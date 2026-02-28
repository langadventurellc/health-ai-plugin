---
id: T-create-plugin-scaffold
title: 'Create plugin scaffold: plugin.json, .mcp.json, and README'
status: done
priority: high
parent: F-claude-code-plugin-and-skill
prerequisites: []
affectedFiles:
  plugin/.claude-plugin/plugin.json: 'Created plugin metadata: name
    "food-tracking-ai", version "1.0.0", description of the plugin'
  plugin/.mcp.json: Created MCP server configuration with type "http" and
    placeholder URL pointing to /mcp endpoint, using mcpServers wrapper matching
    Claude Code plugin conventions
  plugin/README.md: 'Created documentation covering: what the plugin does,
    prerequisites (deployed server + Claude Code), setup (URL replacement in
    .mcp.json and plugin install command), OAuth 2.1 authentication note, usage
    examples (slash command and natural language), and list of four available
    MCP tools'
  plugin/skills/nutrition-tracker/SKILL.md:
    Created placeholder with TODO comment;
    full content deferred to sibling task T-write-skillmd-conversation
log:
  - 'Created the plugin directory scaffold under plugin/ with all four required
    files: plugin.json with metadata (name: "food-tracking-ai", version
    "1.0.0"), .mcp.json configuring connection to the remote MCP server via HTTP
    transport with a placeholder URL, README.md documenting prerequisites, setup
    (URL replacement + plugin install), OAuth authentication, usage, and
    available MCP tools, and a placeholder SKILL.md for the nutrition-tracker
    skill. All files pass Prettier formatting and JSON validation.'
schema: v1.0
childrenIds: []
created: 2026-02-28T21:19:13.234Z
updated: 2026-02-28T21:19:13.234Z
---

## Context

The food-tracking-ai project needs a Claude Code plugin directory (`plugin/`) that provides the infrastructure for connecting to the remote MCP server. This task creates the directory structure and all configuration files except `SKILL.md` (which is handled by a separate task).

Parent feature: `F-claude-code-plugin-and-skill`
Parent epic: `E-food-tracking-ai`

The MCP server is fully implemented in `server/` with four tools: `search_food`, `get_nutrition`, `calculate_meal`, and `save_food`. The server uses MCP OAuth 2.1 with PKCE for authentication and Streamable HTTP transport. The server name is `food-tracking-ai` (see `/Users/zach/code/food-tracking-ai/server/src/server.ts` line 21).

## What to Build

Create the following directory structure and files under `plugin/`:

```
plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── nutrition-tracker/
│       └── SKILL.md          # Placeholder only -- content is a separate task
├── .mcp.json
└── README.md
```

### 1. `plugin/.claude-plugin/plugin.json`

Plugin metadata. Use the `"http"` type for the remote Streamable HTTP MCP server:

```json
{
  "name": "food-tracking-ai",
  "version": "1.0.0",
  "description": "Low-friction nutritional tracking. Describe what you ate and get calculated nutrition data with confidence scores."
}
```

### 2. `plugin/.mcp.json`

Configures the connection to the remote MCP server. Claude Code handles OAuth 2.1 browser-based authentication automatically for `"http"` type servers -- no explicit auth fields needed.

```json
{
  "food-tracking-ai": {
    "type": "http",
    "url": "https://PLACEHOLDER_URL/mcp"
  }
}
```

Use a placeholder URL. The actual deployed server URL will be filled in once the server is deployed to AWS. Add a comment in the README explaining this.

### 3. `plugin/README.md`

Brief documentation covering:

- What the plugin does (one paragraph)
- Prerequisites: remote MCP server must be deployed and accessible
- Setup: how to install the plugin in Claude Code (point to plugin directory)
- Configuration: update the URL in `.mcp.json` to point to the deployed server
- Usage: invoke `/nutrition-tracker` or describe food in conversation
- Available MCP tools (brief list: `search_food`, `get_nutrition`, `calculate_meal`, `save_food`)

### 4. `plugin/skills/nutrition-tracker/SKILL.md`

Create this file as a placeholder with a TODO comment. The full SKILL.md content is written in a separate task (`T-*` sibling task).

## Acceptance Criteria

- Directory structure matches the layout above exactly
- `plugin.json` contains valid JSON with name `"food-tracking-ai"`, version `"1.0.0"`, and a description
- `.mcp.json` contains valid JSON with a single server entry using `"type": "http"` and a placeholder URL pointing to `/mcp` endpoint
- `README.md` documents setup, configuration (URL replacement), and usage
- `SKILL.md` exists as a placeholder file (content deferred to sibling task)
- All files use consistent formatting (match project Prettier config: single quotes where applicable, trailing commas in JSON not applicable, 80 char width for markdown)

## Out of Scope

- Writing the full SKILL.md content (separate task)
- Deploying the MCP server or obtaining a production URL
- Any executable code -- this is purely configuration and documentation
- Automated tests -- there is no code to test
