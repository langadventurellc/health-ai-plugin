import type { FoodConversionContext, PortionData } from './types.js';

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

/** Keywords that indicate a volume or weight measure, not a natural countable unit. */
const MEASURE_KEYWORDS =
  /\b(cup|cups|tbsp|tsp|oz|g|ml|mL|slice|slices|inch|inches|fl oz)\b/i;

const SIZE_UNITS = new Set(['small', 'medium', 'large']);

/** Returns true if a portion represents a natural countable unit (e.g., "1 banana", "1 egg"). */
function isNaturalUnit(portion: PortionData): boolean {
  return (
    portion.amount === 1 && !MEASURE_KEYWORDS.test(portion.portionDescription)
  );
}

/** Finds natural-unit portions, sorted by gramWeight ascending. */
function findNaturalUnits(portions: PortionData[]): PortionData[] {
  return portions
    .filter(isNaturalUnit)
    .sort((a, b) => a.gramWeight - b.gramWeight);
}

/** Selects a portion from sorted natural units based on size keyword. */
function selectBySize(
  sizeKeyword: string,
  naturalUnits: PortionData[],
): PortionData {
  if (naturalUnits.length === 1) {
    return naturalUnits[0];
  }
  if (sizeKeyword === 'small') {
    return naturalUnits[0];
  }
  if (sizeKeyword === 'large') {
    return naturalUnits[naturalUnits.length - 1];
  }
  // "medium" -> median
  const midIndex = Math.floor(naturalUnits.length / 2);
  return naturalUnits[midIndex];
}

/** Computes gram weight from a matched portion. Throws if portion amount is invalid. */
function portionToGrams(amount: number, portion: PortionData): number {
  if (portion.amount <= 0) {
    throw new Error(
      `Invalid portion data: amount must be positive, got ${portion.amount} for "${portion.portionDescription}".`,
    );
  }
  return (amount / portion.amount) * portion.gramWeight;
}

/**
 * Resolves a descriptive size to grams using tiered matching against USDA portion data.
 *
 * Tier 1: Exact substring match on portionDescription or modifier.
 * Tier 2: "piece" falls back to the first natural-unit portion.
 * Tier 3: "small"/"medium"/"large" fall back to natural-unit portions sorted by weight.
 */
function resolveDescriptiveSize(
  amount: number,
  unit: string,
  context: FoodConversionContext,
): number {
  const portions = context.portions;
  if (!portions || portions.length === 0) {
    if (context.hasFilteredJunkPortions) {
      throw new Error(
        `Cannot convert descriptive unit "${unit}": portion data is available but descriptions are not usable. Try using grams (g) instead.`,
      );
    }
    throw new Error(
      `Cannot convert descriptive unit "${unit}": no portion data available for this food. Try using grams (g) instead.`,
    );
  }

  const unitLower = unit.toLowerCase();

  // Tier 1: Exact substring match (original behavior)
  const exactMatch = portions.find((p) => {
    const desc = p.portionDescription.toLowerCase();
    const mod = p.modifier?.toLowerCase() ?? '';
    return desc.includes(unitLower) || mod.includes(unitLower);
  });

  if (exactMatch) {
    return portionToGrams(amount, exactMatch);
  }

  const naturalUnits = findNaturalUnits(portions);

  // Tier 2: "piece" fallback to natural-unit portion
  if (unitLower === 'piece' && naturalUnits.length > 0) {
    return portionToGrams(amount, naturalUnits[0]);
  }

  // Tier 3: Size keyword fallback ("small", "medium", "large")
  if (SIZE_UNITS.has(unitLower) && naturalUnits.length > 0) {
    return portionToGrams(amount, selectBySize(unitLower, naturalUnits));
  }

  const available = portions.map((p) => p.portionDescription).join(', ');
  throw new Error(
    `Cannot convert descriptive unit "${unit}": no matching portion found. Available portions: ${available}. Try using grams (g) instead.`,
  );
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
