import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Cache } from '../../cache/cache.js';
import { initializeDatabase, closeDatabase } from '../../cache/db.js';
import { UsdaClient } from '../../clients/usda.js';
import { OpenFoodFactsClient } from '../../clients/openfoodfacts.js';
import { CustomFoodStore } from '../../clients/custom-store.js';
import type { NutritionData } from '../../types.js';
import { handleCalculateMeal } from '../calculate-meal.js';

const CHICKEN_NUTRITION: NutritionData = {
  foodId: '171705',
  source: 'usda',
  name: 'Chicken, breast, skinless, boneless',
  servingSize: { amount: 100, unit: 'g' },
  nutrients: {
    calories: { value: 165, available: true },
    protein_g: { value: 31, available: true },
    total_carbs_g: { value: 0, available: true },
    total_fat_g: { value: 3.6, available: true },
    fiber_g: { value: 0, available: true },
    cholesterol_mg: { value: 85, available: true },
  },
};

const RICE_NUTRITION: NutritionData = {
  foodId: '169756',
  source: 'usda',
  name: 'Rice, white, cooked',
  servingSize: { amount: 100, unit: 'g' },
  nutrients: {
    calories: { value: 130, available: true },
    protein_g: { value: 2.7, available: true },
    total_carbs_g: { value: 28.2, available: true },
    total_fat_g: { value: 0.3, available: true },
    fiber_g: { value: 0.4, available: true },
    cholesterol_mg: { value: 0, available: true },
  },
};

const MYSTERY_FOOD: NutritionData = {
  foodId: '999999',
  source: 'usda',
  name: 'Mystery food',
  servingSize: { amount: 100, unit: 'g' },
  nutrients: {
    calories: { value: 100, available: true },
    protein_g: { value: 5, available: true },
    total_carbs_g: { value: 10, available: true },
    total_fat_g: { value: 2, available: true },
    cholesterol_mg: { value: 0, available: false },
  },
};

let cache: Cache;
let store: CustomFoodStore;

beforeEach(() => {
  closeDatabase();
  initializeDatabase(':memory:');
  cache = new Cache();
  store = new CustomFoodStore();
});

afterEach(() => {
  closeDatabase();
  vi.restoreAllMocks();
});

function makeDeps() {
  return {
    usda: new UsdaClient(cache, 'test-key'),
    off: new OpenFoodFactsClient(cache),
    store,
  };
}

