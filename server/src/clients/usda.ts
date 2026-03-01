import type { Cache } from '../cache/cache.js';
import type { PortionData } from '../conversion/types.js';
import type {
  NutritionData,
  FoodSearchResult,
  CacheableResult,
} from './types.js';

const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const HTTP_TIMEOUT_MS = 10_000;
const MAX_SEARCH_RESULTS = 15;
const ML_PER_CUP = 236.588;

/** Maps USDA nutrient IDs to our normalized nutrient keys. */
const NUTRIENT_ID_MAP: Record<number, string> = {
  1008: 'calories',
  1003: 'protein_g',
  1005: 'total_carbs_g',
  1004: 'total_fat_g',
  1079: 'fiber_g',
  2000: 'sugar_g',
  1258: 'saturated_fat_g',
  1093: 'sodium_mg',
  1253: 'cholesterol_mg',
};

/** The nutrient keys that must always be present in the output. */
const REQUIRED_NUTRIENTS = [
  'calories',
  'protein_g',
  'total_carbs_g',
  'total_fat_g',
];

// -- USDA API response shapes (subset of fields we use) --

interface UsdaSearchFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  score?: number;
}

interface UsdaSearchResponse {
  foods: UsdaSearchFood[];
  totalHits: number;
}

interface UsdaFoodNutrient {
  nutrient: {
    id: number;
    name: string;
    unitName: string;
  };
  amount?: number;
}

interface UsdaFoodPortion {
  id: number;
  amount: number;
  gramWeight: number;
  portionDescription?: string;
  modifier?: string;
  measureUnit?: { name: string };
}

interface UsdaFoodDetailResponse {
  fdcId: number;
  description: string;
  foodNutrients: UsdaFoodNutrient[];
  foodPortions?: UsdaFoodPortion[];
}

/** Normalizes a USDA search response into FoodSearchResult[]. */
export function normalizeSearchResults(
  data: UsdaSearchResponse,
): FoodSearchResult[] {
  return data.foods.slice(0, MAX_SEARCH_RESULTS).map((food) => ({
    id: String(food.fdcId),
    source: 'usda' as const,
    name: food.description,
    brand: food.brandOwner ?? food.brandName ?? null,
    matchScore: food.score ?? 0,
  }));
}

/** Descriptions that provide no useful matching information. */
const JUNK_DESCRIPTIONS = new Set([
  'undetermined',
  'quantity not specified',
  'unknown',
]);

/** Returns true if a portion description is useless for matching. */
function isJunkDescription(description: string): boolean {
  const trimmed = description.trim();
  return trimmed === '' || JUNK_DESCRIPTIONS.has(trimmed.toLowerCase());
}

/** Parses USDA food portions into PortionData and derives density when a cup portion exists. */
export function extractPortionData(rawPortions: UsdaFoodPortion[]): {
  portions: PortionData[];
  densityGPerMl: number | undefined;
} {
  const portions: PortionData[] = rawPortions
    .filter((p) => p.gramWeight > 0)
    .map((p) => ({
      portionDescription:
        p.portionDescription ?? p.measureUnit?.name ?? 'unknown',
      modifier: p.modifier,
      gramWeight: p.gramWeight,
      amount: p.amount,
    }))
    .filter((p) => !isJunkDescription(p.portionDescription));

  // Derive density from a "1 cup" portion if available
  let densityGPerMl: number | undefined;
  const cupPortion = portions.find(
    (p) =>
      p.amount === 1 && /\bcups?\b/.test(p.portionDescription.toLowerCase()),
  );
  if (cupPortion) {
    densityGPerMl = cupPortion.gramWeight / ML_PER_CUP;
  }

  return { portions, densityGPerMl };
}

