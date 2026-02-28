---
id: T-sqlite-caching-layer-with-ttl
title: SQLite Caching Layer with TTL Revalidation
status: done
priority: high
parent: F-mcp-server-core-and-food-data
prerequisites:
  - T-typescript-project-setup-and
affectedFiles:
  server/src/cache/db.ts: "Created database initialization module: singleton
    pattern, WAL mode, schema creation for nutrition_cache and search_cache
    tables, configurable path via SQLITE_DB_PATH env var"
  server/src/cache/cache.ts: Created Cache class with get/set/stale operations for
    nutrition and search data, TTL constants, query normalization with SHA-256
    hashing, isExpired helper, prepared statements
  server/src/cache/__tests__/cache.test.ts: Created 21 unit tests covering TTL
    expiration, stale retrieval, cache hit/miss, query normalization,
    source-specific TTL, WAL mode, and table creation
  server/package.json: Added vitest dev dependency and test script
log:
  - >-
    Research complete. Codebase findings:

    - ESM project (type: module) with NodeNext module resolution

    - better-sqlite3 v12.6.2 already installed

    - Existing patterns: function exports, JSDoc comments on public interfaces
    only

    - Source types defined in types.ts: "usda" | "openfoodfacts" | "custom"

    - No test framework installed yet (vitest needs to be added)

    - No cache/ directory exists yet


    Plan:

    1. Add vitest as dev dependency

    2. Create server/src/cache/db.ts - Database initialization, schema,
    connection management

    3. Create server/src/cache/cache.ts - Cache class with get/set/stale
    operations and TTL logic

    4. Create server/src/cache/__tests__/cache.test.ts - Unit tests

    5. Add vitest config and test script to package.json

    6. Run tests to verify everything passes

    7. Run build to verify TypeScript compiles
  - >-
    Implemented the SQLite caching layer with TTL revalidation. Created two
    modules under server/src/cache/: db.ts for database initialization
    (singleton pattern, WAL mode, schema creation with IF NOT EXISTS) and
    cache.ts with a Cache class providing get/set operations for both nutrition
    and search data. Key features:


    - TTL configuration: 30d USDA, 7d Open Food Facts, 90d custom, 24h search
    results

    - Standard get methods return null for expired entries (cache miss)

    - Stale get methods return data even if expired, supporting graceful
    degradation when APIs are unreachable

    - Search query normalization (lowercase, trim, collapse whitespace) with
    SHA-256 hashing for consistent cache keys

    - Prepared statements for all queries (performance + SQL injection safety)

    - Configurable database path via SQLITE_DB_PATH env var, defaults to
    ./data/food-cache.db


    Added vitest as dev dependency and wrote 21 unit tests covering: TTL
    expiration logic, stale data retrieval, cache hit/miss, search query
    normalization, source-specific TTL values, WAL mode verification, and table
    creation. All tests pass. TypeScript build compiles cleanly.
schema: v1.0
childrenIds: []
created: 2026-02-28T17:24:19.737Z
updated: 2026-02-28T17:24:19.737Z
---

## Context

This task builds the SQLite caching layer that stores API responses and search results with TTL-based revalidation. The cache is a core dependency for the food data clients and MCP tools -- it provides fast lookups, reduces external API calls, and enables graceful degradation when APIs are unavailable.

Parent feature: `F-mcp-server-core-and-food-data`
Prerequisite: `T-typescript-project-setup-and` (project skeleton must exist)

## Implementation Requirements

### File Structure

```
server/src/
├── cache/
│   ├── db.ts             # Database initialization, schema creation, connection management
│   └── cache.ts          # Cache operations: get, set, search, invalidation, TTL logic
```

### Database Schema

Create tables using `better-sqlite3`:

**`nutrition_cache`** -- Cached nutrition data per food item:
- `cache_key` TEXT PRIMARY KEY -- format: `{source}:{foodId}` (e.g., `usda:12345`, `openfoodfacts:12345678`)
- `source` TEXT NOT NULL -- `usda`, `openfoodfacts`, or `custom`
- `food_id` TEXT NOT NULL -- Source-specific food identifier
- `data` TEXT NOT NULL -- JSON blob of the full nutrition response
- `created_at` INTEGER NOT NULL -- Unix timestamp when cached
- `expires_at` INTEGER NOT NULL -- Unix timestamp when this entry expires

