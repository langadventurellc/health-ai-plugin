# Food Tracking AI - Requirements Document

## Overview

A low-friction nutritional tracking system that lets users describe what they ate (via text or photos) and get back calculated nutritional information. The system consists of two components that work together through Claude Code:

1. **Claude Code Plugin** - A plugin with skill(s) that guide the LLM conversation: clarifying questions, image interpretation, confidence scoring
2. **Remote MCP Server** - A TypeScript server hosted on AWS that handles nutritional data lookups, caching, and deterministic math calculations

### Core Principle

The LLM reasons about *what* was eaten and *how much*. The MCP server does the *calculations*. No nutritional math should rely on LLM probability - all final numbers must be computed deterministically by the MCP server.

### Motivation

Reduce the friction of tracking food intake. After eating a meal, the user sends a message to Claude (often from their phone), describes what they ate, and gets nutritional numbers back. That's it. No apps to open, no databases to search manually, no math to do.

---

## Component 1: Remote MCP Server

### Purpose

Provide tools for nutritional data lookup, unit conversion, and deterministic calculation. This is the source of truth for nutrition facts and arithmetic.

### Stack & Hosting

- **Runtime:** TypeScript / Node.js
- **MCP Transport:** Streamable HTTP (current MCP spec standard)
- **Hosting:** AWS (specific service TBD during implementation - likely ECS, Lambda, or EC2)
- **Cache:** SQLite (file-based, no external dependencies, persists across restarts)
- **HTTPS required** for remote access
- **Authentication:** MCP OAuth 2.1 (see Authentication section below)

### Data Sources

**Priority 1: USDA FoodData Central**
- 300K+ foods, 150+ nutrients per item
- Free API key from fdc.nal.usda.gov
- Best for generic/whole foods: chicken breast, banana, whole milk, sugar, rice, etc.
- Endpoints: `/foods/search`, `/food/{fdcId}`

**Priority 2: Open Food Facts**
- Crowdsourced, millions of branded/packaged products worldwide
- Free, no API key required
- Best for branded items: specific protein powder brands, packaged snacks, etc.
- Supports barcode lookup

Additional sources (Nutritionix, CalorieNinjas, etc.) may be added later.

### MCP Tools

#### `search_food`

Search for foods across configured data sources.

- **Input:** `{ query: string, source?: "usda" | "openfoodfacts" | "all" }`
- **Output:** Array of matches, each with:
  - `id` - Source-specific food identifier
  - `source` - Which data source ("usda" or "openfoodfacts")
  - `name` - Food name/description
  - `brand` - Brand name if applicable (null for generic foods)
  - `matchScore` - Relevance ranking from the source API
- **Behavior:**
  - Searches across all configured sources by default
  - Returns cached results if available and not expired
  - Deduplicates obvious matches across sources

#### `get_nutrition`

Get nutritional breakdown for a specific amount of a specific food.

- **Input:** `{ foodId: string, source: string, amount: number, unit: string }`
  - Units supported: g, kg, oz, lb, cup, tbsp, tsp, fl_oz, mL, L, "piece", "medium", "large", "small"
- **Output:**
  - `servingDescription` - What amount this represents (e.g., "60g of whole milk")
  - `nutrients` - Object with nutrient values:
    - Always present: `calories`, `protein_g`, `total_carbs_g`, `total_fat_g`
    - When available: `fiber_g`, `sugar_g`, `added_sugar_g`, `saturated_fat_g`, `unsaturated_fat_g`, `sodium_mg`, `cholesterol_mg`, `potassium_mg`, `calcium_mg`, `iron_mg`, `vitamin_a_mcg`, `vitamin_c_mg`, `vitamin_d_mcg`, and any others from source data
    - Each nutrient includes `{ value: number, available: boolean }` to distinguish "0g" from "data not available"
- **Behavior:**
  - Handles unit conversions internally using standard conversion factors
  - Volume-to-weight conversions use per-food density data where available (e.g., 1 cup milk ≈ 244g, 1 cup flour ≈ 125g)
  - For descriptive sizes ("1 medium banana"), uses USDA reference amounts

