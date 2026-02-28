import type { UsdaClient } from "../clients/usda.js";
import type { OpenFoodFactsClient } from "../clients/openfoodfacts.js";
import type { Cache } from "../cache/cache.js";
import type { FoodSearchResult, DataFreshness } from "../types.js";

interface SearchFoodDeps {
  usda: UsdaClient;
  off: OpenFoodFactsClient;
  cache: Cache;
}

interface SearchFoodParams {
  query: string;
  source: "usda" | "openfoodfacts" | "all";
}

interface SearchFoodResponse {
  results: FoodSearchResult[];
  dataFreshness?: DataFreshness;
  warnings?: string[];
}

/** Normalizes a food name for deduplication comparison. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\b(raw|cooked|fresh|frozen|dried|organic|natural)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the fraction of words shared between two strings. */
export function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(" ").filter(Boolean));
  const wordsB = new Set(b.split(" ").filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let shared = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) shared++;
  }

  const minSize = Math.min(wordsA.size, wordsB.size);
  return shared / minSize;
}

/** Checks if two results from different sources are duplicates. */
export function isDuplicate(a: FoodSearchResult, b: FoodSearchResult): boolean {
  if (a.source === b.source) return false;

  const normA = normalizeName(a.name);
  const normB = normalizeName(b.name);

  // Substring check
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Word overlap check (>80% of words shared)
  if (wordOverlap(normA, normB) > 0.8) return true;

  return false;
}

/**
 * Deduplicates search results across sources.
 * Prefers USDA results; keeps the OFF id as metadata is not needed per spec.
 */
export function deduplicateResults(
  usdaResults: FoodSearchResult[],
  offResults: FoodSearchResult[]
): FoodSearchResult[] {
  const deduplicated: FoodSearchResult[] = [...usdaResults];
  const usedOffIndices = new Set<number>();

  for (let oi = 0; oi < offResults.length; oi++) {
    const offItem = offResults[oi];
    let isDup = false;

    for (const usdaItem of usdaResults) {
      if (isDuplicate(usdaItem, offItem)) {
        isDup = true;
        break;
      }
    }

    if (!isDup) {
      // Also check against already-added OFF items
      for (const addedIdx of usedOffIndices) {
        if (isDuplicate(offResults[addedIdx], offItem)) {
          isDup = true;
          break;
        }
      }
    }

    if (!isDup) {
      deduplicated.push(offItem);
      usedOffIndices.add(oi);
    }
  }

  return deduplicated;
}

/** Returns the least-fresh value: stale > cache > live. */
function leastFresh(a: DataFreshness, b: DataFreshness): DataFreshness {
  const rank: Record<DataFreshness, number> = { live: 0, cache: 1, stale: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/** Handles the search_food MCP tool call. */
export async function handleSearchFood(
  deps: SearchFoodDeps,
  params: SearchFoodParams
): Promise<SearchFoodResponse> {
  const { query, source } = params;
  const warnings: string[] = [];

  // Check combined cache first when searching all sources
  if (source === "all") {
    const cached = deps.cache.getSearchResults("all", query) as FoodSearchResult[] | null;
    if (cached) {
      return { results: cached, dataFreshness: "cache" };
    }
  }

  if (source === "usda") {
    const result = await deps.usda.searchFoods(query);
    const response: SearchFoodResponse = { results: result.data };
    if (result.freshness === "stale") {
      response.dataFreshness = "stale";
      response.warnings = ["Using cached data; USDA API was unavailable."];
    }
    return response;
  }

  if (source === "openfoodfacts") {
    const result = await deps.off.searchFoods(query);
    const response: SearchFoodResponse = { results: result.data };
    if (result.freshness === "stale") {
      response.dataFreshness = "stale";
      response.warnings = ["Using cached data; Open Food Facts API was unavailable."];
    }
    return response;
  }

  // source === "all": search both in parallel
  const [usdaSettled, offSettled] = await Promise.allSettled([
    deps.usda.searchFoods(query),
    deps.off.searchFoods(query),
  ]);

  let usdaResults: FoodSearchResult[] = [];
  let offResults: FoodSearchResult[] = [];
  let freshness: DataFreshness = "live";

  if (usdaSettled.status === "fulfilled") {
    usdaResults = usdaSettled.value.data;
    freshness = leastFresh(freshness, usdaSettled.value.freshness);
    if (usdaSettled.value.freshness === "stale") {
      warnings.push("Using cached data for USDA; API was unavailable.");
    }
  } else {
    warnings.push("USDA source was unavailable; results may be incomplete.");
  }

  if (offSettled.status === "fulfilled") {
    offResults = offSettled.value.data;
    freshness = leastFresh(freshness, offSettled.value.freshness);
    if (offSettled.value.freshness === "stale") {
      warnings.push("Using cached data for Open Food Facts; API was unavailable.");
    }
  } else {
    warnings.push("Open Food Facts source was unavailable; results may be incomplete.");
  }

  const results = deduplicateResults(usdaResults, offResults);

  // Cache the combined results
  deps.cache.setSearchResults("all", query, results);

  const response: SearchFoodResponse = { results };
  if (freshness !== "live") {
    response.dataFreshness = freshness;
  }
  if (warnings.length > 0) {
    response.warnings = warnings;
  }
  return response;
}
