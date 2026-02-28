import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeDatabase, closeDatabase } from '../../cache/db.js';
import { CustomFoodStore, generateCustomFoodId } from '../custom-store.js';
import type { SaveFoodInput } from '../custom-store.js';
import type { NutritionData } from '../types.js';

let store: CustomFoodStore;

const BASE_INPUT: SaveFoodInput = {
  name: 'Grilled Chicken Bowl',
  brand: 'Chipotle',
  category: 'Restaurant',
  servingSize: { amount: 200, unit: 'g' },
  nutrients: {
    calories: 400,
    protein_g: 32,
    total_carbs_g: 40,
    total_fat_g: 12,
    fiber_g: 4,
    sodium_mg: 800,
  },
};

beforeEach(() => {
  closeDatabase();
  initializeDatabase(':memory:');
  store = new CustomFoodStore();
});

afterEach(() => {
  closeDatabase();
  vi.restoreAllMocks();
});

describe('generateCustomFoodId', () => {
  it('produces deterministic IDs for same name+brand', () => {
    const id1 = generateCustomFoodId('Chicken Bowl', 'Chipotle');
    const id2 = generateCustomFoodId('Chicken Bowl', 'Chipotle');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^custom:[a-f0-9]{64}$/);
  });

  it('is case-insensitive', () => {
    const id1 = generateCustomFoodId('Chicken Bowl', 'Chipotle');
    const id2 = generateCustomFoodId('chicken bowl', 'chipotle');
    expect(id1).toBe(id2);
  });

  it('uses empty string for missing brand', () => {
    const id1 = generateCustomFoodId('Apple');
    const id2 = generateCustomFoodId('Apple');
    expect(id1).toBe(id2);
    // Verify it differs from a food with an explicit brand
    const id3 = generateCustomFoodId('Apple', 'Fuji');
    expect(id1).not.toBe(id3);
  });
});

describe('save and retrieve round-trip', () => {
  it('saves a food and retrieves it by ID with all fields', () => {
    const { id, source } = store.save(BASE_INPUT);
    expect(source).toBe('custom');

    const retrieved = store.get(id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.foodId).toBe(id);
    expect(retrieved!.source).toBe('custom');
    expect(retrieved!.name).toBe('Grilled Chicken Bowl');
    expect(retrieved!.storageMode).toBe('per-100g');
    expect(retrieved!.servingSize).toEqual({ amount: 100, unit: 'g' });

    // Nutrients should be normalized to per-100g (200g -> 100g = halved)
    expect(retrieved!.nutrients.calories).toEqual({
      value: 200,
      available: true,
    });
    expect(retrieved!.nutrients.protein_g).toEqual({
      value: 16,
      available: true,
    });
  });

  it('returns null for a non-existent ID', () => {
    expect(store.get('custom:nonexistent')).toBeNull();
  });
});

describe('upsert behavior', () => {
  it('updates existing entry when saving same name+brand with different nutrients', () => {
    const { id: id1 } = store.save(BASE_INPUT);

    const updated: SaveFoodInput = {
      ...BASE_INPUT,
      nutrients: {
        ...BASE_INPUT.nutrients,
        calories: 500,
        protein_g: 40,
      },
    };
    const { id: id2 } = store.save(updated);

    // Same deterministic ID
    expect(id1).toBe(id2);

    const retrieved = store.get(id1);
    expect(retrieved).not.toBeNull();

    // Nutrients should reflect the updated values (500/2 = 250 per 100g)
    expect(retrieved!.nutrients.calories).toEqual({
      value: 250,
      available: true,
    });
    expect(retrieved!.nutrients.protein_g).toEqual({
      value: 20,
      available: true,
    });
  });
});

describe('TTL expiration', () => {
  it('returns null from get() for expired entries', () => {
    const { id } = store.save(BASE_INPUT);

    // Manually expire the entry by updating expires_at in the DB
    const db = store['db'];
    const pastTime = Math.floor(Date.now() / 1000) - 1;
    db.prepare('UPDATE custom_foods SET expires_at = ? WHERE id = ?').run(
      pastTime,
      id,
    );

    expect(store.get(id)).toBeNull();
  });

  it('excludes expired entries from search results', () => {
    const { id } = store.save(BASE_INPUT);

    // Expire the entry
    const db = store['db'];
    const pastTime = Math.floor(Date.now() / 1000) - 1;
    db.prepare('UPDATE custom_foods SET expires_at = ? WHERE id = ?').run(
      pastTime,
      id,
    );

    const results = store.search('Chicken');
    expect(results).toHaveLength(0);
  });
});

