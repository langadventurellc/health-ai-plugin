---
id: T-build-calculate-meal-tool-for
title: Build calculate_meal tool for deterministic multi-item meal totals
status: done
priority: high
parent: F-unit-conversion-and-meal
prerequisites:
  - T-build-unit-conversion-module
affectedFiles:
  server/src/tools/calculate-meal.ts: Created handler with handleCalculateMeal
    function, supporting types (MealItem, CalculateMealParams,
    CalculateMealResponse, NutrientCoverage), and helper functions (leastFresh,
    collectNutrientKeys, aggregateNutrient, determineCoverage, sumNutrients)
  server/src/server.ts:
    Imported handleCalculateMeal and registered calculate_meal
    tool with Zod schema (items array with min(1), each item has foodId, source,
    amount, unit), following existing error handling pattern
  server/src/tools/__tests__/calculate-meal.test.ts: 'Created 4 tests: two-item
    meal summing, partial coverage detection, error propagation with clear item
    identification, and single-item identity verification'
log:
  - >-
    Research phase complete. Analyzed all relevant source files:

    - server/src/server.ts: Tool registration pattern (registerTool with Zod
    schema, try/catch, isError:true)

    - server/src/tools/get-nutrition.ts: handleGetNutrition returns
    GetNutritionResponse (extends NutritionResult with dataFreshness/warnings)

    - server/src/types.ts: NutrientValue, NutrientBreakdown, NutritionResult,
    DataFreshness types

    - server/src/tools/search-food.ts: leastFresh() pattern for DataFreshness
    comparison

    - server/src/tools/__tests__/get-nutrition.test.ts: Test patterns - uses
    Cache with :memory: SQLite, seed data via cache.setNutrition, creates
    UsdaClient/OpenFoodFactsClient per test

    - server/src/conversion/types.ts: PortionData, FoodConversionContext types


    Plan:

    1. Create server/src/tools/calculate-meal.ts with handleCalculateMeal

    2. Register calculate_meal tool in server/src/server.ts

    3. Create server/src/tools/__tests__/calculate-meal.test.ts with tests for
    two-item meal, partial coverage, error propagation, and single item

    4. Run quality checks
  - 'Built the `calculate_meal` MCP tool for deterministic multi-item meal
    nutrition totals. The tool takes an array of food items (each with foodId,
    source, amount, unit), calls `handleGetNutrition` sequentially for each
    item, and deterministically sums all nutrients. Key features: per-item
    nutritional breakdowns in the response, deterministic summed totals with
    proper rounding, nutrientCoverage reporting (full/partial/none) based on
    data availability across items, dataFreshness propagation using
    least-fresh-wins logic, warning aggregation from individual items, and clear
    error messages identifying which item failed (with index and foodId). All
    111 tests pass and all quality checks (lint, format, type-check) are clean.'
schema: v1.0
childrenIds: []
created: 2026-02-28T19:38:46.125Z
updated: 2026-02-28T19:38:46.125Z
---

## Context

The `calculate_meal` tool is one of the four core MCP tools defined in `REQUIREMENTS.md`. It takes an array of food items (each with `foodId`, `source`, `amount`, `unit`), calls `get_nutrition` internally for each, and deterministically sums all nutrients. This is pure arithmetic -- no estimation or LLM involvement.

This task depends on T-build-unit-conversion-module because `calculate_meal` internally calls `get_nutrition`, which must support all unit types (weight, volume, descriptive) before meal calculation can work end-to-end.

## Implementation Requirements

### 1. Create `server/src/tools/calculate-meal.ts`

**Input type:**

```typescript
interface CalculateMealParams {
  items: Array<{
    foodId: string;
    source: FoodSource;
    amount: number;
    unit: string;
  }>;
}
```

**Handler function:** `handleCalculateMeal(deps, params)` where deps includes the same `{ usda, off }` as `handleGetNutrition`.

**Logic:**

1. For each item in `params.items`, call `handleGetNutrition(deps, item)` sequentially (not in parallel, to avoid overwhelming external APIs)
2. Collect per-item results (the `NutritionResult` from each call)
3. Sum all nutrients across items deterministically:
   - For each nutrient key present in any item, sum the values
   - Track `available` status: a nutrient in the total is `available: true` only if it was `available: true` in ALL items
4. Build `nutrientCoverage` object: for each nutrient key, report whether data was available for all items ("full"), some items ("partial"), or no items ("none")
5. Collect `dataFreshness` and `warnings` from individual items -- use the least-fresh value across all items, and merge all warnings

**Output type:**

```typescript
interface CalculateMealResponse {
  items: Array<{
    foodId: string;
    source: FoodSource;
    servingDescription: string;
    nutrients: NutrientBreakdown;
  }>;
  totals: NutrientBreakdown;
  nutrientCoverage: Record<string, 'full' | 'partial' | 'none'>;
  dataFreshness?: DataFreshness;
  warnings?: string[];
}
```

**Error handling:**

- If any individual item fails (food not found, unsupported unit, etc.), the entire meal calculation should fail with a clear error identifying which item failed (include index and foodId)
- This follows the principle of not guessing -- partial results could be misleading

### 2. Register in `server/src/server.ts`

- Import `handleCalculateMeal`
- Register `calculate_meal` tool with Zod schema:
  - `items`: `z.array(z.object({ foodId: z.string(), source: z.enum(['usda', 'openfoodfacts', 'custom']), amount: z.number().positive(), unit: z.string() })).min(1)` -- require at least one item
- Tool description: "Calculate total nutrition for a meal by summing nutrients across multiple food items. Each item is looked up individually and totals are computed deterministically."
- Follow the same error handling pattern as the existing tools (try/catch, return `isError: true` on failure)

### 3. Unit tests

Create `server/src/tools/__tests__/calculate-meal.test.ts`:

- **Two-item meal test:** Set up two foods in cache (e.g., chicken breast and rice), call `handleCalculateMeal` with both, verify:
  - Per-item breakdowns match what `handleGetNutrition` would return individually
  - Totals are correct sums of individual items
  - `nutrientCoverage` shows "full" for nutrients available in both items
- **Partial coverage test:** Use one food with `cholesterol_mg: { available: true }` and one with `cholesterol_mg: { available: false }`. Verify `nutrientCoverage` reports "partial" for cholesterol.
- **Error propagation test:** Include a non-existent foodId in the items array. Verify the entire call fails with an error message identifying the failed item.
- **Single item test:** Verify that a single-item meal returns totals identical to per-item values.

## Acceptance Criteria

- `calculate_meal` tool is registered and callable via the MCP server
- Per-item nutritional breakdowns are correct
- Totals are deterministic sums of per-item values
- `nutrientCoverage` correctly distinguishes "full" vs "partial" vs "none" for each nutrient
- Stale data indicators and warnings are propagated from individual item lookups
- Errors in individual items cause the entire calculation to fail with a clear message
- All unit tests pass
- Code passes `mise run quality` (lint, format, type-check)

## Out of Scope

- Parallel item lookup (sequential is fine for typical meal sizes of 3-10 items)
- Meal saving/persistence
- Macro percentage calculations or dietary analysis
- Custom food source support (depends on F-custom-food-storage)
