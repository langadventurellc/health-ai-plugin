# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Food Tracking AI - a low-friction nutritional tracking system. Users describe what they ate (text or photos) and get back calculated nutritional information. See `REQUIREMENTS.md` for the full specification.

## Architecture

Two components:

1. **Remote MCP Server** (`server/`) - TypeScript/Node.js, Streamable HTTP transport, deployed on AWS
2. **Claude Code Plugin** (`plugin/`) - Plugin with `nutrition-tracker` skill and MCP server config

### Core Design Constraint

The LLM reasons about _what_ was eaten and _how much_. The MCP server does the _calculations_. All nutritional math must be deterministic (computed by the server, never by LLM probability).

### MCP Server

- **Stack:** TypeScript (ES2022, NodeNext), Express 5, MCP SDK, better-sqlite3, Zod
- **Data sources:** USDA FoodData Central (primary, generic foods) + Open Food Facts (branded/packaged products) + Custom foods (user-saved via `save_food`)
- **Implemented tools:** `search_food`, `get_nutrition`, `calculate_meal`, `save_food`
- **Auth:** MCP OAuth 2.1 with PKCE, dynamic client registration, bearer token middleware on all `/mcp` routes. Single-user v1 (auto-approve). Uses MCP SDK's `mcpAuthRouter` and `requireBearerAuth`.
- **Cache:** SQLite with TTL revalidation (30d USDA, 7d Open Food Facts, 90d custom/saved, 24h search results)
- **Unit conversion:** Weight (g, kg, oz, lb), volume (cup, tbsp, tsp, fl_oz, mL, L) via per-food density, and descriptive sizes (piece, slice, small, medium, large) via USDA portion data. Errors when density or portion data is unavailable (never guesses).
- **Graceful degradation:** When external APIs fail, stale cache data is served with `dataFreshness: "stale"` and warnings.

### Server Structure

```
server/src/
  index.ts          # Express app, Streamable HTTP transport, session management
  server.ts         # McpServer factory, tool registration
  types.ts          # Shared types, NutrientValue, leastFresh helper
  auth/
    db.ts           # OAuth SQLite tables (oauth_clients, oauth_authorization_codes, oauth_tokens)
    clients-store.ts # SqliteClientsStore: dynamic client registration backed by SQLite
    provider.ts     # SqliteOAuthServerProvider: PKCE, token lifecycle (1h access, 30d refresh), auto-approve
  conversion/
    types.ts        # PortionData, FoodConversionContext
    units.ts        # convertToGrams (weight, volume, descriptive), unit detection
  cache/
    db.ts           # SQLite singleton, schema creation, WAL mode
    cache.ts        # Cache class with TTL, query normalization (SHA-256)
  clients/
    usda.ts         # USDA FoodData Central client, portion extraction, density derivation
    openfoodfacts.ts # Open Food Facts client with cache-through reads
    custom-store.ts # CustomFoodStore: save/get/search custom foods, per-100g normalization
    types.ts        # Re-exports from ../types.ts
  tools/
    search-food.ts  # Deduplication logic, parallel source search, combined caching
    get-nutrition.ts # Nutrient scaling from per-100g, delegates conversion to conversion/units
    calculate-meal.ts # Multi-item meal totals, nutrient coverage reporting
    save-food.ts    # Validates and saves custom food entries via CustomFoodStore
```

### Key Patterns

- **Cache-through reads:** API clients check cache first, fall back to live API, fall back to stale cache.
- **Normalized nutrients:** USDA/OFF nutrition data stored as per-100g values. Custom foods use `storageMode`: weight-based servings are normalized to per-100g; non-weight servings (cup, piece, etc.) are stored per-serving. `get_nutrition` handles both scaling paths.
- **`{ value, available }` pairs:** Every nutrient distinguishes "0g" from "data not available".
- **Volume-to-weight conversion:** USDA client extracts `foodPortions` and derives `densityGPerMl` from cup portions. The `conversion/units.ts` module handles all unit math; tool handlers never do conversion inline.
- **Cross-source deduplication:** `search_food` deduplicates USDA vs OFF results using name normalization and word overlap (>80% threshold). Custom foods are always searched fresh from SQLite and prepended to results without deduplication.
- **Custom food IDs:** Deterministic `custom:sha256(name|brand)` -- same name+brand always produces the same ID, enabling upsert semantics.
- **Dependency injection:** Tool handlers receive client/cache deps as parameters for testability.

### Plugin

- `SKILL.md` guides conversation flow: parse → clarify (max 2-3 questions) → search → calculate → present with confidence score
- Images handled by Claude's built-in vision (nutrition labels and food photos)
- Restaurant food: LLM web searches then caches via `save_food` for consistency. Always check `search_food` before web searching.
- Confidence: 0-100% numeric + label (High/Good/Moderate/Low) with explanation of what was estimated

## Setup

```bash
mise install         # Pin Node 24.11.0
npm install          # Root: installs husky, lint-staged (sets up git hooks)
cd server && npm install  # Server: installs project dependencies
```

Both `npm install` steps are required. Root installs repo-wide tooling (git hooks); `server/` installs project dependencies.

**Required env vars** (see `server/.env.example`):

- `USDA_API_KEY` -- free from https://fdc.nal.usda.gov/api-key-signup
- `PORT` -- defaults to 3000
- `SQLITE_DB_PATH` -- defaults to `./data/food-cache.db`
- `ISSUER_URL` -- OAuth 2.1 issuer identifier, defaults to `http://localhost:3000`. Must be `https` in production.

## Build, Run, Test

Prefer `mise run <task>` from the repo root. All mise tasks run in `server/` automatically.

```bash
mise run dev         # Dev server with hot reload
mise run build       # TypeScript compile to dist/
mise run start       # Production server (depends on build)
mise run test        # Run all tests (vitest), alias: mise run t
mise run lint        # ESLint --fix, alias: mise run l
mise run format      # Prettier --write, alias: mise run f
mise run type-check  # tsc --noEmit, alias: mise run tc
mise run quality     # All quality checks (lint + format + type-check)
```

Equivalent npm scripts exist in `server/package.json` (`npm run dev`, `npm run build`, `npm test`, `npm run lint`, `npm run format`).

**Endpoints:**

- `GET /health` -- health check (unauthenticated)
- `POST /mcp` -- MCP Streamable HTTP (initialization and requests, requires bearer token)
- `GET /mcp` -- SSE stream for server-initiated messages (requires bearer token)
- `DELETE /mcp` -- session termination (requires bearer token)
- OAuth 2.1 endpoints auto-mounted by MCP SDK's `mcpAuthRouter` (authorization, token, registration, `.well-known/oauth-authorization-server`)

## Code Quality

- **ESLint 9** flat config at repo root (`eslint.config.mjs`). Uses `typescript-eslint` with `projectService`, `sonarjs`, and `eslint-config-prettier`. Test files have relaxed rules.
- **Prettier** config at repo root (`.prettierrc`). Single quotes, trailing commas, 80 char width.
- **Pre-commit hooks:** Husky + lint-staged. On commit: lint-staged runs ESLint --fix and Prettier on staged files. If code files (`.ts`/`.js`) are staged, also runs type-check and tests.
- Never skip hooks (`--no-verify`) unless explicitly asked.

## Trellis

This project uses the Task Trellis issue tracking system. The parent epic is `E-food-tracking-ai`.
