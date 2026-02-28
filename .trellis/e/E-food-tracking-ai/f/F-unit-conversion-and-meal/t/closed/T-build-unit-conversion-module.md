---
id: T-build-unit-conversion-module
title: Build unit conversion module with volume, weight, density, and
  descriptive size support
status: done
priority: high
parent: F-unit-conversion-and-meal
prerequisites: []
affectedFiles:
  server/src/conversion/types.ts: Created PortionData and FoodConversionContext
    types for unit conversion context
  server/src/conversion/units.ts: Created standalone conversion module with
    weightToGrams, volumeToMl, convertToGrams, and unit type detection functions
  server/src/conversion/__tests__/units.test.ts: Created 26 unit tests covering
    weight, volume, volume-to-weight, descriptive size, and error cases
  server/src/types.ts: Added optional portions (PortionData[]) and densityGPerMl
    fields to NutritionData interface
  server/src/clients/types.ts: Added re-export of PortionData from conversion/types.ts
  server/src/clients/usda.ts: Added UsdaFoodPortion interface, foodPortions to
    UsdaFoodDetailResponse, extractPortionData helper, and updated
    normalizeNutrition to extract portion data and derive density
  server/src/tools/get-nutrition.ts: Removed UNIT_TO_GRAMS/toGrams (moved to
    conversion module), added NutritionUnit type with all 15 units, updated
    handleGetNutrition to use convertToGrams with food context, improved
    buildServingDescription for non-weight units
  server/src/server.ts:
    Expanded get_nutrition Zod schema unit enum to include all
    15 unit types, updated description to mention volume and descriptive unit
    support
  server/src/tools/__tests__/get-nutrition.test.ts:
    Removed toGrams tests (covered
    by conversion module tests), added MILK_NUTRITION and BANANA_NUTRITION
    fixtures, added 4 integration tests for volume unit with density, volume
    unit without density (error), descriptive unit with portions, descriptive
    unit without portions (error)
log:
  - >-
    Research phase complete. Analyzed all relevant source files:

    - server/src/tools/get-nutrition.ts: Contains UNIT_TO_GRAMS and toGrams to
    be moved

    - server/src/types.ts: NutritionData needs PortionData and density fields

    - server/src/clients/usda.ts: normalizeNutrition needs to extract portion
    data

    - server/src/server.ts: Zod schema for get_nutrition unit needs expanding

    - server/src/tools/__tests__/get-nutrition.test.ts: Existing tests to update


    Plan:

    1. Create server/src/conversion/types.ts (PortionData,
    FoodConversionContext)

    2. Create server/src/conversion/units.ts (conversion module)

    3. Update server/src/types.ts (add portions/density to NutritionData)

    4. Update server/src/clients/usda.ts (extract portion data)

    5. Refactor server/src/tools/get-nutrition.ts (use new conversion module)

    6. Update server/src/server.ts (expand unit enum)

    7. Create server/src/conversion/__tests__/units.test.ts

    8. Update server/src/tools/__tests__/get-nutrition.test.ts
  - >-
    Built a standalone unit conversion module that handles weight, volume,
    density-based, and descriptive size conversions. The module is cleanly
    separated from API clients and tool handlers for independent testability.


    Key changes:

    - Created conversion module (types.ts + units.ts) with convertToGrams as
    main entry point, supporting weight (g/kg/oz/lb), volume
    (cup/tbsp/tsp/fl_oz/mL/L via density), and descriptive sizes
    (piece/slice/small/medium/large/extra_large via USDA portions)

    - Added PortionData and densityGPerMl to NutritionData type

    - Updated USDA client to extract foodPortions from API responses and derive
    density from cup portions

    - Refactored get-nutrition tool to use the new conversion module instead of
    inline UNIT_TO_GRAMS/toGrams

    - Expanded get_nutrition Zod schema to accept all 15 unit types

    - Updated buildServingDescription to format non-weight units with a space
    separator

    - 26 unit tests for the conversion module covering all unit types, error
    cases, and edge cases

    - 4 new integration tests for get-nutrition with volume/descriptive units
    and error cases

    - All 103 tests pass, all quality checks (lint, format, type-check) clean
schema: v1.0
childrenIds: []
created: 2026-02-28T19:38:15.004Z
updated: 2026-02-28T19:38:15.004Z
---

## Context

The `get_nutrition` tool currently only supports weight units (`g`, `kg`, `oz`, `lb`) via a simple `UNIT_TO_GRAMS` lookup in `server/src/tools/get-nutrition.ts`. The feature F-unit-conversion-and-meal requires support for volume units (cup, tbsp, tsp, fl_oz, mL, L), volume-to-weight conversion via per-food density data, and descriptive size conversion ("1 medium banana", "1 slice bread") via USDA reference portions.

This task creates a standalone, well-tested conversion module that encapsulates all unit conversion logic. The module must be cleanly separated from API clients and tool handlers so it can be unit tested independently.

## Implementation Requirements

### 1. Create `server/src/conversion/units.ts`

A pure conversion module with no external dependencies. It should contain:

**Weight-to-weight conversions** (already exists in `get-nutrition.ts` as `UNIT_TO_GRAMS` -- move and expand here):

- Supported units: `g`, `kg`, `oz`, `lb`
- All conversions go through grams as the base unit

**Volume-to-volume conversions:**

- Supported units: `cup`, `tbsp`, `tsp`, `fl_oz`, `mL`, `L`
- All conversions go through milliliters as the base unit
- Standard factors: 1 cup = 236.588 mL, 1 tbsp = 14.787 mL, 1 tsp = 4.929 mL, 1 fl_oz = 29.574 mL, 1 L = 1000 mL

