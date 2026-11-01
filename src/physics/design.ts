// Free-design rules: estimated parts from engineering rules of thumb.

import type { Propellant, Tank } from './types';

type LiquidPropellant = Exclude<Propellant, 'solid'>;

/** Bulk density of the propellant mix at its usual oxidiser-to-fuel ratio. */
export const BULK_DENSITY_KGM3: Record<LiquidPropellant, number> = {
  'CH4/LOX': 832.6, // O/F 3.6: CH4 422, LOX 1141 kg/m^3
  'RP-1/LOX': 1023.5, // O/F 2.56: RP-1 810
  'LH2/LOX': 361.9, // O/F 6.0: LH2 71
};

/** Dry tank-and-structure mass as a fraction of propellant (hydrogen tanks are bulky). */
export const DRY_FRACTION: Record<LiquidPropellant, number> = {
  'CH4/LOX': 0.045,
  'RP-1/LOX': 0.045,
  'LH2/LOX': 0.09,
};

/** Share of the cylinder volume that holds propellant (domes, ullage, intertank). */
export const USABLE_VOLUME_FRACTION = 0.9;

export function tankCapacityKg(diameterM: number, lengthM: number, propellant: LiquidPropellant): number {
  const volume = (Math.PI * diameterM * diameterM * lengthM) / 4;
  return volume * USABLE_VOLUME_FRACTION * BULK_DENSITY_KGM3[propellant];
}

export function designTank(
  id: string,
  diameterM: number,
  lengthM: number,
  propellant: LiquidPropellant,
  maxDynamicPressurePa = 55000,
): Tank {
  const capacity = tankCapacityKg(diameterM, lengthM, propellant);
  return {
    id,
    type: 'tank',
    name: `Custom ${propellant} tank (${diameterM.toFixed(1)} m × ${lengthM.toFixed(1)} m)`,
    propellant,
    massKg: Math.round(capacity * DRY_FRACTION[propellant]),
    propellantCapacityKg: Math.round(capacity),
    diameterM,
    lengthM,
    maxDynamicPressurePa,
    source: `Free-design rule: volume × ${propellant} bulk density × ${USABLE_VOLUME_FRACTION * 100}% usable; dry mass ${DRY_FRACTION[propellant] * 100}% of propellant.`,
    confidence: 'estimate',
  };
}
