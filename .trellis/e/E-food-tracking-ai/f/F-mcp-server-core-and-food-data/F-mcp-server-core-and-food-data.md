---
id: F-mcp-server-core-and-food-data
title: MCP Server Core and Food Data Integration
status: done
priority: high
parent: E-food-tracking-ai
prerequisites: []
affectedFiles:
  server/package.json: "Created with all dependencies: @modelcontextprotocol/sdk,
    express, zod, better-sqlite3, and dev dependencies (typescript, tsx,
    @types/*). ESM module with dev/build/start scripts.; Added vitest dev
    dependency and test script"
  server/tsconfig.json: TypeScript config targeting ES2022, NodeNext module
    resolution, strict mode, output to dist/
  server/src/index.ts: "Entry point: Express app with health check, Streamable
    HTTP transport on /mcp (POST/GET/DELETE), stateful session management with
    per-session transport+server pairs; Added Cache import and shared cache
    instance creation. Passes cache to createMcpServer for each session."
  server/src/server.ts: "McpServer factory with placeholder search_food and
    get_nutrition tool stubs using zod input schemas; Replaced placeholder tool
    stubs with real implementations. createMcpServer now accepts Cache
    parameter, creates API clients internally, and registers tools with
    dependency injection. Added error handling that returns isError: true on
    failures."
  server/src/types.ts: "Shared TypeScript interfaces: FoodSearchResult,
    NutrientValue, NutrientBreakdown, NutritionResult"
  server/.env.example: "Documents required env vars: USDA_API_KEY and PORT"
  server/src/cache/db.ts: "Created database initialization module: singleton
    pattern, WAL mode, schema creation for nutrition_cache and search_cache
    tables, configurable path via SQLITE_DB_PATH env var"
  server/src/cache/cache.ts: Created Cache class with get/set/stale operations for
    nutrition and search data, TTL constants, query normalization with SHA-256
    hashing, isExpired helper, prepared statements
  server/src/cache/__tests__/cache.test.ts: Created 21 unit tests covering TTL
    expiration, stale retrieval, cache hit/miss, query normalization,
    source-specific TTL, WAL mode, and table creation
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
  server/src/tools/search-food.ts: "Created search_food tool handler with
    deduplication logic: normalizeName, wordOverlap, isDuplicate,
    deduplicateResults, and handleSearchFood. Searches sources in parallel,
    deduplicates across USDA and OFF, caches combined results, handles partial
    failures with warnings."
  server/src/tools/get-nutrition.ts: "Created get_nutrition tool handler with unit
    conversion and nutrient scaling: toGrams, scaleNutrient, scaleNutrients, and
    handleGetNutrition. Converts weight units to grams, scales per-100g
    nutrients, rounds to 1 decimal, builds serving description."
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
  - "Auto-completed: All child tasks are complete"
schema: v1.0
childrenIds:
  - T-search-food-and-get-nutrition
  - T-sqlite-caching-layer-with-ttl
  - T-typescript-project-setup-and
  - T-usda-and-open-food-facts-api
created: 2026-02-28T16:57:18.560Z
updated: 2026-02-28T16:57:18.560Z
---

## Purpose

Build the foundational MCP server and integrate with external food data sources. This is the base layer that all other features depend on -- it establishes the TypeScript project, Streamable HTTP transport, SQLite caching, and the primary tools for food search and nutrition lookup.

## Key Components

- **TypeScript/Node.js project setup** -- Package structure under `server/`, build tooling, dependencies
- **Streamable HTTP MCP transport** -- Server listens for MCP requests over HTTP (HTTPS handled at deployment layer)
- **SQLite caching layer** -- Database schema for caching API responses and search results with TTL-based revalidation:
  - USDA data: 30-day TTL
  - Open Food Facts data: 7-day TTL
  - Search results: 24-hour TTL
  - Cache key format: `{source}:{foodId}` for nutrition, `{source}:{query_hash}` for searches
- **USDA FoodData Central integration** -- Client for `/foods/search` and `/food/{fdcId}` endpoints (requires free API key)
- **Open Food Facts integration** -- Client for product search (no API key needed)
- **`search_food` tool** -- Search across USDA, Open Food Facts, and cached custom foods. Returns `id`, `source`, `name`, `brand`, `matchScore`. Deduplicates obvious matches across sources. Serves cached results when available and not expired.
- **`get_nutrition` tool** -- Nutritional breakdown for a specific food/amount. Returns `servingDescription`, `nutrients` object with `{ value, available }` pairs. Always includes calories, protein_g, total_carbs_g, total_fat_g. Includes additional nutrients when available from source data.
- **Graceful degradation** -- When external APIs are unavailable, serve cached data and indicate reduced confidence/availability

## Acceptance Criteria

- TypeScript project compiles and runs under `server/`
- MCP server accepts connections via Streamable HTTP transport
- `search_food` returns results from both USDA FoodData Central and Open Food Facts
- `search_food` deduplicates obvious matches across sources
- `search_food` returns cached results when available and within TTL
- `get_nutrition` returns per-amount nutritional breakdown with `{ value, available }` for each nutrient
- `get_nutrition` handles basic weight-based unit inputs (grams as baseline)
- SQLite database persists cached data across server restarts
- Cache entries expire and revalidate according to TTL (30d USDA, 7d OFF, 24h search)
- Server continues to function (serving cached data) when external APIs are unreachable

## Technical Notes

- Use the MCP TypeScript SDK for server implementation
- USDA API key loaded from environment variable
- `get_nutrition` in this feature handles basic weight units (g, oz, lb, kg). Full unit conversion (volume, descriptive sizes) is handled in a separate feature.
- No authentication in this feature -- that is handled separately

## Testing Requirements

- Unit tests for cache TTL logic (expiration, revalidation)
- Unit tests for search result deduplication
- Unit tests for nutrient response normalization (mapping source API formats to standard output format)