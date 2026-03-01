---
id: T-make-descriptive-unit
title: Make descriptive unit conversion more robust with smart matching and fallbacks
status: done
priority: high
parent: none
prerequisites: []
affectedFiles:
  server/src/clients/usda.ts:
    "Added junk portion filtering in extractPortionData:
    filters 'undetermined', 'Quantity not specified', 'unknown', and empty
    descriptions. Made extractPortionData exported for testability."
  server/src/conversion/units.ts: 'Replaced naive substring matching with tiered
    strategy (Tier 1: exact match, Tier 2: piece fallback to natural units, Tier
    3: size keyword fallback). Added helper functions isNaturalUnit,
    findNaturalUnits, selectBySize, portionToGrams. Updated error messages with
    grams fallback hint.'
  server/src/conversion/__tests__/units.test.ts:
    Added 13 new tests covering Tier
    2 piece fallback, Tier 3 size keyword fallback, and error message grams
    hint.
  server/src/clients/__tests__/usda.test.ts: Added 7 new tests for junk portion filtering in extractPortionData.
log:
  - >-
    Research phase complete. Reviewed all relevant source files:

    - server/src/conversion/units.ts (resolveDescriptiveSize needs tiered
    matching)

    - server/src/conversion/types.ts (FoodConversionContext - may not need
    foodName)

    - server/src/clients/usda.ts (extractPortionData needs junk filtering)

    - server/src/tools/get-nutrition.ts (convertToGrams call site)

    - server/src/tools/calculate-meal.ts (delegates to get-nutrition)

    - server/src/conversion/__tests__/units.test.ts (existing tests)

    - server/src/clients/__tests__/usda.test.ts (existing tests)


    Plan:

    1. Add junk portion filtering in extractPortionData (usda.ts)

    2. Implement tiered matching in resolveDescriptiveSize (units.ts)

    3. Update error messages with grams fallback hint

    4. No need to add foodName to context - the description-pattern heuristic is
    sufficient

    5. Add tests for all tiers and edge cases

    6. Run quality checks
  - >-
    Implemented robust descriptive unit conversion with tiered matching and junk
    portion filtering.


    1. Added junk portion filtering in `extractPortionData` (usda.ts): Filters
    out portions with useless descriptions ("undetermined", "Quantity not
    specified", "unknown", empty/whitespace) after the existing gramWeight > 0
    filter. Made the function exported for direct testing.


    2. Implemented tiered matching in `resolveDescriptiveSize` (units.ts):
       - Tier 1: Exact substring match on portionDescription/modifier (preserved existing behavior)
       - Tier 2: "piece" fallback finds the first natural-unit portion (amount=1, no volume/weight keywords)
       - Tier 3: "small"/"medium"/"large" fallback maps to lightest/median/heaviest natural-unit portions sorted by gramWeight; single natural unit serves as the "medium" equivalent for any size keyword

    3. Updated error messages to include "Try using grams (g) instead." hint for
    all descriptive unit failure modes.


    4. Added helper functions to keep cognitive complexity under the sonarjs
    limit: `isNaturalUnit`, `findNaturalUnits`, `selectBySize`,
    `portionToGrams`.


    5. Added 20 new tests:
       - 13 in units.test.ts: Tier 2 piece fallback (5 tests), Tier 3 size keyword fallback (6 tests), error message hints (2 tests)
       - 7 in usda.test.ts: junk portion filtering for all description variants

    All 191 tests pass. All quality checks pass (lint, format, type-check).
schema: v1.0
childrenIds: []
created: 2026-03-01T04:53:41.120Z
updated: 2026-03-01T04:53:41.120Z
---

## Context

The MCP server's descriptive unit conversion (`piece`, `medium`, `large`, `small`, `slice`) fails in common real-world scenarios because the matching logic in `resolveDescriptiveSize` (`server/src/conversion/units.ts:65-93`) does naive substring matching against USDA portion data. Three failure modes have been observed:

1. **Banana with `"medium"`** — USDA portions include `"1 banana"` but not the word `"medium"` in either `portionDescription` or `modifier`. Substring match fails.
2. **Egg with `"piece"`** (foodId 173424) — Portions exist but all have `portionDescription: "undetermined"`. No substring can match.
3. **Whey protein with `"piece"`** — No portion data at all (expected for powders), but error message doesn't help the LLM client recover.

## Implementation Requirements

### 1. Filter junk portions during extraction (`server/src/clients/usda.ts`)

In `extractPortionData` (line 88-114), filter out portions with useless descriptions before returning:

- Filter where `portionDescription` is `"undetermined"`, `"Quantity not specified"`, `"unknown"`, or empty/whitespace-only
- This prevents junk data from polluting error messages and matching logic
- Apply the filter AFTER the existing `gramWeight > 0` filter

### 2. Smarter matching in `resolveDescriptiveSize` (`server/src/conversion/units.ts`)

Replace the simple substring match with a tiered matching strategy:

**Tier 1 — Exact match (current behavior):** Substring match of the unit against `portionDescription` and `modifier`. Keep this as-is.

**Tier 2 — `"piece"` fallback:** When `"piece"` doesn't match in Tier 1, look for a "natural unit" portion — one whose description matches the pattern of a single countable item (e.g., `"1 banana"`, `"1 egg"`, `"1 cookie"`). Heuristic: a portion with `amount: 1` whose description is NOT a volume/weight measure (doesn't contain "cup", "tbsp", "tsp", "oz", "g", "mL", "slice", "inch"). Use the first such match.

