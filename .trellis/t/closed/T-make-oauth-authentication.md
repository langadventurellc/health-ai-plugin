---
id: T-make-oauth-authentication
title: Make OAuth authentication optional in the MCP server
status: done
priority: high
parent: none
prerequisites: []
affectedFiles:
  server/src/index.ts: Added AUTH_ENABLED env var (defaults to false). Wrapped
    mcpAuthRouter mounting in AUTH_ENABLED conditional. Replaced bearerAuth with
    authMiddleware that is either requireBearerAuth (when enabled) or a no-op
    pass-through (when disabled). Updated all three /mcp route handlers to use
    authMiddleware. Added startup log line showing auth status.
log:
  - Starting implementation. Reviewed server/src/index.ts - need to add
    AUTH_ENABLED env var check, conditionally mount mcpAuthRouter, create
    conditional authMiddleware (no-op when disabled), and add startup log line.
  - "Made OAuth authentication optional via AUTH_ENABLED env var in
    server/src/index.ts. When AUTH_ENABLED is not set or is anything other than
    'true', the server starts without OAuth: mcpAuthRouter is not mounted, and
    /mcp routes use a no-op middleware instead of bearer token auth. When
    AUTH_ENABLED=true, behavior is identical to before. A startup log line
    indicates whether authentication is enabled or disabled. All 171 tests pass,
    lint/format/type-check are clean."
schema: v1.0
childrenIds: []
created: 2026-02-28T23:45:34.162Z
updated: 2026-02-28T23:45:34.162Z
---

## Context

The MCP server currently requires OAuth 2.1 authentication on all `/mcp` routes unconditionally. For deployment scenarios without HTTPS (e.g., using the ALB's default DNS name without a custom domain), OAuth cannot function because the spec requires HTTPS for token endpoints. This task makes authentication opt-in via an environment variable so the server can run without auth when needed.

This is a standalone task. The Terraform infrastructure changes that set this env var are handled in a separate task.

## What to Change

### `server/src/index.ts`

Add an `AUTH_ENABLED` environment variable that controls whether OAuth middleware is mounted. Default to `'false'`.

**When `AUTH_ENABLED` is `'false'` (default):**

- Do NOT mount `mcpAuthRouter` (lines 28-37)
- Do NOT create `bearerAuth` middleware (line 39)
- Mount `/mcp` routes (lines 53, 117, 140) **without** the `bearerAuth` middleware
- The `SqliteOAuthServerProvider`, its import (line 10), and the auth DB tables can still be initialized — they just won't be used. This avoids branching the database initialization logic.
- `ISSUER_URL` (lines 13-15) can still be parsed but won't be used

**When `AUTH_ENABLED` is `'true'`:**

- Current behavior exactly as-is: mount OAuth router, create bearer auth, protect all `/mcp` routes

**Implementation approach:**

```typescript
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
```

For the conditional middleware on routes, the cleanest approach is to define a no-op middleware when auth is off:

```typescript
const authMiddleware = AUTH_ENABLED
  ? requireBearerAuth({ verifier: provider })
  : (_req, _res, next) => next();
```

And conditionally mount the OAuth router:

```typescript
if (AUTH_ENABLED) {
  app.use(
    mcpAuthRouter({ ... }),
  );
}
```

The route definitions (lines 53, 117, 140) already use `bearerAuth` — just rename to `authMiddleware` (or keep `bearerAuth` and conditionally assign it).

**Startup logging:** Add a log line indicating whether auth is enabled:

```
console.warn(`Authentication: ${AUTH_ENABLED ? 'enabled' : 'disabled'}`);
```

## Files to Modify

- `server/src/index.ts` — conditional auth middleware (~15 lines changed)

## Acceptance Criteria

- `AUTH_ENABLED=false` (or unset): server starts, `/mcp` routes are accessible without a bearer token, OAuth endpoints are not mounted
- `AUTH_ENABLED=true`: server behaves exactly as it does today (OAuth required)
- Default is `false` (no auth)
- All existing tests pass (tests don't use auth)
- Startup log indicates whether auth is enabled or disabled
- `npm run lint`, `npm run format`, and `npm run type-check` all pass

## Out of Scope

- Terraform changes to set this env var (separate task)
- Any changes to auth provider, auth DB, or OAuth flow logic
- Adding tests for the auth toggle (the toggle is trivial; existing tests cover both paths implicitly since they run without auth)
- Changes to the plugin or SKILL.md