**`search_cache`** -- Cached search results:
- `cache_key` TEXT PRIMARY KEY -- format: `{source}:{query_hash}` where query_hash is a hash of the normalized search query
- `source` TEXT NOT NULL -- `usda`, `openfoodfacts`, or `all`
- `query` TEXT NOT NULL -- Original search query (for debugging)
- `data` TEXT NOT NULL -- JSON blob of search results array
- `created_at` INTEGER NOT NULL
- `expires_at` INTEGER NOT NULL

### TTL Configuration

Define TTL constants:
- USDA data: 30 days (2,592,000 seconds)
- Open Food Facts data: 7 days (604,800 seconds)
- Custom/saved foods: 90 days (7,776,000 seconds) -- used by `F-custom-food-storage` later
- Search results: 24 hours (86,400 seconds)

### Cache Operations

Implement a `Cache` class or module with:

- **`getNutrition(source, foodId)`** -- Returns cached data if present and not expired, `null` otherwise
- **`getNutritionStale(source, foodId)`** -- Returns cached data even if expired, `null` only if not present. This supports graceful degradation when external APIs are unreachable -- downstream consumers (API clients) can fall back to stale cached data rather than returning nothing.
- **`setNutrition(source, foodId, data)`** -- Stores nutrition data with appropriate TTL based on source
- **`getSearchResults(source, query)`** -- Returns cached search results if present and not expired. Hash the query for the cache key (normalize: lowercase, trim whitespace).
- **`getSearchResultsStale(source, query)`** -- Returns cached search results even if expired, for graceful degradation.
- **`setSearchResults(source, query, data)`** -- Stores search results with 24h TTL
- **`isExpired(expiresAt)`** -- Helper to check if a cache entry has expired
- **`initialize()`** -- Creates tables if they don't exist, enables WAL mode for better concurrent read performance

Note: The `*Stale()` methods are essential for the graceful degradation requirement in the parent feature. When external APIs fail, the API client layer (T-usda-and-open-food-facts-api) will use these to serve expired cached data rather than returning errors.

### Database Initialization

- SQLite database file stored at a configurable path (env var `SQLITE_DB_PATH`, default `./data/food-cache.db`)
- Create the `data/` directory if it doesn't exist
- Enable WAL journal mode
- Create tables with `IF NOT EXISTS`
- Run initialization on server startup

### Unit Tests

Write unit tests (using the project's test framework -- vitest is recommended, include it as a dev dependency if not already present) for:

- **TTL expiration logic**: Set a cache entry, verify it returns data before expiration, verify it returns `null` after expiration (use a short TTL or mock time)
- **Stale data retrieval**: Set a cache entry with a short TTL, let it expire, verify `getNutritionStale()` still returns the data while `getNutrition()` returns `null`
- **Cache hit/miss**: Store nutrition data, retrieve it by key, verify correct data returned. Query a non-existent key, verify `null`.
- **Search query normalization**: Verify that "Chicken Breast", "chicken breast", and "  chicken breast  " all produce the same cache key
- **Source-specific TTL**: Verify USDA entries get 30-day TTL, Open Food Facts entries get 7-day TTL

## Acceptance Criteria

- SQLite database is created automatically on first server startup
- Database persists across server restarts (file-based, not in-memory)
- Cache entries are stored and retrieved correctly by key
- Expired entries return `null` (treated as cache miss) via standard get methods
- Stale/expired entries are still retrievable via dedicated `*Stale()` methods for graceful degradation
- TTL values are correct per source type (30d USDA, 7d OFF, 24h search)
- Query normalization produces consistent cache keys
- Unit tests pass for TTL logic, stale retrieval, cache operations, and query normalization

## Out of Scope

- Custom food storage (`save_food`) -- handled by `F-custom-food-storage`
- Cache pre-loading/bootstrapping of common foods -- not required for v1
- Cache eviction beyond TTL (no LRU or size limits needed)
- Any API client code -- that is the next task