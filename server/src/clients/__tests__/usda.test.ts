import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Cache } from "../../cache/cache.js";
import { initializeDatabase, closeDatabase } from "../../cache/db.js";
import { UsdaClient, normalizeSearchResults, normalizeNutrition } from "../usda.js";

// -- Fixtures: Sample USDA API responses --

const SEARCH_RESPONSE = {
  foods: [
    {
      fdcId: 171705,
      description: "Chicken, broilers or fryers, breast, skinless, boneless",
      brandOwner: undefined,
      score: 247.56,
    },
    {
      fdcId: 331960,
      description: "CHICKEN BREAST",
      brandOwner: "Tyson Foods Inc.",
      score: 189.32,
    },
  ],
  totalHits: 1542,
};

const FOOD_DETAIL_RESPONSE = {
  fdcId: 171705,
  description: "Chicken, broilers or fryers, breast, skinless, boneless",
  foodNutrients: [
    { nutrient: { id: 1008, name: "Energy", unitName: "kcal" }, amount: 165 },
    { nutrient: { id: 1003, name: "Protein", unitName: "g" }, amount: 31.02 },
    { nutrient: { id: 1005, name: "Carbohydrate, by difference", unitName: "g" }, amount: 0 },
    { nutrient: { id: 1004, name: "Total lipid (fat)", unitName: "g" }, amount: 3.57 },
    { nutrient: { id: 1079, name: "Fiber, total dietary", unitName: "g" }, amount: 0 },
    { nutrient: { id: 2000, name: "Sugars, total", unitName: "g" }, amount: 0 },
    { nutrient: { id: 1258, name: "Fatty acids, total saturated", unitName: "g" }, amount: 1.01 },
    { nutrient: { id: 1093, name: "Sodium, Na", unitName: "mg" }, amount: 74 },
    // cholesterol deliberately omitted to test available: false
    { nutrient: { id: 9999, name: "Some Unknown Nutrient", unitName: "mg" }, amount: 42 },
  ],
};

// Detail with missing required nutrients (no calories, no protein)
const SPARSE_FOOD_DETAIL = {
  fdcId: 99999,
  description: "Mystery food with sparse data",
  foodNutrients: [
    { nutrient: { id: 1004, name: "Total lipid (fat)", unitName: "g" }, amount: 5.0 },
  ],
};

let cache: Cache;

beforeEach(() => {
  closeDatabase();
  initializeDatabase(":memory:");
  cache = new Cache();
});

afterEach(() => {
  closeDatabase();
  vi.restoreAllMocks();
});

describe("normalizeSearchResults", () => {
  it("maps USDA search foods to FoodSearchResult[]", () => {
    const results = normalizeSearchResults(SEARCH_RESPONSE);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "171705",
      source: "usda",
      name: "Chicken, broilers or fryers, breast, skinless, boneless",
      brand: null,
      matchScore: 247.56,
    });
    expect(results[1]).toEqual({
      id: "331960",
      source: "usda",
      name: "CHICKEN BREAST",
      brand: "Tyson Foods Inc.",
      matchScore: 189.32,
    });
  });

  it("limits results to 15 items", () => {
    const manyFoods = {
      foods: Array.from({ length: 30 }, (_, i) => ({
        fdcId: i,
        description: `Food ${i}`,
        score: 100 - i,
      })),
      totalHits: 30,
    };
    const results = normalizeSearchResults(manyFoods);
    expect(results).toHaveLength(15);
  });
});

