import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Cache } from "../../cache/cache.js";
import { initializeDatabase, closeDatabase } from "../../cache/db.js";
import { OpenFoodFactsClient, normalizeSearchResults, normalizeNutrition } from "../openfoodfacts.js";

// -- Fixtures: Sample Open Food Facts API responses --

const SEARCH_RESPONSE = {
  count: 245,
  products: [
    {
      code: "3017620422003",
      product_name: "Nutella",
      brands: "Ferrero",
    },
    {
      code: "8000500310427",
      product_name: "Nutella B-ready",
      brands: "Ferrero",
    },
    {
      code: "0000000000000",
      // product_name is missing -- should be filtered out
      brands: "Unknown",
    },
  ],
};

const PRODUCT_RESPONSE = {
  status: 1,
  product: {
    code: "3017620422003",
    product_name: "Nutella",
    brands: "Ferrero",
    nutriments: {
      "energy-kcal_100g": 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      fiber_100g: 3.4,
      sugars_100g: 56.3,
      "saturated-fat_100g": 10.6,
      sodium_100g: 0.041,
      // cholesterol_100g deliberately omitted
    },
  },
};

const SPARSE_PRODUCT = {
  code: "1111111111111",
  product_name: "Sparse product",
  brands: undefined,
  nutriments: {
    "energy-kcal_100g": 100,
    // Everything else missing
  },
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
  it("maps OFF search products to FoodSearchResult[] and filters missing names", () => {
    const results = normalizeSearchResults(SEARCH_RESPONSE);

    // Third product has no product_name and should be excluded
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "3017620422003",
      source: "openfoodfacts",
      name: "Nutella",
      brand: "Ferrero",
      matchScore: 1,
    });
    expect(results[1]).toEqual({
      id: "8000500310427",
      source: "openfoodfacts",
      name: "Nutella B-ready",
      brand: "Ferrero",
      matchScore: 0.95,
    });
  });

  it("limits results to 10 items", () => {
    const manyProducts = {
      count: 25,
      products: Array.from({ length: 25 }, (_, i) => ({
        code: String(i),
        product_name: `Product ${i}`,
      })),
    };
    const results = normalizeSearchResults(manyProducts);
    expect(results).toHaveLength(10);
  });
});

describe("normalizeNutrition", () => {
  it("maps OFF nutriments to NutritionData with correct values", () => {
    const result = normalizeNutrition(PRODUCT_RESPONSE.product);

    expect(result.foodId).toBe("3017620422003");
    expect(result.source).toBe("openfoodfacts");
    expect(result.name).toBe("Nutella");
    expect(result.servingSize).toEqual({ amount: 100, unit: "g" });

    expect(result.nutrients.calories).toEqual({ value: 539, available: true });
    expect(result.nutrients.protein_g).toEqual({ value: 6.3, available: true });
    expect(result.nutrients.total_carbs_g).toEqual({ value: 57.5, available: true });
    expect(result.nutrients.total_fat_g).toEqual({ value: 30.9, available: true });
    expect(result.nutrients.fiber_g).toEqual({ value: 3.4, available: true });
    expect(result.nutrients.sugar_g).toEqual({ value: 56.3, available: true });
    expect(result.nutrients.saturated_fat_g).toEqual({ value: 10.6, available: true });

    // Cholesterol was omitted from the fixture
    expect(result.nutrients.cholesterol_mg).toEqual({ value: 0, available: false });
  });

  it("converts sodium from grams to milligrams", () => {
    const result = normalizeNutrition(PRODUCT_RESPONSE.product);
    expect(result.nutrients.sodium_mg).toEqual({ value: 41, available: true });
  });

  it("marks missing required nutrients as available: false", () => {
    const result = normalizeNutrition(SPARSE_PRODUCT);

    expect(result.nutrients.calories).toEqual({ value: 100, available: true });
    expect(result.nutrients.protein_g).toEqual({ value: 0, available: false });
    expect(result.nutrients.total_carbs_g).toEqual({ value: 0, available: false });
    expect(result.nutrients.total_fat_g).toEqual({ value: 0, available: false });
  });

  it("handles product with empty nutriments object", () => {
    const result = normalizeNutrition({
      code: "0000",
      product_name: "Empty",
      nutriments: {},
    });

    expect(result.nutrients.calories).toEqual({ value: 0, available: false });
    expect(result.nutrients.protein_g).toEqual({ value: 0, available: false });
  });

  it("handles product with undefined nutriments", () => {
    const result = normalizeNutrition({
      code: "0000",
      product_name: "No nutriments",
    });

    expect(result.nutrients.calories).toEqual({ value: 0, available: false });
    expect(result.name).toBe("No nutriments");
  });
});

