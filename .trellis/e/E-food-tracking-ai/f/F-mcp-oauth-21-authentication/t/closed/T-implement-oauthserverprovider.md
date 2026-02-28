---
id: T-implement-oauthserverprovider
title: Implement OAuthServerProvider with SQLite-backed storage
status: done
priority: high
parent: F-mcp-oauth-21-authentication
prerequisites: []
affectedFiles:
  server/src/auth/db.ts: 'New file: initializeAuthTables function creating
    oauth_clients, oauth_authorization_codes, and oauth_tokens tables with index
    on client_id'
  server/src/auth/clients-store.ts: 'New file: SqliteClientsStore implementing
    OAuthRegisteredClientsStore with getClient and registerClient backed by
    SQLite'
  server/src/auth/provider.ts: 'New file: SqliteOAuthServerProvider implementing
    OAuthServerProvider interface with all required methods - authorize,
    challengeForAuthorizationCode, exchangeAuthorizationCode,
    exchangeRefreshToken, verifyAccessToken, revokeToken'
  server/src/auth/__tests__/provider.test.ts: 'New file: 22 unit tests covering
    token validation, PKCE flow, refresh token flow, auth code expiry, token
    revocation, and authorize redirect behavior'
  server/src/cache/db.ts:
    'Modified: Added import and call to initializeAuthTables
    so auth tables are created alongside cache tables during database
    initialization'
log:
  - >-
    Research phase complete. Reviewed:

    - SDK interfaces: OAuthServerProvider (provider.d.ts),
    OAuthRegisteredClientsStore (clients.d.ts), AuthInfo (types.d.ts)

    - SDK error classes: InvalidGrantError, InvalidTokenError, etc.
    (errors.d.ts)

    - SDK types: OAuthClientInformationFull, OAuthTokens,
    OAuthTokenRevocationRequest (shared/auth.d.ts)

    - Demo in-memory provider (demoInMemoryOAuthProvider.js) for reference
    implementation

    - Existing codebase patterns: db.ts (initializeDatabase), cache.test.ts and
    custom-store.test.ts (test patterns)

    - Key note: registerClient in clients.d.ts takes
    Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'> but
    the SDK pre-populates those fields before calling. The demo stores client
    as-is.

    - redirect_uris in the schema are string[] (URL-validated but stored as
    strings)


    Starting implementation of:

    1. server/src/auth/db.ts - Auth table schema

    2. server/src/auth/clients-store.ts - OAuthRegisteredClientsStore impl

    3. server/src/auth/provider.ts - OAuthServerProvider impl

    4. server/src/auth/__tests__/provider.test.ts - Unit tests
  - >-
    Implemented OAuthServerProvider with SQLite-backed storage for the MCP OAuth
    2.1 authentication feature. The implementation includes:


    1. Auth database schema (initializeAuthTables) with three tables:
    oauth_clients, oauth_authorization_codes, and oauth_tokens, integrated into
    the existing initializeDatabase flow.

    2. SqliteClientsStore implementing OAuthRegisteredClientsStore with
    getClient and registerClient methods backed by SQLite.

    3. SqliteOAuthServerProvider implementing the full OAuthServerProvider
    interface: authorize (auto-approve with redirect),
    challengeForAuthorizationCode, exchangeAuthorizationCode,
    exchangeRefreshToken (with token rotation), verifyAccessToken, and
    revokeToken. All tokens are opaque UUIDs via crypto.randomUUID().
    Authorization codes expire after 10 minutes, access tokens after 1 hour,
    refresh tokens after 30 days.

    4. Comprehensive unit tests (22 tests) covering: token validation
    (valid/expired/revoked/wrong-type), PKCE code challenge flow, authorization
    code exchange (single-use, client mismatch, expiry), refresh token flow
    (rotation, expiry, revocation, client mismatch), token revocation, and the
    authorize redirect.
schema: v1.0
childrenIds: []
created: 2026-02-28T20:48:10.326Z
updated: 2026-02-28T20:48:10.326Z
---

## Context

The MCP TypeScript SDK (`@modelcontextprotocol/sdk` v1.27+) provides a complete OAuth 2.1 server framework via `mcpAuthRouter` and related utilities. To use it, we need to implement the `OAuthServerProvider` interface and `OAuthRegisteredClientsStore` interface with our own storage backend. This task implements all the OAuth business logic and data persistence; wiring it into the Express app is handled by the next task.

**Parent feature:** F-mcp-oauth-21-authentication
**SDK reference:** `@modelcontextprotocol/sdk/server/auth/provider.js` exports `OAuthServerProvider`; `@modelcontextprotocol/sdk/server/auth/clients.js` exports `OAuthRegisteredClientsStore`

## Implementation Requirements

### 1. SQLite Auth Schema (`server/src/auth/db.ts`)

