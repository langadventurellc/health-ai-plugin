import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Cache } from "../../cache/cache.js";
import { initializeDatabase, closeDatabase } from "../../cache/db.js";
import { UsdaClient } from "../../clients/usda.js";
import { OpenFoodFactsClient } from "../../clients/openfoodfacts.js";
import type { NutritionData } from "../../types.js";
import {
  toGrams,
  scaleNutrient,
  scaleNutrients,
  handleGetNutrition,
} from "../get-nutrition.js";

// -- Fixture: Per-100g nutrition data --

const CHICKEN_NUTRITION: NutritionData = {
  foodId: "171705",
  source: "usda",
  name: "Chicken, breast, skinless, boneless",
  servingSize: { amount: 100, unit: "g" },
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

describe("toGrams", () => {
  it("converts grams (no-op)", () => {
    expect(toGrams(150, "g")).toBe(150);
  });

  it("converts kilograms", () => {
    expect(toGrams(1, "kg")).toBe(1000);
    expect(toGrams(0.5, "kg")).toBe(500);
  });

  it("converts ounces", () => {
    expect(toGrams(1, "oz")).toBeCloseTo(28.3495, 3);
    expect(toGrams(4, "oz")).toBeCloseTo(113.398, 3);
  });

  it("converts pounds", () => {
    expect(toGrams(1, "lb")).toBeCloseTo(453.592, 3);
    expect(toGrams(0.5, "lb")).toBeCloseTo(226.796, 3);
  });

  it("throws for unsupported units", () => {
    expect(() => toGrams(1, "cup")).toThrow("Unsupported unit: cup");
  });
});

describe("scaleNutrient", () => {
  it("scales per-100g value to requested grams", () => {
    const nutrient = { value: 165, available: true };
    const result = scaleNutrient(nutrient, 150);
    // 165 * (150/100) = 247.5
    expect(result).toEqual({ value: 247.5, available: true });
  });

  it("rounds to 1 decimal place", () => {
    const nutrient = { value: 31.02, available: true };
    const result = scaleNutrient(nutrient, 150);
    // 31.02 * 1.5 = 46.53
    expect(result).toEqual({ value: 46.5, available: true });
  });

  it("returns value: 0, available: false for unavailable nutrients", () => {
    const nutrient = { value: 0, available: false };
    const result = scaleNutrient(nutrient, 150);
    expect(result).toEqual({ value: 0, available: false });
  });

  it("handles zero grams", () => {
    const nutrient = { value: 165, available: true };
    const result = scaleNutrient(nutrient, 0);
    expect(result).toEqual({ value: 0, available: true });
  });
});

describe("scaleNutrients", () => {
  it("scales all nutrients for 150g of chicken breast", () => {
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

  it("scales correctly for oz conversion (4oz = ~113.4g)", () => {
    const grams = 4 * 28.3495; // ~113.398g
    const scaled = scaleNutrients(CHICKEN_NUTRITION, grams);

    // calories: 165 * (113.398/100) = 187.1067 -> 187.1
    expect(scaled.calories.value).toBeCloseTo(187.1, 0);
    expect(scaled.calories.available).toBe(true);

    // protein: 31.02 * (113.398/100) = 35.1564 -> 35.2
    expect(scaled.protein_g.value).toBeCloseTo(35.2, 0);
  });

  it("scales correctly for 1lb = 453.592g", () => {
    const grams = 453.592;
    const scaled = scaleNutrients(CHICKEN_NUTRITION, grams);

    // calories: 165 * (453.592/100) = 748.4268 -> 748.4
    expect(scaled.calories.value).toBeCloseTo(748.4, 0);
    expect(scaled.calories.available).toBe(true);
  });

  it("throws when required nutrients are missing from the data", () => {
    const malformed: NutritionData = {
      foodId: "bad",
      source: "usda",
      name: "Malformed food",
      servingSize: { amount: 100, unit: "g" },
      nutrients: {
        calories: { value: 100, available: true },
        // protein_g, total_carbs_g, total_fat_g are missing
      } as NutritionData["nutrients"],
    };

    expect(() => scaleNutrients(malformed, 100)).toThrow(
      "Nutrition data is malformed: missing required nutrients: protein_g, total_carbs_g, total_fat_g"
    );
  });
});

describe("handleGetNutrition", () => {
  it("returns scaled nutrition for USDA food", async () => {
    cache.setNutrition("usda", "171705", CHICKEN_NUTRITION);

    const usda = new UsdaClient(cache, "test-key");
    const off = new OpenFoodFactsClient(cache);

    const result = await handleGetNutrition(
      { usda, off },
      { foodId: "171705", source: "usda", amount: 200, unit: "g" }
    );

    expect(result.servingDescription).toBe("200g of Chicken, breast, skinless, boneless");
    // 165 * 2 = 330
    expect(result.nutrients.calories).toEqual({ value: 330, available: true });
    // 31.02 * 2 = 62.0 (rounded)
    expect(result.nutrients.protein_g).toEqual({ value: 62, available: true });
    // Fresh cache should not include stale indicator
    expect(result.dataFreshness).toBeUndefined();
  });

  it("throws when food is not found", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Not found"));

    const usda = new UsdaClient(cache, "test-key");
    const off = new OpenFoodFactsClient(cache);

    await expect(
      handleGetNutrition(
        { usda, off },
        { foodId: "nonexistent", source: "usda", amount: 100, unit: "g" }
      )
    ).rejects.toThrow('Nutrition data not found for food ID "nonexistent"');
  });

  it("throws for custom source (not yet supported)", async () => {
    const usda = new UsdaClient(cache, "test-key");
    const off = new OpenFoodFactsClient(cache);

    await expect(
      handleGetNutrition(
        { usda, off },
        { foodId: "custom-1", source: "custom", amount: 100, unit: "g" }
      )
    ).rejects.toThrow("Unsupported source: custom");
  });

  it("handles oz unit correctly end-to-end", async () => {
    cache.setNutrition("usda", "171705", CHICKEN_NUTRITION);

    const usda = new UsdaClient(cache, "test-key");
    const off = new OpenFoodFactsClient(cache);

    const result = await handleGetNutrition(
      { usda, off },
      { foodId: "171705", source: "usda", amount: 6, unit: "oz" }
    );

    expect(result.servingDescription).toBe("6oz of Chicken, breast, skinless, boneless");
    // 6oz = 170.097g; calories: 165 * 1.70097 = 280.66 -> 280.7
    expect(result.nutrients.calories.value).toBeCloseTo(280.7, 0);
    expect(result.nutrients.calories.available).toBe(true);
  });

  it("includes stale data indicator when serving stale cached data", async () => {
    // Seed stale nutrition data by inserting an already-expired entry
    const db = cache["db"];
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO nutrition_cache (cache_key, source, food_id, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("usda:171705", "usda", "171705", JSON.stringify(CHICKEN_NUTRITION), now - 200, now - 1);

    // API call will fail, triggering stale fallback
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("API down"));

    const usda = new UsdaClient(cache, "test-key");
    const off = new OpenFoodFactsClient(cache);

    const result = await handleGetNutrition(
      { usda, off },
      { foodId: "171705", source: "usda", amount: 100, unit: "g" }
    );

    expect(result.dataFreshness).toBe("stale");
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("cached data"))).toBe(true);
    // Data should still be correct
    expect(result.nutrients.calories).toEqual({ value: 165, available: true });
  });
});
