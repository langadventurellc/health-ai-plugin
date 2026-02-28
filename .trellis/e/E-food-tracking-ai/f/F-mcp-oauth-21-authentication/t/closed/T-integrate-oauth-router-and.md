---
id: T-integrate-oauth-router-and
title: Integrate OAuth router and bearer auth middleware into Express app
status: done
priority: high
parent: F-mcp-oauth-21-authentication
prerequisites:
  - T-implement-oauthserverprovider
affectedFiles:
  server/src/index.ts: Added imports for mcpAuthRouter, requireBearerAuth,
    getDatabase, and SqliteOAuthServerProvider. Moved initializeDatabase() to
    top of module. Created provider instance and configured mcpAuthRouter with
    rate limiting disabled. Applied bearerAuth middleware to all three MCP
    routes (POST/GET/DELETE /mcp). Added ISSUER_URL constant derived from env
    var with localhost fallback.
  server/.env.example:
    Added ISSUER_URL env var with description and default value
    for local development.
log:
  - >-
    Research complete. Findings:


    1. `server/src/index.ts` - Express app with health check and 3 MCP routes
    (POST/GET/DELETE /mcp)

    2. Auth infrastructure from prerequisite task: `auth/provider.ts`
    (SqliteOAuthServerProvider), `auth/db.ts` (initializeAuthTables),
    `auth/clients-store.ts` (SqliteClientsStore)

    3. Auth tables already initialized in `cache/db.ts` via
    `initializeAuthTables(db)` call

    4. MCP SDK exports: `mcpAuthRouter` from
    `@modelcontextprotocol/sdk/server/auth/router.js`, `requireBearerAuth` from
    `@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js`

    5. Rate limiting disabled via `rateLimit: false` on authorizationOptions,
    tokenOptions, clientRegistrationOptions, revocationOptions

    6. `mcpAuthRouter` takes `issuerUrl` as a `URL` object, not a string

    7. `requireBearerAuth` takes `{ verifier: OAuthTokenVerifier }` --
    SqliteOAuthServerProvider implements this interface


    Plan:

    1. Modify `server/src/index.ts` to import and wire mcpAuthRouter +
    requireBearerAuth

    2. Create SqliteOAuthServerProvider instance with the shared database

    3. Mount mcpAuthRouter before MCP routes, protect MCP routes with bearerAuth
    middleware

    4. Add ISSUER_URL to .env.example

    5. Write integration test for the wiring
  - Integrated OAuth 2.1 auth router and bearer auth middleware into the Express
    app. The mcpAuthRouter is mounted at the app root (before MCP routes) with
    rate limiting disabled on all endpoints (v1). All three MCP routes
    (POST/GET/DELETE /mcp) are protected with requireBearerAuth middleware that
    validates Bearer tokens via the SqliteOAuthServerProvider. The /health
    endpoint remains unauthenticated. Database initialization was moved to the
    top of the module so the provider can be constructed before route
    registration. ISSUER_URL env var added to .env.example with documentation.
schema: v1.0
childrenIds: []
created: 2026-02-28T20:48:38.120Z
updated: 2026-02-28T20:48:38.120Z
---

## Context

With the `OAuthServerProvider` and SQLite storage in place (T-implement-oauthserverprovider), this task wires everything into the Express application so that:

1. OAuth endpoints (authorization, token, registration, metadata) are live
2. All MCP tool calls require a valid Bearer token

The MCP SDK provides `mcpAuthRouter` (installs all OAuth endpoints) and `requireBearerAuth` (Express middleware for token validation). This task integrates both into `server/src/index.ts`.

**Parent feature:** F-mcp-oauth-21-authentication
**Prerequisite:** T-implement-oauthserverprovider
**SDK reference:** `@modelcontextprotocol/sdk/server/auth/router.js` exports `mcpAuthRouter`; `@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js` exports `requireBearerAuth`

## Implementation Requirements

