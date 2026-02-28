import type { FoodConversionContext } from './types.js';

/** Conversion factors from weight units to grams. */
const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

/** Conversion factors from volume units to milliliters. */
const VOLUME_TO_ML: Record<string, number> = {
  mL: 1,
  L: 1000,
  cup: 236.588,
  tbsp: 14.787,
  tsp: 4.929,
  fl_oz: 29.574,
};

const WEIGHT_UNITS = new Set(Object.keys(WEIGHT_TO_GRAMS));
const VOLUME_UNITS = new Set(Object.keys(VOLUME_TO_ML));

/** Descriptive size keywords that map to USDA portion descriptions. */
const DESCRIPTIVE_UNITS = new Set([
  'piece',
  'slice',
  'small',
  'medium',
  'large',
]);

export function isWeightUnit(unit: string): boolean {
  return WEIGHT_UNITS.has(unit);
}

export function isVolumeUnit(unit: string): boolean {
  return VOLUME_UNITS.has(unit);
}

export function isDescriptiveUnit(unit: string): boolean {
  return DESCRIPTIVE_UNITS.has(unit);
}

/** Converts a weight amount to grams. Throws for unsupported units. */
export function weightToGrams(amount: number, unit: string): number {
  if (!(unit in WEIGHT_TO_GRAMS)) {
    throw new Error(`Unsupported weight unit: ${unit}`);
  }
  return amount * WEIGHT_TO_GRAMS[unit];
}

/** Converts a volume amount to milliliters. Throws for unsupported units. */
export function volumeToMl(amount: number, unit: string): number {
  if (!(unit in VOLUME_TO_ML)) {
    throw new Error(`Unsupported volume unit: ${unit}`);
  }
  return amount * VOLUME_TO_ML[unit];
}

/**
 * Resolves a descriptive size (e.g., "medium", "slice") to grams using USDA portion data.
 * Matches against portionDescription and modifier fields, case-insensitively.
 */
function resolveDescriptiveSize(
  amount: number,
  unit: string,
  context: FoodConversionContext,
): number {
  const portions = context.portions;
  if (!portions || portions.length === 0) {
    throw new Error(
      `Cannot convert descriptive unit "${unit}": no portion data available for this food.`,
    );
  }

  const unitLower = unit.toLowerCase();

  const match = portions.find((p) => {
    const desc = p.portionDescription.toLowerCase();
    const mod = p.modifier?.toLowerCase() ?? '';
    return desc.includes(unitLower) || mod.includes(unitLower);
  });

  if (!match) {
    const available = portions.map((p) => p.portionDescription).join(', ');
    throw new Error(
      `Cannot convert descriptive unit "${unit}": no matching portion found. Available portions: ${available}`,
    );
  }

  return (amount / match.amount) * match.gramWeight;
}

/**
 * Main entry point: converts any supported unit to grams.
 * - Weight units convert directly.
 * - Volume units require densityGPerMl in context.
 * - Descriptive units require portions in context.
 */
export function convertToGrams(
  amount: number,
  unit: string,
  context?: FoodConversionContext,
): number {
  if (isWeightUnit(unit)) {
    return weightToGrams(amount, unit);
  }

  if (isVolumeUnit(unit)) {
    const density = context?.densityGPerMl;
    if (density == null) {
      throw new Error(
        `Cannot convert volume unit "${unit}" to grams: density data (grams per mL) is not available for this food.`,
      );
    }
    const ml = volumeToMl(amount, unit);
    return ml * density;
  }

  if (isDescriptiveUnit(unit)) {
    return resolveDescriptiveSize(amount, unit, context ?? {});
  }

  throw new Error(
    `Unsupported unit: "${unit}". Supported units: ${[...WEIGHT_UNITS, ...VOLUME_UNITS, ...DESCRIPTIVE_UNITS].join(', ')}`,
  );
}
