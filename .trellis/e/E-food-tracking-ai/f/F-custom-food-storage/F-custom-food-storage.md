---
id: F-custom-food-storage
title: Custom Food Storage
status: open
priority: medium
parent: E-food-tracking-ai
prerequisites:
  - F-mcp-server-core-and-food-data
affectedFiles: {}
log: []
schema: v1.0
childrenIds: []
created: 2026-02-28T16:57:51.986Z
updated: 2026-02-28T16:57:51.986Z
---

## Purpose

Implement the `save_food` tool so the LLM can store nutrition data obtained from web searches (restaurant items) or nutrition label photos into the server's cache. This enables consistent repeat lookups -- once a restaurant dish or labeled product is saved, future requests return the same numbers without re-searching.

## Key Components

- **`save_food` tool** -- Accepts `name`, optional `brand` and `category`, `servingSize` ({ amount, unit }), and `nutrients` object. Returns `{ id, source: "custom" }`.
- **Custom food storage in SQLite** -- Stores entries with source "custom" and 90-day TTL. If a food with the same name and brand already exists, updates it and resets TTL.
- **Integration with `search_food`** -- Custom/saved foods appear in `search_food` results alongside USDA and Open Food Facts results.
- **Integration with `get_nutrition` and `calculate_meal`** -- Saved foods are usable by ID with these tools, supporting unit conversion based on the stored serving size.

## Acceptance Criteria

- `save_food` stores custom nutrition data and returns a usable `{ id, source: "custom" }` response
- Saved foods appear in `search_food` results when the query matches their name or brand
- Saved foods work with `get_nutrition` for amount-based lookups (scaling from stored serving size)
- Saved foods work with `calculate_meal` as items in a meal
- Duplicate name+brand entries are updated (upsert) with TTL reset rather than creating duplicates
- Custom food entries expire after 90 days
- Stored nutrients use the same `{ value, available }` format as other data sources

## Technical Notes

- The `save_food` input nutrients object should accept the same nutrient keys as `get_nutrition` output (calories, protein_g, total_carbs_g, total_fat_g, plus optional additional nutrients)
- Scaling custom foods: if a food is saved with serving size "1 cup" and the user later queries "2 cups", the server scales proportionally
- This is the mechanism the LLM uses to cache restaurant data and nutrition label data for consistency

## Testing Requirements

- Unit tests for save/retrieve round-trip (save a food, find it via search, get its nutrition)
- Unit test for upsert behavior (save same name+brand twice, verify update not duplicate)
- Unit test for TTL expiration of custom entries