#### `calculate_meal`

Sum nutrients across multiple food items. Pure arithmetic, no estimation.

- **Input:** `{ items: Array<{ foodId: string, source: string, amount: number, unit: string }> }`
- **Output:**
  - `items` - Per-item nutritional breakdown (same format as get_nutrition output)
  - `totals` - Summed nutrients across all items
  - `nutrientCoverage` - Which nutrients had data available for all items vs. partial coverage

#### `save_food`

Store nutritional data obtained from external sources (e.g., web search for restaurant items, nutrition labels read from photos) into the local cache for consistent future lookups.

- **Input:** `{ name: string, brand?: string, category?: string, servingSize: { amount: number, unit: string }, nutrients: { calories: number, protein_g?: number, total_carbs_g?: number, total_fat_g?: number, ... } }`
- **Output:** `{ id: string, source: "custom" }` - Returns an ID that can be used with `get_nutrition` and `calculate_meal`
- **Behavior:**
  - Stores the food in the SQLite cache with source "custom"
  - These entries are included in `search_food` results
  - TTL: 90 days (restaurant menus and products change infrequently)
  - If a food with the same name and brand already exists, updates it and resets the TTL
  - The LLM uses this after finding nutrition data via web search or reading a nutrition label, so the data is available for future lookups without re-searching

### Caching Strategy

- **Storage:** SQLite database file
- **What's cached:** API responses from USDA and Open Food Facts (raw nutrition data per food item)
- **Cache key:** `{source}:{foodId}` for nutrition data, `{source}:{query_hash}` for search results
- **TTL:**
  - USDA data: 30 days (rarely changes)
  - Open Food Facts data: 7 days (community-edited, changes more often)
  - Search results: 24 hours
- **Revalidation:** On cache miss or expiration, fetch fresh data and update cache
- **Pre-loading:** Consider bootstrapping common foods on first run (top 100-200 ingredients) to reduce cold-start API calls

### Authentication

- **Protocol:** MCP OAuth 2.1 with PKCE
- Claude Code has built-in support for MCP OAuth flows - handles token acquisition, refresh, and storage natively
- The server implements the OAuth 2.1 authorization server endpoints (authorization, token, registration)
- Single-user for now, but OAuth provides a clean path to multi-user if ever needed
- All MCP tool calls require a valid access token

### Rate Limiting (Fast Follow)

- Not required for v1 launch
- When added: per-token request counting at the server middleware level
- Reasonable defaults for a single user (e.g., 100 requests/minute)

### Unit Conversion

The server must handle common kitchen measurements and convert between them:

- **Volume:** cups, tablespoons (tbsp), teaspoons (tsp), fluid ounces (fl oz), milliliters (mL), liters (L)
- **Weight:** grams (g), ounces (oz), pounds (lb), kilograms (kg)
- **Descriptive:** "1 medium banana", "2 large eggs", "1 slice bread" → mapped to USDA standard reference amounts
- **Volume ↔ Weight:** Requires per-food density data. Where density is unknown, the server should return an error rather than guess.

---

## Component 2: Claude Code Plugin

### Purpose

Guide the LLM to effectively use the MCP server tools and provide a good conversational experience for nutritional tracking.

### Plugin Structure

```
food-tracking-ai-plugin/
├── .claude-plugin/
│   └── plugin.json          # name, description, version
├── skills/
│   └── nutrition-tracker/
│       └── SKILL.md          # Conversation guidance for the LLM
├── .mcp.json                 # Points to the remote MCP server
└── README.md
```

### Skill: `nutrition-tracker` (SKILL.md)

The skill instructs Claude on how to handle food tracking conversations.

#### Conversation Flow

