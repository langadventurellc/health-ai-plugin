/** A USDA food portion with gram weight for unit conversion. */
export interface PortionData {
  portionDescription: string;
  modifier?: string;
  gramWeight: number;
  amount: number;
}

/** Density and portion data for a specific food, used by convertToGrams. */
export interface FoodConversionContext {
  densityGPerMl?: number;
  portions?: PortionData[];
}
