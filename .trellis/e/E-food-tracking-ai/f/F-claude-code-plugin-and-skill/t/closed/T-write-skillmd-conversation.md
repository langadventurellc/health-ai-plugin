---
id: T-write-skillmd-conversation
title: Write SKILL.md conversation flow for nutrition-tracker skill
status: done
priority: high
parent: F-claude-code-plugin-and-skill
prerequisites:
  - T-create-plugin-scaffold
affectedFiles:
  plugin/skills/nutrition-tracker/SKILL.md: 'Replaced placeholder with complete
    skill definition (337 lines). Covers: conversation flow, input parsing,
    clarifying questions with defaults table, food search/lookup workflow with
    exact tool parameters, image handling (labels/food photos/combined),
    restaurant food flow with save_food caching, response format with confidence
    score examples, confidence scoring scale and factors, and general behavioral
    guidelines.'
log:
  - 'Research complete. Reviewed: REQUIREMENTS.md (scenarios, confidence
    scoring, response format), server/src/server.ts (exact tool schemas with
    parameter names and types), existing SKILL.md placeholder, parent feature
    requirements. Planning to write the full SKILL.md now.'
  - 'Wrote the complete SKILL.md for the nutrition-tracker skill, replacing the
    placeholder. The document covers all required sections: skill activation and
    core rule (LLM reasons, server calculates), conversation flow overview,
    input parsing (simple and complex meals, recipes/batches), clarifying
    questions (max 2-3, when-to-ask/when-not-to-ask guidelines, vague answer
    defaults table with 9 mappings), food search and lookup workflow
    (search_food -> get_nutrition -> calculate_meal with exact parameter
    signatures), image handling (three scenarios: nutrition labels with
    save_food caching, food photos with portion estimation, combined
    photo+text), restaurant food flow (search_food first, web search for chains,
    estimate for local, always cache via save_food), response format (meal
    totals, additional nutrients, per-item breakdown, confidence score with
    examples), confidence scoring (0-100% scale with 4 tiers, increase/decrease
    factors, explanation guidance), and general guidelines (conciseness, error
    handling, available field, no dietary advice). All four MCP tools are
    referenced with correct parameter names and types matching server.ts.'
schema: v1.0
childrenIds: []
created: 2026-02-28T21:19:58.368Z
updated: 2026-02-28T21:19:58.368Z
---

## Context

The nutrition-tracker skill needs a comprehensive `SKILL.md` that guides Claude through food tracking conversations. This is the core deliverable of the plugin feature -- it controls how Claude parses input, uses MCP tools, handles images, manages restaurant food, and presents results with confidence scores.

Parent feature: `F-claude-code-plugin-and-skill`
Parent epic: `E-food-tracking-ai`
Prerequisite: `T-create-plugin-scaffold` (creates the file as a placeholder)

The SKILL.md is an LLM prompt, not code. It must be thorough enough to cover all conversation patterns but not so prescriptive that Claude cannot handle varied situations naturally.

## What to Build

Write the full content of `plugin/skills/nutrition-tracker/SKILL.md`, replacing the placeholder created by `T-create-plugin-scaffold`.

### Available MCP Tools

The skill must reference these four tools (implemented in `/Users/zach/code/food-tracking-ai/server/src/server.ts`):

1. **`search_food`** -- `{ query: string, source?: "usda" | "openfoodfacts" | "all" }` -- Returns array of `{ id, source, name, brand, matchScore }` results
2. **`get_nutrition`** -- `{ foodId: string, source: "usda" | "openfoodfacts" | "custom", amount: number, unit: "g"|"kg"|"oz"|"lb"|"cup"|"tbsp"|"tsp"|"fl_oz"|"mL"|"L"|"piece"|"medium"|"large"|"small"|"slice" }` -- Returns serving description + nutrients with `{ value, available }` pairs
3. **`calculate_meal`** -- `{ items: Array<{ foodId, source, amount, unit }> }` -- Returns per-item breakdown, totals, and nutrient coverage
4. **`save_food`** -- `{ name, brand?, category?, servingSize: { amount, unit }, nutrients: { calories, protein_g, total_carbs_g, total_fat_g, ...optional } }` -- Saves custom food, returns `{ id, source: "custom" }`

### Required Sections in SKILL.md

The skill should cover these areas as described in the feature requirements and `REQUIREMENTS.md` (`/Users/zach/code/food-tracking-ai/REQUIREMENTS.md`):

