import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { TTL } from '../cache/cache.js';
import { getDatabase } from '../cache/db.js';
import { isWeightUnit, weightToGrams } from '../conversion/units.js';
import type { FoodSearchResult, NutritionData } from './types.js';

/** Input accepted by CustomFoodStore.save(). */
export interface SaveFoodInput {
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

interface CustomFoodRow {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  data: string;
  created_at: number;
  expires_at: number;
}

/** Generates a deterministic ID from name and optional brand. */
export function generateCustomFoodId(name: string, brand?: string): string {
  const normalized = name.toLowerCase() + '|' + (brand?.toLowerCase() ?? '');
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `custom:${hash}`;
}

/** Converts SaveFoodInput nutrients into NutrientValue records. */
function toNutrientValues(
  nutrients: SaveFoodInput['nutrients'],
): NutritionData['nutrients'] {
  const result: NutritionData['nutrients'] = {
    calories: { value: 0, available: false },
    protein_g: { value: 0, available: false },
    total_carbs_g: { value: 0, available: false },
    total_fat_g: { value: 0, available: false },
  };

  for (const [key, rawValue] of Object.entries(nutrients)) {
    if (rawValue != null) {
      result[key] = { value: rawValue, available: true };
    }
  }

  return result;
}

/** Scales all available nutrient values by a factor. */
function scaleNutrients(
  nutrients: NutritionData['nutrients'],
  factor: number,
): NutritionData['nutrients'] {
  const scaled: NutritionData['nutrients'] = {
    calories: { value: 0, available: false },
    protein_g: { value: 0, available: false },
    total_carbs_g: { value: 0, available: false },
    total_fat_g: { value: 0, available: false },
  };

  for (const [key, nv] of Object.entries(nutrients)) {
    if (nv != null) {
      const nutrient = nv;
      scaled[key] = {
        value: nutrient.available
          ? Math.round(nutrient.value * factor * 100) / 100
          : 0,
        available: nutrient.available,
      };
    }
  }

  return scaled;
}

/** Escapes SQL LIKE wildcard characters (%, _, \) in user input. */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

/** Persistent storage for user-created custom foods with TTL expiration. */
export class CustomFoodStore {
  private db: Database.Database;
  private stmts: {
    upsert: Database.Statement;
    getById: Database.Statement;
    searchByText: Database.Statement;
    purgeExpired: Database.Statement;
  };

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
    this.stmts = {
      upsert: this.db.prepare(
        `INSERT OR REPLACE INTO custom_foods (id, name, brand, category, data, created_at, expires_at)
         VALUES (@id, @name, @brand, @category, @data, @created_at, @expires_at)`,
      ),
      getById: this.db.prepare('SELECT * FROM custom_foods WHERE id = ?'),
      searchByText: this.db.prepare(
        `SELECT * FROM custom_foods
         WHERE (name LIKE @pattern ESCAPE '\\' COLLATE NOCASE
                OR brand LIKE @pattern ESCAPE '\\' COLLATE NOCASE)
           AND expires_at > @now`,
      ),
      purgeExpired: this.db.prepare(
        'DELETE FROM custom_foods WHERE expires_at < ?',
      ),
    };
  }

  /** Saves a custom food, normalizing to per-100g for weight-based servings. Returns the deterministic ID. */
  save(input: SaveFoodInput): { id: string; source: 'custom' } {
    if (input.servingSize.amount <= 0) {
      throw new Error(
        `Invalid serving size amount: ${input.servingSize.amount}. Must be greater than 0.`,
      );
    }

    const id = generateCustomFoodId(input.name, input.brand);
    const now = Math.floor(Date.now() / 1000);

    // Purge expired rows opportunistically
    this.purgeExpired(now);

    const rawNutrients = toNutrientValues(input.nutrients);
    const isWeight = isWeightUnit(input.servingSize.unit);

    let storedNutrients: NutritionData['nutrients'];
    let servingSize: NutritionData['servingSize'];
    let storageMode: 'per-100g' | 'per-serving';

    if (isWeight) {
      // Normalize to per-100g
      const servingGrams = weightToGrams(
        input.servingSize.amount,
        input.servingSize.unit,
      );
      const factor = 100 / servingGrams;
      storedNutrients = scaleNutrients(rawNutrients, factor);
      servingSize = { amount: 100, unit: 'g' };
      storageMode = 'per-100g';
    } else {
      // Normalize to per-1-unit of the serving size
      const factor = 1 / input.servingSize.amount;
      storedNutrients = scaleNutrients(rawNutrients, factor);
      servingSize = { amount: 1, unit: input.servingSize.unit };
      storageMode = 'per-serving';
    }

    const nutritionData: NutritionData = {
      foodId: id,
      source: 'custom',
      name: input.name,
      servingSize,
      storageMode,
      nutrients: storedNutrients,
    };

    this.stmts.upsert.run({
      id,
      name: input.name,
      brand: input.brand ?? null,
      category: input.category ?? null,
      data: JSON.stringify(nutritionData),
      created_at: now,
      expires_at: now + TTL.custom,
    });

    return { id, source: 'custom' };
  }

  /** Retrieves a custom food by ID, returning null if not found or expired. */
  get(id: string): NutritionData | null {
    const row = this.stmts.getById.get(id) as CustomFoodRow | undefined;
    if (!row) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= row.expires_at) {
      return null;
    }

    return JSON.parse(row.data) as NutritionData;
  }

  /** Searches custom foods by name or brand, excluding expired entries. */
  search(query: string): FoodSearchResult[] {
    const now = Math.floor(Date.now() / 1000);
    const escaped = escapeLikePattern(query);
    const pattern = `%${escaped}%`;

    const rows = this.stmts.searchByText.all({
      pattern,
      now,
    }) as CustomFoodRow[];

    const queryLower = query.toLowerCase();

    return rows.map((row) => {
      const nameLower = row.name.toLowerCase();
      const brandLower = (row.brand ?? '').toLowerCase();

      // Exact name match scores highest, then exact brand, then partial
      let matchScore = 50;
      if (nameLower === queryLower || brandLower === queryLower) {
        matchScore = 100;
      } else if (
        nameLower.startsWith(queryLower) ||
        brandLower.startsWith(queryLower)
      ) {
        matchScore = 75;
      }

      return {
        id: row.id,
        source: 'custom' as const,
        name: row.name,
        brand: row.brand,
        matchScore,
      };
    });
  }

  /** Deletes expired rows to prevent unbounded table growth. */
  private purgeExpired(nowSeconds: number): void {
    this.stmts.purgeExpired.run(nowSeconds);
  }
}
