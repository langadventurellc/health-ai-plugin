---
id: T-implement-custom-food-sqlite
title: Implement custom food SQLite storage layer
status: done
priority: high
parent: F-custom-food-storage
prerequisites: []
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
log:
  - >-
    Research phase complete. Key findings:

    - db.ts: Singleton pattern with
    initializeDatabase/closeDatabase/getDatabase. Tables created in db.exec
    block.

    - cache.ts: TTL.custom = 90 days. Cache class takes optional
    Database.Database in constructor, falls back to getDatabase().

    - types.ts: NutritionData interface has foodId, source, name, servingSize,
    portions?, densityGPerMl?, nutrients. No storageMode field yet.

    - conversion/units.ts: isWeightUnit() checks against Set of g, kg, oz, lb.
    Will use this for normalization decisions.

    - Test pattern: beforeEach closes then inits with ':memory:', afterEach
    closes and restores mocks.

    - clients/types.ts: Re-exports from ../types.ts and ../conversion/types.ts.


    Plan:

    1. Add storageMode to NutritionData interface in types.ts (optional field,
    'per-100g' | 'per-serving')

    2. Add custom_foods table + indexes in db.ts initializeDatabase()

    3. Create CustomFoodStore class in server/src/clients/custom-store.ts

    4. Create tests in server/src/clients/__tests__/custom-store.test.ts
  - Implemented the custom food SQLite storage layer. Added a `custom_foods`
    table with case-insensitive indexes on name and brand. Created the
    `CustomFoodStore` class with save (deterministic SHA-256 ID, upsert via
    INSERT OR REPLACE, 90-day TTL), get (with expiration check), and search
    (LIKE-based case-insensitive text matching with scoring) methods.
    Weight-based serving sizes are normalized to per-100g before storage;
    non-weight serving sizes store nutrients as-is with a `storageMode` flag.
    Added `StorageMode` type and optional `storageMode` field to the
    `NutritionData` interface. All 16 unit tests pass covering round-trip,
    upsert, TTL expiration, search by name/brand, per-100g normalization, and
    per-serving storage.
schema: v1.0
childrenIds: []
created: 2026-02-28T20:07:37.026Z
updated: 2026-02-28T20:07:37.026Z
---

## Context

The food tracking server needs persistent storage for custom/saved foods (restaurant items, nutrition label data). The existing cache system (`server/src/cache/cache.ts`, `server/src/cache/db.ts`) handles USDA and Open Food Facts nutrition data in a `nutrition_cache` table and search results in a `search_cache` table. Custom foods need a dedicated table because they are user-created entities (not API cache entries) and require text search by name/brand, upsert by name+brand, and 90-day TTL expiration.

Parent feature: `F-custom-food-storage`

## Implementation Requirements

### 1. New SQLite table: `custom_foods`

Add a `custom_foods` table in `server/src/cache/db.ts` within the `initializeDatabase` function's `db.exec()` block. Schema:

```sql
CREATE TABLE IF NOT EXISTS custom_foods (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  brand      TEXT,
  category   TEXT,
  data       TEXT NOT NULL,       -- JSON: full NutritionData object
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_foods_name ON custom_foods(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_custom_foods_brand ON custom_foods(brand COLLATE NOCASE);
```

The `id` should be a deterministic string derived from name+brand (e.g., `custom:<sha256(lowercase(name) + "|" + lowercase(brand ?? ""))>`), enabling upsert via `INSERT OR REPLACE`. The `data` column stores a full `NutritionData` JSON blob (same structure used by the nutrition cache).

### 2. New module: `server/src/clients/custom-store.ts`

Create a `CustomFoodStore` class that encapsulates all custom food database operations. It should accept a `Database.Database` instance (from `better-sqlite3`) in its constructor, matching the dependency injection pattern used by `Cache`. Obtain the database via `getDatabase()` from `server/src/cache/db.ts` in production code.

Required methods:

- **`save(input: SaveFoodInput): { id: string; source: "custom" }`** -- Converts input to a `NutritionData` object, generates the deterministic ID, and performs `INSERT OR REPLACE`. Sets `expires_at` to `now + TTL.custom` (90 days, reuse from `server/src/cache/cache.ts`). Returns `{ id, source: "custom" }`.

- **`get(id: string): NutritionData | null`** -- Retrieves a single custom food by ID. Returns null if not found or expired (check `expires_at` against current time).

- **`search(query: string): FoodSearchResult[]`** -- Searches custom foods by name and brand using SQL `LIKE '%query%'` (case-insensitive via `COLLATE NOCASE`). Filters out expired entries. Returns results as `FoodSearchResult[]` with `source: "custom"` and a simple match score (e.g., exact match = 100, partial = 50).

**Nutrient storage strategy (per-serving vs per-100g):**

The storage strategy depends on whether the serving size unit is a weight unit:

- **Weight-based serving sizes** (g, oz, lb, kg): Normalize nutrients to per-100g before storing. For example, if serving size is "200g" and calories are 400, store `calories: { value: 200, available: true }` (per 100g). This enables the existing `convertToGrams` + `scaleNutrients` pipeline in `get_nutrition` to work as-is.

- **Non-weight serving sizes** (cup, tbsp, piece, etc.): Store nutrients as-is for 1 unit of the serving size and set `servingSize` to `{ amount: 1, unit: "<unit>" }` in the `NutritionData` object. Since there is no gram weight to normalize against, per-100g normalization is impossible. Instead, `get_nutrition` will scale these proportionally by ratio (e.g., "2 cups" of a food saved as "1 cup" = 2x nutrients). The integration task (T-integrate-custom-foods-with) is responsible for handling ratio-based scaling in `get_nutrition` for non-weight custom foods.

Store a `storageMode` field (or equivalent flag) in the `NutritionData` to distinguish between per-100g and per-serving storage, so `get_nutrition` knows which scaling strategy to apply.

**`SaveFoodInput` type:**

```typescript
interface SaveFoodInput {
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
```

### 3. Unit tests

Add `server/src/clients/__tests__/custom-store.test.ts` with tests for:

- **Save and retrieve round-trip**: Save a food, retrieve it by ID, verify all fields match.
- **Upsert behavior**: Save a food with name+brand, save again with same name+brand but different nutrients, verify only one entry exists with updated values and reset TTL.
- **TTL expiration**: Insert a custom food with an already-expired `expires_at`, verify `get()` returns null and `search()` excludes it.
- **Search by name**: Save foods with different names, search by partial name match, verify correct results.
- **Search by brand**: Save foods with brands, verify search matches on brand text.
- **Per-100g normalization (weight serving)**: Save a food with 200g serving, verify stored nutrients are halved (per-100g).
- **Per-serving storage (non-weight serving)**: Save a food with "1 cup" serving, verify stored nutrients are kept as-is (not normalized).

Use the same test setup pattern as existing tests: `initializeDatabase(':memory:')` in `beforeEach`, `closeDatabase()` in `afterEach`.

## Acceptance Criteria

- `custom_foods` table is created automatically when the database initializes
- `CustomFoodStore.save()` generates deterministic IDs and performs upsert (no duplicates for same name+brand)
- `CustomFoodStore.get()` returns null for expired entries
- `CustomFoodStore.search()` performs case-insensitive text matching and excludes expired entries
- Weight-based serving sizes are normalized to per-100g values before storage
- Non-weight serving sizes store nutrients per-serving with a flag indicating the storage mode
- All unit tests pass

## Out of Scope

- The `save_food` MCP tool registration and handler (separate task)
- Integration with `search_food`, `get_nutrition`, or `calculate_meal` tools (separate task)
- Any API endpoint changes
