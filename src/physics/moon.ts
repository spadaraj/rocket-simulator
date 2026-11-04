// The Moon leg as a delta-v ledger: each burn from Earth orbit to the Moon's surface and
// back, paid for by the stage that does it. The push toward the Moon comes from the real
// free-return flight path (trajectory.ts); the other burns use Apollo's budgets.

import { G0_MS2 } from './constants';
import { solveFreeReturn } from './trajectory';
import { resolveCatalog } from './vehicle';
import type { Catalog, Fault, Payload, RocketSpec } from './types';

// Apollo-era budgets (NASA Apollo mission reports, rounded).
export const LOI_BUDGET_MS = 900;
export const DESCENT_BUDGET_MS = 2000;
export const ASCENT_BUDGET_MS = 1850;
export const TEI_BUDGET_MS = 1000;
/** Free-return flyby: small course corrections only (Apollo 13 / Artemis II style). */
export const FLYBY_BUDGET_MS = 50;

/** Apollo 13: a course correction back onto the free return, then a burn to get home sooner (38 + 262 m/s). */
export const LIFEBOAT_BUDGET_MS = 300;

export type LegId = 'tli' | 'loi' | 'descent' | 'ascent' | 'tei' | 'flyby' | 'lifeboat';

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
  /** The path flown: loop around the Moon and home, or stop in Moon orbit to land. */
  trip: 'flyby' | 'land';
  /** The service module broke on the way out (Apollo 13). */
  emergency?: boolean;
  /** Cargo with no crew: it lands and stays, so nothing comes home. */
  oneWay?: boolean;
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

/** Push needed to leave a parking orbit on a free return around the Moon. */
export const tliNeededMS = (parkingAltM: number) => Math.ceil(solveFreeReturn(parkingAltM).burnMS);