1. **Parse user input** - Understand what was eaten from natural language and/or images
2. **Identify information gaps** - What's missing? Amounts? Specific ingredients? Brands?
3. **Ask clarifying questions** - Only when the missing info would significantly change the result
4. **Map to searchable foods** - Break a described meal into individual ingredients/components
5. **Use MCP tools** - `search_food` → `get_nutrition` for each item → `calculate_meal` for totals
6. **Present results** - Nutritional breakdown with confidence score and explanation

#### Clarifying Question Guidelines

The skill should instruct Claude to:

- **Don't over-ask.** Max 2-3 clarifying questions before providing an answer.
- **Only ask when it matters.** Don't ask about a dash of salt or a squeeze of lemon. Do ask about the amount of rice or meat.
- **Accept vague answers.** "A handful" → reasonable estimate. "A normal serving" → USDA reference serving. "About half" → 50% of standard.
- **Provide defaults for "I don't know."** Map common vague descriptions to reasonable amounts:
  - "a splash of milk" → ~2 tablespoons
  - "some cheese" → ~1 oz / 28g
  - "a bowl of rice" → ~1 cup cooked
- **Never block on missing info.** Always give the best answer possible with available information, noting what was estimated.

#### Image Handling

The skill should instruct Claude to:

- **Nutrition labels (photos):** Read all visible nutritional information directly from the label. Use this as-is - highest confidence data. Extract serving size, calories, macros, and any visible micronutrients.
- **Food photos:** Estimate what foods are present and approximate portion sizes. Use these estimates with the MCP tools to calculate nutrition. Note that portions are estimated in the confidence explanation.
- **Combined (photo + text):** Use text description as primary, photo for verification or to fill gaps.
- Claude's built-in multimodal vision handles all image analysis. No specialized OCR or estimation tools needed.

#### Restaurant Food

- The LLM handles restaurant food lookup via its own knowledge and web search capabilities
- For major chains: LLM finds published nutrition data via web search → high confidence
- For small/local restaurants: LLM estimates based on typical recipes for that dish → lower confidence
- **Caching flow:** After finding restaurant nutrition data via web search, the LLM should call `save_food` to cache it in the MCP server. On future requests for the same item, `search_food` will return the cached entry - no web search needed, and the numbers are consistent.
- The skill should instruct the LLM to always check `search_food` first before falling back to web search for restaurant items
- The LLM can also use `calculate_meal` if it breaks a restaurant dish down into estimated ingredients

#### Response Format

Every response should include:

1. **Meal totals** (always shown prominently):
   - Calories
   - Protein (g)
   - Carbs (g)
   - Fat (g)

2. **Additional nutrients** - shown if the user asked for them, or if they're notably high/low

3. **Per-item breakdown** - included but can be brief/collapsed for simple meals

4. **Confidence score** - numeric percentage + label + brief explanation:
   - "**85% - Good confidence.** Nutritional data from USDA database. Amounts based on your description."
   - "**55% - Moderate confidence.** Portion sizes estimated from your photo. Ingredients for the pasta sauce were assumed based on a typical marinara."

### Confidence Scoring

Confidence is determined by the LLM based on how much estimation was involved.

**Scale:** 0-100% numeric score with a label:

| Range | Label | Meaning |
|-------|-------|---------|
| 90-100% | High | Exact data available (nutrition label, precise amounts, known products) |
| 70-89% | Good | Minor estimations (approximate amounts, well-known generic foods) |
| 50-69% | Moderate | Significant estimations (portions from photos, assumed ingredients) |
| Below 50% | Low | Mostly guessing (vague descriptions, unknown restaurant food, many unknowns) |

**Factors that affect confidence:**