**Tier 3 — Size keyword fallback (`"medium"`, `"small"`, `"large"`):** When no portion contains the size keyword, find all "natural unit" portions (same heuristic as Tier 2). If exactly one exists, use it as the `"medium"` equivalent. If multiple exist sorted by `gramWeight`, map `"small"` → lightest, `"medium"` → middle (or median), `"large"` → heaviest.

### 3. Improve error messages (`server/src/conversion/units.ts`)

- When portions exist but all were filtered as junk: `"Cannot convert descriptive unit \"piece\": portion data is available but descriptions are not usable. Try using grams (g) instead."`
- When portions exist but no match: keep current message but append `" Try using grams (g) instead."`
- When no portion data exists at all: keep current message but append `" Try using grams (g) instead."`

### 4. Pass food name into conversion context (if needed for Tier 2)

If the natural-unit heuristic needs food name matching, add an optional `foodName?: string` field to `FoodConversionContext` in `server/src/conversion/types.ts` and populate it from the nutrition data in `get-nutrition.ts` and `calculate-meal.ts`. However, the description-pattern heuristic (filtering out volume/weight terms) may be sufficient without the food name.

## Technical Approach

1. Start with `extractPortionData` in `usda.ts` — add the junk filter
2. Refactor `resolveDescriptiveSize` in `units.ts` into the tiered strategy
3. Update error messages
4. Add/update tests in `server/src/conversion/__tests__/units.test.ts` covering:
   - Tier 1 still works (existing tests should pass)
   - Tier 2: `"piece"` resolves to `"1 banana"` when no explicit piece portion exists
   - Tier 2: `"piece"` does NOT match volume portions like `"1 cup"`
   - Tier 3: `"medium"` resolves to the only natural-unit portion when no size keyword exists
   - Tier 3: `"small"`/`"medium"`/`"large"` map correctly to sorted portions by weight
   - Junk portions (`"undetermined"`) are filtered and produce helpful error messages
   - Error messages include the grams fallback hint
5. Add tests in `server/src/clients/__tests__/usda.test.ts` for junk portion filtering

## Acceptance Criteria

- [ ] `convertToGrams(1, 'medium', { portions: [{ portionDescription: '1 banana', gramWeight: 118, amount: 1 }] })` returns `118` (Tier 3 fallback)
- [ ] `convertToGrams(1, 'piece', { portions: [{ portionDescription: '1 banana', gramWeight: 118, amount: 1 }] })` returns `118` (Tier 2 fallback)
- [ ] `convertToGrams(1, 'piece', { portions: [{ portionDescription: '1 cup', gramWeight: 244, amount: 1 }] })` throws (cup is not a natural unit)
- [ ] Portions with `portionDescription: "undetermined"` are filtered during extraction
- [ ] Error messages include `"Try using grams (g) instead"` hint
- [ ] All existing unit conversion tests continue to pass
- [ ] New tests cover all three tiers and edge cases
- [ ] `mise run quality` passes (lint, format, type-check)
- [ ] `mise run test` passes

## Out of Scope

- Adding a `"serving"` descriptive unit (future enhancement)
- Changes to the LLM skill instructions (separate task)
- Changes to the MCP tool schemas or API contract
- Custom food portion handling
