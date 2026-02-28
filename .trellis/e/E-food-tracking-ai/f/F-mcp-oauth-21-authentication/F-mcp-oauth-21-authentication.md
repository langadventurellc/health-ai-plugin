---
id: F-mcp-oauth-21-authentication
title: MCP OAuth 2.1 Authentication
status: open
priority: high
parent: E-food-tracking-ai
prerequisites:
  - F-mcp-server-core-and-food-data
affectedFiles: {}
log: []
schema: v1.0
childrenIds: []
created: 2026-02-28T16:58:04.850Z
updated: 2026-02-28T16:58:04.850Z
---

## Purpose

Implement MCP OAuth 2.1 with PKCE on the server so all tool calls require a valid access token. Claude Code has built-in support for MCP OAuth flows (token acquisition, refresh, storage), so the server needs to implement the authorization server endpoints.

## Key Components

- **OAuth 2.1 authorization server endpoints** -- Authorization endpoint, token endpoint, and dynamic client registration as specified by MCP OAuth 2.1
- **PKCE support** -- Required for public clients (Claude Code acts as a public client)
- **Token validation middleware** -- All MCP tool calls (`search_food`, `get_nutrition`, `calculate_meal`, `save_food`) reject requests without a valid access token
- **Token lifecycle** -- Access token issuance, expiration, and refresh token support

## Acceptance Criteria

- Server exposes OAuth 2.1 authorization, token, and registration endpoints per MCP spec
- PKCE is required for all authorization flows
- All four MCP tools reject requests without a valid access token (401 response)
- Access tokens expire and can be refreshed using refresh tokens
- Claude Code can complete the full OAuth flow and make authenticated tool calls
- Server metadata endpoint (`.well-known/oauth-authorization-server`) is properly configured

## Technical Notes

- Follow the MCP specification for OAuth 2.1 implementation details -- check the current MCP TypeScript SDK for built-in OAuth support before implementing from scratch
- Single-user for v1 (no user accounts), but OAuth provides multi-user path for the future
- No rate limiting in v1 -- that is a fast-follow after auth
- Token storage on the server can use SQLite (same database as the cache)

## Testing Requirements

- Unit tests for token validation middleware (valid token passes, missing/expired token rejects)
- Unit tests for PKCE code challenge/verifier flow