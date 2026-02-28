---
id: T-typescript-project-setup-and
title: TypeScript Project Setup and MCP Server Skeleton
status: done
priority: high
parent: F-mcp-server-core-and-food-data
prerequisites: []
affectedFiles:
  server/package.json: "Created with all dependencies: @modelcontextprotocol/sdk,
    express, zod, better-sqlite3, and dev dependencies (typescript, tsx,
    @types/*). ESM module with dev/build/start scripts."
  server/tsconfig.json: TypeScript config targeting ES2022, NodeNext module
    resolution, strict mode, output to dist/
  server/src/index.ts: "Entry point: Express app with health check, Streamable
    HTTP transport on /mcp (POST/GET/DELETE), stateful session management with
    per-session transport+server pairs"
  server/src/server.ts: McpServer factory with placeholder search_food and
    get_nutrition tool stubs using zod input schemas
  server/src/types.ts: "Shared TypeScript interfaces: FoodSearchResult,
    NutrientValue, NutrientBreakdown, NutritionResult"
  server/.env.example: "Documents required env vars: USDA_API_KEY and PORT"
log:
  - >-
    Research complete. Plan:

    1. Create server/ directory structure

    2. Create package.json with all dependencies

    3. Create tsconfig.json targeting ES2022 with NodeNext modules

    4. Create src/types.ts with shared TypeScript types

    5. Create src/server.ts with McpServer instance and placeholder tool stubs

    6. Create src/index.ts with Express app, Streamable HTTP transport, health
    check

    7. Create .env.example

    8. Run npm install and npm run build to verify


    Key findings:

    - MCP SDK 1.27.1 has createMcpExpressApp() helper and
    StreamableHTTPServerTransport class

    - SDK requires zod ^3.25 || ^4.0 - will use zod@3.25.76

    - StreamableHTTPServerTransport.handleRequest(req, res, parsedBody) handles
    POST/GET/DELETE

    - McpServer.connect(transport) attaches transport

    - McpServer.tool() or registerTool() to register tools
  - "Created the TypeScript project under server/ with a fully functional MCP
    server skeleton using Streamable HTTP transport. The server initializes with
    Express, registers placeholder tool stubs for search_food and get_nutrition,
    and handles all three Streamable HTTP methods (POST, GET, DELETE) on /mcp
    with stateful session management. All acceptance criteria verified: npm
    install/build succeed, health check returns 200, MCP protocol messages are
    accepted, tools are visible to MCP clients, and .env.example documents
    required environment variables."
schema: v1.0
childrenIds: []
created: 2026-02-28T17:23:52.815Z
updated: 2026-02-28T17:23:52.815Z
---

## Context

This is the first task for the Food Tracking AI MCP server (`F-mcp-server-core-and-food-data`). Nothing exists yet under `server/` -- the entire project needs to be bootstrapped. This task creates the TypeScript project structure and a minimal MCP server that accepts connections via Streamable HTTP transport.

Parent feature: `F-mcp-server-core-and-food-data`
Parent epic: `E-food-tracking-ai`
Full requirements: `REQUIREMENTS.md` in the project root.

## Implementation Requirements

### Project Structure

Create the `server/` directory with:

```
server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Entry point: Express app + MCP server setup
│   ├── server.ts         # MCP server instance creation and tool registration (stubs)
│   └── types.ts          # Shared TypeScript types/interfaces
└── .env.example          # Document required env vars (USDA_API_KEY, PORT)
```

### Dependencies

- `@modelcontextprotocol/sdk` (stable 1.x -- currently 1.27.x) -- MCP server and Streamable HTTP transport
- `express` -- HTTP server
- `zod` (v3) -- Input schema validation (used by MCP SDK)
- `better-sqlite3` -- SQLite driver (dependency for the caching task, include it now to avoid a second setup pass)
- TypeScript, `tsx` (for dev), `@types/express`, `@types/better-sqlite3` as dev dependencies

### MCP Server Setup

In `src/index.ts` / `src/server.ts`:
- Create an `McpServer` instance with name `"food-tracking-ai"` and version from package.json
- Set up Express app with `express.json()` middleware
- Mount Streamable HTTP transport on the `/mcp` endpoint using `StreamableHTTPServerTransport`. The Streamable HTTP spec requires handling three HTTP methods on this path:
  - `POST /mcp` -- Primary endpoint for MCP protocol messages
  - `GET /mcp` -- SSE connection for server-initiated messages
  - `DELETE /mcp` -- Session termination
  - Follow the SDK's Express integration example for complete endpoint setup
- Register placeholder tool stubs for `search_food` and `get_nutrition` (these will be implemented in later tasks) so the server can be tested end-to-end
- Server listens on `PORT` from environment (default 3000)
- Add a basic health check endpoint (`GET /health`) that returns 200

### TypeScript Configuration

- Target: ES2022 or later
- Module: Node16 or NodeNext
- Strict mode enabled
- Output to `dist/`
- Include `src/**/*`

### Package Scripts

- `dev` -- Run with `tsx watch` for development
- `build` -- `tsc` compilation
- `start` -- Run compiled output from `dist/`

## Acceptance Criteria

- `npm install` succeeds in `server/`
- `npm run build` compiles without errors
- `npm run dev` starts the server and it listens on the configured port
- `GET /health` returns 200
- `POST /mcp` accepts MCP protocol messages (verifiable with `npx @modelcontextprotocol/inspector`)
- `GET /mcp` and `DELETE /mcp` are handled per the Streamable HTTP spec
- The placeholder tools are visible when connecting with an MCP client
- `.env.example` documents `USDA_API_KEY` and `PORT`

## Out of Scope

- Actual tool implementations (search, nutrition) -- handled by a later task
- SQLite database schema and caching logic -- separate task
- OAuth/authentication -- handled by `F-mcp-oauth-21-authentication`
- HTTPS -- handled at deployment layer (`F-aws-deployment`)
- Any API client code for USDA or Open Food Facts