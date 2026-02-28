---
id: T-implement-save-food-mcp-tool
title: Implement save_food MCP tool
status: done
priority: high
parent: F-custom-food-storage
prerequisites:
  - T-implement-custom-food-sqlite
affectedFiles:
  server/src/tools/save-food.ts: 'New file: save_food tool handler with
    validateNutrients validation and handleSaveFood function that delegates to
    CustomFoodStore.save()'
  server/src/server.ts: Added CustomFoodStore import and instantiation in
    createMcpServer, added store to ToolDeps interface, registered save_food
    tool with Zod input schema
  server/src/tools/__tests__/save-food.test.ts: 'New file: 4 unit tests covering
    successful save, negative calorie validation, NaN validation, and upsert
    behavior'
log:
  - >-
    Research phase complete. Reviewed:

    - server/src/server.ts (tool registration pattern, ToolDeps interface,
    createMcpServer factory)

    - server/src/tools/get-nutrition.ts (handler pattern with deps injection)

    - server/src/tools/search-food.ts (handler pattern)

    - server/src/clients/custom-store.ts (CustomFoodStore with save/get/search,
    SaveFoodInput interface)

    - server/src/types.ts (FoodSource, NutritionData, etc.)

    - server/src/cache/db.ts (getDatabase export)

    - server/src/tools/__tests__/get-nutrition.test.ts (test patterns: vitest,
    in-memory DB, beforeEach/afterEach)


    Plan:

    1. Create server/src/tools/save-food.ts with handleSaveFood handler

    2. Update server/src/server.ts to register save_food tool with
    CustomFoodStore

    3. Create server/src/tools/__tests__/save-food.test.ts with unit tests
  - 'Implemented the save_food MCP tool with handler, tool registration, and
    unit tests. The handler validates required nutrient fields (calories,
    protein_g, total_carbs_g, total_fat_g) are non-negative finite numbers, then
    delegates to CustomFoodStore.save(). The tool is registered in server.ts
    with a Zod schema matching the SaveFoodParams interface. CustomFoodStore is
    instantiated in createMcpServer using getDatabase(). Error responses follow
    the existing isError: true pattern. All 139 tests pass and quality checks
    (lint, format, type-check) are clean.'
schema: v1.0
childrenIds: []
created: 2026-02-28T20:07:56.303Z
updated: 2026-02-28T20:07:56.303Z
---

## Context

With the custom food storage layer in place (`CustomFoodStore` from `T-implement-custom-food-sqlite`), this task adds the `save_food` MCP tool that the LLM uses to persist nutrition data from web searches and nutrition label photos.

Parent feature: `F-custom-food-storage`

## Implementation Requirements

### 1. Tool handler: `server/src/tools/save-food.ts`

Create a new tool handler module following the same patterns as `server/src/tools/get-nutrition.ts` and `server/src/tools/search-food.ts`.

```typescript
interface SaveFoodDeps {
  store: CustomFoodStore;
}

interface SaveFoodParams {
  name: string;
  brand?: string;
  category?: string;
  servingSize: { amount: number; unit: string };
  nutrients: {
    calories: number;
    protein_g: number;
    total_carbs_g: number;
    total_fat_g: number;
    fiber_g?: number;
    sugar_g?: number;
    saturated_fat_g?: number;
    sodium_mg?: number;
    cholesterol_mg?: number;
    [key: string]: number | undefined;
  };
}

interface SaveFoodResponse {
  id: string;
  source: 'custom';
}

export async function handleSaveFood(
  deps: SaveFoodDeps,
  params: SaveFoodParams,
): Promise<SaveFoodResponse>;
```

The handler should validate that the four required nutrient fields (`calories`, `protein_g`, `total_carbs_g`, `total_fat_g`) are non-negative numbers, then delegate to `CustomFoodStore.save()`.

### 2. Tool registration in `server/src/server.ts`

Add `save_food` tool registration in the `registerTools` function, following the same pattern as the existing tools. Key changes:

- Import `CustomFoodStore` and `handleSaveFood`
- Create a `CustomFoodStore` instance in `createMcpServer` using `getDatabase()` from `server/src/cache/db.ts` (do not access the cache's private `db` field)
- Add `store: CustomFoodStore` to the `ToolDeps` interface
- Register the tool with Zod schema matching the `SaveFoodParams` interface:
  - `name`: `z.string().min(1)` (required)
  - `brand`: `z.string().optional()`
  - `category`: `z.string().optional()`
  - `servingSize`: `z.object({ amount: z.number().positive(), unit: z.string() })`
  - `nutrients`: `z.object(...)` with required calories/protein/carbs/fat and optional extras

Tool description: `"Save custom food nutrition data (from restaurant lookups, nutrition labels, etc.) for consistent future retrieval. If a food with the same name and brand already exists, it will be updated."`

### 3. Unit tests

Add `server/src/tools/__tests__/save-food.test.ts`:

- **Successful save**: Call `handleSaveFood` with valid input, verify it returns `{ id, source: "custom" }` with a non-empty ID string.
- **Validation**: Call with negative calorie value, verify it throws a descriptive error.
- **Upsert via handler**: Save same name+brand twice with different nutrients through the handler, verify second call returns same ID and updated data is retrievable from the store.

## Acceptance Criteria

- `save_food` MCP tool is registered and callable
- Tool accepts `name`, optional `brand`/`category`, `servingSize`, and `nutrients` object
- Returns `{ id: string, source: "custom" }` on success
- Validates required nutrient fields are non-negative
- Errors return `isError: true` with descriptive messages (matching existing tool error patterns)
- Unit tests pass

## Out of Scope

- The `CustomFoodStore` class itself (done in `T-implement-custom-food-sqlite`)
- Integration with `search_food`, `get_nutrition`, or `calculate_meal` (separate task)
- OAuth/authentication
