---
id: F-mcp-server-core-and-food-data
title: MCP Server Core and Food Data Integration
status: open
priority: high
parent: E-food-tracking-ai
prerequisites: []
affectedFiles: {}
log: []
schema: v1.0
childrenIds: []
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