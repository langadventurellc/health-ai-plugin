---
id: T-usda-and-open-food-facts-api
title: USDA and Open Food Facts API Clients
status: done
priority: high
parent: F-mcp-server-core-and-food-data
prerequisites:
  - T-sqlite-caching-layer-with-ttl
affectedFiles:
  server/src/clients/types.ts: "Created shared types: NutritionData interface with
    foodId, source, name, servingSize, and nutrients map (NutrientValue with
    value+available flag). FoodSearchResult interface with id, source, name,
    brand, matchScore."
  server/src/clients/usda.ts: Created UsdaClient class with searchFoods and
    getNutrition methods. Includes USDA nutrient ID-to-key mapping,
    normalizeSearchResults and normalizeNutrition pure functions (exported for
    testing), cache-through reads, stale-cache fallback on API failure, 10s HTTP
    timeout.
  server/src/clients/openfoodfacts.ts: Created OpenFoodFactsClient class with
    searchFoods and getNutrition methods. Includes OFF nutriment key mapping,
    sodium g-to-mg conversion, User-Agent header, normalizeSearchResults and
    normalizeNutrition pure functions, cache-through reads, stale-cache
    fallback, 10s HTTP timeout.
  server/src/clients/__tests__/usda.test.ts: "10 unit tests: search normalization,
    result limit, nutrition normalization with available/unavailable flags,
    sparse data handling, cache hit/miss/stale integration with mocked fetch."
  server/src/clients/__tests__/openfoodfacts.test.ts: "14 unit tests: search
    normalization with name filtering, result limit, nutrition normalization,
    sodium conversion, sparse/empty/undefined nutriments handling, cache
    hit/miss/stale integration, product-not-found handling."
log:
  - >-
    Research complete. Codebase findings:

    - ESM project (type: module) with NodeNext module resolution, Node 25.3.0

    - Existing types in src/types.ts: FoodSource, FoodSearchResult,
    NutrientValue, NutrientBreakdown, NutritionResult

    - Cache layer exists at src/cache/cache.ts with Cache class: getNutrition,
    getNutritionStale, setNutrition, getSearchResults, getSearchResultsStale,
    setSearchResults

    - Test patterns: vitest, in-memory SQLite, beforeEach/afterEach cleanup

    - No vitest config file exists -- vitest runs with default config via
    "vitest run"

    - .env.example documents USDA_API_KEY


    Plan:

    1. Create server/src/clients/types.ts with NutritionData interface
    (extending/complementing existing types)

    2. Create server/src/clients/usda.ts - USDA FoodData Central client with
    searchFoods and getNutrition

    3. Create server/src/clients/openfoodfacts.ts - Open Food Facts client with
    searchFoods and getNutrition

    4. Create server/src/clients/__tests__/usda.test.ts - Tests for USDA
    normalization and cache integration

    5. Create server/src/clients/__tests__/openfoodfacts.test.ts - Tests for OFF
    normalization and cache integration

    6. Run tests and verify TypeScript compilation
  - >-
    Implemented USDA FoodData Central and Open Food Facts API clients with
    cache-through reads and graceful degradation.


    Created three source files:

    - clients/types.ts: NutritionData and FoodSearchResult interfaces with
    NutrientValue (value + available flag)

    - clients/usda.ts: UsdaClient class with searchFoods and getNutrition
    methods, USDA nutrient ID mapping (1008->calories, 1003->protein_g, etc.),
    response normalization, 10s HTTP timeout, cache-through reads, and
    stale-cache fallback on API failure

    - clients/openfoodfacts.ts: OpenFoodFactsClient class with searchFoods and
    getNutrition methods, OFF nutriment key mapping, sodium g-to-mg conversion,
    proper User-Agent header, cache-through reads, and stale-cache fallback


    Both clients: use Node.js built-in fetch, set AbortSignal.timeout(10s),
    catch all errors gracefully (return null/empty, never throw), check cache
    first on every request, store results in cache on miss, fall back to stale
    cache when API is unreachable, normalize to per-100g serving sizes.


    24 new unit tests across two test files covering: search response
    normalization, nutrition response normalization, available/unavailable
    nutrient flag correctness, sparse data handling, cache hit bypasses fetch,
    cache miss triggers fetch and caches results, stale fallback on API failure,
    empty results on total failure.
schema: v1.0
childrenIds: []
created: 2026-02-28T17:24:55.805Z
updated: 2026-02-28T17:24:55.805Z
---

## Context

This task implements the API clients for USDA FoodData Central and Open Food Facts. These clients handle HTTP requests to the external APIs, map responses into a normalized internal format, and integrate with the SQLite cache from `T-sqlite-caching-layer-with-ttl`. The clients are consumed by the MCP tools (`search_food`, `get_nutrition`) built in the next task.

Parent feature: `F-mcp-server-core-and-food-data`
Prerequisite: `T-sqlite-caching-layer-with-ttl` (cache layer must exist for cache-through reads)

## Implementation Requirements

### File Structure

```
server/src/
├── clients/
│   ├── usda.ts           # USDA FoodData Central client
│   ├── openfoodfacts.ts  # Open Food Facts client
│   └── types.ts          # Shared types for normalized food/nutrition data
```

### Normalized Data Types