/** remainingDeltaVMS: what the top stage has left in Earth orbit (from the ascent). */
export function moonLedger(spec: RocketSpec, catalog: Catalog, remainingDeltaVMS: number, faults: Fault[] = []): MoonLedger {
  const parts = payloadParts(spec, catalog);
  const lander = parts.find((p) => p.lander);
  const service = parts.find((p) => p.propulsion);
  const capsule = parts.find((p) => p.heatShield);
  const shieldScale = spec.payload.heatShieldScale ?? 1;
  const otherKg = parts
    .filter((p) => p !== lander && p !== service)
    .reduce((a, p) => a + p.massKg + (p.heatShield ? p.heatShield.massKg * (shieldScale - 1) : 0), 0);
  const topStage = spec.stages[spec.stages.length - 1]?.name ?? 'Top stage';
  const legs: Leg[] = [];
  const add = (leg: Omit<Leg, 'ok'>) => {
    legs.push({ ...leg, ok: leg.availableMS >= leg.neededMS });
  };
  const done = (extra: Partial<MoonLedger> = {}): MoonLedger => {
    // Each leg depends on the ones before it.
    const short = legs.find((l) => !l.ok);
    return { legs, shortLeg: short?.id, success: !short, trip: 'land', ...extra };
  };

  const tliMS = tliNeededMS(spec.mission.targetOrbitAltitudeM);
  add({ id: 'tli', name: 'Trans-lunar injection', roscoe: 'Blast off toward the Moon', by: topStage, neededMS: tliMS, availableMS: remainingDeltaVMS });

  const lmKg = lander?.massKg ?? 0;
  const smKg = service?.massKg ?? 0;

  // Apollo 13: the service module breaks on the way. Its engine and air are gone, so the
  // landing is off. The free return still loops the crew around the Moon and home, but only
  // if a lander comes along as a lifeboat to make the steering burns.
  if (faults.some((f) => f.kind === 'serviceModule') && capsule) {
    const l = lander?.lander;
    add({
      id: 'lifeboat',
      name: 'Lifeboat burns',
      roscoe: 'The lander steers everyone home',
      by: lander && l && l.ascentPropellantKg > 0 ? `${lander.name} (lifeboat)` : 'No lifeboat',
      neededMS: LIFEBOAT_BUDGET_MS,
      availableMS: lander && l && l.ascentPropellantKg > 0 ? rocketDv(l.ispS, otherKg + smKg + lmKg, l.descentPropellantKg) : 0,
    });
    return done({ trip: 'flyby', emergency: true });
  }

  if (spec.mission.target === 'moonFlyby') {
    // Loop behind the Moon and fall straight back to Earth: gravity does the turning.
    const m = otherKg + smKg + lmKg;
    const prop = service?.propulsion?.propellantKg ?? 0;
    add({ id: 'flyby', name: 'Free-return flyby', roscoe: 'Swing around the Moon and head home', by: service?.name ?? 'Nothing', neededMS: FLYBY_BUDGET_MS, availableMS: rocketDv(service?.propulsion?.ispS ?? 0, m, prop) });
    return done({ trip: 'flyby' });
  }

  const l = lander?.lander;
  if (!service) {
    // No service module: the lander's descent stage brakes into Moon orbit itself, then
    // lands with everything riding on it. With no capsule, that is a one-way cargo trip.
    const m0 = otherKg + lmKg;
    const prop = l?.descentPropellantKg ?? 0;
    const isp = l?.ispS ?? 0;
    const by = lander && l ? `${lander.name} descent stage` : 'No lander';
    add({ id: 'loi', name: 'Lunar orbit insertion', roscoe: 'Slow down into Moon orbit', by, neededMS: LOI_BUDGET_MS, availableMS: rocketDv(isp, m0, prop) });
    const used = Math.min(prop, propFor(isp, m0, LOI_BUDGET_MS));
    add({ id: 'descent', name: 'Powered descent', roscoe: capsule ? 'Land on the Moon' : 'Land the cargo', by, neededMS: DESCENT_BUDGET_MS, availableMS: rocketDv(isp, m0 - used, prop - used) });
    if (capsule) {
      add({ id: 'ascent', name: 'Lunar ascent', roscoe: 'Lift off from the Moon', by: 'No ascent stage', neededMS: ASCENT_BUDGET_MS, availableMS: 0 });
      return done();
    }
    return done({ oneWay: true });
  }

  let smProp = service.propulsion?.propellantKg ?? 0;
  const smIsp = service.propulsion?.ispS ?? 0;
  const smDry = smKg - smProp;

  // Lunar orbit insertion: the service module brakes the whole spacecraft.
  const m0 = otherKg + smDry + smProp + lmKg;
  add({ id: 'loi', name: 'Lunar orbit insertion', roscoe: 'Slow down into Moon orbit', by: service.name, neededMS: LOI_BUDGET_MS, availableMS: rocketDv(smIsp, m0, smProp) });
  smProp = Math.max(0, smProp - propFor(smIsp, m0, LOI_BUDGET_MS));

  if (lander && l) {
    add({ id: 'descent', name: 'Powered descent', roscoe: 'Land on the Moon', by: `${lander.name} descent stage`, neededMS: DESCENT_BUDGET_MS, availableMS: rocketDv(l.ispS, lander.massKg, l.descentPropellantKg) });
    add({
      id: 'ascent',
      name: 'Lunar ascent',
      roscoe: 'Lift off from the Moon',
      by: l.ascentPropellantKg > 0 ? `${lander.name} ascent stage` : 'No ascent stage',
      neededMS: ASCENT_BUDGET_MS,
      availableMS: rocketDv(l.ispS, l.ascentDryKg + l.ascentPropellantKg, l.ascentPropellantKg),
    });
  } else {
    add({ id: 'descent', name: 'Powered descent', roscoe: 'Land on the Moon', by: 'No lander', neededMS: DESCENT_BUDGET_MS, availableMS: 0 });
  }

  // Trans-Earth injection: the lander stays behind; the service module brings the crew home.
  const m1 = otherKg + smDry + smProp;
  add({ id: 'tei', name: 'Trans-Earth injection', roscoe: 'Blast off for home', by: service.name, neededMS: TEI_BUDGET_MS, availableMS: rocketDv(smIsp, m1, smProp) });
  return done();
}