Add new tables to the existing SQLite database (via `server/src/cache/db.ts`'s `initializeDatabase`). New tables:

- **`oauth_clients`** -- Stores dynamically registered clients. Columns: `client_id` (PK), `client_data` (JSON blob of `OAuthClientInformationFull`), `created_at` (epoch seconds).
- **`oauth_authorization_codes`** -- Stores pending authorization codes. Columns: `code` (PK), `client_id`, `code_challenge` (S256 hash), `redirect_uri`, `scopes` (JSON array), `expires_at` (epoch seconds), `created_at`.
- **`oauth_tokens`** -- Stores issued access/refresh tokens. Columns: `token` (PK), `token_type` (`access` or `refresh`), `client_id`, `scopes` (JSON array), `expires_at` (epoch seconds), `created_at`, `revoked` (boolean, default 0). Add index on `client_id`.

Create an `initializeAuthTables(db: Database)` function that can be called from the existing `initializeDatabase` flow, or called separately. Keep auth table creation idempotent (`CREATE TABLE IF NOT EXISTS`).

### 2. OAuthRegisteredClientsStore Implementation (`server/src/auth/clients-store.ts`)

Implement the `OAuthRegisteredClientsStore` interface from the SDK:

- `getClient(clientId: string)` -- Look up client by ID from `oauth_clients` table, parse and return `OAuthClientInformationFull`, or `undefined` if not found.
- `registerClient(client)` -- Insert new client into `oauth_clients`. With the default `clientIdGeneration: true` option, the SDK's `clientRegistrationHandler` pre-populates `client_id` and `client_id_issued_at` on the input object before calling this method. The store should persist the client as-is and return it. Do not generate or overwrite `client_id` or `client_id_issued_at` -- the SDK provides them.

### 3. OAuthServerProvider Implementation (`server/src/auth/provider.ts`)

Implement the `OAuthServerProvider` interface. This is the core auth logic. Constructor takes the SQLite `Database` instance.

- **`clientsStore`** getter -- Return the `OAuthRegisteredClientsStore` instance.
- **`authorize(client, params, res)`** -- Single-user v1: auto-approve all authorization requests. Generate a random authorization code (e.g., `crypto.randomUUID()`), store it in `oauth_authorization_codes` with the `codeChallenge`, `redirectUri`, scopes, and a short expiry (10 minutes). Redirect to `params.redirectUri` with `code` and `state` query parameters.
- **`challengeForAuthorizationCode(client, code)`** -- Look up the authorization code row and return its `code_challenge`. Throw if not found or expired.
- **`exchangeAuthorizationCode(client, code, codeVerifier, redirectUri)`** -- Validate the auth code exists, is not expired, and belongs to this client. The SDK handles PKCE verification (comparing `codeVerifier` against the stored challenge) unless `skipLocalPkceValidation` is set. Generate an access token and refresh token (both `crypto.randomUUID()`), store them in `oauth_tokens` with appropriate expiry (access: 1 hour, refresh: 30 days). Delete the used authorization code. Return `OAuthTokens` object.
- **`exchangeRefreshToken(client, refreshToken, scopes)`** -- Validate the refresh token exists, is not expired, is not revoked, and belongs to this client. Generate a new access token (1 hour expiry). Optionally rotate the refresh token. Return new `OAuthTokens`.
- **`verifyAccessToken(token)`** -- Look up the token in `oauth_tokens`, verify it is an access token, not expired, and not revoked. Return `AuthInfo` with `token`, `clientId`, `scopes`, and `expiresAt`.
- **`revokeToken(client, request)`** -- Mark the token as revoked in `oauth_tokens`. If the token doesn't exist, do nothing (per spec).

Token generation should use `crypto.randomUUID()` for simplicity in v1. No JWT needed.

### 4. Unit Tests

Add tests in `server/src/auth/__tests__/provider.test.ts`:

- **Token validation:** `verifyAccessToken` returns `AuthInfo` for a valid token; throws/rejects for missing, expired, or revoked tokens.
- **PKCE flow:** Create an authorization code with a code challenge, then exchange it. Verify the SDK's PKCE validation works by testing with correct and incorrect code verifiers (test through `exchangeAuthorizationCode`).
- **Refresh token:** Exchange a refresh token for a new access token; verify expired/revoked refresh tokens are rejected.
- **Authorization code expiry:** Verify expired auth codes cannot be exchanged.

Use an in-memory SQLite database (`:memory:`) for tests, same pattern as existing tests.

## Acceptance Criteria

- `OAuthServerProvider` fully implements the SDK interface (all required methods)
- `OAuthRegisteredClientsStore` supports `getClient` and `registerClient`
- Auth tables are created in SQLite alongside existing cache tables
- Authorization codes expire after 10 minutes
- Access tokens expire after 1 hour
- Refresh tokens expire after 30 days
- All tokens are opaque UUIDs (no JWT complexity)
- Unit tests pass for token validation, PKCE code challenge/verifier, refresh flow, and auth code expiry

## Out of Scope

- Express route wiring / `mcpAuthRouter` integration (next task)
- Bearer auth middleware on `/mcp` routes (next task)
- Authorization consent UI beyond auto-approve redirect (single-user v1)
- Rate limiting (explicitly excluded from v1 per feature spec)
- User accounts or multi-user support
- JWT tokens or signed tokens
