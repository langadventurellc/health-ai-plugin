import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Cache } from '../../cache/cache.js';
import { initializeDatabase, closeDatabase } from '../../cache/db.js';
import { UsdaClient } from '../../clients/usda.js';
import { OpenFoodFactsClient } from '../../clients/openfoodfacts.js';
import { CustomFoodStore } from '../../clients/custom-store.js';
import type { NutritionData } from '../../types.js';
import {
  scaleNutrient,
  scaleNutrients,
  handleGetNutrition,
} from '../get-nutrition.js';

// -- Fixture: Per-100g nutrition data --

const CHICKEN_NUTRITION: NutritionData = {
  foodId: '171705',
  source: 'usda',
  name: 'Chicken, breast, skinless, boneless',
  servingSize: { amount: 100, unit: 'g' },
  nutrients: {
    calories: { value: 165, available: true },
    protein_g: { value: 31.02, available: true },
    total_carbs_g: { value: 0, available: true },
    total_fat_g: { value: 3.57, available: true },
    fiber_g: { value: 0, available: true },
    sugar_g: { value: 0, available: true },
    saturated_fat_g: { value: 1.01, available: true },
    sodium_mg: { value: 74, available: true },
    cholesterol_mg: { value: 0, available: false },
  },
};

const MILK_NUTRITION: NutritionData = {
  foodId: '171265',
  source: 'usda',
  name: 'Milk, whole, 3.25% milkfat',
  servingSize: { amount: 100, unit: 'g' },
  densityGPerMl: 1.03,
  portions: [
    { portionDescription: '1 cup', gramWeight: 244, amount: 1 },
    { portionDescription: '1 tbsp', gramWeight: 15, amount: 1 },
  ],
  nutrients: {
    calories: { value: 61, available: true },
    protein_g: { value: 3.15, available: true },
    total_carbs_g: { value: 4.78, available: true },
    total_fat_g: { value: 3.27, available: true },
    fiber_g: { value: 0, available: true },
    sugar_g: { value: 5.05, available: true },
    saturated_fat_g: { value: 1.87, available: true },
    sodium_mg: { value: 43, available: true },
    cholesterol_mg: { value: 14, available: true },
  },
};

