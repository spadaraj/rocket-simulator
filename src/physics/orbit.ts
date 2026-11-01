import { MU_EARTH_M3S2, R_EARTH_M } from './constants';

export interface OrbitElements {
  semiMajorAxisM: number;
  eccentricity: number;
  /** Lowest point above the surface. Negative means the path hits the ground. */
  perigeeAltM: number;
  /** Highest point above the surface. Infinity for escape trajectories. */
  apogeeAltM: number;
  specificEnergyJKg: number;
}

/** Two-body orbit shape from a 2D inertial position and velocity. */
export function orbitElements(xM: number, yM: number, vxMS: number, vyMS: number): OrbitElements {
  const r = Math.hypot(xM, yM);
  const v2 = vxMS * vxMS + vyMS * vyMS;
  const energy = v2 / 2 - MU_EARTH_M3S2 / r;
  const h = xM * vyMS - yM * vxMS;
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (MU_EARTH_M3S2 * MU_EARTH_M3S2)));
  const perigeeR = (h * h) / (MU_EARTH_M3S2 * (1 + e));
  if (energy >= 0) {
    return {
      semiMajorAxisM: Infinity,
      eccentricity: e,
      perigeeAltM: perigeeR - R_EARTH_M,
      apogeeAltM: Infinity,
      specificEnergyJKg: energy,
    };
  }
  const a = -MU_EARTH_M3S2 / (2 * energy);
  return {
    semiMajorAxisM: a,
    eccentricity: e,
    perigeeAltM: a * (1 - e) - R_EARTH_M,
    apogeeAltM: a * (1 + e) - R_EARTH_M,
    specificEnergyJKg: energy,
  };
}

export function circularSpeedMS(altitudeM: number): number {
  return Math.sqrt(MU_EARTH_M3S2 / (R_EARTH_M + altitudeM));
}
