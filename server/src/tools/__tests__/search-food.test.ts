import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Cache } from '../../cache/cache.js';
import { initializeDatabase, closeDatabase } from '../../cache/db.js';
import { UsdaClient } from '../../clients/usda.js';
import { OpenFoodFactsClient } from '../../clients/openfoodfacts.js';
import { CustomFoodStore } from '../../clients/custom-store.js';
import type { FoodSearchResult } from '../../types.js';
import {
  normalizeName,
  wordOverlap,
  isDuplicate,
  deduplicateResults,
  handleSearchFood,
} from '../search-food.js';

// -- Fixtures --

const USDA_RESULTS: FoodSearchResult[] = [
  {
    id: '171705',
    source: 'usda',
    name: 'Chicken, breast, skinless, boneless',
    brand: null,
    matchScore: 247,
  },
  {
    id: '171706',
    source: 'usda',
    name: 'Chicken, thigh, skinless',
    brand: null,
    matchScore: 200,
  },
  {
    id: '171707',
    source: 'usda',
    name: 'Brown Rice',
    brand: null,
    matchScore: 150,
  },
];

const OFF_RESULTS: FoodSearchResult[] = [
  {
    id: '3017620422003',
    source: 'openfoodfacts',
    name: 'Chicken Breast Skinless Boneless',
    brand: 'FoodCo',
    matchScore: 0.95,
  },
  {
    id: '3017620422004',
    source: 'openfoodfacts',
    name: 'Organic Quinoa',
    brand: 'NatureBrand',
    matchScore: 0.9,
  },
  {
    id: '3017620422005',
    source: 'openfoodfacts',
    name: 'Brown Rice',
    brand: 'RiceCo',
    matchScore: 0.85,
  },
];

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

describe('normalizeName', () => {
  it('lowercases, strips punctuation, and removes common qualifiers', () => {
    expect(normalizeName('Chicken, BREAST (Raw)')).toBe('chicken breast');
    expect(normalizeName('Organic Brown Rice, Cooked')).toBe('brown rice');
  });
});

describe('wordOverlap', () => {
  it('returns 1.0 for identical word sets', () => {
    expect(wordOverlap('chicken breast', 'chicken breast')).toBe(1);
  });

  it('returns correct fraction for partial overlap', () => {
    // "chicken breast" shares 1 word ("chicken") with "chicken thigh" -> 1/2 = 0.5
    expect(wordOverlap('chicken breast', 'chicken thigh')).toBe(0.5);
  });

  it('returns 0 for empty strings', () => {
    expect(wordOverlap('', 'chicken')).toBe(0);
  });
});

describe('isDuplicate', () => {
  it('identifies cross-source duplicates by substring match', () => {
    const usda: FoodSearchResult = {
      id: '1',
      source: 'usda',
      name: 'Chicken Breast',
      brand: null,
      matchScore: 100,
    };
    const off: FoodSearchResult = {
      id: '2',
      source: 'openfoodfacts',
      name: 'Chicken Breast Skinless',
      brand: null,
      matchScore: 0.9,
    };
    expect(isDuplicate(usda, off)).toBe(true);
  });

  it('does not flag items from the same source', () => {
    const a: FoodSearchResult = {
      id: '1',
      source: 'usda',
      name: 'Chicken Breast',
      brand: null,
      matchScore: 100,
    };
    const b: FoodSearchResult = {
      id: '2',
      source: 'usda',
      name: 'Chicken Breast',
      brand: null,
      matchScore: 90,
    };
    expect(isDuplicate(a, b)).toBe(false);
  });

  it('does not flag clearly different items', () => {
    const usda: FoodSearchResult = {
      id: '1',
      source: 'usda',
      name: 'Chicken Breast',
      brand: null,
      matchScore: 100,
    };
    const off: FoodSearchResult = {
      id: '2',
      source: 'openfoodfacts',
      name: 'Organic Quinoa',
      brand: null,
      matchScore: 0.9,
    };
    expect(isDuplicate(usda, off)).toBe(false);
  });
});

describe('deduplicateResults', () => {
  it('removes OFF duplicates that match USDA items, keeping unique ones', () => {
    const result = deduplicateResults(USDA_RESULTS, OFF_RESULTS);

    // USDA items: chicken breast, chicken thigh, brown rice (3)
    // OFF items: chicken breast skinless boneless (dup of USDA chicken breast),
    //            organic quinoa (unique), brown rice (dup of USDA brown rice)
    // Expected: 3 USDA + 1 unique OFF (quinoa) = 4
    expect(result).toHaveLength(4);

    const sources = result.map((r) => `${r.source}:${r.id}`);
    expect(sources).toContain('usda:171705');
    expect(sources).toContain('usda:171706');
    expect(sources).toContain('usda:171707');
    expect(sources).toContain('openfoodfacts:3017620422004'); // Quinoa
  });

  it('returns all items when there are no duplicates', () => {
    const usda: FoodSearchResult[] = [
      { id: '1', source: 'usda', name: 'Apple', brand: null, matchScore: 100 },
    ];
    const off: FoodSearchResult[] = [
      {
        id: '2',
        source: 'openfoodfacts',
        name: 'Banana',
        brand: null,
        matchScore: 0.9,
      },
    ];
    const result = deduplicateResults(usda, off);
    expect(result).toHaveLength(2);
  });

  it('handles empty arrays', () => {
    expect(deduplicateResults([], [])).toHaveLength(0);
    expect(deduplicateResults(USDA_RESULTS, [])).toEqual(USDA_RESULTS);
    expect(deduplicateResults([], OFF_RESULTS)).toEqual(OFF_RESULTS);
  });
});

