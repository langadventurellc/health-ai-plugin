---
id: T-update-skillmd-to-guide-llm
title: Update SKILL.md to guide LLM on unit selection and fallback behavior
status: done
priority: medium
parent: none
prerequisites:
  - T-make-descriptive-unit
affectedFiles:
  plugin/skills/nutrition-tracker/SKILL.md:
    Added 'Unit selection' subsection with
    four bullet points (prefer grams, when to use descriptive units, never use
    piece for powders/liquids, retry with grams on failure). Enhanced the unit
    rejection fallback note in step 4 to be more specific about retrying with
    grams.
log:
  - >-
    Research phase complete. Read the current SKILL.md (246 lines) and the
    prerequisite task T-make-descriptive-unit (completed).


    Current state of SKILL.md:

    - MANDATORY block (lines 23-27): Already has the correct fallback chain (MCP
    → web → training data < 40%)

    - Critical Rules (lines 42-56): Already aligned with fallback chain — was
    updated previously. Contains "Fallback chain" bullet and "Training data =
    low confidence" bullet. No contradictions found.

    - Confidence scoring table (lines 223-229): Already has "Very Low" tier
    (Below 40%) for training data fallback.

    - Food Search and Lookup (lines 101-127): Has basic guidance but NO unit
    selection guidance. Line 113-114 mentions "If the server rejects a unit,
    fall back to a weight-based estimate" but lacks specifics.

    - Technical Notes (lines 237-245): Lists supported units but doesn't guide
    when to use which.


    Assessment:

    1. The Critical Rules and confidence table are already correct — they were
    updated in a previous change. The task description mentioned they "still"
    needed updating, but that's already been done.

    2. The main gap is unit selection guidance — this is completely missing.

    3. I need to add a "Unit Selection" subsection to the "Food Search and
    Lookup" section.


    Plan:

    1. Add a "Unit Selection" subsection after line 101 (within Food Search and
    Lookup) with the four bullet points from the task requirements.

    2. Verify that the existing Critical Rules, MANDATORY block, and confidence
    scoring are all consistent (they appear to be).

    3. No other changes needed since the Critical Rules and confidence table are
    already aligned.
  - >-
    Added unit selection guidance to SKILL.md and verified consistency across
    all sections.


    Changes made:

    1. Added a "Unit selection" subsection within "Food Search and Lookup" with
    four concise bullet points: prefer grams, when to use descriptive units,
    never use piece for powders/liquids, and retry with grams on failure.

    2. Enhanced the existing unit rejection fallback note (step 4 under "For
    each ingredient") to be more specific — "retry with grams (estimate a
    reasonable weight) and note the assumption in the confidence line."


    Verified (no changes needed):

    - The Critical Rules section already aligns with the MCP → web → training
    data fallback chain.

    - The confidence scoring table already includes the "Very Low" tier (below
    40%) for training data.

    - The MANDATORY block, Critical Rules, and confidence scoring sections are
    all consistent with each other.

    - No contradictory "never estimate from memory" or "no exceptions" language
    remains.
schema: v1.0
childrenIds: []
created: 2026-03-01T04:54:02.320Z
updated: 2026-03-01T04:54:02.320Z
---

## Context

The nutrition-tracker skill (`plugin/skills/nutrition-tracker/SKILL.md`) doesn't give the LLM clear guidance on when to use descriptive units vs. weight units. This leads to avoidable errors — e.g., passing `"piece"` for whey protein powder, or `"medium"` for foods where the server can't resolve sizes. The server is being made more robust (T-make-descriptive-unit), but the LLM should also be smarter about unit selection to reduce errors in the first place.

Additionally, the skill's critical rules still say to never provide data from training knowledge. The fallback chain should be: MCP tools → web search → training data (low confidence). This was partially updated in the description frontmatter but the Critical Rules section still contradicts it.

## Implementation Requirements

### 1. Add unit selection guidance to SKILL.md

In the "Food Search and Lookup" section or a new subsection, add guidance like:

- **Prefer grams** when the user states a weight or you can estimate one (e.g., "two scoops of whey" → ~62g based on standard scoop size)
- **Use descriptive units** (`piece`, `medium`, `large`, `small`, `slice`) only for whole countable foods (fruits, eggs, slices of bread) where the user gave a count rather than a weight
- **Never use `piece` for** powders, liquids, sauces, or bulk ingredients — use grams or volume units instead
- **If a descriptive unit fails**, retry with grams using a reasonable estimate and note the assumption in the confidence line

### 2. Align the Critical Rules with the fallback chain

The Critical Rules section (lines ~40-52) still contains:

- "ALWAYS use tools. Every nutrition number MUST come from `get_nutrition` or `calculate_meal`. No exceptions."
- "NEVER estimate from memory."

These need to be updated to match the fallback chain that was already set in the MANDATORY block at the top:

- MCP tools first → web search second → training data last resort (confidence below 40%)
- Always provide a response, never refuse

### 3. Update the confidence scoring table

Add the "Very Low" tier (below 40%) for training data fallback if not already present (it was added previously but verify it's consistent with the Critical Rules changes).

## Acceptance Criteria

- [ ] SKILL.md includes clear unit selection guidance (prefer grams, when to use descriptive, what to avoid)
- [ ] Critical Rules section aligns with the fallback chain (MCP → web → training data)
- [ ] No contradictions between the MANDATORY block, Critical Rules, and confidence scoring sections
- [ ] The guidance is concise (not verbose — a few bullet points, not paragraphs)

## Out of Scope

- Server-side changes (handled by T-make-descriptive-unit)
- Changes to the system prompt for the Claude chat project
- Changes to plugin.json or .mcp.json
