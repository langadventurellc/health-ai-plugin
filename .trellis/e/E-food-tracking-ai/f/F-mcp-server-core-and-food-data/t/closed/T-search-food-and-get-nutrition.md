---
id: T-search-food-and-get-nutrition
title: search_food and get_nutrition MCP Tool Implementations
status: done
priority: high
parent: F-mcp-server-core-and-food-data
prerequisites:
  - T-usda-and-open-food-facts-api
affectedFiles:
  server/src/tools/search-food.ts: "Created search_food tool handler with
    deduplication logic: normalizeName, wordOverlap, isDuplicate,
    deduplicateResults, and handleSearchFood. Searches sources in parallel,
    deduplicates across USDA and OFF, caches combined results, handles partial
    failures with warnings."
  server/src/tools/get-nutrition.ts: "Created get_nutrition tool handler with unit
    conversion and nutrient scaling: toGrams, scaleNutrient, scaleNutrients, and
    handleGetNutrition. Converts weight units to grams, scales per-100g
    nutrients, rounds to 1 decimal, builds serving description."
  server/src/server.ts: "Replaced placeholder tool stubs with real
    implementations. createMcpServer now accepts Cache parameter, creates API
    clients internally, and registers tools with dependency injection. Added
    error handling that returns isError: true on failures."
  server/src/index.ts: Added Cache import and shared cache instance creation.
    Passes cache to createMcpServer for each session.
  server/src/tools/__tests__/search-food.test.ts: "13 unit tests covering: name
    normalization, word overlap calculation, cross-source duplicate detection,
    deduplication with overlapping results, single-source search, partial source
    failure, and combined cache hits."
  server/src/tools/__tests__/get-nutrition.test.ts: "16 unit tests covering:
    toGrams conversion for all supported units, scaleNutrient with
    available/unavailable nutrients, scaleNutrients for 150g/oz/lb amounts,
    handleGetNutrition end-to-end with USDA food, error on missing food, error
    on custom source, and oz unit conversion."
log:
  - >-
    Research complete. Codebase findings:


    - ESM project (type: module) with NodeNext module resolution

    - server.ts has createMcpServer() factory with placeholder tool stubs for
    search_food and get_nutrition

    - clients/types.ts re-exports from ../types.ts (FoodSource,
    FoodSearchResult, NutrientValue, NutritionData)

    - UsdaClient: searchFoods(query) -> FoodSearchResult[], getNutrition(fdcId)
    -> NutritionData | null

    - OpenFoodFactsClient: searchFoods(query) -> FoodSearchResult[],
    getNutrition(productId) -> NutritionData | null

    - Both clients have cache-through reads with stale fallback on API failure

    - Cache class at cache/cache.ts with getSearchResults, setSearchResults,
    getNutrition, setNutrition, and stale variants

    - Types in types.ts: FoodSearchResult, NutritionData (per-100g),
    NutrientValue, NutrientBreakdown, NutritionResult

    - Test patterns: vitest, in-memory SQLite via
    initializeDatabase(":memory:"), vi.spyOn for fetch mocking,
    beforeEach/afterEach cleanup

    - index.ts: createMcpServer() is called per-session (no shared state
    injected currently)


    Plan:

    1. Create server/src/tools/search-food.ts - search_food handler with
    deduplication logic

    2. Create server/src/tools/get-nutrition.ts - get_nutrition handler with
    unit conversion and nutrient scaling

    3. Update server/src/server.ts - Wire up real implementations with
    dependency injection (Cache, UsdaClient, OpenFoodFactsClient)

    4. Update server/src/index.ts - Pass cache to createMcpServer

    5. Create server/src/tools/__tests__/search-food.test.ts - Tests for
    deduplication, partial source failure

    6. Create server/src/tools/__tests__/get-nutrition.test.ts - Tests for unit
    conversion and nutrient scaling

    7. Run tests and verify TypeScript compilation
  - >-
    Implemented search_food and get_nutrition MCP tool handlers, replacing the
    placeholder stubs in server.ts with full implementations.


    search_food (tools/search-food.ts):

    - Searches USDA and Open Food Facts in parallel when source="all", or a
    single source when specified

    - Checks the combined "all" search cache before making API calls

    - Deduplicates results across sources using name normalization (strips
    punctuation, common qualifiers like "raw"/"cooked") and word overlap
    detection (>80% threshold) or substring matching

    - Prefers USDA results when deduplicating (more comprehensive nutrient data)

    - Handles partial source failures gracefully -- returns results from the
    working source with a warning

    - Caches combined/deduplicated results for subsequent calls


    get_nutrition (tools/get-nutrition.ts):

    - Fetches nutrition data from the appropriate client based on source
    parameter

    - Converts amount/unit to grams (supports g, kg, oz, lb) then scales all
    per-100g nutrients to the requested amount

    - Rounds nutrient values to 1 decimal place

    - Returns { value, available } pairs for each nutrient, preserving the
    available flag from source data

    - Builds human-readable serving description (e.g., "150g of Chicken Breast")

    - Returns clear error for unsupported sources (custom) and missing foods


    server.ts updated with dependency injection:

    - createMcpServer now accepts a Cache parameter

    - Creates UsdaClient and OpenFoodFactsClient internally and passes them to
    tool handlers

    - Tool registration uses real handlers with proper error handling (returns
    isError: true on failures)


    index.ts updated:

    - Creates shared Cache instance after database initialization

    - Passes cache to createMcpServer for each session


    29 new unit tests covering:

    - Name normalization, word overlap, and deduplication logic

    - Weight unit conversion (g, kg, oz, lb) and nutrient scaling

    - Partial source failure handling

    - Cache hit on combined search results

    - End-to-end handler tests with mocked clients
