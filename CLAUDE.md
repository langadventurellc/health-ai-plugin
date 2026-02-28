# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Food Tracking AI - a low-friction nutritional tracking system. Users describe what they ate (text or photos) and get back calculated nutritional information. See `REQUIREMENTS.md` for the full specification.

## Architecture

Two components:

1. **Remote MCP Server** (`server/`) - TypeScript/Node.js, Streamable HTTP transport, deployed on AWS
2. **Claude Code Plugin** (`plugin/`) - Plugin with `nutrition-tracker` skill and MCP server config

### Core Design Constraint

The LLM reasons about *what* was eaten and *how much*. The MCP server does the *calculations*. All nutritional math must be deterministic (computed by the server, never by LLM probability).

### MCP Server

- **Stack:** TypeScript (ES2022, NodeNext), Express 5, MCP SDK, better-sqlite3, Zod
- **Data sources:** USDA FoodData Central (primary, generic foods) + Open Food Facts (branded/packaged products)
- **Implemented tools:** `search_food`, `get_nutrition`
- **Not yet implemented:** `calculate_meal`, `save_food`, OAuth 2.1 auth, volume/descriptive unit conversion
- **Cache:** SQLite with TTL revalidation (30d USDA, 7d Open Food Facts, 90d custom/saved, 24h search results)
- **Unit conversion (current):** Weight only -- g, kg, oz, lb. Volume and descriptive sizes are planned.
- **Graceful degradation:** When external APIs fail, stale cache data is served with `dataFreshness: "stale"` and warnings.

### Server Structure

```
server/src/
  index.ts          # Express app, Streamable HTTP transport, session management
  server.ts         # McpServer factory, tool registration
  types.ts          # Shared types (FoodSearchResult, NutritionData, NutrientValue)
  cache/
    db.ts           # SQLite singleton, schema creation, WAL mode
    cache.ts        # Cache class with TTL, query normalization (SHA-256)
  clients/
    usda.ts         # USDA FoodData Central client with cache-through reads
    openfoodfacts.ts # Open Food Facts client with cache-through reads
    types.ts        # Re-exports from ../types.ts
  tools/
    search-food.ts  # Deduplication logic, parallel source search, combined caching
    get-nutrition.ts # Unit conversion (weight), nutrient scaling from per-100g
```

### Key Patterns

- **Cache-through reads:** API clients check cache first, fall back to live API, fall back to stale cache.
- **Normalized nutrients:** All nutrition data stored as per-100g values. The `get_nutrition` tool scales to requested amounts.
- **`{ value, available }` pairs:** Every nutrient distinguishes "0g" from "data not available".
- **Cross-source deduplication:** `search_food` deduplicates USDA vs OFF results using name normalization and word overlap (>80% threshold).
- **Dependency injection:** Tool handlers receive client/cache deps as parameters for testability.

### Plugin

- `SKILL.md` guides conversation flow: parse → clarify (max 2-3 questions) → search → calculate → present with confidence score
- Images handled by Claude's built-in vision (nutrition labels and food photos)
- Restaurant food: LLM web searches then caches via `save_food` for consistency. Always check `search_food` before web searching.
- Confidence: 0-100% numeric + label (High/Good/Moderate/Low) with explanation of what was estimated

## Build, Run, Test

All commands run from `server/`:

```bash
npm install          # Install dependencies
npm run build        # TypeScript compile to dist/
npm run dev          # Dev server with hot reload (tsx watch)
npm start            # Production server from dist/
npm test             # Run all tests (vitest)
```

**Required env vars** (see `server/.env.example`):
- `USDA_API_KEY` -- free from https://fdc.nal.usda.gov/api-key-signup
- `PORT` -- defaults to 3000
- `SQLITE_DB_PATH` -- defaults to `./data/food-cache.db`

**Endpoints:**
- `GET /health` -- health check
- `POST /mcp` -- MCP Streamable HTTP (initialization and requests)
- `GET /mcp` -- SSE stream for server-initiated messages
- `DELETE /mcp` -- session termination

## Trellis

This project uses the Task Trellis issue tracking system. The parent epic is `E-food-tracking-ai`.
