---
id: F-unit-conversion-and-meal
title: Unit Conversion and Meal Calculation
status: open
priority: high
parent: E-food-tracking-ai
prerequisites:
  - F-mcp-server-core-and-food-data
affectedFiles: {}
log: []
schema: v1.0
childrenIds: []
created: 2026-02-28T16:57:36.130Z
updated: 2026-02-28T16:57:36.130Z
---

## Purpose

Implement comprehensive unit conversion so `get_nutrition` handles all supported unit types, and build the `calculate_meal` tool for deterministic multi-item meal totals. This feature makes the server capable of handling real-world meal descriptions where users specify amounts in cups, tablespoons, descriptive sizes, etc.

## Key Components

- **Volume unit conversions** -- cups, tbsp, tsp, fl_oz, mL, L. Standard conversion factors between volume units.
- **Weight unit conversions** -- g, oz, lb, kg. Standard conversion factors between weight units.
- **Volume-to-weight conversion** -- Per-food density data (e.g., 1 cup milk = 244g, 1 cup flour = 125g). When density is unknown for a food, return an error rather than guess.
- **Descriptive size conversion** -- "1 medium banana", "2 large eggs", "1 slice bread" mapped to USDA standard reference amounts (gram weights).
- **`calculate_meal` tool** -- Takes an array of `{ foodId, source, amount, unit }` items. Calls `get_nutrition` internally for each item, sums all nutrients deterministically. Returns per-item breakdown, totals, and `nutrientCoverage` indicating which nutrients had data for all items vs. partial.

## Acceptance Criteria

- `get_nutrition` accepts and correctly converts volume units (cup, tbsp, tsp, fl_oz, mL, L) for foods with known density
- `get_nutrition` accepts and correctly converts descriptive sizes ("medium", "large", "small", "piece", "slice") using USDA reference amounts
- `get_nutrition` returns an error (not a guess) when volume-to-weight conversion is requested for a food without known density data
- `calculate_meal` returns per-item nutritional breakdowns and deterministic summed totals
- `calculate_meal` reports `nutrientCoverage` distinguishing full vs. partial data availability
- All unit conversions produce mathematically correct results (verifiable against known reference values)

## Technical Notes

- Density data can be bootstrapped from USDA food portion data (many USDA entries include gram weights for common portions like "1 cup", "1 medium")
- Descriptive size mappings come from USDA standard reference portions
- The conversion module should be cleanly separated so it can be unit tested independently of API calls
- `calculate_meal` is pure arithmetic over `get_nutrition` results -- no estimation or LLM involvement

## Testing Requirements

- Unit tests for volume-to-volume, weight-to-weight, and volume-to-weight conversions against known reference values
- Unit tests for descriptive size resolution (e.g., "1 medium banana" = ~118g)
- Unit tests for `calculate_meal` summing logic and nutrient coverage reporting
- Unit test confirming error response when density is unknown for a volume-to-weight conversion