schema: v1.0
childrenIds: []
created: 2026-02-28T17:25:32.608Z
updated: 2026-02-28T17:25:32.608Z
---

## Context

This task replaces the placeholder tool stubs from the project setup with full implementations of `search_food` and `get_nutrition`. These tools compose the API clients and cache layer from previous tasks into the MCP interface that Claude interacts with. This is the final task for the core feature -- after this, the server is functional end-to-end for basic food search and nutrition lookup.

Parent feature: `F-mcp-server-core-and-food-data`
Prerequisite: `T-usda-and-open-food-facts-api` (API clients must exist)

## Implementation Requirements

### File Structure

```
server/src/
├── tools/
│   ├── search-food.ts      # search_food tool implementation
│   └── get-nutrition.ts    # get_nutrition tool implementation
├── server.ts               # Update: register real tools instead of stubs
```

### `search_food` Tool

**Input Schema (Zod):**
```typescript
{
  query: z.string().describe("Food search query"),
  source: z.enum(["usda", "openfoodfacts", "all"]).default("all").optional()
    .describe("Data source to search. Defaults to all.")
}
```

**Output:** Array of `FoodSearchResult` objects: `{ id, source, name, brand, matchScore }`

**Behavior:**
1. Check search cache first (key: `{source}:{hash(normalized_query)}`). If cached and not expired, return cached results.
2. If `source` is `"all"` (default), search both USDA and Open Food Facts in parallel (`Promise.all`).
3. If a specific source is requested, search only that source.
4. **Deduplicate obvious matches across sources.** Two results are considered duplicates when:
   - Names are very similar after normalization (lowercase, strip punctuation, trim). Use a simple similarity check -- e.g., one name contains the other, or Levenshtein distance is below a threshold relative to string length.
   - Both are from different sources (no need to dedup within a single source).
   - When deduplicating, prefer the USDA result (more comprehensive nutrient data) but note the Open Food Facts ID as an alternative.
5. Cache the combined/deduplicated results.
6. If one source fails (API error), still return results from the other source. Include a warning in the response if a source was unavailable.

**Deduplication Details:**