const BANANA_NUTRITION: NutritionData = {
  foodId: '173944',
  source: 'usda',
  name: 'Bananas, raw',
  servingSize: { amount: 100, unit: 'g' },
  portions: [
    {
      portionDescription: '1 medium (7" to 7-7/8" long)',
      modifier: 'medium',
      gramWeight: 118,
      amount: 1,
    },
    {
      portionDescription: '1 large (8" to 8-7/8" long)',
      modifier: 'large',
      gramWeight: 136,
      amount: 1,
    },
    {
      portionDescription: '1 small (6" to 6-7/8" long)',
      modifier: 'small',
      gramWeight: 101,
      amount: 1,
    },
  ],
  nutrients: {
    calories: { value: 89, available: true },
    protein_g: { value: 1.09, available: true },
    total_carbs_g: { value: 22.84, available: true },
    total_fat_g: { value: 0.33, available: true },
    fiber_g: { value: 2.6, available: true },
    sugar_g: { value: 12.23, available: true },
    saturated_fat_g: { value: 0.112, available: true },
    sodium_mg: { value: 1, available: true },
    cholesterol_mg: { value: 0, available: true },
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

describe('scaleNutrient', () => {
  it('scales per-100g value to requested grams', () => {
    const nutrient = { value: 165, available: true };
    const result = scaleNutrient(nutrient, 150);
    // 165 * (150/100) = 247.5
    expect(result).toEqual({ value: 247.5, available: true });
  });

  it('rounds to 1 decimal place', () => {
    const nutrient = { value: 31.02, available: true };
    const result = scaleNutrient(nutrient, 150);
    // 31.02 * 1.5 = 46.53
    expect(result).toEqual({ value: 46.5, available: true });
  });

  it('returns value: 0, available: false for unavailable nutrients', () => {
    const nutrient = { value: 0, available: false };
    const result = scaleNutrient(nutrient, 150);
    expect(result).toEqual({ value: 0, available: false });
  });

  it('handles zero grams', () => {
    const nutrient = { value: 165, available: true };
    const result = scaleNutrient(nutrient, 0);
    expect(result).toEqual({ value: 0, available: true });
  });
});

describe('scaleNutrients', () => {
  it('scales all nutrients for 150g of chicken breast', () => {
    const scaled = scaleNutrients(CHICKEN_NUTRITION, 150);

    expect(scaled.calories).toEqual({ value: 247.5, available: true });
    expect(scaled.protein_g).toEqual({ value: 46.5, available: true });
    expect(scaled.total_carbs_g).toEqual({ value: 0, available: true });
    expect(scaled.total_fat_g).toEqual({ value: 5.4, available: true });
    expect(scaled.fiber_g).toEqual({ value: 0, available: true });
    expect(scaled.sodium_mg).toEqual({ value: 111, available: true });
    // Cholesterol was unavailable in source data
    expect(scaled.cholesterol_mg).toEqual({ value: 0, available: false });
  });

  it('scales correctly for oz conversion (4oz = ~113.4g)', () => {
    const grams = 4 * 28.3495; // ~113.398g
    const scaled = scaleNutrients(CHICKEN_NUTRITION, grams);

    // calories: 165 * (113.398/100) = 187.1067 -> 187.1
    expect(scaled.calories.value).toBeCloseTo(187.1, 0);
    expect(scaled.calories.available).toBe(true);

    // protein: 31.02 * (113.398/100) = 35.1564 -> 35.2
    expect(scaled.protein_g.value).toBeCloseTo(35.2, 0);
  });

  it('scales correctly for 1lb = 453.592g', () => {
    const grams = 453.592;
    const scaled = scaleNutrients(CHICKEN_NUTRITION, grams);

    // calories: 165 * (453.592/100) = 748.4268 -> 748.4
    expect(scaled.calories.value).toBeCloseTo(748.4, 0);
    expect(scaled.calories.available).toBe(true);
  });

  it('throws when required nutrients are missing from the data', () => {
    const malformed: NutritionData = {
      foodId: 'bad',
      source: 'usda',
      name: 'Malformed food',
      servingSize: { amount: 100, unit: 'g' },
      nutrients: {
        calories: { value: 100, available: true },
        // protein_g, total_carbs_g, total_fat_g are missing
      } as NutritionData['nutrients'],
    };

    expect(() => scaleNutrients(malformed, 100)).toThrow(
      'Nutrition data is malformed: missing required nutrients: protein_g, total_carbs_g, total_fat_g',
    );
  });
});

describe('handleGetNutrition', () => {
  it('returns scaled nutrition for USDA food', async () => {
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const result = await handleGetNutrition(
      { usda, off, store },
      { foodId: '171705', source: 'usda', amount: 200, unit: 'g' },
    );

    expect(result.servingDescription).toBe(
      '200g of Chicken, breast, skinless, boneless',
    );
    // 165 * 2 = 330
    expect(result.nutrients.calories).toEqual({ value: 330, available: true });
    // 31.02 * 2 = 62.0 (rounded)
    expect(result.nutrients.protein_g).toEqual({ value: 62, available: true });
    // Fresh cache should not include stale indicator
    expect(result.dataFreshness).toBeUndefined();
  });

  it('throws when food is not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Not found'));

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    await expect(
      handleGetNutrition(
        { usda, off, store },
        { foodId: 'nonexistent', source: 'usda', amount: 100, unit: 'g' },
      ),
    ).rejects.toThrow('Nutrition data not found for food ID "nonexistent"');
  });

  it('returns scaled nutrition for per-100g custom food', async () => {
    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    // Save a weight-based custom food (normalized to per-100g by the store)
    const { id } = store.save({
      name: 'Homemade Granola',
      servingSize: { amount: 100, unit: 'g' },
      nutrients: {
        calories: 450,
        protein_g: 10,
        total_carbs_g: 60,
        total_fat_g: 18,
      },
    });

    const result = await handleGetNutrition(
      { usda, off, store },
      { foodId: id, source: 'custom', amount: 50, unit: 'g' },
    );

    expect(result.servingDescription).toBe('50g of Homemade Granola');
    // 450 * (50/100) = 225
    expect(result.nutrients.calories).toEqual({ value: 225, available: true });
    // 10 * (50/100) = 5
    expect(result.nutrients.protein_g).toEqual({ value: 5, available: true });
    // Custom food is authoritative local data -- no stale indicator
    expect(result.dataFreshness).toBeUndefined();
    expect(result.warnings).toBeUndefined();
  });

  it('scales per-100g custom food with different weight unit', async () => {
    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const { id } = store.save({
      name: 'Protein Powder',
      servingSize: { amount: 30, unit: 'g' },
      nutrients: {
        calories: 120,
        protein_g: 24,
        total_carbs_g: 3,
        total_fat_g: 1,
      },
    });

    // Request 2oz; store normalized 30g serving to per-100g
    const result = await handleGetNutrition(
      { usda, off, store },
      { foodId: id, source: 'custom', amount: 2, unit: 'oz' },
    );

    // 2oz = 56.699g; per-100g calories = 120 * (100/30) = 400
    // scaled: 400 * (56.699/100) = 226.796 -> 226.8
    expect(result.nutrients.calories.value).toBeCloseTo(226.8, 0);
  });

  it('scales per-serving custom food by ratio', async () => {
    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    // Save a non-weight-based serving (per-serving mode)
    const { id } = store.save({
      name: 'Birthday Cake Slice',
      servingSize: { amount: 1, unit: 'piece' },
      nutrients: {
        calories: 350,
        protein_g: 4,
        total_carbs_g: 50,
        total_fat_g: 15,
      },
    });

    const result = await handleGetNutrition(
      { usda, off, store },
      { foodId: id, source: 'custom', amount: 2, unit: 'piece' },
    );

    expect(result.servingDescription).toBe('2 piece Birthday Cake Slice');
    // 350 * 2 = 700
    expect(result.nutrients.calories).toEqual({ value: 700, available: true });
    // 4 * 2 = 8
    expect(result.nutrients.protein_g).toEqual({ value: 8, available: true });
  });

  it('throws when per-serving custom food is requested with incompatible unit', async () => {
    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const { id } = store.save({
      name: 'Cookie',
      servingSize: { amount: 1, unit: 'piece' },
      nutrients: {
        calories: 200,
        protein_g: 2,
        total_carbs_g: 28,
        total_fat_g: 10,
      },
    });

    await expect(
      handleGetNutrition(
        { usda, off, store },
        { foodId: id, source: 'custom', amount: 50, unit: 'g' },
      ),
    ).rejects.toThrow('Cannot convert "g" to "piece"');
  });

  it('throws when custom food is not found', async () => {
    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    await expect(
      handleGetNutrition(
        { usda, off, store },
        {
          foodId: 'custom:nonexistent',
          source: 'custom',
          amount: 100,
          unit: 'g',
        },
      ),
    ).rejects.toThrow(
      'Nutrition data not found for food ID "custom:nonexistent" from source "custom"',
    );
  });

  it('handles oz unit correctly end-to-end', async () => {
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const result = await handleGetNutrition(
      { usda, off, store },
      { foodId: '171705', source: 'usda', amount: 6, unit: 'oz' },
    );

    expect(result.servingDescription).toBe(
      '6oz of Chicken, breast, skinless, boneless',
    );
    // 6oz = 170.097g; calories: 165 * 1.70097 = 280.66 -> 280.7
    expect(result.nutrients.calories.value).toBeCloseTo(280.7, 0);
    expect(result.nutrients.calories.available).toBe(true);
  });

  it('includes stale data indicator when serving stale cached data', async () => {
    // Seed stale nutrition data by inserting an already-expired entry
    const db = cache['db'];
    const now = Math.floor(Date.now() / 1000);
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

    // API call will fail, triggering stale fallback
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('API down'));

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const result = await handleGetNutrition(
      { usda, off, store },
      { foodId: '171705', source: 'usda', amount: 100, unit: 'g' },
    );

    expect(result.dataFreshness).toBe('stale');
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes('cached data'))).toBe(true);
    // Data should still be correct
    expect(result.nutrients.calories).toEqual({ value: 165, available: true });
  });

  it('converts volume unit using density data', async () => {
    cache.setNutrition('usda', '171265', MILK_NUTRITION);

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const result = await handleGetNutrition(
      { usda, off, store },
      { foodId: '171265', source: 'usda', amount: 1, unit: 'cup' },
    );

    expect(result.servingDescription).toBe(
      '1 cup of Milk, whole, 3.25% milkfat',
    );
    // 1 cup = 236.588 mL * 1.03 g/mL = 243.686g
    // calories: 61 * (243.686/100) = 148.6
    expect(result.nutrients.calories.value).toBeCloseTo(148.6, 0);
  });

  it('throws when volume unit is used on food without density data', async () => {
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    await expect(
      handleGetNutrition(
        { usda, off, store },
        { foodId: '171705', source: 'usda', amount: 1, unit: 'cup' },
      ),
    ).rejects.toThrow('density data');
  });

  it('converts descriptive unit using portion data', async () => {
    cache.setNutrition('usda', '173944', BANANA_NUTRITION);

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const result = await handleGetNutrition(
      { usda, off, store },
      { foodId: '173944', source: 'usda', amount: 1, unit: 'medium' },
    );

    expect(result.servingDescription).toBe('1 medium Bananas, raw');
    // 1 medium banana = 118g; calories: 89 * (118/100) = 105.0
    expect(result.nutrients.calories.value).toBeCloseTo(105, 0);
  });

  it('throws when descriptive unit is used on food without portion data', async () => {
    cache.setNutrition('usda', '171705', CHICKEN_NUTRITION);

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    await expect(
      handleGetNutrition(
        { usda, off, store },
        { foodId: '171705', source: 'usda', amount: 1, unit: 'medium' },
      ),
    ).rejects.toThrow('no portion data available');
  });
});