**Volume-to-weight conversion:**

- Takes a volume amount + unit and a density value (grams per mL)
- Converts volume to mL first, then multiplies by density to get grams
- If density is not provided/available, throws a clear error (never guesses)

**Descriptive size resolution:**

- Takes a descriptive size string (e.g., "medium", "large", "slice", "piece") and a food's portion data
- Looks up the gram weight from USDA portion data (passed in as a parameter, not fetched here)
- If no matching portion is found, throws a clear error

**Key exports:**

- `convertToGrams(amount: number, unit: string, context?: { densityGPerMl?: number, portions?: PortionData[] }): number` -- the main entry point. Handles weight units directly, volume units via density, descriptive units via portions.
- `isWeightUnit(unit: string): boolean`
- `isVolumeUnit(unit: string): boolean`
- `isDescriptiveUnit(unit: string): boolean`
- `volumeToMl(amount: number, unit: string): number`
- `weightToGrams(amount: number, unit: string): number`

### 2. Create `server/src/conversion/types.ts`

Types for portion/density data:

- `PortionData` -- represents a USDA food portion: `{ portionDescription: string, modifier?: string, gramWeight: number, amount: number }`
- `FoodConversionContext` -- density and portion data for a specific food: `{ densityGPerMl?: number, portions?: PortionData[] }`

### 3. Update `server/src/types.ts`

Add optional portion and density data to `NutritionData`:

- `portions?: PortionData[]` -- USDA food portions with gram weights
- `densityGPerMl?: number` -- derived from portions when a "1 cup" portion exists (gramWeight / 236.588)

### 4. Refactor `server/src/tools/get-nutrition.ts`

- Remove the `UNIT_TO_GRAMS` constant and `toGrams` function (moved to conversion module)
- Import and use `convertToGrams` from the conversion module instead
- Keep `scaleNutrient` and `scaleNutrients` in place (they handle nutrient math, not unit conversion)
- Update `GetNutritionParams` to accept the expanded unit type: `'g' | 'kg' | 'oz' | 'lb' | 'cup' | 'tbsp' | 'tsp' | 'fl_oz' | 'mL' | 'L' | 'piece' | 'medium' | 'large' | 'small' | 'slice'`
- Pass the food's `portions` and `densityGPerMl` from `NutritionData` to `convertToGrams`
- Update `buildServingDescription` to handle non-weight units nicely (e.g., "1 cup of whole milk", "1 medium banana")

### 5. Update `server/src/server.ts`

- Update the `get_nutrition` tool's Zod schema for `unit` to include all new unit types
- Update the tool description to mention volume and descriptive unit support

### 6. Update USDA client to extract portion data

In `server/src/clients/usda.ts`:

- Add `UsdaFoodPortion` interface matching the USDA API response shape: `{ id: number, amount: number, gramWeight: number, portionDescription?: string, modifier?: string, measureUnit?: { name: string } }`
- Add `foodPortions?: UsdaFoodPortion[]` to `UsdaFoodDetailResponse`
- In `normalizeNutrition`, parse `foodPortions` into `PortionData[]` on the `NutritionData` result
- Derive `densityGPerMl` when a "1 cup" portion is present: `gramWeight / 236.588`

### 7. Unit tests

Create `server/src/conversion/__tests__/units.test.ts` with tests for:

- Weight-to-weight conversions: verify `weightToGrams` for all supported units against known reference values
- Volume-to-volume conversions: verify `volumeToMl` for all supported units against known reference values
- Volume-to-weight: verify that `convertToGrams(1, 'cup', { densityGPerMl: 1.03 })` produces the correct gram weight (236.588 \* 1.03 = 243.7)
- Volume-to-weight error: verify that calling `convertToGrams(1, 'cup', {})` (no density) throws an error
- Descriptive size resolution: verify that `convertToGrams(1, 'medium', { portions: [{ portionDescription: '1 medium', gramWeight: 118, amount: 1 }] })` returns 118
- Descriptive size error: verify that calling `convertToGrams` with a descriptive unit and no matching portion throws an error
- Unit type detection: `isWeightUnit`, `isVolumeUnit`, `isDescriptiveUnit`

Update `server/src/tools/__tests__/get-nutrition.test.ts`:

- Update the existing `toGrams` test to use the new import path (or remove if redundant with conversion module tests)
- Add a test for `handleGetNutrition` with a volume unit and food that has density data
- Add a test for `handleGetNutrition` with a descriptive unit and food that has portion data
- Add a test verifying error when volume unit is used on food without density data

## Acceptance Criteria

- All weight unit conversions produce correct results (g, kg, oz, lb)
- All volume unit conversions produce correct results (cup, tbsp, tsp, fl_oz, mL, L)
- Volume-to-weight conversion works when density is available and errors when it is not
- Descriptive size resolution works when portion data is available and errors when it is not
- USDA client extracts portion data from the API response and derives density from cup portions
- `get_nutrition` tool accepts all new unit types and converts correctly
- Existing weight-only tests continue to pass
- All new unit tests pass
- Code passes `mise run quality` (lint, format, type-check)

## Out of Scope

- Open Food Facts portion data extraction (OFF has limited portion data; not needed now)
- The `calculate_meal` tool (separate task)
- Custom/saved food density or portion data
- Caching changes (portion data is stored as part of `NutritionData` which is already cached)