Define shared types in `clients/types.ts` that both clients map into:

```typescript
interface FoodSearchResult {
  id: string;              // Source-specific ID (fdcId for USDA, barcode/id for OFF)
  source: "usda" | "openfoodfacts";
  name: string;
  brand: string | null;
  matchScore: number;      // Relevance ranking (normalized 0-1 or source-native)
}

interface NutrientValue {
  value: number;
  available: boolean;      // true = real data, false = nutrient not in source
}

interface NutritionData {
  foodId: string;
  source: "usda" | "openfoodfacts" | "custom";
  name: string;
  servingSize: { amount: number; unit: string };  // Base serving from source
  nutrients: {
    calories: NutrientValue;
    protein_g: NutrientValue;
    total_carbs_g: NutrientValue;
    total_fat_g: NutrientValue;
    fiber_g?: NutrientValue;
    sugar_g?: NutrientValue;
    saturated_fat_g?: NutrientValue;
    sodium_mg?: NutrientValue;
    cholesterol_mg?: NutrientValue;
    // ... additional nutrients when available
    [key: string]: NutrientValue | undefined;
  };
}
```

### USDA FoodData Central Client (`usda.ts`)

**API Reference:** https://fdc.nal.usda.gov/api-guide

- **`searchFoods(query: string)`**:
  - Calls `GET https://api.nal.usda.gov/fdc/v1/foods/search?query={query}&api_key={key}`
  - API key from env var `USDA_API_KEY`
  - Maps response to `FoodSearchResult[]`
  - Check search cache first; store results in search cache on miss
  - Limit results to a reasonable number (e.g., top 10-15 matches)

- **`getNutrition(fdcId: string)`**:
  - Calls `GET https://api.nal.usda.gov/fdc/v1/food/{fdcId}?api_key={key}`
  - Maps USDA nutrient data to the normalized `NutritionData` format
  - USDA uses nutrient IDs (e.g., 1008 = Energy/calories, 1003 = Protein). Create a mapping from USDA nutrient IDs to our normalized keys.
  - USDA returns nutrients per 100g -- store this as the base serving size
  - Check nutrition cache first; store in nutrition cache on miss

**USDA Nutrient ID Mapping** (key ones):
- 1008 → calories (kcal)
- 1003 → protein_g
- 1005 → total_carbs_g
- 1004 → total_fat_g
- 1079 → fiber_g
- 2000 → sugar_g
- 1258 → saturated_fat_g
- 1093 → sodium_mg
- 1253 → cholesterol_mg

### Open Food Facts Client (`openfoodfacts.ts`)

**API Reference:** https://wiki.openfoodfacts.org/API

- **`searchFoods(query: string)`**:
  - Calls `GET https://world.openfoodfacts.org/cgi/search.pl?search_terms={query}&json=1&page_size=10`
  - Maps response to `FoodSearchResult[]`
  - Check search cache first; store results on miss
  - Set a proper User-Agent header (Open Food Facts requires identifying your app)

- **`getNutrition(productId: string)`**:
  - Calls `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
  - Maps Open Food Facts `nutriments` object to normalized `NutritionData` format
  - OFF uses keys like `energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`
  - OFF data is per 100g -- store this as the base serving size
  - Check nutrition cache first; store on miss

### Error Handling and Graceful Degradation

Both clients must:
- Set reasonable HTTP timeouts (e.g., 10 seconds)
- Catch network errors and API failures gracefully -- return `null` or empty results, do not throw uncaught exceptions
- Log errors for debugging (use `console.error` or a simple logger)
- When an API call fails but cached data exists (even expired), the cache layer should be consulted as a fallback. Implement a `getStale(key)` method on the cache or handle this in the client by passing a `allowStale: true` option.
- Use Node.js built-in `fetch` (available in Node 18+) -- no need for axios or node-fetch

### Unit Tests

Write unit tests for:

- **Nutrient response normalization**: Given a sample USDA API response JSON, verify the client correctly maps it to the `NutritionData` format. Verify that nutrients present in the response have `available: true` and correct values, and nutrients absent have `available: false`.
- **Open Food Facts normalization**: Same pattern -- given a sample OFF response, verify correct mapping to `NutritionData`.
- **Cache integration**: Verify that a search call checks cache first and only calls the API on cache miss (mock the fetch call).

Use static sample API response data (fixtures) rather than calling real APIs in tests.

## Acceptance Criteria

- USDA client successfully searches and retrieves nutrition data from the USDA API (verifiable with a real API key)
- Open Food Facts client successfully searches and retrieves nutrition data
- Both clients map source-specific response formats to the shared `NutritionData` type
- Both clients integrate with the SQLite cache (cache-through reads, cache on miss)
- Both clients handle API errors gracefully without crashing the server
- When an API is unreachable, cached data (including stale) is served as fallback
- Nutrient `available` flag correctly distinguishes real data from absent data
- Unit tests pass for normalization and cache integration

## Out of Scope

- Volume or descriptive size unit conversion -- handled by `F-unit-conversion-and-meal`
- Search result deduplication across sources -- handled in the MCP tool layer (next task)
- `save_food` / custom food storage -- handled by `F-custom-food-storage`
- Barcode lookup for Open Food Facts -- not required for v1
- Rate limiting of outbound API calls