describe('search', () => {
  it('finds foods by partial name match', () => {
    store.save(BASE_INPUT);
    store.save({
      ...BASE_INPUT,
      name: 'Veggie Bowl',
      brand: 'Sweetgreen',
    });

    const results = store.search('Bowl');
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.source === 'custom')).toBe(true);
  });

  it('finds foods by brand match', () => {
    store.save(BASE_INPUT);
    store.save({
      ...BASE_INPUT,
      name: 'Veggie Bowl',
      brand: 'Sweetgreen',
    });

    const results = store.search('Chipotle');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Grilled Chicken Bowl');
    expect(results[0].brand).toBe('Chipotle');
  });

  it('performs case-insensitive search', () => {
    store.save(BASE_INPUT);

    const results = store.search('grilled chicken');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Grilled Chicken Bowl');
  });

  it('assigns higher score for exact name match', () => {
    store.save({
      ...BASE_INPUT,
      name: 'Chicken',
      brand: undefined,
    });
    store.save({
      ...BASE_INPUT,
      name: 'Grilled Chicken Bowl',
      brand: undefined,
    });

    const results = store.search('Chicken');
    const exact = results.find((r) => r.name === 'Chicken');
    const partial = results.find((r) => r.name === 'Grilled Chicken Bowl');

    expect(exact).toBeDefined();
    expect(partial).toBeDefined();
    expect(exact!.matchScore).toBeGreaterThan(partial!.matchScore);
  });
});

describe('per-100g normalization (weight serving)', () => {
  it('normalizes nutrients to per-100g for gram-based serving', () => {
    const { id } = store.save({
      ...BASE_INPUT,
      servingSize: { amount: 200, unit: 'g' },
      nutrients: {
        calories: 400,
        protein_g: 30,
        total_carbs_g: 50,
        total_fat_g: 10,
      },
    });

    const data = store.get(id) as NutritionData;
    expect(data.storageMode).toBe('per-100g');
    expect(data.servingSize).toEqual({ amount: 100, unit: 'g' });
    expect(data.nutrients.calories).toEqual({ value: 200, available: true });
    expect(data.nutrients.protein_g).toEqual({ value: 15, available: true });
    expect(data.nutrients.total_carbs_g).toEqual({
      value: 25,
      available: true,
    });
    expect(data.nutrients.total_fat_g).toEqual({ value: 5, available: true });
  });

  it('normalizes nutrients for oz-based serving', () => {
    // 4 oz = 113.398 g, so factor = 100 / 113.398 ~= 0.8818
    const { id } = store.save({
      ...BASE_INPUT,
      servingSize: { amount: 4, unit: 'oz' },
      nutrients: {
        calories: 200,
        protein_g: 20,
        total_carbs_g: 0,
        total_fat_g: 12,
      },
    });

    const data = store.get(id) as NutritionData;
    expect(data.storageMode).toBe('per-100g');
    expect(data.servingSize).toEqual({ amount: 100, unit: 'g' });
    // 200 * (100 / 113.398) ~= 176.37
    expect(data.nutrients.calories.value).toBeCloseTo(176.37, 0);
    expect(data.nutrients.calories.available).toBe(true);
  });
});