| Factor | Direction |
|--------|-----------|
| Nutrition label photo provided | ↑ Very high |
| Specific brand identified and found in database | ↑ High |
| Generic food with precise weight/volume | ↑ High |
| Generic food with approximate amount ("about a cup") | → Moderate |
| Portion estimated from food photo | ↓ Lower |
| Ingredients assumed (e.g., guessing what's in a sauce) | ↓ Lower |
| "I don't know" answer to amount question | ↓ Lower |
| Restaurant food without published data | ↓ Lower |

The skill should instruct the LLM to briefly explain *why* the confidence is at that level.

---

## Use Case Scenarios

### Scenario 1: Simple - Coffee with milk and sugar
- **User:** "How many calories in my coffee with milk and sugar?"
- **LLM asks:** "About how much milk and sugar did you use?"
- **User:** "Quarter cup of milk, one and a half teaspoons of sugar"
- **LLM:** search_food("whole milk") → search_food("granulated sugar") → get_nutrition for each → calculate_meal → "Your coffee had approximately **47 calories**, 2g protein, 6g carbs, 2g fat. **88% - Good confidence.** Amounts based on your description; nutritional data from USDA."

### Scenario 2: Moderate - Protein shake with photo
- **User:** [photo of protein powder label] "Had two scoops of this with 330g whole milk and half a banana"
- **LLM:** Reads label from image, extracts per-serving values, multiplies by 2. Searches milk and banana via MCP. calculate_meal for totals. **92% - High confidence.**

### Scenario 3: Complex - Home-cooked spaghetti
- **User:** "Made spaghetti - used about half a box of pasta, a pound of ground beef, and a jar of Rao's marinara"
- **LLM:** Searches for each ingredient. May ask "How much did you eat - about half the batch, a third?" Calculates per-serving based on answer. **65% - Moderate confidence.** Amounts are approximate, assumes the full jar of sauce was used.

### Scenario 4: Restaurant - Known chain
- **User:** "Had a Big Mac and medium fries"
- **LLM:** Searches web for McDonald's published nutrition data. Reports numbers. **90% - High confidence.**

### Scenario 5: Restaurant - Local place
- **User:** "Had pad thai from the Thai place downtown"
- **LLM:** Estimates based on typical pad thai recipe and standard restaurant portion. Uses MCP to calculate from estimated ingredients. **40% - Low confidence.** Ingredients and portions estimated based on typical pad thai preparation.

---

## Non-Goals (v1)

- **No daily/weekly tracking or totals** - Just per-meal/per-item calculations
- **No meal planning or dietary recommendations** - Just reporting numbers
- **No user accounts or persistent meal history** - Each conversation is independent
- **No barcode scanning integration** - Photo of label works, but no camera-scan-to-lookup flow
- **No fitness tracker integration** - Future scope
- **No restaurant-specific database in the MCP server** - LLM handles lookup via web search, but caches results via `save_food` for consistency
- **No rate limiting in v1** - Fast follow after auth is in place

---

## Technical Constraints & Notes

- MCP server must be remotely accessible via Streamable HTTP (not stdio)
- All nutritional calculations must be deterministic (MCP server, not LLM)
- Plugin should work with Claude on desktop and mobile (via Claude app)
- USDA API key required (free, from fdc.nal.usda.gov)
- Open Food Facts API requires no key
- System should degrade gracefully when external APIs are unavailable (serve cached data, note reduced confidence)
- This is a greenfield project - no existing codebase

---

## Definition of Done

- [ ] Remote MCP server deployed on AWS, accessible via Streamable HTTP over HTTPS
- [ ] `search_food` tool returns results from both USDA and Open Food Facts
- [ ] `get_nutrition` tool returns per-amount nutritional breakdowns with unit conversion
- [ ] `calculate_meal` tool sums nutrients across multiple items deterministically
- [ ] `save_food` tool stores custom/web-searched nutrition data with 90-day TTL
- [ ] Saved foods appear in `search_food` results for consistent repeat lookups
- [ ] Nutritional data is cached in SQLite with TTL-based revalidation
- [ ] MCP OAuth 2.1 authentication is implemented and required for all tool calls
- [ ] Claude Code plugin is installable with a `SKILL.md` that guides conversation flow
- [ ] Plugin connects to the remote MCP server via `.mcp.json`
- [ ] End-to-end: user describes a meal in text → gets calculated nutrition with confidence score
- [ ] End-to-end: user sends nutrition label photo → correct data extraction and calculation
- [ ] Confidence scores are present and reasonable across different input scenarios
