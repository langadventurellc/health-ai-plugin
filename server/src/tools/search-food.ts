import type { UsdaClient } from '../clients/usda.js';
import type { OpenFoodFactsClient } from '../clients/openfoodfacts.js';
import type { CustomFoodStore } from '../clients/custom-store.js';
import type { Cache } from '../cache/cache.js';
import {
  leastFresh,
  type FoodSearchResult,
  type DataFreshness,
} from '../types.js';

interface SearchFoodDeps {
  usda: UsdaClient;
  off: OpenFoodFactsClient;
  cache: Cache;
  store: CustomFoodStore;
}

interface SearchFoodParams {
  query: string;
  source: 'usda' | 'openfoodfacts' | 'all';
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
    .replace(/[^\w\s]/g, '')
    .replace(/\b(raw|cooked|fresh|frozen|dried|organic|natural)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the fraction of words shared between two strings. */
export function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter(Boolean));
  const wordsB = new Set(b.split(' ').filter(Boolean));
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

/** Returns true if the candidate is a duplicate of any item in the list. */
function isDuplicateOfAny(
  candidate: FoodSearchResult,
  existing: FoodSearchResult[],
): boolean {
  return existing.some((item) => isDuplicate(item, candidate));
}

/**
 * Deduplicates search results across sources.
 * Prefers USDA results; keeps the OFF id as metadata is not needed per spec.
 */
export function deduplicateResults(
  usdaResults: FoodSearchResult[],
  offResults: FoodSearchResult[],
): FoodSearchResult[] {
  const deduplicated: FoodSearchResult[] = [...usdaResults];

  for (const offItem of offResults) {
    if (isDuplicateOfAny(offItem, deduplicated)) {
      continue;
    }
    deduplicated.push(offItem);
  }

  return deduplicated;
}

/** Wraps a single-source search result into a SearchFoodResponse. */
async function searchSingleSource(
  searchFn: (
    query: string,
  ) => Promise<{ data: FoodSearchResult[]; freshness: DataFreshness }>,
  query: string,
  staleWarning: string,
): Promise<SearchFoodResponse> {
  const result = await searchFn(query);
  const response: SearchFoodResponse = { results: result.data };
  if (result.freshness === 'stale') {
    response.dataFreshness = 'stale';
    response.warnings = [staleWarning];
  }
  return response;
}

interface SettledSourceResult {
  results: FoodSearchResult[];
  freshness: DataFreshness;
  warnings: string[];
}

/** Extracts results from a settled promise, collecting freshness and warnings. */
function processSettledResult(
  settled: PromiseSettledResult<{
    data: FoodSearchResult[];
    freshness: DataFreshness;
  }>,
  sourceName: string,
): SettledSourceResult {
  const warnings: string[] = [];
  if (settled.status === 'fulfilled') {
    if (settled.value.freshness === 'stale') {
      warnings.push(
        `Using cached data for ${sourceName}; API was unavailable.`,
      );
    }
    return {
      results: settled.value.data,
      freshness: settled.value.freshness,
      warnings,
    };
  }
  warnings.push(
    `${sourceName} source was unavailable; results may be incomplete.`,
  );
  return { results: [], freshness: 'stale', warnings };
}

/** Handles the search_food MCP tool call. */
export async function handleSearchFood(
  deps: SearchFoodDeps,
  params: SearchFoodParams,
): Promise<SearchFoodResponse> {
  const { query, source } = params;

  // Check combined cache first when searching all sources
  if (source === 'all') {
    const cached = deps.cache.getSearchResults('all', query) as
      | FoodSearchResult[]
      | null;
    if (cached) {
      // Always search custom foods fresh (local SQLite, not an API call)
      const customResults = deps.store.search(query);
      return {
        results: [...customResults, ...cached],
        dataFreshness: 'cache',
      };
    }
  }

  if (source === 'usda') {
    return searchSingleSource(
      (q) => deps.usda.searchFoods(q),
      query,
      'Using cached data; USDA API was unavailable.',
    );
  }

  if (source === 'openfoodfacts') {
    return searchSingleSource(
      (q) => deps.off.searchFoods(q),
      query,
      'Using cached data; Open Food Facts API was unavailable.',
    );
  }

  // source === "all": search both in parallel
  const [usdaSettled, offSettled] = await Promise.allSettled([
    deps.usda.searchFoods(query),
    deps.off.searchFoods(query),
  ]);

  const usda = processSettledResult(usdaSettled, 'USDA');
  const off = processSettledResult(offSettled, 'Open Food Facts');

  const warnings = [...usda.warnings, ...off.warnings];
  const freshness = leastFresh(usda.freshness, off.freshness);
  const deduplicated = deduplicateResults(usda.results, off.results);

  // Cache the combined USDA/OFF results (custom foods are always searched fresh)
  deps.cache.setSearchResults('all', query, deduplicated);

  // Always search custom foods fresh -- they are local SQLite, not an API call,
  // and must appear immediately after being saved without waiting for cache expiry.
  // Custom foods do not participate in cross-source deduplication.
  const customResults = deps.store.search(query);
  const results = [...customResults, ...deduplicated];

  const response: SearchFoodResponse = { results };
  if (freshness !== 'live') {
    response.dataFreshness = freshness;
  }
  if (warnings.length > 0) {
    response.warnings = warnings;
  }
  return response;
}
