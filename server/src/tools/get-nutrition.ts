import type { UsdaClient } from '../clients/usda.js';
import type { OpenFoodFactsClient } from '../clients/openfoodfacts.js';
import type { CustomFoodStore } from '../clients/custom-store.js';
import {
  convertToGrams,
  isWeightUnit,
  isDescriptiveUnit,
} from '../conversion/units.js';
import type {
  FoodSource,
  NutrientValue,
  NutritionData,
  NutritionResult,
  DataFreshness,
} from '../types.js';

interface GetNutritionDeps {
  usda: UsdaClient;
  off: OpenFoodFactsClient;
  store: CustomFoodStore;
}

/** All unit types accepted by get_nutrition. */
export type NutritionUnit =
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'cup'
  | 'tbsp'
  | 'tsp'
  | 'fl_oz'
  | 'mL'
  | 'L'
  | 'piece'
  | 'medium'
  | 'large'
  | 'small'
  | 'slice';

interface GetNutritionParams {
  foodId: string;
  source: FoodSource;
  amount: number;
  unit: NutritionUnit;
}

interface GetNutritionResponse extends NutritionResult {
  dataFreshness?: DataFreshness;
  warnings?: string[];
}

const REQUIRED_NUTRIENT_KEYS = [
  'calories',
  'protein_g',
  'total_carbs_g',
  'total_fat_g',
];

/** Scales a NutrientValue from per-100g to the given gram amount, rounding to 1 decimal. */
export function scaleNutrient(
  nutrient: NutrientValue,
  grams: number,
): NutrientValue {
  if (!nutrient.available) {
    return { value: 0, available: false };
  }
  return {
    value: Math.round(nutrient.value * (grams / 100) * 10) / 10,
    available: true,
  };
}

/** Scales all nutrients in a NutritionData object to the requested amount. */
export function scaleNutrients(
  data: NutritionData,
  grams: number,
): NutritionResult['nutrients'] {
  const scaled: Record<string, NutrientValue> = {};

  for (const [key, nutrient] of Object.entries(data.nutrients)) {
    if (nutrient !== undefined) {
      scaled[key] = scaleNutrient(nutrient, grams);
    }
  }

  const missing = REQUIRED_NUTRIENT_KEYS.filter((key) => !(key in scaled));
  if (missing.length > 0) {
    throw new Error(
      `Nutrition data is malformed: missing required nutrients: ${missing.join(', ')}`,
    );
  }

  return scaled as NutritionResult['nutrients'];
}

/** Builds a human-readable serving description. */
function buildServingDescription(
  amount: number,
  unit: string,
  name: string,
): string {
  if (isWeightUnit(unit)) {
    return `${amount}${unit} of ${name}`;
  }
  if (isDescriptiveUnit(unit)) {
    return `${amount} ${unit} ${name}`;
  }
  return `${amount} ${unit} of ${name}`;
}

/** Scales nutrients for per-serving custom foods by ratio of requested to stored serving. */
function scalePerServing(
  data: NutritionData,
  amount: number,
  unit: string,
): NutritionResult['nutrients'] {
  const storedUnit = data.servingSize.unit;
  if (unit !== storedUnit) {
    throw new Error(
      `Cannot convert "${unit}" to "${storedUnit}" for custom food "${data.name}". ` +
        `This food was saved with a "${storedUnit}" serving size. ` +
        `Please request in "${storedUnit}" units.`,
    );
  }

  // Data is stored as per-1-unit; multiply by the requested amount.
  const ratio = amount / data.servingSize.amount;
  const scaled: Record<string, NutrientValue> = {};

  for (const [key, nutrient] of Object.entries(data.nutrients)) {
    if (nutrient !== undefined) {
      if (!nutrient.available) {
        scaled[key] = { value: 0, available: false };
      } else {
        scaled[key] = {
          value: Math.round(nutrient.value * ratio * 10) / 10,
          available: true,
        };
      }
    }
  }

  const missing = REQUIRED_NUTRIENT_KEYS.filter((key) => !(key in scaled));
  if (missing.length > 0) {
    throw new Error(
      `Nutrition data is malformed: missing required nutrients: ${missing.join(', ')}`,
    );
  }

  return scaled as NutritionResult['nutrients'];
}

/** Handles the get_nutrition MCP tool call. */
export async function handleGetNutrition(
  deps: GetNutritionDeps,
  params: GetNutritionParams,
): Promise<GetNutritionResponse> {
  const { foodId, source, amount, unit } = params;

  if (source === 'custom') {
    const nutritionData = deps.store.get(foodId);
    if (!nutritionData) {
      throw new Error(
        `Nutrition data not found for food ID "${foodId}" from source "${source}".`,
      );
    }

    const isPerServing = nutritionData.storageMode === 'per-serving';
    const nutrients = isPerServing
      ? scalePerServing(nutritionData, amount, unit)
      : scaleNutrients(
          nutritionData,
          convertToGrams(amount, unit, {
            densityGPerMl: nutritionData.densityGPerMl,
            portions: nutritionData.portions,
          }),
        );

    const servingDescription = buildServingDescription(
      amount,
      unit,
      nutritionData.name,
    );

    // Custom foods are authoritative local data -- always "live"
    return { servingDescription, nutrients };
  }

  const client = source === 'usda' ? deps.usda : deps.off;
  const result = await client.getNutrition(foodId);

  if (!result) {
    throw new Error(
      `Nutrition data not found for food ID "${foodId}" from source "${source}".`,
    );
  }

  const { data: nutritionData, freshness } = result;
  const grams = convertToGrams(amount, unit, {
    densityGPerMl: nutritionData.densityGPerMl,
    portions: nutritionData.portions,
    hasFilteredJunkPortions: nutritionData.hasFilteredJunkPortions,
  });
  const nutrients = scaleNutrients(nutritionData, grams);
  const servingDescription = buildServingDescription(
    amount,
    unit,
    nutritionData.name,
  );

  const response: GetNutritionResponse = { servingDescription, nutrients };
  if (freshness === 'stale') {
    response.dataFreshness = 'stale';
    response.warnings = [`Using cached data; ${source} API was unavailable.`];
  }
  return response;
}
