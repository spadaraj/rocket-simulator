// The Moon leg as a delta-v ledger: each burn from Earth orbit to the Moon's surface and
// back, paid for by the stage that does it. Not a trajectory (that is Phase 4).

import { G0_MS2 } from './constants';
import { TLI_BUDGET_MS } from './deltaV';
import { resolveCatalog } from './vehicle';
import type { Catalog, Payload, RocketSpec } from './types';

// Apollo-era budgets (NASA Apollo mission reports, rounded).
export const LOI_BUDGET_MS = 900;
export const DESCENT_BUDGET_MS = 2000;
export const ASCENT_BUDGET_MS = 1850;
export const TEI_BUDGET_MS = 1000;

export type LegId = 'tli' | 'loi' | 'descent' | 'ascent' | 'tei';

export interface Leg {
  id: LegId;
  name: string;
  roscoe: string;
  /** Who does the burn. */
  by: string;
  neededMS: number;
  /** What that stage could give at that point. */
  availableMS: number;
  ok: boolean;
}

export interface MoonLedger {
  legs: Leg[];
  /** First leg that came up short, if any. */
  shortLeg?: LegId;
  success: boolean;
}

function payloadParts(spec: RocketSpec, catalog: Catalog): Payload[] {
  const cat = resolveCatalog(spec, catalog);
  return spec.payload.parts
    .map((r) => cat[r.part])
    .filter((p): p is Payload => p?.type === 'payload' && p.jettisonAfterFirstStagingS === undefined);
}

const rocketDv = (ispS: number, m0: number, propKg: number) =>
  propKg > 0 && m0 > propKg ? ispS * G0_MS2 * Math.log(m0 / (m0 - propKg)) : 0;
const propFor = (ispS: number, m0: number, dvMS: number) => m0 * (1 - Math.exp(-dvMS / (ispS * G0_MS2)));

/** remainingDeltaVMS: what the top stage has left in Earth orbit (from the ascent). */
export function moonLedger(spec: RocketSpec, catalog: Catalog, remainingDeltaVMS: number): MoonLedger {
  const parts = payloadParts(spec, catalog);
  const lander = parts.find((p) => p.lander);
  const service = parts.find((p) => p.propulsion);
  const shieldScale = spec.payload.heatShieldScale ?? 1;
  const otherKg = parts
    .filter((p) => p !== lander && p !== service)
    .reduce((a, p) => a + p.massKg + (p.heatShield ? p.heatShield.massKg * (shieldScale - 1) : 0), 0);
  const topStage = spec.stages[spec.stages.length - 1]?.name ?? 'Top stage';
  const legs: Leg[] = [];
  const add = (leg: Omit<Leg, 'ok'>) => {
    legs.push({ ...leg, ok: leg.availableMS >= leg.neededMS });
  };

  add({ id: 'tli', name: 'Trans-lunar injection', roscoe: 'Blast off toward the Moon', by: topStage, neededMS: TLI_BUDGET_MS, availableMS: remainingDeltaVMS });

  const lmKg = lander?.massKg ?? 0;
  let smProp = service?.propulsion?.propellantKg ?? 0;
  const smIsp = service?.propulsion?.ispS ?? 0;
  const smKg = service?.massKg ?? 0;
  const smDry = smKg - smProp;

  // Lunar orbit insertion: the service module brakes the whole spacecraft.
  const m0 = otherKg + smDry + smProp + lmKg;
  add({ id: 'loi', name: 'Lunar orbit insertion', roscoe: 'Slow down into Moon orbit', by: service?.name ?? 'Nothing', neededMS: LOI_BUDGET_MS, availableMS: rocketDv(smIsp, m0, smProp) });
  smProp = Math.max(0, smProp - propFor(smIsp, m0, LOI_BUDGET_MS));

  if (lander?.lander) {
    const l = lander.lander;
    add({ id: 'descent', name: 'Powered descent', roscoe: 'Land on the Moon', by: `${lander.name} descent stage`, neededMS: DESCENT_BUDGET_MS, availableMS: rocketDv(l.ispS, lander.massKg, l.descentPropellantKg) });
    add({ id: 'ascent', name: 'Lunar ascent', roscoe: 'Lift off from the Moon', by: `${lander.name} ascent stage`, neededMS: ASCENT_BUDGET_MS, availableMS: rocketDv(l.ispS, l.ascentDryKg + l.ascentPropellantKg, l.ascentPropellantKg) });
  } else {
    add({ id: 'descent', name: 'Powered descent', roscoe: 'Land on the Moon', by: 'No lander', neededMS: DESCENT_BUDGET_MS, availableMS: 0 });
  }

  // Trans-Earth injection: the lander stays behind; the service module brings the crew home.
  const m1 = otherKg + smDry + smProp;
  add({ id: 'tei', name: 'Trans-Earth injection', roscoe: 'Blast off for home', by: service?.name ?? 'Nothing', neededMS: TEI_BUDGET_MS, availableMS: rocketDv(smIsp, m1, smProp) });

  // Each leg depends on the ones before it.
  const short = legs.find((l) => !l.ok);
  return { legs, shortLeg: short?.id, success: !short };
}
