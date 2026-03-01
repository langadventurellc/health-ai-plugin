import { describe, it, expect } from 'vitest';
import {
  weightToGrams,
  volumeToMl,
  convertToGrams,
  isWeightUnit,
  isVolumeUnit,
  isDescriptiveUnit,
} from '../units.js';

describe('isWeightUnit', () => {
  it('returns true for weight units', () => {
    expect(isWeightUnit('g')).toBe(true);
    expect(isWeightUnit('kg')).toBe(true);
    expect(isWeightUnit('oz')).toBe(true);
    expect(isWeightUnit('lb')).toBe(true);
  });

  it('returns false for non-weight units', () => {
    expect(isWeightUnit('cup')).toBe(false);
    expect(isWeightUnit('medium')).toBe(false);
  });
});

describe('isVolumeUnit', () => {
  it('returns true for volume units', () => {
    expect(isVolumeUnit('cup')).toBe(true);
    expect(isVolumeUnit('tbsp')).toBe(true);
    expect(isVolumeUnit('tsp')).toBe(true);
    expect(isVolumeUnit('fl_oz')).toBe(true);
    expect(isVolumeUnit('mL')).toBe(true);
    expect(isVolumeUnit('L')).toBe(true);
  });

  it('returns false for non-volume units', () => {
    expect(isVolumeUnit('g')).toBe(false);
    expect(isVolumeUnit('medium')).toBe(false);
  });
});

describe('isDescriptiveUnit', () => {
  it('returns true for descriptive units', () => {
    expect(isDescriptiveUnit('piece')).toBe(true);
    expect(isDescriptiveUnit('slice')).toBe(true);
    expect(isDescriptiveUnit('small')).toBe(true);
    expect(isDescriptiveUnit('medium')).toBe(true);
    expect(isDescriptiveUnit('large')).toBe(true);
  });

  it('returns false for non-descriptive units', () => {
    expect(isDescriptiveUnit('g')).toBe(false);
    expect(isDescriptiveUnit('cup')).toBe(false);
  });
});

describe('weightToGrams', () => {
  it('converts grams (identity)', () => {
    expect(weightToGrams(150, 'g')).toBe(150);
  });

  it('converts kilograms', () => {
    expect(weightToGrams(1, 'kg')).toBe(1000);
    expect(weightToGrams(0.5, 'kg')).toBe(500);
  });

  it('converts ounces', () => {
    expect(weightToGrams(1, 'oz')).toBeCloseTo(28.3495, 3);
    expect(weightToGrams(4, 'oz')).toBeCloseTo(113.398, 3);
  });

  it('converts pounds', () => {
    expect(weightToGrams(1, 'lb')).toBeCloseTo(453.592, 3);
    expect(weightToGrams(0.5, 'lb')).toBeCloseTo(226.796, 3);
  });

  it('throws for unsupported units', () => {
    expect(() => weightToGrams(1, 'cup')).toThrow(
      'Unsupported weight unit: cup',
    );
  });
});

describe('volumeToMl', () => {
  it('converts milliliters (identity)', () => {
    expect(volumeToMl(100, 'mL')).toBe(100);
  });

  it('converts liters', () => {
    expect(volumeToMl(1, 'L')).toBe(1000);
    expect(volumeToMl(0.5, 'L')).toBe(500);
  });

  it('converts cups', () => {
    expect(volumeToMl(1, 'cup')).toBeCloseTo(236.588, 2);
  });

  it('converts tablespoons', () => {
    expect(volumeToMl(1, 'tbsp')).toBeCloseTo(14.787, 2);
  });

  it('converts teaspoons', () => {
    expect(volumeToMl(1, 'tsp')).toBeCloseTo(4.929, 2);
  });

  it('converts fluid ounces', () => {
    expect(volumeToMl(1, 'fl_oz')).toBeCloseTo(29.574, 2);
  });

  it('throws for unsupported units', () => {
    expect(() => volumeToMl(1, 'g')).toThrow('Unsupported volume unit: g');
  });
});