describe('handleSearchFood', () => {
  it('returns results from a single source when specified', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          foods: [{ fdcId: 1, description: 'Apple', score: 100 }],
          totalHits: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const response = await handleSearchFood(
      { usda, off, cache, store },
      { query: 'apple', source: 'usda' },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(response.results).toHaveLength(1);
    expect(response.results[0].source).toBe('usda');
    expect(response.warnings).toBeUndefined();
  });

  it('returns results from the working source and includes a warning when the other fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      let url: string;
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = input.url;
      }

      if (url.includes('nal.usda.gov')) {
        return Promise.reject(new Error('USDA is down'));
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            count: 1,
            products: [
              { code: '123', product_name: 'Apple Juice', brands: 'JuiceCo' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const response = await handleSearchFood(
      { usda, off, cache, store },
      { query: 'apple', source: 'all' },
    );

    // Should still get OFF results
    expect(response.results.length).toBeGreaterThanOrEqual(1);
    expect(response.results.some((r) => r.source === 'openfoodfacts')).toBe(
      true,
    );

    // Should include a warning about the USDA source being unavailable
    expect(response.warnings).toBeDefined();
    expect(response.warnings!.some((w) => w.includes('USDA'))).toBe(true);

    // Stale freshness since USDA fell back to stale (empty) results
    expect(response.dataFreshness).toBe('stale');
  });

  it('returns cached combined results on subsequent calls', async () => {
    const cachedResults: FoodSearchResult[] = [
      {
        id: '1',
        source: 'usda',
        name: 'Cached food',
        brand: null,
        matchScore: 100,
      },
    ];
    cache.setSearchResults('all', 'cached query', cachedResults);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const response = await handleSearchFood(
      { usda, off, cache, store },
      { query: 'cached query', source: 'all' },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    // Cached USDA/OFF results should still be present
    expect(response.results).toEqual(expect.arrayContaining(cachedResults));
    expect(response.dataFreshness).toBe('cache');
  });

  it('includes custom foods in results when source is all', async () => {
    store.save({
      name: 'Homemade Granola',
      servingSize: { amount: 100, unit: 'g' },
      nutrients: {
        calories: 450,
        protein_g: 10,
        total_carbs_g: 60,
        total_fat_g: 18,
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ foods: [], totalHits: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const response = await handleSearchFood(
      { usda, off, cache, store },
      { query: 'granola', source: 'all' },
    );

    const customResults = response.results.filter((r) => r.source === 'custom');
    expect(customResults).toHaveLength(1);
    expect(customResults[0].name).toBe('Homemade Granola');
  });

  it('does not include custom foods when source is usda or openfoodfacts', async () => {
    store.save({
      name: 'Homemade Granola',
      servingSize: { amount: 100, unit: 'g' },
      nutrients: {
        calories: 450,
        protein_g: 10,
        total_carbs_g: 60,
        total_fat_g: 18,
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          foods: [{ fdcId: 1, description: 'Granola Bar', score: 100 }],
          totalHits: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const usdaResponse = await handleSearchFood(
      { usda, off, cache, store },
      { query: 'granola', source: 'usda' },
    );

    expect(usdaResponse.results.every((r) => r.source !== 'custom')).toBe(true);
  });

  it('includes custom foods even when USDA/OFF results come from cache', async () => {
    // Pre-populate combined cache
    const cachedResults: FoodSearchResult[] = [
      {
        id: '1',
        source: 'usda',
        name: 'Granola Cereal',
        brand: null,
        matchScore: 100,
      },
    ];
    cache.setSearchResults('all', 'granola', cachedResults);

    // Save a custom food after cache was populated
    store.save({
      name: 'Homemade Granola',
      servingSize: { amount: 100, unit: 'g' },
      nutrients: {
        calories: 450,
        protein_g: 10,
        total_carbs_g: 60,
        total_fat_g: 18,
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const usda = new UsdaClient(cache, 'test-key');
    const off = new OpenFoodFactsClient(cache);

    const response = await handleSearchFood(
      { usda, off, cache, store },
      { query: 'granola', source: 'all' },
    );

    // No API calls since USDA/OFF results come from cache
    expect(fetchSpy).not.toHaveBeenCalled();
    // Should include both cached USDA results and fresh custom results
    expect(response.results).toHaveLength(2);
    expect(response.results.some((r) => r.source === 'custom')).toBe(true);
    expect(response.results.some((r) => r.source === 'usda')).toBe(true);
  });
});
