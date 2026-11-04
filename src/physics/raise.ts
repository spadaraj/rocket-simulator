// Climbing to a high orbit after reaching the parking orbit: two burns, a Hohmann transfer.
// The first burn stretches the orbit so its top reaches the target height; the second, at the
// top, rounds it out. Both come from what the top stage has left.

import { MU_EARTH_M3S2, R_EARTH_M } from './constants';
import type { MissionSpec } from './types';

/** Geostationary orbit: one lap per day, so it hangs over the same spot. */
export const GEO_ALTITUDE_M = 35786e3;

export const goesToMoon = (t: MissionSpec['target']) => t === 'moon' || t === 'moonFlyby';

/** Delta-v for the two burns of a Hohmann transfer between circular orbits at these heights. */
export function hohmann(fromAltM: number, toAltM: number): { dv1: number; dv2: number } {
  const r1 = R_EARTH_M + fromAltM;
  const r2 = R_EARTH_M + toAltM;
  const a = (r1 + r2) / 2;
  const v1 = Math.sqrt(MU_EARTH_M3S2 / r1);
  const v2 = Math.sqrt(MU_EARTH_M3S2 / r2);
  const vPeri = Math.sqrt(MU_EARTH_M3S2 * (2 / r1 - 1 / a));
  const vApo = Math.sqrt(MU_EARTH_M3S2 * (2 / r2 - 1 / a));
  return { dv1: Math.abs(vPeri - v1), dv2: Math.abs(v2 - vApo) };
}

export interface RaiseLeg {
  id: 'transfer' | 'circularize';
  name: string;
  roscoe: string;
  neededMS: number;
  availableMS: number;
  ok: boolean;
}

export interface RaiseLedger {
  fromAltM: number;
  targetAltM: number;
  legs: RaiseLeg[];
  success: boolean;
  /** Hours from the first burn to the second (half the transfer orbit). */
  transferHours: number;
}

export function orbitRaise(fromAltM: number, targetAltM: number, remainingDeltaVMS: number): RaiseLedger {
  const { dv1, dv2 } = hohmann(fromAltM, targetAltM);
  const left2 = Math.max(0, remainingDeltaVMS - dv1);
  const legs: RaiseLeg[] = [
    { id: 'transfer', name: 'Transfer burn', roscoe: 'Push out toward the high orbit', neededMS: dv1, availableMS: remainingDeltaVMS, ok: remainingDeltaVMS >= dv1 },
    { id: 'circularize', name: 'Circularize at the top', roscoe: 'Push again to stay up high', neededMS: dv2, availableMS: left2, ok: remainingDeltaVMS >= dv1 && left2 >= dv2 },
  ];
  const a = R_EARTH_M + (fromAltM + targetAltM) / 2;
  const transferHours = (Math.PI * Math.sqrt(a ** 3 / MU_EARTH_M3S2)) / 3600;
  return { fromAltM, targetAltM, legs, success: legs.every((l) => l.ok), transferHours };
}
