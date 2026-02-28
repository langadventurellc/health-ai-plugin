import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase, closeDatabase } from '../../cache/db.js';
import { CustomFoodStore } from '../../clients/custom-store.js';
import { handleSaveFood } from '../save-food.js';

let store: CustomFoodStore;

beforeEach(() => {
  closeDatabase();
  const db = initializeDatabase(':memory:');
  store = new CustomFoodStore(db);
});

afterEach(() => {
  closeDatabase();
});

const validParams = {
  name: 'Chipotle Burrito Bowl',
  brand: 'Chipotle',
  category: 'fast food',
  servingSize: { amount: 1, unit: 'bowl' },
  nutrients: {
    calories: 665,
    protein_g: 38,
    total_carbs_g: 68,
    total_fat_g: 24,
    fiber_g: 12,
    sodium_mg: 1530,
  },
};

describe('handleSaveFood', () => {
  it('saves a food and returns id with source "custom"', async () => {
    const result = await handleSaveFood({ store }, validParams);

    expect(result.id).toMatch(/^custom:/);
    expect(result.id.length).toBeGreaterThan('custom:'.length);
    expect(result.source).toBe('custom');
  });

  it('throws when a required nutrient is negative', async () => {
    const params = {
      ...validParams,
      nutrients: { ...validParams.nutrients, calories: -100 },
    };

    await expect(handleSaveFood({ store }, params)).rejects.toThrow(
      'Invalid nutrient value for "calories": -100. Must be non-negative.',
    );
  });

  it('throws when a required nutrient is NaN', async () => {
    const params = {
      ...validParams,
      nutrients: { ...validParams.nutrients, protein_g: NaN },
    };

    await expect(handleSaveFood({ store }, params)).rejects.toThrow(
      'Invalid nutrient value for "protein_g"',
    );
  });

  it('throws when an optional nutrient is negative', async () => {
    const params = {
      ...validParams,
      nutrients: { ...validParams.nutrients, fiber_g: -5 },
    };

    await expect(handleSaveFood({ store }, params)).rejects.toThrow(
      'Invalid nutrient value for "fiber_g": -5. Must be non-negative.',
    );
  });

  it('upserts when same name+brand is saved twice', async () => {
    const first = await handleSaveFood({ store }, validParams);

    const updatedParams = {
      ...validParams,
      nutrients: {
        ...validParams.nutrients,
        calories: 700,
      },
    };
    const second = await handleSaveFood({ store }, updatedParams);

    // Same ID returned for same name+brand
    expect(second.id).toBe(first.id);

    // Verify the stored data reflects the update
    const stored = store.get(first.id);
    expect(stored).not.toBeNull();
    expect(stored!.nutrients.calories.available).toBe(true);
    // The store normalizes per-serving to per-1-unit, so the value
    // should reflect the updated calories (700 / 1 = 700)
    expect(stored!.nutrients.calories.value).toBe(700);
  });

  it('preserves extra nutrient keys through round-trip', async () => {
    const params = {
      ...validParams,
      nutrients: {
        ...validParams.nutrients,
        potassium_mg: 420,
        vitamin_a_mcg: 75,
      },
    };

    const result = await handleSaveFood({ store }, params);
    const stored = store.get(result.id);

    expect(stored).not.toBeNull();
    expect(stored!.nutrients.potassium_mg).toEqual({
      value: 420,
      available: true,
    });
    expect(stored!.nutrients.vitamin_a_mcg).toEqual({
      value: 75,
      available: true,
    });
  });
});
