import type { Cache } from "../cache/cache.js";
import type { NutritionData, FoodSearchResult, CacheableResult } from "./types.js";

const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const HTTP_TIMEOUT_MS = 10_000;
const MAX_SEARCH_RESULTS = 10;
const USER_AGENT = "FoodTrackingAI/1.0 (https://github.com/food-tracking-ai)";

/** Maps Open Food Facts nutriment keys to our normalized nutrient keys. */
const NUTRIMENT_KEY_MAP: Record<string, string> = {
  "energy-kcal_100g": "calories",
  "proteins_100g": "protein_g",
  "carbohydrates_100g": "total_carbs_g",
  "fat_100g": "total_fat_g",
  "fiber_100g": "fiber_g",
  "sugars_100g": "sugar_g",
  "saturated-fat_100g": "saturated_fat_g",
  "sodium_100g": "sodium_mg",
  "cholesterol_100g": "cholesterol_mg",
};

/** The nutrient keys that must always be present in the output. */
const REQUIRED_NUTRIENTS = ["calories", "protein_g", "total_carbs_g", "total_fat_g"];

/** Conversion factor: OFF stores sodium in g per 100g; we store in mg. */
const SODIUM_G_TO_MG = 1000;

// -- Open Food Facts API response shapes (subset of fields we use) --

interface OffSearchProduct {
  code: string;
  product_name?: string;
  brands?: string;
  // Relevance score is not directly in OFF; we use position as proxy
}

interface OffSearchResponse {
  count: number;
  products: OffSearchProduct[];
}

interface OffNutriments {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  "saturated-fat_100g"?: number;
  sodium_100g?: number;
  cholesterol_100g?: number;
  [key: string]: number | string | undefined;
}

interface OffProductDetail {
  code: string;
  product_name?: string;
  brands?: string;
  nutriments?: OffNutriments;
}

interface OffProductResponse {
  status: number;
  product: OffProductDetail | null;
}

/** Normalizes an Open Food Facts search response into FoodSearchResult[]. */
export function normalizeSearchResults(data: OffSearchResponse): FoodSearchResult[] {
  return data.products
    .filter((p) => p.product_name)
    .slice(0, MAX_SEARCH_RESULTS)
    .map((product, index) => ({
      id: product.code,
      source: "openfoodfacts" as const,
      name: product.product_name!,
      brand: product.brands ?? null,
      matchScore: Math.max(0, 1 - index * 0.05),
    }));
}

/** Normalizes Open Food Facts nutriments into NutritionData. */
export function normalizeNutrition(product: OffProductDetail): NutritionData {
  const nutriments = product.nutriments ?? {};

  const nutrients: NutritionData["nutrients"] = {
    calories: { value: 0, available: false },
    protein_g: { value: 0, available: false },
    total_carbs_g: { value: 0, available: false },
    total_fat_g: { value: 0, available: false },
  };

  for (const [offKey, normalizedKey] of Object.entries(NUTRIMENT_KEY_MAP)) {
    const rawValue = nutriments[offKey];
    if (typeof rawValue === "number") {
      let value = rawValue;
      // Convert sodium from g to mg
      if (normalizedKey === "sodium_mg" && offKey === "sodium_100g") {
        value = rawValue * SODIUM_G_TO_MG;
      }
      nutrients[normalizedKey] = { value, available: true };
    } else if (!REQUIRED_NUTRIENTS.includes(normalizedKey)) {
      nutrients[normalizedKey] = { value: 0, available: false };
    }
    // Required nutrients already initialized with available: false
  }

  return {
    foodId: product.code,
    source: "openfoodfacts",
    name: product.product_name ?? "Unknown",
    servingSize: { amount: 100, unit: "g" },
    nutrients,
  };
}

/** Open Food Facts API client with cache-through reads. */
export class OpenFoodFactsClient {
  private cache: Cache;

  constructor(cache: Cache) {
    this.cache = cache;
  }

  /** Searches Open Food Facts, returning cached results when available. */
  async searchFoods(query: string): Promise<CacheableResult<FoodSearchResult[]>> {
    const cached = this.cache.getSearchResults("openfoodfacts", query) as FoodSearchResult[] | null;
    if (cached) {
      return { data: cached, freshness: "cache" };
    }

    try {
      const params = new URLSearchParams({
        search_terms: query,
        json: "1",
        page_size: String(MAX_SEARCH_RESULTS),
      });

      const response = await fetch(`${OFF_SEARCH_URL}?${params}`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        headers: {
          "Accept": "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        console.error(`Open Food Facts search API error: ${response.status} ${response.statusText}`);
        return this.fallbackSearchResults(query);
      }

      const data = (await response.json()) as OffSearchResponse;
      const results = normalizeSearchResults(data);
      this.cache.setSearchResults("openfoodfacts", query, results);
      return { data: results, freshness: "live" };
    } catch (error) {
      console.error("Open Food Facts search request failed:", error);
      return this.fallbackSearchResults(query);
    }
  }

  /** Retrieves nutrition data for a specific Open Food Facts product ID. */
  async getNutrition(productId: string): Promise<CacheableResult<NutritionData> | null> {
    const cached = this.cache.getNutrition("openfoodfacts", productId) as NutritionData | null;
    if (cached) {
      return { data: cached, freshness: "cache" };
    }

    try {
      const response = await fetch(`${OFF_PRODUCT_URL}/${productId}.json`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        headers: {
          "Accept": "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        console.error(`Open Food Facts product API error: ${response.status} ${response.statusText}`);
        return this.fallbackNutrition(productId);
      }

      const data = (await response.json()) as OffProductResponse;
      if (data.status === 0 || !data.product) {
        return this.fallbackNutrition(productId);
      }

      const nutrition = normalizeNutrition(data.product);
      this.cache.setNutrition("openfoodfacts", productId, nutrition);
      return { data: nutrition, freshness: "live" };
    } catch (error) {
      console.error("Open Food Facts product request failed:", error);
      return this.fallbackNutrition(productId);
    }
  }

  private fallbackSearchResults(query: string): CacheableResult<FoodSearchResult[]> {
    const stale = this.cache.getSearchResultsStale("openfoodfacts", query) as FoodSearchResult[] | null;
    return { data: stale ?? [], freshness: "stale" };
  }

  private fallbackNutrition(productId: string): CacheableResult<NutritionData> | null {
    const stale = this.cache.getNutritionStale("openfoodfacts", productId) as NutritionData | null;
    if (!stale) return null;
    return { data: stale, freshness: "stale" };
  }
}