describe('handleCalculateMeal', () => {
  it('sums nutrients for a two-item meal', async () => {
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);
    cache.setNutrition('usda', '169756', RICE_NUTRITION);

    const result = await handleCalculateMeal(makeDeps(), {
      items: [
        { foodId: '171705', source: 'usda', amount: 200, unit: 'g' },
        { foodId: '169756', source: 'usda', amount: 150, unit: 'g' },
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].servingDescription).toBe(
      '200g of Chicken, breast, skinless, boneless',
    );
    expect(result.items[1].servingDescription).toBe(
      '150g of Rice, white, cooked',
    );

    // Chicken 200g: calories = 165 * 2 = 330
    // Rice 150g:    calories = 130 * 1.5 = 195
    // Total:        525
    expect(result.totals.calories).toEqual({ value: 525, available: true });

    // Totals sum already-rounded per-item values (not raw per-100g values).
    // This is deliberate: each item is independently scaled and rounded by
    // scaleNutrient, then sumNutrients sums those rounded results.
    // Chicken 200g: protein = 31 * 2 = 62
    // Rice 150g:    protein = 2.7 * 1.5 = 4.05 -> 4.1 (rounded per-item)
    // Total:        62 + 4.1 = 66.1
    expect(result.totals.protein_g).toEqual({ value: 66.1, available: true });

    // Both items have all nutrients available
    expect(result.nutrientCoverage['calories']).toBe('full');
    expect(result.nutrientCoverage['protein_g']).toBe('full');
    expect(result.nutrientCoverage['cholesterol_mg']).toBe('full');
  });

  it('reports partial coverage when a nutrient is unavailable in some items', async () => {
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);
    cache.setNutrition('usda', '999999', MYSTERY_FOOD);

    const result = await handleCalculateMeal(makeDeps(), {
      items: [
        { foodId: '171705', source: 'usda', amount: 100, unit: 'g' },
        { foodId: '999999', source: 'usda', amount: 100, unit: 'g' },
      ],
    });

    // cholesterol_mg: chicken has available:true, mystery has available:false
    expect(result.nutrientCoverage['cholesterol_mg']).toBe('partial');
    expect(result.totals.cholesterol_mg.available).toBe(false);

    // Only the chicken's cholesterol value is summed (85), mystery contributes 0
    expect(result.totals.cholesterol_mg.value).toBe(85);

    // fiber_g: only chicken has it, mystery doesn't have the key at all
    expect(result.nutrientCoverage['fiber_g']).toBe('partial');

    // calories: both available
    expect(result.nutrientCoverage['calories']).toBe('full');
  });

  it('fails with a clear error when an item cannot be found', async () => {
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not found'));

    await expect(
      handleCalculateMeal(makeDeps(), {
        items: [
          { foodId: '171705', source: 'usda', amount: 100, unit: 'g' },
          { foodId: 'nonexistent', source: 'usda', amount: 100, unit: 'g' },
        ],
      }),
    ).rejects.toThrow(
      'Failed to get nutrition for item 1 (foodId: "nonexistent")',
    );
  });

  it('propagates stale dataFreshness from individual items', async () => {
    // First item: fresh cache
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);

    // Second item: expired cache entry triggers stale fallback
    const db = cache['db'];
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO nutrition_cache (cache_key, source, food_id, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'usda:169756',
      'usda',
      '169756',
      JSON.stringify(RICE_NUTRITION),
      now - 200,
      now - 1,
    );

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('API down'));

    const result = await handleCalculateMeal(makeDeps(), {
      items: [
        { foodId: '171705', source: 'usda', amount: 100, unit: 'g' },
        { foodId: '169756', source: 'usda', amount: 100, unit: 'g' },
      ],
    });

    expect(result.dataFreshness).toBe('stale');
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes('cached data'))).toBe(true);
  });

  it('aggregates warnings from multiple stale items', async () => {
    const db = cache['db'];
    const now = Math.floor(Date.now() / 1000);

    // Both items are expired cache entries
    db.prepare(
      `INSERT INTO nutrition_cache (cache_key, source, food_id, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'usda:171705',
      'usda',
      '171705',
      JSON.stringify(CHICKEN_NUTRITION),
      now - 200,
      now - 1,
    );
    db.prepare(
      `INSERT INTO nutrition_cache (cache_key, source, food_id, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'usda:169756',
      'usda',
      '169756',
      JSON.stringify(RICE_NUTRITION),
      now - 200,
      now - 1,
    );

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('API down'));

    const result = await handleCalculateMeal(makeDeps(), {
      items: [
        { foodId: '171705', source: 'usda', amount: 100, unit: 'g' },
        { foodId: '169756', source: 'usda', amount: 100, unit: 'g' },
      ],
    });

    expect(result.dataFreshness).toBe('stale');
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings![0]).toContain('cached data');
    expect(result.warnings![1]).toContain('cached data');
  });

  it('returns totals identical to per-item values for a single item', async () => {
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);

    const result = await handleCalculateMeal(makeDeps(), {
      items: [{ foodId: '171705', source: 'usda', amount: 100, unit: 'g' }],
    });

    expect(result.items).toHaveLength(1);

    // Totals should match the single item's nutrients exactly
    for (const key of Object.keys(result.items[0].nutrients)) {
      expect(result.totals[key].value).toBe(
        result.items[0].nutrients[key].value,
      );
      expect(result.totals[key].available).toBe(
        result.items[0].nutrients[key].available,
      );
    }

    // All nutrients should have full coverage
    for (const coverage of Object.values(result.nutrientCoverage)) {
      expect(coverage).toBe('full');
    }
  });

  it('computes totals for a meal with USDA and custom food items', async () => {
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);

    // Save a custom food (per-serving, piece-based)
    const { id: customId } = store.save({
      name: 'Dinner Roll',
      servingSize: { amount: 1, unit: 'piece' },
      nutrients: {
        calories: 110,
        protein_g: 3,
        total_carbs_g: 19,
        total_fat_g: 2,
      },
    });

    const result = await handleCalculateMeal(makeDeps(), {
      items: [
        { foodId: '171705', source: 'usda', amount: 200, unit: 'g' },
        { foodId: customId, source: 'custom', amount: 2, unit: 'piece' },
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].source).toBe('usda');
    expect(result.items[1].source).toBe('custom');

    // Chicken 200g: calories = 165 * 2 = 330
    // 2 rolls: calories = 110 * 2 = 220
    // Total: 550
    expect(result.totals.calories).toEqual({ value: 550, available: true });

    // Chicken 200g: protein = 31 * 2 = 62
    // 2 rolls: protein = 3 * 2 = 6
    // Total: 68
    expect(result.totals.protein_g).toEqual({ value: 68, available: true });
  });
});
