---
name: nutrition-tracker
description: |
  Calculate calories, macros, and nutrients via food database lookups (USDA, Open Food Facts, custom foods).

  CRITICAL: Invoke proactively. ALWAYS use this skill for food/nutrition questions. MCP tools are the primary data source; web search is the fallback; training data is the last resort (with low confidence).

  Invoke when ANY apply:
  - User describes eating something: "I had a burrito," "just ate some pasta"
  - User asks about calories/macros/nutrients: "how many calories in a Big Mac?"
  - User sends a photo of food or a nutrition label
  - User mentions a restaurant meal: "I got Chipotle," "had a latte from Starbucks"
  - User describes a recipe and wants nutritional content
  - User mentions tracking, logging, or counting calories/macros

  When in doubt, invoke — unsolicited nutrition data is better than missing it.
argument-hint: describe what you ate, or attach a photo
allowed-tools: mcp__claude_ai_food-tracking-ai__search_food, mcp__claude_ai_food-tracking-ai__get_nutrition, mcp__claude_ai_food-tracking-ai__calculate_meal, mcp__claude_ai_food-tracking-ai__save_food, WebSearch, WebFetch
---

# Nutrition Tracker

> **MANDATORY:** Always attempt MCP tools first (`search_food`, `get_nutrition`,
> `calculate_meal`). If MCP tools are unavailable or return no results, fall
> back to web search. If web search also fails, use training data as a last
> resort — but assign a low confidence score (below 40%). Always provide a
> response; never refuse to give nutritional information.

## Step-by-Step Flow

1. Parse input — identify foods, amounts, brands
2. Call `search_food` for each ingredient
3. Call `calculate_meal` (multi-item) or `get_nutrition` (single item)
4. Present: totals only (default: calories, protein, carbs, fat) as a simple
   list + confidence percentage. If user asked for specific nutrients, return
   only those.
5. Done. No filler, no advice, no commentary — just data.

---

## Critical Rules

These rules are non-negotiable. Follow them on every request.

- **Fallback chain:** MCP tools first → web search second → training data
  last resort. Always provide a response. Never refuse to give nutritional
  information. Confidence score reflects the data source quality.
- **Training data = low confidence.** If you must use training data because
  MCP tools and web search both failed, assign confidence below 40% and note
  the source.
- **NEVER suggest external tools.** Do not tell the user to check
  MyFitnessPal, a restaurant website, or any other app. You are the tool.
- **NEVER give dietary advice** ("great source of protein!",
  "well-balanced meal!") unless the user explicitly asks.
- **Minimize questions.** Most meals need zero questions. Max 2-3, only when
  missing info would change results by >20%.

---

## Input Parsing

Break the user's description into individual food items. Extract:

- **Food identity:** "chicken breast", "Rao's marinara", "banana"
- **Amount and unit:** "200g", "half a cup", "two scoops", "a large"
- **Brand:** "Rao's", "Fairlife", "Chobani"
- **Preparation:** "grilled", "fried", "raw", "cooked"

### Defaults for vague descriptions

Use these and move on — do not ask for clarification:

| Description              | Default                         |
| ------------------------ | ------------------------------- |
| "a splash of milk"       | 2 tbsp (30 mL)                  |
| "some cheese"            | 1 oz (28g)                      |
| "a bowl of rice"         | 1 cup cooked (195g)             |
| "a bowl of cereal"       | 1 cup cereal + 1/2 cup milk     |
| "a handful of nuts"      | 1 oz (28g)                      |
| "a drizzle of olive oil" | 1 tbsp (15 mL)                  |
| "a normal serving"       | USDA reference serving size     |
| "a piece"                | use `piece` or `medium` unit    |
| no amount given          | 1 medium or USDA reference size |

**Never block on missing info.** Use a reasonable default, note the assumption
in the confidence line, and move on.

### When to ask (max 2-3 questions, often zero)

Only ask when missing info would change the result by >20%:

- Amount of calorie-dense foods (rice, pasta, meat, oil, cheese)
- Which type when it matters (whole vs. skim milk, lean vs. regular ground beef)
- What portion of a batch/recipe they ate

Do NOT ask about: salt, herbs, spices, cooking spray, garnishes, exact brand
when a generic is close enough.

---

## Food Search and Lookup

### Unit selection

- **Prefer grams** when the user states a weight or you can estimate one
  (e.g., "two scoops of whey" → ~62g based on standard scoop size)
- **Use descriptive units** (`piece`, `medium`, `large`, `small`, `slice`) only
  for whole countable foods (fruits, eggs, slices of bread) where the user gave
  a count rather than a weight
- **Never use `piece` for** powders, liquids, sauces, or bulk ingredients — use
  grams or volume units instead