describe('convertToGrams', () => {
  it('converts weight units directly', () => {
    expect(convertToGrams(100, 'g')).toBe(100);
    expect(convertToGrams(1, 'kg')).toBe(1000);
  });

  it('converts volume to weight using density', () => {
    // 1 cup = 236.588 mL * 1.03 g/mL = 243.686g
    const result = convertToGrams(1, 'cup', { densityGPerMl: 1.03 });
    expect(result).toBeCloseTo(243.7, 0);
  });

  it('throws when volume unit is used without density', () => {
    expect(() => convertToGrams(1, 'cup', {})).toThrow('density data');
    expect(() => convertToGrams(1, 'cup')).toThrow('density data');
  });

  it('resolves descriptive size from portion data', () => {
    const context = {
      portions: [
        {
          portionDescription: '1 medium (7" to 7-7/8" long)',
          modifier: 'medium',
          gramWeight: 118,
          amount: 1,
        },
      ],
    };
    expect(convertToGrams(1, 'medium', context)).toBe(118);
  });

  it('scales descriptive size by amount', () => {
    const context = {
      portions: [
        {
          portionDescription: '1 slice',
          gramWeight: 30,
          amount: 1,
        },
      ],
    };
    expect(convertToGrams(2, 'slice', context)).toBe(60);
  });

  it('throws when descriptive unit has no matching portion', () => {
    const context = {
      portions: [
        {
          portionDescription: '1 cup',
          gramWeight: 244,
          amount: 1,
        },
      ],
    };
    expect(() => convertToGrams(1, 'medium', context)).toThrow(
      'no matching portion found',
    );
  });

  it('throws when descriptive unit has no portion data at all', () => {
    expect(() => convertToGrams(1, 'medium', {})).toThrow(
      'no portion data available',
    );
    expect(() => convertToGrams(1, 'medium')).toThrow(
      'no portion data available',
    );
  });

  it('throws when portion amount is zero (guards against Infinity)', () => {
    const context = {
      portions: [
        {
          portionDescription: '1 slice',
          gramWeight: 30,
          amount: 0,
        },
      ],
    };
    expect(() => convertToGrams(1, 'slice', context)).toThrow(
      'Invalid portion data: amount must be positive',
    );
  });

  it('produces distinct error when portions existed but all were junk', () => {
    const context = {
      hasFilteredJunkPortions: true,
    };
    expect(() => convertToGrams(1, 'piece', context)).toThrow(
      'portion data is available but descriptions are not usable',
    );
    expect(() => convertToGrams(1, 'piece', context)).toThrow(
      'Try using grams (g) instead.',
    );
  });

  it('throws for completely unsupported unit', () => {
    expect(() => convertToGrams(1, 'bushel')).toThrow(
      'Unsupported unit: "bushel"',
    );
  });

  describe('Tier 2: "piece" fallback to natural-unit portion', () => {
    it('resolves "piece" to a natural-unit portion like "1 banana"', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 banana',
            gramWeight: 118,
            amount: 1,
          },
        ],
      };
      expect(convertToGrams(1, 'piece', context)).toBe(118);
    });

    it('scales "piece" by amount', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 egg',
            gramWeight: 50,
            amount: 1,
          },
        ],
      };
      expect(convertToGrams(3, 'piece', context)).toBe(150);
    });

    it('does NOT match volume portions like "1 cup"', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 cup',
            gramWeight: 244,
            amount: 1,
          },
        ],
      };
      expect(() => convertToGrams(1, 'piece', context)).toThrow(
        'no matching portion found',
      );
    });

    it('does NOT match portions with measurement keywords', () => {
      const context = {
        portions: [
          { portionDescription: '1 tbsp', gramWeight: 15, amount: 1 },
          { portionDescription: '1 oz', gramWeight: 28, amount: 1 },
        ],
      };
      expect(() => convertToGrams(1, 'piece', context)).toThrow(
        'no matching portion found',
      );
    });

    it('prefers Tier 1 exact match over Tier 2 fallback', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 piece',
            gramWeight: 50,
            amount: 1,
          },
          {
            portionDescription: '1 cookie',
            gramWeight: 30,
            amount: 1,
          },
        ],
      };
      // Should match "1 piece" via Tier 1, not "1 cookie" via Tier 2
      expect(convertToGrams(1, 'piece', context)).toBe(50);
    });
  });

  describe('Tier 3: size keyword fallback', () => {
    it('resolves "medium" to the only natural-unit portion', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 banana',
            gramWeight: 118,
            amount: 1,
          },
        ],
      };
      expect(convertToGrams(1, 'medium', context)).toBe(118);
    });

    it('resolves "small" to the only natural-unit portion', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 apple',
            gramWeight: 182,
            amount: 1,
          },
        ],
      };
      expect(convertToGrams(1, 'small', context)).toBe(182);
    });

    it('resolves "large" to the only natural-unit portion', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 apple',
            gramWeight: 182,
            amount: 1,
          },
        ],
      };
      expect(convertToGrams(1, 'large', context)).toBe(182);
    });

    it('maps small/medium/large to lightest/middle/heaviest with multiple natural units', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 apple (large)',
            gramWeight: 223,
            amount: 1,
            modifier: 'large',
          },
          {
            portionDescription: '1 apple (small)',
            gramWeight: 149,
            amount: 1,
            modifier: 'small',
          },
          {
            portionDescription: '1 apple (medium)',
            gramWeight: 182,
            amount: 1,
            modifier: 'medium',
          },
          {
            portionDescription: '1 cup, sliced',
            gramWeight: 109,
            amount: 1,
          },
        ],
      };
      // Tier 1 matches via modifier, so this tests Tier 1 still works
      expect(convertToGrams(1, 'small', context)).toBe(149);
      expect(convertToGrams(1, 'medium', context)).toBe(182);
      expect(convertToGrams(1, 'large', context)).toBe(223);
    });

    it('maps small/medium/large to sorted natural units when no modifier exists', () => {
      // Descriptions that don't contain size keywords, so Tier 1 won't match
      const context = {
        portions: [
          {
            portionDescription: '1 type-A egg',
            gramWeight: 50,
            amount: 1,
          },
          {
            portionDescription: '1 type-B egg',
            gramWeight: 63,
            amount: 1,
          },
          {
            portionDescription: '1 type-C egg',
            gramWeight: 38,
            amount: 1,
          },
        ],
      };
      // Sorted by weight: 38, 50, 63
      expect(convertToGrams(1, 'small', context)).toBe(38);
      expect(convertToGrams(1, 'medium', context)).toBe(50);
      expect(convertToGrams(1, 'large', context)).toBe(63);
    });

    it('ignores volume/weight portions when selecting natural units', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 cup',
            gramWeight: 244,
            amount: 1,
          },
          {
            portionDescription: '1 banana',
            gramWeight: 118,
            amount: 1,
          },
        ],
      };
      // Only "1 banana" is a natural unit; cup is excluded
      expect(convertToGrams(1, 'medium', context)).toBe(118);
    });
  });

  describe('error messages include grams fallback hint', () => {
    it('includes hint when no portion data exists', () => {
      expect(() => convertToGrams(1, 'piece', {})).toThrow(
        'Try using grams (g) instead.',
      );
    });

    it('includes hint when no matching portion found', () => {
      const context = {
        portions: [
          {
            portionDescription: '1 cup',
            gramWeight: 244,
            amount: 1,
          },
        ],
      };
      expect(() => convertToGrams(1, 'piece', context)).toThrow(
        'Try using grams (g) instead.',
      );
    });
  });
});
