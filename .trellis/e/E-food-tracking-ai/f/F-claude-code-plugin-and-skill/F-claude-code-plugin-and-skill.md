---
id: F-claude-code-plugin-and-skill
title: Claude Code Plugin and Skill
status: open
priority: high
parent: E-food-tracking-ai
prerequisites:
  - F-mcp-server-core-and-food-data
  - F-unit-conversion-and-meal
  - F-custom-food-storage
  - F-mcp-oauth-21-authentication
affectedFiles: {}
log: []
schema: v1.0
childrenIds: []
created: 2026-02-28T16:58:33.208Z
updated: 2026-02-28T16:58:33.208Z
---

## Purpose

Build the Claude Code plugin that connects to the remote MCP server and provides the `nutrition-tracker` skill. The skill (SKILL.md) guides Claude through the full conversation flow: parsing user input, asking clarifying questions, using MCP tools, handling images, managing restaurant food lookups, and presenting results with confidence scores.

## Key Components

- **Plugin structure** -- Directory layout under `plugin/`:
  ```
  plugin/
  ├── .claude-plugin/
  │   └── plugin.json          # name, description, version
  ├── skills/
  │   └── nutrition-tracker/
  │       └── SKILL.md          # Conversation guidance
  ├── .mcp.json                 # Points to remote MCP server URL
  └── README.md
  ```
- **`.mcp.json`** -- Configures connection to the remote MCP server via Streamable HTTP with OAuth authentication
- **`plugin.json`** -- Plugin metadata (name: "food-tracking-ai", description, version)
- **`SKILL.md` conversation flow** -- Detailed instructions for Claude covering:
  1. **Input parsing** -- Understand what was eaten from natural language
  2. **Clarifying questions** -- Max 2-3 questions, only when the missing info would significantly change the result. Accept vague answers with reasonable defaults ("a splash of milk" = ~2 tbsp, "some cheese" = ~1 oz, "a bowl of rice" = ~1 cup cooked). Never block on missing info.
  3. **Food search and lookup** -- Break meals into individual ingredients, `search_food` for each, then `get_nutrition`
  4. **Meal calculation** -- `calculate_meal` for multi-item totals
  5. **Image handling** -- Nutrition label photos: read all visible data directly (highest confidence). Food photos: estimate foods and portions, note estimates in confidence. Combined: text primary, photo for verification.
  6. **Restaurant food flow** -- Always check `search_food` first. If not found, web search for nutrition data. For major chains, find published data. For local places, estimate from typical recipes. Cache findings via `save_food` for future consistency.
  7. **Response format** -- Meal totals (calories, protein, carbs, fat) shown prominently, additional nutrients when relevant, per-item breakdown, confidence score with label and explanation.
  8. **Confidence scoring** -- 0-100% scale: High (90-100%), Good (70-89%), Moderate (50-69%), Low (<50%). Explain what was estimated vs. known. Factors: nutrition label = very high, known brand = high, generic food + precise amount = high, photo portion estimates = lower, assumed ingredients = lower, "I don't know" = lower.

## Acceptance Criteria

- Plugin installs in Claude Code without errors
- `.mcp.json` connects to the remote MCP server and authenticates via OAuth
- Skill activates for food/nutrition tracking conversations
- End-to-end: user describes a meal in text, receives calculated nutrition with confidence score
- End-to-end: user sends nutrition label photo, receives correct extracted data
- Clarifying questions are limited to 2-3 max and only asked when they would significantly affect results
- Response format includes meal totals, per-item breakdown, and confidence score with explanation
- Restaurant food flow checks `search_food` before falling back to web search
- Restaurant food data is cached via `save_food` after web search lookup

## Technical Notes

- The plugin contains no executable code -- it is configuration (`.mcp.json`, `plugin.json`) and LLM instructions (`SKILL.md`)
- All computation happens on the MCP server; the skill only guides Claude's reasoning and tool usage
- Image analysis uses Claude's built-in multimodal vision -- no additional tools needed
- The skill should be thorough but not overly prescriptive; Claude needs latitude to handle varied conversational situations

## Testing Requirements

- No automated tests for this feature -- it is entirely configuration and LLM prompting. Validation is through the end-to-end acceptance criteria above.