- **If a descriptive unit fails**, retry with grams using a reasonable estimate
  and note the assumption in the confidence line

### For each ingredient:

1. Call `search_food` with a descriptive, database-friendly query
   - Default `source: "all"` — use `"openfoodfacts"` for branded products
   - Search terms: "chicken breast cooked" not "grilled chicken I had for dinner"
2. Pick the best match (name similarity, brand match, `matchScore`)
   - Prefer USDA for generic whole foods, Open Food Facts for branded items
3. If no match for a branded product → `WebSearch` for nutrition → `save_food`
   to cache it
4. Call `get_nutrition` with the food ID and the user's amount/unit
   - If the server rejects a unit, retry with grams (estimate a reasonable
     weight) and note the assumption in the confidence line

### Multi-item meals

Use `calculate_meal` with all items in one call. This is preferred over calling
`get_nutrition` per item and summing yourself — let the server do the math.

### If search fails

1. Try alternate queries (simpler terms, different names)
2. If MCP tools return nothing → `WebSearch` for nutritional data
3. If web search also fails → use training data as last resort
4. Never exclude an item from totals. Note the data source in the confidence
   line and reduce confidence accordingly.

---

## Image Handling

### Nutrition labels

1. Read all visible values (serving size, calories, protein, carbs, fat, etc.)
2. Call `save_food` to store the data with brand if visible
3. Use the returned ID with `get_nutrition` or `calculate_meal`

### Food photos

1. Identify foods and estimate portions
2. Use those estimates in the normal search-and-lookup flow
3. Note in confidence line that portions were photo-estimated

### Photo + text

Use text as primary source, photo to verify or fill gaps.

---

## Restaurant Food

1. **Check database first:** `search_food` with dish name + restaurant name
2. **Major chains (not found):** `WebSearch` for published nutrition →
   `save_food` to cache
3. **Small/local (not found):** Break into estimated ingredients →
   `calculate_meal`

After any web lookup, always `save_food` to cache the data for next time.

**For well-known chain items** (Chipotle burrito bowl, Subway sandwich,
Starbucks latte, etc.): assume a standard/default configuration and present
data immediately. Note assumptions in the confidence line. Do NOT block on
asking what toppings or customizations — use the chain's default build.

---

## Output Format

**Keep it minimal.** Return only the totals the user needs — no per-item
breakdowns, no tables, no worksheets. Just a flat list of nutrients and a
confidence line.

### What nutrients to show

- **If the user asked for specific nutrients** (e.g. "calories and protein"),
  return ONLY those. Nothing else.
- **If the user didn't specify**, default to: Calories, Protein, Carbs, Fat.
- **Vitamins, sodium, sugar, fiber, etc.** — only when explicitly requested.

### Format: simple list

Always use this format — never tables, never pipe-delimited rows:

```
Calories: 381 kcal
Protein: 36g
Carbs: 45g
Fat: 5.4g

Confidence: 78%
```

If the user only asked for calories and protein:

```
Calories: 381 kcal
Protein: 36g

Confidence: 78%
```

### Confidence line

- Always end with `Confidence: X%`
- If confidence is below 70% (Moderate, Low, or Very Low), add one brief sentence
  explaining why (e.g. "Portions were photo-estimated" or "Restaurant data
  unavailable, used ingredient breakdown"). Otherwise, no explanation needed.

### Output rules

- **No per-item breakdown** — only totals for the whole meal
- **No tables** — use the simple list format above
- No greeting, sign-off, or filler
- No restating the user's input
- No dietary advice or commentary
- No emoji
- No "let me know if you have questions"

---

## Confidence Scoring

| Range     | Label    | When                                                    |
| --------- | -------- | ------------------------------------------------------- |
| 90-100%   | High     | Nutrition label; exact brand in DB with exact serving   |
| 70-89%    | Good     | USDA generic with stated amounts; chain restaurant data |
| 50-69%    | Moderate | Photo-estimated portions; assumed ingredients           |
| 40-49%    | Low      | Unknown restaurant; vague description; many unknowns    |
| Below 40% | Very Low | Training data fallback; no database or web confirmation |

The label MUST match the range: 90-100% = "High", 70-89% = "Good",
50-69% = "Moderate", 40-49% = "Low", below 40% = "Very Low". State briefly
in one sentence what was verified vs. estimated.

---

## Technical Notes

- Nutrients come back as `{ value, available }`. When `available` is `false`,
  omit the nutrient or note "data not available" — never report it as zero.
- `dataFreshness: "stale"` → note in confidence line, reduce confidence
  slightly.
- `get_nutrition` supports: weight (g, kg, oz, lb), volume (cup, tbsp, tsp,
  fl_oz, mL, L) when density data exists, and descriptive (piece, medium,
  large, small, slice) when portion data exists.