/** Normalizes a USDA food detail response into NutritionData. */
export function normalizeNutrition(
  data: UsdaFoodDetailResponse,
): NutritionData {
  const nutrientMap = new Map<string, number>();

  for (const fn of data.foodNutrients) {
    if (fn.nutrient.id in NUTRIENT_ID_MAP && fn.amount != null) {
      const key = NUTRIENT_ID_MAP[fn.nutrient.id];
      nutrientMap.set(key, fn.amount);
    }
  }

  const nutrients: NutritionData['nutrients'] = {
    calories: { value: 0, available: false },
    protein_g: { value: 0, available: false },
    total_carbs_g: { value: 0, available: false },
    total_fat_g: { value: 0, available: false },
  };

  // Fill all mapped nutrients
  for (const key of Object.values(NUTRIENT_ID_MAP)) {
    const value = nutrientMap.get(key);
    if (value !== undefined) {
      nutrients[key] = { value, available: true };
    } else if (!REQUIRED_NUTRIENTS.includes(key)) {
      // Optional nutrients only appear if data exists
      nutrients[key] = { value: 0, available: false };
    }
    // Required nutrients already initialized above with available: false
  }

  const result: NutritionData = {
    foodId: String(data.fdcId),
    source: 'usda',
    name: data.description,
    servingSize: { amount: 100, unit: 'g' },
    nutrients,
  };

  if (data.foodPortions && data.foodPortions.length > 0) {
    const { portions, densityGPerMl } = extractPortionData(data.foodPortions);
    if (portions.length > 0) {
      result.portions = portions;
    } else {
      // Raw portions existed but all were filtered as junk
      result.hasFilteredJunkPortions = true;
    }
    if (densityGPerMl != null) {
      result.densityGPerMl = densityGPerMl;
    }
  }

  return result;
}

/** USDA FoodData Central API client with cache-through reads. */
export class UsdaClient {
  private apiKey: string;
  private cache: Cache;

  constructor(cache: Cache, apiKey?: string) {
    this.apiKey = apiKey ?? process.env.USDA_API_KEY ?? '';
    this.cache = cache;
    if (!this.apiKey) {
      console.warn(
        'UsdaClient: USDA_API_KEY is not set. All API requests will fail.',
      );
    }
  }

  /** Searches USDA FoodData Central, returning cached results when available. */
  async searchFoods(
    query: string,
  ): Promise<CacheableResult<FoodSearchResult[]>> {
    const cached = this.cache.getSearchResults('usda', query) as
      | FoodSearchResult[]
      | null;
    if (cached) {
      return { data: cached, freshness: 'cache' };
    }

    try {
      const params = new URLSearchParams({
        query,
        api_key: this.apiKey,
        pageSize: String(MAX_SEARCH_RESULTS),
      });

      const response = await fetch(`${USDA_BASE_URL}/foods/search?${params}`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(
          `USDA search API error: ${response.status} ${response.statusText}`,
        );
        return this.fallbackSearchResults(query);
      }

      const data = (await response.json()) as UsdaSearchResponse;
      const results = normalizeSearchResults(data);
      this.cache.setSearchResults('usda', query, results);
      return { data: results, freshness: 'live' };
    } catch (error) {
      console.error('USDA search request failed:', error);
      return this.fallbackSearchResults(query);
    }
  }

  /** Retrieves nutrition data for a specific USDA food ID, using cache when available. */
  async getNutrition(
    fdcId: string,
  ): Promise<CacheableResult<NutritionData> | null> {
    const cached = this.cache.getNutrition(
      'usda',
      fdcId,
    ) as NutritionData | null;
    if (cached) {
      return { data: cached, freshness: 'cache' };
    }

    try {
      const params = new URLSearchParams({ api_key: this.apiKey });
      const response = await fetch(`${USDA_BASE_URL}/food/${fdcId}?${params}`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(
          `USDA food detail API error: ${response.status} ${response.statusText}`,
        );
        return this.fallbackNutrition(fdcId);
      }

      const data = (await response.json()) as UsdaFoodDetailResponse;
      const nutrition = normalizeNutrition(data);
      this.cache.setNutrition('usda', fdcId, nutrition);
      return { data: nutrition, freshness: 'live' };
    } catch (error) {
      console.error('USDA food detail request failed:', error);
      return this.fallbackNutrition(fdcId);
    }
  }

  private fallbackSearchResults(
    query: string,
  ): CacheableResult<FoodSearchResult[]> {
    const stale = this.cache.getSearchResultsStale('usda', query) as
      | FoodSearchResult[]
      | null;
    return { data: stale ?? [], freshness: 'stale' };
  }

  private fallbackNutrition(
    fdcId: string,
  ): CacheableResult<NutritionData> | null {
    const stale = this.cache.getNutritionStale(
      'usda',
      fdcId,
    ) as NutritionData | null;
    if (!stale) return null;
    return { data: stale, freshness: 'stale' };
  }
}
