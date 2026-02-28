import type { PortionData } from './conversion/types.js';

/** Data source for food items. */
export type FoodSource = 'usda' | 'openfoodfacts' | 'custom';

/** Indicates how data was resolved: live API, fresh cache, or expired cache. */
export type DataFreshness = 'live' | 'cache' | 'stale';

/** Wraps a value with metadata about how it was resolved. */
export interface CacheableResult<T> {
  data: T;
  freshness: DataFreshness;
}

/** Result item from search_food tool and API clients. */
export interface FoodSearchResult {
  id: string;
  source: FoodSource;
  name: string;
  brand: string | null;
  matchScore: number;
}

/** A nutrient value that distinguishes "0" from "data not available". */
export interface NutrientValue {
  value: number;
  available: boolean;
}

/** How nutrient values are stored: per 100g (weight-based) or per serving unit. */
export type StorageMode = 'per-100g' | 'per-serving';

/** Normalized nutrition data returned by API clients and stored in cache. */
export interface NutritionData {
  foodId: string;
  source: FoodSource;
  name: string;
  servingSize: { amount: number; unit: string };
  storageMode?: StorageMode;
  portions?: PortionData[];
  densityGPerMl?: number;
  nutrients: {
    calories: NutrientValue;
    protein_g: NutrientValue;
    total_carbs_g: NutrientValue;
    total_fat_g: NutrientValue;
    fiber_g?: NutrientValue;
    sugar_g?: NutrientValue;
    saturated_fat_g?: NutrientValue;
    sodium_mg?: NutrientValue;
    cholesterol_mg?: NutrientValue;
    [key: string]: NutrientValue | undefined;
  };
}

/** Core nutrients always present in get_nutrition responses. */
export interface NutrientBreakdown {
  calories: NutrientValue;
  protein_g: NutrientValue;
  total_carbs_g: NutrientValue;
  total_fat_g: NutrientValue;
  [key: string]: NutrientValue;
}

/** Result from get_nutrition tool. */
export interface NutritionResult {
  servingDescription: string;
  nutrients: NutrientBreakdown;
}

/** Returns the least-fresh value: stale > cache > live. */
export function leastFresh(a: DataFreshness, b: DataFreshness): DataFreshness {
  const rank: Record<DataFreshness, number> = {
    live: 0,
    cache: 1,
    stale: 2,
  };
  return rank[a] >= rank[b] ? a : b;
}