#### 1. Skill Activation and Purpose

- Brief description of what the skill does
- When it should activate (food/nutrition tracking conversations)

#### 2. Conversation Flow

The core workflow: parse input -> identify gaps -> clarify (sparingly) -> search/lookup -> calculate -> present results.

#### 3. Input Parsing

- Break natural language meal descriptions into individual food items
- Identify amounts, units, brands, and preparation methods
- Handle both simple ("a banana") and complex ("half a box of pasta with a jar of Rao's marinara and a pound of ground beef") inputs

#### 4. Clarifying Questions

- Maximum 2-3 questions before providing an answer
- Only ask when the missing info would significantly change the result (e.g., amount of rice matters; dash of salt does not)
- Accept vague answers with reasonable defaults:
  - "a splash of milk" -> ~2 tbsp
  - "some cheese" -> ~1 oz / 28g
  - "a bowl of rice" -> ~1 cup cooked
  - "a handful" -> reasonable estimate
  - "a normal serving" -> USDA reference serving
- Never block on missing info -- always provide best answer with available data

#### 5. Food Search and Lookup

- Break meals into individual ingredients
- Call `search_food` for each ingredient
- Select the best match from results (consider name, brand, match score)
- Call `get_nutrition` for each with the appropriate amount and unit
- Use `calculate_meal` for multi-item meals to get totals

#### 6. Image Handling

- **Nutrition label photos:** Read all visible data directly from the label using Claude's built-in vision. This is the highest confidence data. Extract serving size, calories, macros, and any visible micronutrients. Use `save_food` to cache the extracted data.
- **Food photos:** Estimate what foods are present and approximate portion sizes. Use these estimates with MCP tools. Note portion estimates in the confidence explanation.
- **Combined (photo + text):** Use text description as primary, photo for verification or to fill gaps.

#### 7. Restaurant Food Flow

- **Always** check `search_food` first before any web search
- If found in database, use that data (may be a previously cached entry)
- If not found:
  - Major chains: web search for published nutrition data -> high confidence
  - Local/small restaurants: estimate from typical recipes -> lower confidence
- After obtaining restaurant nutrition data via web search, call `save_food` to cache it for future consistency
- Can also use `calculate_meal` if breaking a restaurant dish into estimated ingredients

#### 8. Response Format

Every response must include:

- **Meal totals** (always prominent): Calories, Protein (g), Carbs (g), Fat (g)
- **Additional nutrients:** Show when user asks, or when notably high/low
- **Per-item breakdown:** Include but can be brief for simple meals
- **Confidence score:** Numeric percentage + label + brief explanation

#### 9. Confidence Scoring

Scale: 0-100% with labels:
| Range | Label |
|-------|-------|
| 90-100% | High |
| 70-89% | Good |
| 50-69% | Moderate |
| Below 50% | Low |

Factors that increase confidence: nutrition label photo, specific brand found in DB, generic food with precise weight/volume.
Factors that decrease confidence: portion estimated from photo, assumed ingredients, "I don't know" answers, restaurant food without published data.

Always briefly explain WHY the confidence is at that level.

### Tone and Style

- Conversational but concise -- this is a utility, not a chatbot
- Give Claude latitude to handle varied situations naturally
- Do not be overly prescriptive about exact wording -- focus on behavior and decision-making rules
- Use examples from `REQUIREMENTS.md` scenarios as reference (coffee with milk, protein shake with photo, home-cooked spaghetti, Big Mac, local pad thai)

## Acceptance Criteria

- `plugin/skills/nutrition-tracker/SKILL.md` contains the complete skill definition
- All four MCP tools are referenced with correct parameter names and types
- Clarifying question guidelines are clear: max 2-3, only when significant, with default mappings for vague answers
- Image handling covers all three scenarios (nutrition labels, food photos, combined)
- Restaurant food flow explicitly states to check `search_food` before web searching, and to call `save_food` after web search
- Response format section specifies meal totals, per-item breakdown, and confidence score
- Confidence scoring table and factor list are included
- The skill reads naturally as LLM instructions -- not as a requirements doc or code specification
- Length is appropriate: comprehensive but not bloated (aim for a single well-structured document)

## Out of Scope

- Plugin configuration files (handled by `T-create-plugin-scaffold`)
- Any executable code or automated tests
- Server-side changes
- Daily/weekly tracking, meal planning, dietary recommendations, barcode scanning (all v1 non-goals per REQUIREMENTS.md)