describe('per-serving storage (non-weight serving)', () => {
  it('stores nutrients as-is for cup-based serving', () => {
    const { id } = store.save({
      ...BASE_INPUT,
      servingSize: { amount: 1, unit: 'cup' },
      nutrients: {
        calories: 250,
        protein_g: 8,
        total_carbs_g: 45,
        total_fat_g: 5,
      },
    });

    const data = store.get(id) as NutritionData;
    expect(data.storageMode).toBe('per-serving');
    expect(data.servingSize).toEqual({ amount: 1, unit: 'cup' });
    expect(data.nutrients.calories).toEqual({ value: 250, available: true });
    expect(data.nutrients.protein_g).toEqual({ value: 8, available: true });
    expect(data.nutrients.total_carbs_g).toEqual({
      value: 45,
      available: true,
    });
    expect(data.nutrients.total_fat_g).toEqual({ value: 5, available: true });
  });

  it('stores nutrients as-is for piece-based serving', () => {
    const { id } = store.save({
      ...BASE_INPUT,
      name: 'Croissant',
      brand: undefined,
      servingSize: { amount: 1, unit: 'piece' },
      nutrients: {
        calories: 230,
        protein_g: 5,
        total_carbs_g: 26,
        total_fat_g: 12,
      },
    });

    const data = store.get(id) as NutritionData;
    expect(data.storageMode).toBe('per-serving');
    expect(data.servingSize).toEqual({ amount: 1, unit: 'piece' });
    expect(data.nutrients.calories).toEqual({ value: 230, available: true });
  });

  it('normalizes nutrients to per-1-unit when amount is not 1', () => {
    const { id } = store.save({
      ...BASE_INPUT,
      servingSize: { amount: 2, unit: 'cup' },
      nutrients: {
        calories: 500,
        protein_g: 16,
        total_carbs_g: 90,
        total_fat_g: 10,
      },
    });

    const data = store.get(id) as NutritionData;
    expect(data.storageMode).toBe('per-serving');
    expect(data.servingSize).toEqual({ amount: 1, unit: 'cup' });
    // 500 calories for 2 cups -> 250 per cup
    expect(data.nutrients.calories).toEqual({ value: 250, available: true });
    expect(data.nutrients.protein_g).toEqual({ value: 8, available: true });
    expect(data.nutrients.total_carbs_g).toEqual({
      value: 45,
      available: true,
    });
    expect(data.nutrients.total_fat_g).toEqual({ value: 5, available: true });
  });
});

describe('input validation', () => {
  it('throws when servingSize.amount is zero', () => {
    expect(() =>
      store.save({
        ...BASE_INPUT,
        servingSize: { amount: 0, unit: 'g' },
      }),
    ).toThrow('Must be greater than 0');
  });

  it('throws when servingSize.amount is negative', () => {
    expect(() =>
      store.save({
        ...BASE_INPUT,
        servingSize: { amount: -1, unit: 'cup' },
      }),
    ).toThrow('Must be greater than 0');
  });
});

describe('LIKE wildcard escaping', () => {
  it('does not treat % in food names as SQL wildcards', () => {
    store.save({
      ...BASE_INPUT,
      name: '2% Milk',
      brand: undefined,
    });
    store.save({
      ...BASE_INPUT,
      name: 'Whole Milk',
      brand: undefined,
    });

    // Searching for "2%" should only match "2% Milk", not everything
    const results = store.search('2%');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('2% Milk');
  });

  it('does not treat _ in queries as single-character wildcard', () => {
    store.save({
      ...BASE_INPUT,
      name: 'A1 Sauce',
      brand: undefined,
    });
    store.save({
      ...BASE_INPUT,
      name: 'AB Sauce',
      brand: undefined,
    });

    // "_1" with unescaped _ would match both "A1" and "AB" (any char + "1")
    // but with escaping, "_1" should only match literal "_1"
    const results = store.search('_1');
    expect(results).toHaveLength(0);
  });
});

describe('expired row cleanup', () => {
  it('purges expired rows when saving a new food', () => {
    const { id: expiredId } = store.save({
      ...BASE_INPUT,
      name: 'Old Food',
      brand: undefined,
    });

    // Manually expire the entry
    const db = store['db'];
    const pastTime = Math.floor(Date.now() / 1000) - 1;
    db.prepare('UPDATE custom_foods SET expires_at = ? WHERE id = ?').run(
      pastTime,
      expiredId,
    );

    // Saving a new food should trigger purge of expired rows
    store.save({
      ...BASE_INPUT,
      name: 'New Food',
      brand: undefined,
    });

    // The expired row should be physically deleted, not just filtered
    const row = db
      .prepare('SELECT * FROM custom_foods WHERE id = ?')
      .get(expiredId);
    expect(row).toBeUndefined();
  });
});
