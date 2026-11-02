// Free-design rules: estimated parts from engineering rules of thumb.

import type { LiquidEngine, Propellant, RocketSpec, Tank } from './types';

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

// ---------- Free-design engines and plausibility checks ----------

/**
 * Vacuum Isp limits by propellant. "best" is the best engine ever flown on it;
 * "limit" is roughly what the chemistry can give with a very large nozzle.
 */
export const ISP_LIMITS: Record<LiquidPropellant, { best: number; bestEngine: string; limit: number }> = {
  'CH4/LOX': { best: 380, bestEngine: 'Raptor Vacuum', limit: 400 },
  'RP-1/LOX': { best: 359, bestEngine: 'RD-0124', limit: 375 },
  'LH2/LOX': { best: 465.5, bestEngine: 'RL10B-2', limit: 490 },
};
/** Sea-level thrust-to-weight: Merlin 1D is near the top (about 180). */
const BEST_ENGINE_TWR = 200;
const SCI_FI_ENGINE_TWR = 300;
const P0_PA = 101325;

export type WarningLevel = 'info' | 'warn' | 'impossible';

export interface DesignWarning {
  level: WarningLevel;
  message: string;
  /** Short and simple, for Roscoe mode. */
  roscoe: string;
}

export function engineWarnings(e: LiquidEngine): DesignWarning[] {
  const out: DesignWarning[] = [];
  const lim = ISP_LIMITS[e.propellant];
  if (e.thrustVacuumN < e.thrustSeaLevelN || e.ispVacuumS < e.ispSeaLevelS)
    out.push({ level: 'impossible', message: 'Sea-level thrust and Isp must be lower than in vacuum: thick air always pushes back on the nozzle.', roscoe: 'Engines always push a bit less in thick air!' });
  if (e.ispVacuumS > lim.limit)
    out.push({ level: 'impossible', message: `Vacuum Isp ${e.ispVacuumS} s is beyond what ${e.propellant} can give (about ${lim.limit} s, even with a huge nozzle).`, roscoe: 'No engine can save fuel that well with this fuel. That is science fiction!' });
  else if (e.ispVacuumS > lim.best)
    out.push({ level: 'warn', message: `Vacuum Isp ${e.ispVacuumS} s beats the best ${e.propellant} engine ever flown (${lim.bestEngine}, ${lim.best} s).`, roscoe: 'Better than any real engine so far. Maybe one day!' });
  const twr = e.thrustSeaLevelN / (e.massKg * 9.80665);
  if (!e.vacuumOnly && twr > SCI_FI_ENGINE_TWR)
    out.push({ level: 'impossible', message: `Thrust-to-weight ${twr.toFixed(0)}: far lighter than any engine for its push (the best are about 180).`, roscoe: 'Way too light for how hard it pushes!' });
  else if (!e.vacuumOnly && twr > BEST_ENGINE_TWR)
    out.push({ level: 'warn', message: `Thrust-to-weight ${twr.toFixed(0)} beats the best real engines (Merlin 1D is about 180).`, roscoe: 'Lighter than any real engine this strong.' });
  else if (twr < 20 && !e.vacuumOnly)
    out.push({ level: 'info', message: `Thrust-to-weight ${twr.toFixed(0)} is heavy for a booster engine (most are 60–180).`, roscoe: 'A heavy engine for how hard it pushes.' });
  if (e.diameterM) {
    const exitArea = Math.max(0, (e.thrustVacuumN - e.thrustSeaLevelN) / P0_PA);
    const bellArea = (Math.PI * e.diameterM * e.diameterM) / 4;
    // Real sea-level figures include flow separation (J-2), so allow some slack.
    if (exitArea > bellArea * 2)
      out.push({ level: 'warn', message: `The sea-level vs vacuum thrust gap needs a ${(2 * Math.sqrt(exitArea / Math.PI)).toFixed(1)} m nozzle, wider than the ${e.diameterM} m engine.`, roscoe: 'Its nozzle would have to be bigger than the engine!' });
  }
  if (e.throttleMin < 0.2)
    out.push({ level: 'info', message: `Throttling down to ${Math.round(e.throttleMin * 100)}% is deeper than most engines manage (Raptor and Merlin: about 40%).`, roscoe: 'It can turn down really low.' });
  if ((e.gimbalDeg ?? 5) > 15)
    out.push({ level: 'warn', message: `${e.gimbalDeg}° of gimbal is more than any big engine swivels (Raptor: about 15°).`, roscoe: 'It swivels more than real engines can.' });
  return out;
}

export const worstLevel = (ws: DesignWarning[]): WarningLevel | undefined =>
  ws.some((w) => w.level === 'impossible') ? 'impossible' : ws.some((w) => w.level === 'warn') ? 'warn' : ws.length ? 'info' : undefined;

/** Warnings for every free-design engine on the rocket. */
export function rocketWarnings(spec: RocketSpec): { part: string; warnings: DesignWarning[] }[] {
  return (spec.customParts ?? [])
    .filter((p): p is LiquidEngine => p.type === 'liquidEngine')
    .map((e) => ({ part: e.name, warnings: engineWarnings(e) }))
    .filter((x) => x.warnings.length);
}