describe("OpenFoodFactsClient cache integration", () => {
  it("returns cached search results without calling fetch", async () => {
    const cachedResults = [
      { id: "3017620422003", source: "openfoodfacts" as const, name: "Nutella", brand: "Ferrero", matchScore: 1 },
    ];
    cache.setSearchResults("openfoodfacts", "nutella", cachedResults);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = new OpenFoodFactsClient(cache);

    const result = await client.searchFoods("nutella");

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

    const client = new OpenFoodFactsClient(cache);
    const result = await client.searchFoods("nutella");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.data).toHaveLength(2);
    expect(result.freshness).toBe("live");
    expect(result.data[0].name).toBe("Nutella");

    // Verify results are now cached
    const cached = cache.getSearchResults("openfoodfacts", "nutella");
    expect(cached).toEqual(result.data);
  });

  it("returns cached nutrition data without calling fetch", async () => {
    const cachedNutrition = normalizeNutrition(PRODUCT_RESPONSE.product);
    cache.setNutrition("openfoodfacts", "3017620422003", cachedNutrition);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = new OpenFoodFactsClient(cache);

    const result = await client.getNutrition("3017620422003");

    expect(result).not.toBeNull();
    expect(result!.data).toEqual(cachedNutrition);
    expect(result!.freshness).toBe("cache");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches, normalizes, and caches nutrition on cache miss", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(PRODUCT_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new OpenFoodFactsClient(cache);
    const result = await client.getNutrition("3017620422003");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result!.freshness).toBe("live");
    expect(result!.data.foodId).toBe("3017620422003");
    expect(result!.data.source).toBe("openfoodfacts");
    expect(result!.data.nutrients.calories).toEqual({ value: 539, available: true });
    expect(result!.data.nutrients.protein_g).toEqual({ value: 6.3, available: true });

    // Verify result is now cached
    const cached = cache.getNutrition("openfoodfacts", "3017620422003");
    expect(cached).toEqual(result!.data);
  });

  it("falls back to stale cache when API fails", async () => {
    const db = cache["db"];
    const now = Math.floor(Date.now() / 1000);
    const staleData = [{ id: "1", source: "openfoodfacts", name: "Stale nutella", brand: "Ferrero", matchScore: 1 }];
    const { searchKey } = await import("../../cache/cache.js");
    const key = searchKey("openfoodfacts", "nutella");
    db.prepare(
      `INSERT INTO search_cache (cache_key, source, query, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(key, "openfoodfacts", "nutella", JSON.stringify(staleData), now - 200, now - 1);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const client = new OpenFoodFactsClient(cache);
    const result = await client.searchFoods("nutella");

    expect(result.data).toEqual(staleData);
    expect(result.freshness).toBe("stale");
  });

  it("returns empty array with stale freshness when search API fails and no stale cache exists", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const client = new OpenFoodFactsClient(cache);
    const result = await client.searchFoods("nonexistent");

    expect(result.data).toEqual([]);
    expect(result.freshness).toBe("stale");
  });

  it("returns null when getNutrition API fails and no stale cache exists", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const client = new OpenFoodFactsClient(cache);
    const result = await client.getNutrition("99999");

    expect(result).toBeNull();
  });

  it("returns null when product is not found (status 0)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: 0, product: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new OpenFoodFactsClient(cache);
    const result = await client.getNutrition("0000000000000");

    // status 0 with no product triggers fallback, which has no stale data
    expect(result).toBeNull();
  });
});
