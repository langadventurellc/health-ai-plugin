---
id: F-custom-food-storage
title: Custom Food Storage
status: done
priority: medium
parent: E-food-tracking-ai
prerequisites:
  - F-mcp-server-core-and-food-data
affectedFiles:
  server/src/types.ts: Added StorageMode type ('per-100g' | 'per-serving') and
    optional storageMode field to NutritionData interface
  server/src/clients/types.ts: Re-exported StorageMode type from ../types.ts
  server/src/cache/db.ts:
    Added custom_foods table with id, name, brand, category,
    data, created_at, expires_at columns and case-insensitive indexes on name
    and brand
  server/src/clients/custom-store.ts: 'New module: CustomFoodStore class with
    save(), get(), search() methods; SaveFoodInput interface;
    generateCustomFoodId helper; per-100g normalization for weight-based
    servings'
  server/src/clients/__tests__/custom-store.test.ts: 'New test file: 16 tests
    covering ID generation, save/retrieve round-trip, upsert behavior, TTL
    expiration, search by name/brand, per-100g normalization, and per-serving
    storage'
  server/src/tools/save-food.ts: 'New file: save_food tool handler with
    validateNutrients validation and handleSaveFood function that delegates to
    CustomFoodStore.save()'
  server/src/server.ts: Added CustomFoodStore import and instantiation in
    createMcpServer, added store to ToolDeps interface, registered save_food
    tool with Zod input schema; Updated all three handler calls
    (handleSearchFood, handleGetNutrition, handleCalculateMeal) to pass
    deps.store.
  server/src/tools/__tests__/save-food.test.ts: 'New file: 4 unit tests covering
    successful save, negative calorie validation, NaN validation, and upsert
    behavior'
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
  - 'Auto-completed: All child tasks are complete'
schema: v1.0
childrenIds:
  - T-implement-custom-food-sqlite
  - T-implement-save-food-mcp-tool
  - T-integrate-custom-foods-with
created: 2026-02-28T16:57:51.986Z
updated: 2026-02-28T16:57:51.986Z
---

## Purpose

Implement the `save_food` tool so the LLM can store nutrition data obtained from web searches (restaurant items) or nutrition label photos into the server's cache. This enables consistent repeat lookups -- once a restaurant dish or labeled product is saved, future requests return the same numbers without re-searching.

## Key Components

- **`save_food` tool** -- Accepts `name`, optional `brand` and `category`, `servingSize` ({ amount, unit }), and `nutrients` object. Returns `{ id, source: "custom" }`.
- **Custom food storage in SQLite** -- Stores entries with source "custom" and 90-day TTL. If a food with the same name and brand already exists, updates it and resets TTL.
- **Integration with `search_food`** -- Custom/saved foods appear in `search_food` results alongside USDA and Open Food Facts results.
- **Integration with `get_nutrition` and `calculate_meal`** -- Saved foods are usable by ID with these tools, supporting unit conversion based on the stored serving size.

## Acceptance Criteria

- `save_food` stores custom nutrition data and returns a usable `{ id, source: "custom" }` response
- Saved foods appear in `search_food` results when the query matches their name or brand
- Saved foods work with `get_nutrition` for amount-based lookups (scaling from stored serving size)
- Saved foods work with `calculate_meal` as items in a meal
- Duplicate name+brand entries are updated (upsert) with TTL reset rather than creating duplicates
- Custom food entries expire after 90 days
- Stored nutrients use the same `{ value, available }` format as other data sources

## Technical Notes

- The `save_food` input nutrients object should accept the same nutrient keys as `get_nutrition` output (calories, protein_g, total_carbs_g, total_fat_g, plus optional additional nutrients)
- Scaling custom foods: if a food is saved with serving size "1 cup" and the user later queries "2 cups", the server scales proportionally
- This is the mechanism the LLM uses to cache restaurant data and nutrition label data for consistency

## Testing Requirements

- Unit tests for save/retrieve round-trip (save a food, find it via search, get its nutrition)
- Unit test for upsert behavior (save same name+brand twice, verify update not duplicate)
- Unit test for TTL expiration of custom entries
