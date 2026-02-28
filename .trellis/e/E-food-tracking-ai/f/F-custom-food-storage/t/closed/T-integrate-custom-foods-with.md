---
id: T-integrate-custom-foods-with
title: Integrate custom foods with search_food, get_nutrition, and calculate_meal
status: done
priority: high
parent: F-custom-food-storage
prerequisites:
  - T-implement-custom-food-sqlite
  - T-implement-save-food-mcp-tool
affectedFiles:
  server/src/tools/search-food.ts: Added CustomFoodStore import and store to
    SearchFoodDeps. When source='all', custom foods are searched fresh via
    store.search() and prepended to results, both when hitting cache and when
    fetching live USDA/OFF results. Custom foods skip cross-source
    deduplication.
  server/src/tools/get-nutrition.ts: "Added CustomFoodStore import and store to
    GetNutritionDeps. Added scalePerServing() for per-serving custom foods
    (ratio-based scaling with unit validation). Replaced the 'Unsupported
    source: custom' error with actual custom food retrieval supporting both
    per-100g and per-serving storage modes."
  server/src/tools/calculate-meal.ts: Added CustomFoodStore import and store to
    CalculateMealDeps, enabling handleGetNutrition to receive the store
    dependency transitively.
  server/src/server.ts: Updated all three handler calls (handleSearchFood,
    handleGetNutrition, handleCalculateMeal) to pass deps.store.
  server/src/tools/__tests__/search-food.test.ts: "Added CustomFoodStore to
    imports and deps. Added 3 tests: custom foods appear in source='all'
    results, excluded from source-specific searches, and appear even when
    USDA/OFF results come from cache."
  server/src/tools/__tests__/get-nutrition.test.ts: "Added CustomFoodStore to
    imports and deps. Replaced 'throws for custom source' test with 5 new tests:
    per-100g custom food scaling, per-100g with different weight unit,
    per-serving ratio scaling, incompatible unit error for per-serving foods,
    and custom food not found error."
  server/src/tools/__tests__/calculate-meal.test.ts: 'Added CustomFoodStore to
    imports and deps (via makeDeps). Added 1 test: meal with mixed USDA and
    custom food items computes correct totals.'
log:
  - >-
    Research phase complete. Read all files that need modification:

    - server/src/tools/search-food.ts (add custom food search)

    - server/src/tools/get-nutrition.ts (replace custom source error with actual
    retrieval)

    - server/src/tools/calculate-meal.ts (pass store through deps)

    - server/src/server.ts (wire store into handler calls)

    - server/src/clients/custom-store.ts (reference for store API)

    - server/src/types.ts (reference for NutritionData/StorageMode)

    - server/src/conversion/units.ts (reference for unit detection)

    - All 3 test files (to add custom food test cases)


    Plan:

    1. Update search-food.ts: add store to deps, search custom foods fresh for
    source=all

    2. Update get-nutrition.ts: add store to deps, handle source=custom with
    per-100g and per-serving scaling

    3. Update calculate-meal.ts: add store to deps, pass to handleGetNutrition

    4. Update server.ts: pass store in handler calls

    5. Update all 3 test files with custom food test cases
  - >-
    Integrated custom foods with all three existing MCP tool handlers
    (search_food, get_nutrition, calculate_meal).


    Key changes:

    - search_food: When source='all', custom foods are always searched fresh via
    store.search() and merged into results, even when USDA/OFF results come from
    cache. Custom foods do not participate in cross-source deduplication.
    Source-specific filters ('usda', 'openfoodfacts') correctly exclude custom
    results.

    - get_nutrition: Replaced the 'Unsupported source: custom' error with real
    custom food retrieval. Per-100g stored foods use the existing convertToGrams
    + scaleNutrients pipeline. Per-serving stored foods use ratio-based scaling
    with unit validation (must request in the same unit the food was saved
    with). Custom food responses have no dataFreshness/warnings since they are
    authoritative local data.

    - calculate_meal: Added store to deps and passes it through to
    handleGetNutrition, enabling meals with mixed USDA/OFF/custom items.

    - All handler calls in server.ts updated to pass the store dependency.

    - Tests: Replaced the old 'throws for custom source' test with 5 new custom
    food tests in get-nutrition.test.ts, added 3 new tests in
    search-food.test.ts, and 1 new test in calculate-meal.test.ts. All 149 tests
    pass.
schema: v1.0
childrenIds: []
created: 2026-02-28T20:08:22.769Z
updated: 2026-02-28T20:08:22.769Z
---

## Context

With `CustomFoodStore` (`T-implement-custom-food-sqlite`) and the `save_food` tool (`T-implement-save-food-mcp-tool`) in place, the existing tools need to be updated so custom/saved foods appear in search results and are usable for nutrition lookups and meal calculations. Currently:

- `search_food` (`server/src/tools/search-food.ts`) only queries USDA and Open Food Facts
- `get_nutrition` (`server/src/tools/get-nutrition.ts`) throws `"Unsupported source: custom"` around line 117-119
- `calculate_meal` (`server/src/tools/calculate-meal.ts`) delegates to `get_nutrition`, so it will work automatically once `get_nutrition` supports custom

