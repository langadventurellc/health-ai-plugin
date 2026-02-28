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

- **Data sources:** USDA FoodData Central (primary, generic foods) + Open Food Facts (branded/packaged products)
- **Tools:** `search_food`, `get_nutrition`, `calculate_meal`, `save_food`
- **Auth:** MCP OAuth 2.1 with PKCE
- **Cache:** SQLite with TTL revalidation (30d USDA, 7d Open Food Facts, 90d custom/saved, 24h search results)
- **Unit conversion:** Volume, weight, and descriptive sizes. Volume-to-weight requires per-food density data; error rather than guess when density is unknown.

### Plugin

- `SKILL.md` guides conversation flow: parse → clarify (max 2-3 questions) → search → calculate → present with confidence score
- Images handled by Claude's built-in vision (nutrition labels and food photos)
- Restaurant food: LLM web searches then caches via `save_food` for consistency. Always check `search_food` before web searching.
- Confidence: 0-100% numeric + label (High/Good/Moderate/Low) with explanation of what was estimated

## Trellis

This project uses the Task Trellis issue tracking system. The parent epic is `E-food-tracking-ai`.