### 1. Mount the OAuth Auth Router (`server/src/index.ts`)

Import and configure `mcpAuthRouter` from the SDK. Mount it on the Express app **before** the MCP route handlers.

```typescript
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
```

Configure `mcpAuthRouter` with:

- `provider`: The `OAuthServerProvider` instance created in T-implement-oauthserverprovider
- `issuerUrl`: Derived from `process.env.ISSUER_URL` or default to `http://localhost:${PORT}` for local dev
- Disable rate limiting on all endpoints (v1 has no rate limiting): pass `rateLimit: false` in `authorizationOptions`, `tokenOptions`, `clientRegistrationOptions`, and `revocationOptions`

The router must be mounted at the app root (`app.use(mcpAuthRouter(...))`), as required by the SDK docs. This automatically installs:

- `GET /.well-known/oauth-authorization-server` -- Server metadata
- `GET /.well-known/oauth-protected-resource` (or `/mcp` variant) -- Protected resource metadata
- `POST /register` -- Dynamic client registration
- `GET /authorize` -- Authorization endpoint
- `POST /token` -- Token endpoint
- `POST /revoke` -- Token revocation (if `revokeToken` is implemented on the provider)

### 2. Protect MCP Routes with Bearer Auth

Apply `requireBearerAuth` middleware to all three MCP route handlers (`POST /mcp`, `GET /mcp`, `DELETE /mcp`). The middleware extracts the `Authorization: Bearer <token>` header, calls `provider.verifyAccessToken`, and either attaches `req.auth` (type `AuthInfo`) or responds with 401.

Update each MCP route in `server/src/index.ts`:

```typescript
const bearerAuth = requireBearerAuth({ verifier: provider });

app.post('/mcp', bearerAuth, async (req, res) => { ... });
app.get('/mcp', bearerAuth, async (req, res) => { ... });
app.delete('/mcp', bearerAuth, async (req, res) => { ... });
```

The `/health` endpoint should remain unauthenticated.

### 3. Initialize Auth Tables at Startup

Call `initializeAuthTables` (from T-implement-oauthserverprovider) during the startup sequence in `server/src/index.ts`, after `initializeDatabase()` is called. The auth tables use the same SQLite database instance.

### 4. Update Environment Configuration

Add to `server/.env.example`:

- `ISSUER_URL` -- The public-facing URL of the server (e.g., `https://food-tracking.example.com`). Defaults to `http://localhost:3000` for local development.

### 5. Verify OAuth Metadata Endpoint

After integration, `GET /.well-known/oauth-authorization-server` should return valid JSON including:

- `issuer` matching the configured issuer URL
- `authorization_endpoint`, `token_endpoint`, `registration_endpoint` URLs
- `code_challenge_methods_supported` including `S256`
- `response_types_supported` including `code`
- `grant_types_supported` including `authorization_code` and `refresh_token`

## Acceptance Criteria

- `mcpAuthRouter` is mounted on the Express app and OAuth endpoints respond correctly
- `GET /.well-known/oauth-authorization-server` returns valid OAuth metadata JSON
- All three MCP routes (`POST/GET/DELETE /mcp`) reject requests without a valid Bearer token (401 response)
- All three MCP routes accept requests with a valid Bearer token and pass through to existing handlers
- `/health` remains unauthenticated
- Auth tables are initialized at server startup
- `ISSUER_URL` env var is documented in `.env.example`
- Rate limiting is disabled on all OAuth endpoints (v1)
- Server starts successfully with `mise run dev` and the full OAuth flow can be tested manually with `curl` or Claude Code

## Out of Scope

- Implementing the `OAuthServerProvider` itself (done in T-implement-oauthserverprovider)
- Multi-user authorization logic or user accounts
- Rate limiting (v1 exclusion)
- Custom scopes or permissions
- HTTPS/TLS configuration (handled at deployment layer)
- Automated end-to-end integration tests of the full OAuth flow
