import type { UsdaClient } from '../clients/usda.js';
import type { OpenFoodFactsClient } from '../clients/openfoodfacts.js';
import {
  leastFresh,
  type FoodSource,
  type NutrientValue,
  type NutrientBreakdown,
  type DataFreshness,
} from '../types.js';
import { handleGetNutrition, type NutritionUnit } from './get-nutrition.js';

interface CalculateMealDeps {
  usda: UsdaClient;
  off: OpenFoodFactsClient;
}

interface MealItem {
  foodId: string;
  source: FoodSource;
  amount: number;
  unit: NutritionUnit;
}

interface CalculateMealParams {
  items: MealItem[];
}

interface MealItemResult {
  foodId: string;
  source: FoodSource;
  servingDescription: string;
  nutrients: NutrientBreakdown;
}

type NutrientCoverage = 'full' | 'partial' | 'none';

interface CalculateMealResponse {
  items: MealItemResult[];
  totals: NutrientBreakdown;
  nutrientCoverage: Record<string, NutrientCoverage>;
  dataFreshness?: DataFreshness;
  warnings?: string[];
}

/** Collects all unique nutrient keys across multiple items. */
function collectNutrientKeys(itemNutrients: NutrientBreakdown[]): Set<string> {
  const allKeys = new Set<string>();
  for (const nutrients of itemNutrients) {
    for (const key of Object.keys(nutrients)) {
      allKeys.add(key);
    }
  }
  return allKeys;
}

/** Computes sum and availability counts for a single nutrient across all items. */
function aggregateNutrient(
  key: string,
  itemNutrients: NutrientBreakdown[],
): { sum: number; availableCount: number } {
  let sum = 0;
  let availableCount = 0;

  for (const nutrients of itemNutrients) {
    const nutrient = nutrients[key] as NutrientValue | undefined;
    if (nutrient == null) continue;
    if (nutrient.available) {
      availableCount++;
      sum += nutrient.value;
    }
  }

  return { sum, availableCount };
}

/** Determines coverage level based on how many items had data for a nutrient. */
function determineCoverage(
  availableCount: number,
  totalItems: number,
): NutrientCoverage {
  if (availableCount === totalItems) return 'full';
  if (availableCount > 0) return 'partial';
  return 'none';
}

/** Sums nutrient values across items, tracking availability per nutrient key. */
function sumNutrients(itemNutrients: NutrientBreakdown[]): {
  totals: NutrientBreakdown;
  coverage: Record<string, NutrientCoverage>;
} {
  const allKeys = collectNutrientKeys(itemNutrients);
  const totals: Record<string, NutrientValue> = {};
  const coverage: Record<string, NutrientCoverage> = {};

  for (const key of allKeys) {
    const { sum, availableCount } = aggregateNutrient(key, itemNutrients);
    totals[key] = {
      value: Math.round(sum * 10) / 10,
      available: availableCount === itemNutrients.length,
    };
    coverage[key] = determineCoverage(availableCount, itemNutrients.length);
  }

  return { totals: totals as NutrientBreakdown, coverage };
}

/** Handles the calculate_meal MCP tool call. */
export async function handleCalculateMeal(
  deps: CalculateMealDeps,
  params: CalculateMealParams,
): Promise<CalculateMealResponse> {
  const itemResults: MealItemResult[] = [];
  const itemNutrients: NutrientBreakdown[] = [];
  const allWarnings: string[] = [];
  let overallFreshness: DataFreshness | undefined;

  for (let i = 0; i < params.items.length; i++) {
    const item = params.items[i];
    let result;
    try {
      result = await handleGetNutrition(deps, {
        foodId: item.foodId,
        source: item.source,
        amount: item.amount,
        unit: item.unit,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to get nutrition for item ${i} (foodId: "${item.foodId}"): ${message}`,
      );
    }

    itemResults.push({
      foodId: item.foodId,
      source: item.source,
      servingDescription: result.servingDescription,
      nutrients: result.nutrients,
    });
    itemNutrients.push(result.nutrients);

    if (result.dataFreshness) {
      overallFreshness = overallFreshness
        ? leastFresh(overallFreshness, result.dataFreshness)
        : result.dataFreshness;
    }

    if (result.warnings) {
      allWarnings.push(...result.warnings);
    }
  }

  const { totals, coverage } = sumNutrients(itemNutrients);

  const response: CalculateMealResponse = {
    items: itemResults,
    totals,
    nutrientCoverage: coverage,
  };

  if (overallFreshness) {
    response.dataFreshness = overallFreshness;
  }

  if (allWarnings.length > 0) {
    response.warnings = allWarnings;
  }

  return response;
}