describe("normalizeNutrition", () => {
  it("maps USDA food detail to NutritionData with correct nutrient values", () => {
    const result = normalizeNutrition(FOOD_DETAIL_RESPONSE);

    expect(result.foodId).toBe("171705");
    expect(result.source).toBe("usda");
    expect(result.name).toBe("Chicken, broilers or fryers, breast, skinless, boneless");
    expect(result.servingSize).toEqual({ amount: 100, unit: "g" });

    // Present nutrients have available: true
    expect(result.nutrients.calories).toEqual({ value: 165, available: true });
    expect(result.nutrients.protein_g).toEqual({ value: 31.02, available: true });
    expect(result.nutrients.total_carbs_g).toEqual({ value: 0, available: true });
    expect(result.nutrients.total_fat_g).toEqual({ value: 3.57, available: true });
    expect(result.nutrients.fiber_g).toEqual({ value: 0, available: true });
    expect(result.nutrients.sugar_g).toEqual({ value: 0, available: true });
    expect(result.nutrients.saturated_fat_g).toEqual({ value: 1.01, available: true });
    expect(result.nutrients.sodium_mg).toEqual({ value: 74, available: true });

    // Cholesterol was omitted from the fixture -- should be available: false
    expect(result.nutrients.cholesterol_mg).toEqual({ value: 0, available: false });
  });

  it("marks missing required nutrients as available: false", () => {
    const result = normalizeNutrition(SPARSE_FOOD_DETAIL);

    expect(result.nutrients.calories).toEqual({ value: 0, available: false });
    expect(result.nutrients.protein_g).toEqual({ value: 0, available: false });
    expect(result.nutrients.total_carbs_g).toEqual({ value: 0, available: false });
    expect(result.nutrients.total_fat_g).toEqual({ value: 5.0, available: true });
  });
});

describe("UsdaClient cache integration", () => {
  it("returns cached search results without calling fetch", async () => {
    const cachedResults = [
      { id: "171705", source: "usda" as const, name: "Chicken", brand: null, matchScore: 100 },
    ];
    cache.setSearchResults("usda", "chicken", cachedResults);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = new UsdaClient(cache, "test-key");

    const result = await client.searchFoods("chicken");

    expect(result.data).toEqual(cachedResults);
    expect(result.freshness).toBe("cache");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls fetch and caches results on cache miss", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(SEARCH_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new UsdaClient(cache, "test-key");
    const result = await client.searchFoods("chicken breast");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.data).toHaveLength(2);
    expect(result.freshness).toBe("live");
    expect(result.data[0].name).toBe("Chicken, broilers or fryers, breast, skinless, boneless");

    // Verify results are now cached
    const cached = cache.getSearchResults("usda", "chicken breast");
    expect(cached).toEqual(result.data);
  });

  it("returns cached nutrition data without calling fetch", async () => {
    const cachedNutrition = normalizeNutrition(FOOD_DETAIL_RESPONSE);
    cache.setNutrition("usda", "171705", cachedNutrition);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = new UsdaClient(cache, "test-key");

    const result = await client.getNutrition("171705");

    expect(result).not.toBeNull();
    expect(result!.data).toEqual(cachedNutrition);
    expect(result!.freshness).toBe("cache");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches, normalizes, and caches nutrition on cache miss", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(FOOD_DETAIL_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new UsdaClient(cache, "test-key");
    const result = await client.getNutrition("171705");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result!.freshness).toBe("live");
    expect(result!.data.foodId).toBe("171705");
    expect(result!.data.source).toBe("usda");
    expect(result!.data.nutrients.calories).toEqual({ value: 165, available: true });
    expect(result!.data.nutrients.protein_g).toEqual({ value: 31.02, available: true });

    // Verify result is now cached
    const cached = cache.getNutrition("usda", "171705");
    expect(cached).toEqual(result!.data);
  });

  it("falls back to stale cache when API fails", async () => {
    // Seed stale data by inserting an already-expired entry
    const db = cache["db"];
    const now = Math.floor(Date.now() / 1000);
    const staleData = [{ id: "1", source: "usda", name: "Stale chicken", brand: null, matchScore: 50 }];
    const { searchKey } = await import("../../cache/cache.js");
    const key = searchKey("usda", "chicken");
    db.prepare(
      `INSERT INTO search_cache (cache_key, source, query, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(key, "usda", "chicken", JSON.stringify(staleData), now - 200, now - 1);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const client = new UsdaClient(cache, "test-key");
    const result = await client.searchFoods("chicken");

    expect(result.data).toEqual(staleData);
    expect(result.freshness).toBe("stale");
  });

  it("returns empty array with stale freshness when API fails and no stale cache exists", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const client = new UsdaClient(cache, "test-key");
    const result = await client.searchFoods("nonexistent food query");

    expect(result.data).toEqual([]);
    expect(result.freshness).toBe("stale");
  });

  it("returns null when getNutrition API fails and no stale cache exists", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const client = new UsdaClient(cache, "test-key");
    const result = await client.getNutrition("99999");

    expect(result).toBeNull();
  });
});
