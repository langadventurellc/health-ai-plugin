import type {
  CustomFoodStore,
  SaveFoodInput,
} from '../clients/custom-store.js';

interface SaveFoodDeps {
  store: CustomFoodStore;
}

interface SaveFoodParams {
  name: string;
  brand?: string;
  category?: string;
  servingSize: { amount: number; unit: string };
  nutrients: {
    calories: number;
    protein_g: number;
    total_carbs_g: number;
    total_fat_g: number;
    fiber_g?: number;
    sugar_g?: number;
    saturated_fat_g?: number;
    sodium_mg?: number;
    cholesterol_mg?: number;
    [key: string]: number | undefined;
  };
}

interface SaveFoodResponse {
  id: string;
  source: 'custom';
}

const REQUIRED_NUTRIENTS = [
  'calories',
  'protein_g',
  'total_carbs_g',
  'total_fat_g',
] as const;

/** Validates all provided nutrient values are finite non-negative numbers, and required fields are present. */
function validateNutrients(nutrients: SaveFoodParams['nutrients']): void {
  for (const key of REQUIRED_NUTRIENTS) {
    const value = nutrients[key];
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new Error(
        `Invalid nutrient value for "${key}": expected a finite number, got ${String(value)}.`,
      );
    }
    if (value < 0) {
      throw new Error(
        `Invalid nutrient value for "${key}": ${value}. Must be non-negative.`,
      );
    }
  }

  for (const [key, value] of Object.entries(nutrients)) {
    if (value == null) continue;
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new Error(
        `Invalid nutrient value for "${key}": expected a finite number, got ${String(value)}.`,
      );
    }
    if (value < 0) {
      throw new Error(
        `Invalid nutrient value for "${key}": ${value}. Must be non-negative.`,
      );
    }
  }
}

/** Handles the save_food MCP tool call. */
export async function handleSaveFood(
  deps: SaveFoodDeps,
  params: SaveFoodParams,
): Promise<SaveFoodResponse> {
  validateNutrients(params.nutrients);

  const input: SaveFoodInput = {
    name: params.name,
    brand: params.brand,
    category: params.category,
    servingSize: params.servingSize,
    nutrients: params.nutrients,
  };

  return await Promise.resolve(deps.store.save(input));
}