Parent feature: `F-custom-food-storage`

## Implementation Requirements

### 1. Wire `CustomFoodStore` into tool dependencies

In `server/src/server.ts`, the `ToolDeps` interface and `registerTools` function need to pass the `CustomFoodStore` to all tool handlers that need it:

- `handleSearchFood` needs `store: CustomFoodStore` in its deps to search custom foods
- `handleGetNutrition` needs `store: CustomFoodStore` in its deps to retrieve custom food nutrition
- `handleCalculateMeal` needs it transitively via `handleGetNutrition`

### 2. Update `search_food` handler (`server/src/tools/search-food.ts`)

Add custom food search to `handleSearchFood`:

- Add `store: CustomFoodStore` to the `SearchFoodDeps` interface
- When `source === 'all'`, also search custom foods via `store.search(query)` and merge results into the combined list (custom results should appear alongside USDA and OFF results)
- **Custom food search must happen independently of the combined search cache.** Always call `store.search(query)` fresh (it's a local SQLite query, not an API call) and merge custom results into the final list regardless of whether USDA/OFF results came from cache. This ensures recently saved custom foods always appear in search results without waiting for cache expiration.
- Custom foods should not participate in cross-source deduplication (they are unique user-saved entries)
- For `source === 'usda'` or `source === 'openfoodfacts'`, do NOT include custom results (the source filter is explicit)
- Custom food results have `source: "custom"` and are never "stale" (they are authoritative local data)

### 3. Update `get_nutrition` handler (`server/src/tools/get-nutrition.ts`)

Replace the `source === 'custom'` error throw with actual custom food retrieval:

- Add `store: CustomFoodStore` to the `GetNutritionDeps` interface (currently only `usda` and `off`)
- When `source === 'custom'`, call `store.get(foodId)` to retrieve the `NutritionData`
- If not found (null), throw the same "not found" error pattern as USDA/OFF
- **Scaling strategy depends on storage mode** (set by T-implement-custom-food-sqlite):
  - **Per-100g stored foods** (weight-based serving sizes): The existing `convertToGrams` + `scaleNutrients` pipeline works as-is.
  - **Per-serving stored foods** (non-weight serving sizes like cups, pieces): Scale by ratio from the stored serving size. For example, if stored as "1 cup" and user requests "2 cups", multiply all nutrients by 2. If the user requests a different unit than the stored serving unit, return an error (e.g., cannot convert "cups" to "pieces" without additional data).
- Custom food `NutritionData` may not have `densityGPerMl` or `portions`, so volume and descriptive unit conversions will correctly error when that data is absent (matching existing behavior for USDA foods without density/portion data)
- Custom foods are local authoritative data, so `freshness` should be `"live"` (not "cache" or "stale")

### 4. Update `calculate_meal` handler (`server/src/tools/calculate-meal.ts`)

- Add `store: CustomFoodStore` to the `CalculateMealDeps` interface
- Pass `store` through to `handleGetNutrition` calls
- No other changes needed -- the meal calculator already iterates items and delegates to `get_nutrition`

### 5. Unit tests

Update existing test files and add new test cases:

**`server/src/tools/__tests__/search-food.test.ts`** -- Add:

- Save a custom food via `CustomFoodStore`, then call `handleSearchFood` with `source: 'all'` and a matching query. Verify the custom food appears in results with `source: "custom"`.
- Verify custom foods do NOT appear when `source: 'usda'` or `source: 'openfoodfacts'`.
- Verify custom foods appear even when combined USDA/OFF results are served from cache (the cache bypass behavior).

**`server/src/tools/__tests__/get-nutrition.test.ts`** -- Update:

- Replace the "throws for custom source" test with a test that saves a custom food, then calls `handleGetNutrition` with `source: 'custom'` and verifies correct scaled nutrition is returned.
- Add a test for per-100g custom food with a different amount than the serving size, verifying correct proportional scaling.
- Add a test for per-serving custom food (non-weight unit), verifying ratio-based scaling works correctly.

**`server/src/tools/__tests__/calculate-meal.test.ts`** -- Add:

- Test a meal containing one USDA item and one custom item, verify totals are computed correctly.

## Acceptance Criteria

- `search_food` with `source: 'all'` includes matching custom foods in results
- Custom foods appear in search results even when USDA/OFF results are served from combined cache
- `get_nutrition` with `source: 'custom'` returns scaled nutrition data for saved foods
- Both per-100g and per-serving custom foods scale correctly in `get_nutrition`
- `calculate_meal` works with custom food items mixed with USDA/OFF items
- Custom food not found returns a descriptive error (not "unsupported source")
- All existing tests continue to pass (no regressions)
- New integration test cases pass

## Out of Scope

- Changes to the `CustomFoodStore` class itself
- Changes to the `save_food` tool handler
- OAuth/authentication
- Any new MCP tool definitions
