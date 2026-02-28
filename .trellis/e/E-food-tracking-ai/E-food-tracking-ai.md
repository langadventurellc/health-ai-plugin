---
id: E-food-tracking-ai
title: Food Tracking AI
status: open
priority: high
parent: none
prerequisites: []
affectedFiles: {}
log: []
schema: v1.0
childrenIds: []
created: 2026-02-28T16:46:47.998Z
updated: 2026-02-28T16:46:47.998Z
---

## Overview

A low-friction nutritional tracking system that lets users describe what they ate (via text or photos) and get back calculated nutritional information. Two components work together through Claude Code:

1. **Remote MCP Server** (TypeScript/Node.js on AWS) - Nutritional data lookups, caching, and deterministic math calculations
2. **Claude Code Plugin** - Skill(s) that guide the LLM conversation: clarifying questions, image interpretation, confidence scoring

### Core Principle

The LLM reasons about *what* was eaten and *how much*. The MCP server does the *calculations*. No nutritional math should rely on LLM probability - all final numbers must be computed deterministically by the MCP server.

## Components

### Remote MCP Server

- **Stack:** TypeScript / Node.js, Streamable HTTP transport, deployed on AWS
- **Authentication:** MCP OAuth 2.1 with PKCE
- **Cache:** SQLite with TTL-based revalidation
- **Data Sources:**
  - USDA FoodData Central (primary - 300K+ foods, 150+ nutrients)
  - Open Food Facts (secondary - branded/packaged products)

#### MCP Tools
- `search_food` - Search across data sources + cached custom foods
- `get_nutrition` - Nutritional breakdown for a specific food/amount with unit conversion
- `calculate_meal` - Deterministic sum of nutrients across multiple items
- `save_food` - Cache nutrition data from web searches/labels for consistent repeat lookups (90-day TTL)

#### Unit Conversion
Handles volume (cups, tbsp, tsp, fl oz, mL), weight (g, oz, lb, kg), and descriptive sizes ("1 medium banana"). Volume-to-weight requires per-food density data.

### Claude Code Plugin

- Plugin with `nutrition-tracker` skill (SKILL.md)
- Guides conversation: parse input → identify gaps → ask clarifying questions (max 2-3) → search → calculate → present results
- Image handling via Claude's built-in vision (nutrition labels + food photos)
- Restaurant food: LLM web searches, then caches via `save_food` for consistency
- Confidence scoring: 0-100% with labels (High/Good/Moderate/Low) + explanation

## Requirements Reference

Full requirements document: `REQUIREMENTS.md` in the project root.

## Acceptance Criteria

- Remote MCP server deployed on AWS, accessible via Streamable HTTP over HTTPS
- MCP OAuth 2.1 authentication implemented and required for all tool calls
- `search_food` returns results from USDA, Open Food Facts, and cached custom foods
- `get_nutrition` returns per-amount nutritional breakdowns with unit conversion
- `calculate_meal` sums nutrients deterministically across multiple items
- `save_food` stores custom nutrition data with 90-day TTL, appears in future searches
- SQLite caching with TTL revalidation (30 days USDA, 7 days Open Food Facts, 90 days custom)
- Claude Code plugin installable with SKILL.md guiding conversation flow
- Plugin connects to remote MCP server via `.mcp.json`
- End-to-end: user describes meal in text → calculated nutrition with confidence score
- End-to-end: user sends nutrition label photo → correct data extraction and calculation
- Confidence scores present and reasonable across input scenarios

## Non-Goals (v1)

- No daily/weekly tracking or totals
- No meal planning or dietary recommendations
- No user accounts or persistent meal history
- No barcode scanning integration
- No fitness tracker integration
- No rate limiting (fast follow after auth)

## Technical Notes

- Greenfield project - no existing codebase
- USDA API key required (free, from fdc.nal.usda.gov)
- Open Food Facts API requires no key
- System should degrade gracefully when external APIs unavailable
- Estimated scale: ~5-6 features