Keep deduplication simple. A reasonable approach:
- Normalize both names: lowercase, remove common qualifiers like "raw", "cooked", strip brand prefixes
- Check if one normalized name is a substring of the other, or if they share >80% of their words
- When in doubt, keep both results (false negatives are better than false positives -- the LLM can choose)

### `get_nutrition` Tool

**Input Schema (Zod):**
```typescript
{
  foodId: z.string().describe("Food ID from search results"),
  source: z.enum(["usda", "openfoodfacts", "custom"]).describe("Data source"),
  amount: z.number().positive().describe("Amount of food"),
  unit: z.enum(["g", "kg", "oz", "lb"]).describe("Unit of measurement (weight only in this feature)")
}
```

**Output:**
```typescript
{
  servingDescription: string;  // e.g., "150g of Chicken Breast"
  nutrients: {
    calories: { value: number, available: boolean };
    protein_g: { value: number, available: boolean };
    total_carbs_g: { value: number, available: boolean };
    total_fat_g: { value: number, available: boolean };
    // ... additional nutrients when available
  }
}
```

**Behavior:**
1. Fetch nutrition data from the appropriate client (USDA or Open Food Facts) based on `source`. The clients already handle caching internally.
2. Convert the requested `amount`/`unit` to grams (the base unit all source data is stored in per 100g):
   - `g` → no conversion
   - `kg` → multiply by 1000
   - `oz` → multiply by 28.3495
   - `lb` → multiply by 453.592
3. Scale all nutrient values from per-100g to the requested amount: `value * (grams / 100)`
4. Build the response with `servingDescription` (e.g., "150g of Chicken Breast") and all available nutrients with their `{ value, available }` pairs.
5. Round nutrient values to 1 decimal place.

### Tool Registration

Update `server.ts` to:
- Import the real tool implementations
- Replace placeholder stubs with actual `search_food` and `get_nutrition` handlers
- Pass the cache and API client instances to the tool handlers (dependency injection via constructor or function parameters)

### Graceful Degradation

- If both API sources fail and no cache exists, return an appropriate error message (not a crash)
- If a source fails but stale cache exists, serve stale data and include a note like `"dataFreshness": "stale"` or `"warning": "Using cached data; source API was unavailable"`

### Unit Tests

Write unit tests for:

- **Search deduplication**: Given two arrays of search results (one from USDA, one from OFF) with overlapping items, verify the deduplication logic correctly identifies and merges duplicates while keeping unique items.
- **Weight unit conversion and nutrient scaling**: Given a `NutritionData` object (per 100g) and a request for 150g, verify all nutrient values are scaled by 1.5. Test with oz and lb conversions too.
- **Partial source failure**: Mock one client to fail and verify `search_food` still returns results from the other source.

## Acceptance Criteria

- `search_food` returns results from both USDA and Open Food Facts when source is `"all"`
- `search_food` deduplicates obvious matches across sources
- `search_food` returns cached results when available and within TTL
- `search_food` handles partial source failures gracefully (returns results from available source)
- `get_nutrition` returns correct per-amount nutritional breakdown for weight-based units (g, kg, oz, lb)
- `get_nutrition` response includes `{ value, available }` for each nutrient
- `get_nutrition` always includes calories, protein_g, total_carbs_g, total_fat_g
- Nutrient values are correctly scaled from per-100g source data to the requested amount
- Server continues to function when external APIs are unreachable (serves cached/stale data)
- All unit tests pass
- End-to-end: MCP client can call `search_food` then `get_nutrition` and receive valid nutritional data

## Out of Scope

- Volume units (cup, tbsp, tsp, fl_oz, mL, L) -- handled by `F-unit-conversion-and-meal`
- Descriptive sizes ("medium", "large", "slice") -- handled by `F-unit-conversion-and-meal`
- `calculate_meal` tool -- handled by `F-unit-conversion-and-meal`
- `save_food` tool / custom food source -- handled by `F-custom-food-storage`
- Custom foods in search results -- handled by `F-custom-food-storage`
- OAuth authentication -- handled by `F-mcp-oauth-21-authentication`