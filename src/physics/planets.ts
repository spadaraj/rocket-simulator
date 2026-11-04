// A trip to another planet as a delta-v ledger, like the Moon leg. The top stage throws the
// probe out of Earth orbit; the probe (and a braking stage, if it has one) pays for braking
// at the far end; landers bring their own heat shield, parachute and rockets.
//
// Chemical trips follow a real transfer orbit that joins Earth on launch day to the target on
// arrival day (Lambert's problem), so launching outside the window costs more. Ion probes
// instead spiral out slowly, paying the difference in orbit speeds.

import { G0_MS2 } from './constants';
import {
  BODIES,
  DAY_S,
  bestTransfer,
  captureDvMS,
  departureDvMS,
  hohmannSun,
  lowOrbitSpeedMS,
  nPerDay,
  rM,
  vCircSun,
  wrapOffsetDays,
  AU_M,
  MU_SUN_M3S2,
  type BodyId,
  type Vec,
} from './solar';
import { resolveCatalog } from './vehicle';
import type { Arrival, Catalog, Destination, Payload, RocketSpec } from './types';

/** After the heat shield and parachute, about 100 m/s is left on Mars, plus hovering and steering. */
export const MARS_TOUCHDOWN_MS = 350;
/** With no parachute the rockets have to do the parachute's job too. */
export const NO_CHUTE_TOUCHDOWN_MS = 1000;
/** Venus: send pictures and data for an hour. */
export const VENUS_GOAL_MIN = 60;
/** "Through the belt" means out past its far edge. */
export const BELT_CROSS_AU = 3.2;

export interface DestinationInfo {
  name: string;
  emoji: string;
  /** Where the trip goes, in order. Empty for the belt (a ring, not a point). */
  stops: BodyId[];
  arrivals: Arrival[];
}

export const DESTINATIONS: Record<Destination, DestinationInfo> = {
  venus: { name: 'Venus', emoji: '🟡', stops: ['venus'], arrivals: ['flyby', 'orbit', 'land'] },
  mars: { name: 'Mars', emoji: '🔴', stops: ['mars'], arrivals: ['flyby', 'orbit', 'land'] },
  mercury: { name: 'Mercury', emoji: '☿️', stops: ['mercury'], arrivals: ['flyby', 'orbit'] },
  belt: { name: 'the asteroid belt', emoji: '🪨', stops: [], arrivals: ['flyby'] },
  vesta: { name: 'Vesta', emoji: '🪨', stops: ['vesta'], arrivals: ['flyby', 'orbit'] },
  ceres: { name: 'Ceres', emoji: '⚪', stops: ['ceres'], arrivals: ['flyby', 'orbit'] },
  vestaCeres: { name: 'Vesta, then Ceres', emoji: '🪨', stops: ['vesta', 'ceres'], arrivals: ['orbit'] },
  rock: { name: 'Space rock Q-7', emoji: '🪨', stops: ['rock'], arrivals: ['flyby', 'orbit', 'sample'] },
};

export type PlanetLegId = 'depart' | 'cruise' | 'capture' | 'hop' | 'entry' | 'touchdown' | 'survive' | 'home' | 'capsule';

export interface PlanetLeg {
  id: PlanetLegId;
  name: string;
  roscoe: string;
  /** Who does it. */
  by: string;
  /** m/s for burns, minutes for surviving, 1/0 for yes-or-no checks. */
  neededMS: number;
  availableMS: number;
  unit: 'm/s' | 'min' | 'check';
  ok: boolean;
}

/** One piece of the path drawn on the map. */
export interface Segment {
  kind: 'conic' | 'spiral' | 'wait';
  from: BodyId;
  /** Where it ends: a body, or a distance from the Sun for the belt. */
  to: BodyId | 'belt';
  startDay: number;
  days: number;
  /** Conic: start position and velocity around the Sun. */
  r1?: Vec;
  v1?: Vec;
  /** Spiral: start and end distance from the Sun, and start angle. */
  fromAU?: number;
  toAU?: number;
  fromAngle?: number;
}

export interface PlanetLedger {
  destination: Destination;
  arrival: Arrival;
  legs: PlanetLeg[];
  shortLeg?: PlanetLegId;
  success: boolean;
  segments: Segment[];
  /** Each body's angle around the Sun on launch day, so the map lines up with the path. */
  angles: Partial<Record<BodyId, number>>;
  totalDays: number;
  /** An ion probe did the cruising. */
  ion: boolean;
  /** Launch day, after the best day in the window (wrapped to the nearest window). */
  offsetDays: number;
  /** What leaving Earth would cost on the best day. */
  windowDepartMS: number;
  /** Venus: how long the lander kept working. */
  surfaceMinutes?: number;
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

interface Engine {
  name: string;
  ispS: number;
  propKg: number;
  /** Dry mass dropped when this engine runs dry (a braking stage). */
  dropKg: number;
}

/** The spacecraft's engines, fired in order; braking stages drop off once empty. */
class Burner {
  constructor(
    public massKg: number,
    public engines: Engine[],
  ) {}
  /** How much push is left in total, without using any. */
  capacity() {
    const copy = new Burner(this.massKg, this.engines.map((e) => ({ ...e })));
    return copy.burn(Infinity);
  }
  /** Burn up to dv; returns what was achieved. */
  burn(dv: number) {
    let left = dv;
    let got = 0;
    for (const e of this.engines) {
      if (left <= 0) break;
      if (e.propKg <= 0) continue;
      const can = rocketDv(e.ispS, this.massKg, e.propKg);
      if (can >= left) {
        const used = propFor(e.ispS, this.massKg, left);
        e.propKg -= used;
        this.massKg -= used;
        got += left;
        left = 0;
      } else {
        this.massKg -= e.propKg + e.dropKg;
        e.propKg = 0;
        got += can;
        left -= can;
      }
    }
    return got;
  }
  get names() {
    return this.engines.filter((e) => e.propKg > 0).map((e) => e.name);
  }
}

/** Where a spiral from r1 to r2 ends up (angle swept), for drawing and lining up the target. */
export function spiralSweep(fromAU: number, toAU: number, days: number, steps = 400) {
  let theta = 0;
  const dt = (days * DAY_S) / steps;
  for (let i = 0; i < steps; i++) {
    const r = (fromAU + ((toAU - fromAU) * (i + 0.5)) / steps) * AU_M;
    theta += Math.sqrt(MU_SUN_M3S2 / r ** 3) * dt;
  }
  return theta;
}

/** Wait at a body until Earth comes round to meet the path home. */
function waitForEarth(bodyAngleAtArrival: number, body: BodyId, earthAngleAtArrival: number, sweep: number, tripDays: number) {
  const nB = nPerDay(body);
  const nE = nPerDay('earth');
  // Need: bodyAngle + nB w + sweep = earthAngle + nE (w + tripDays)  (mod 2π)
  const gap = bodyAngleAtArrival + sweep - earthAngleAtArrival - nE * tripDays;
  const cycle = (2 * Math.PI) / Math.abs(nE - nB);
  let w = (gap / (nE - nB)) % cycle;
  if (w < 0) w += cycle;
  return w;
}

const mod2pi = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** The far side of the trip. remainingDeltaVMS: what the top stage has left in Earth orbit. */
export function planetLedger(spec: RocketSpec, catalog: Catalog, remainingDeltaVMS: number): PlanetLedger {
  const destination = spec.mission.destination ?? 'mars';
  const info = DESTINATIONS[destination];
  const arrival: Arrival = info.arrivals.includes(spec.mission.arrival ?? 'flyby') ? spec.mission.arrival ?? 'flyby' : info.arrivals[0];
  const parkingM = spec.mission.targetOrbitAltitudeM;
  const parts = payloadParts(spec, catalog);
  const totalKg = parts.reduce((a, p) => a + p.massKg, 0);
  const ionPart = parts.find((p) => p.ion);
  const kick = parts.find((p) => p.brakingStage && p.propulsion);
  const craft = parts.find((p) => p.propulsion && !p.brakingStage && !p.lander);
  const topStage = spec.stages[spec.stages.length - 1]?.name ?? 'Top stage';
  const first = info.stops[0];
  const there = first ? BODIES[first].name : 'the belt';

  const legs: PlanetLeg[] = [];
  const add = (leg: Omit<PlanetLeg, 'ok'>) => legs.push({ ...leg, ok: leg.availableMS >= leg.neededMS - 1e-6 });
  const segments: Segment[] = [];
  const angles: Partial<Record<BodyId, number>> = { mercury: 2.1, venus: 4.0, earth: 0, mars: 1.2, vesta: 3.3, ceres: 5.0, rock: 2.6, jupiter: 0.7, saturn: 3.6, uranus: 5.4, neptune: 1.9 };
  const offsetDays = first ? wrapOffsetDays(first, spec.mission.launchOffsetDays ?? 0) : 0;
  let windowDepartMS = 0;
  let surfaceMinutes: number | undefined;
  let day = 0;

  const useIon = !!ionPart && arrival !== 'land';
  const ionBurner = ionPart?.ion ? new Burner(totalKg, [{ name: ionPart.name, ispS: ionPart.ion.ispS, propKg: ionPart.ion.propellantKg, dropKg: 0 }]) : null;
  const chem = new Burner(totalKg, [
    ...(kick?.propulsion ? [{ name: kick.name, ispS: kick.propulsion.ispS, propKg: kick.propulsion.propellantKg, dropKg: kick.massKg - kick.propulsion.propellantKg }] : []),
    ...(craft?.propulsion ? [{ name: craft.name, ispS: craft.propulsion.ispS, propKg: craft.propulsion.propellantKg, dropKg: 0 }] : []),
  ]);
  const chemBy = () => (chem.names.length ? chem.names.join(' + ') : 'No braking engine');

  /** An ion leg: pay the push, and work out how long the gentle thrust takes. */
  const ionLeg = (id: PlanetLegId, name: string, roscoe: string, neededMS: number) => {
    const b = ionBurner!;
    const m0 = b.massKg;
    const availableMS = b.capacity();
    b.burn(neededMS);
    add({ id, name, roscoe, by: ionPart!.name, neededMS, availableMS, unit: 'm/s' });
    const avgKg = (m0 + b.massKg) / 2;
    return (Math.min(neededMS, availableMS) / (ionPart!.ion!.thrustN / avgKg)) / DAY_S;
  };

  if (useIon) {
    // Spiral out: the rocket only has to escape Earth; the ion engine does the rest, slowly.
    windowDepartMS = departureDvMS(0, parkingM);
    add({ id: 'depart', name: 'Escape Earth', roscoe: 'Blast free of Earth', by: topStage, neededMS: windowDepartMS, availableMS: remainingDeltaVMS, unit: 'm/s' });
    let from: BodyId = 'earth';
    let fromAngle = 0;
    const stops: (BodyId | 'belt')[] = info.stops.length ? info.stops : ['belt'];
    stops.forEach((to, k) => {
      const toAU = to === 'belt' ? BELT_CROSS_AU : BODIES[to].aAU;
      const stopping = to !== 'belt' && (arrival !== 'flyby' || k < stops.length - 1);
      const neededMS =
        Math.abs(vCircSun(rM(from)) - vCircSun(toAU * AU_M)) + (from !== 'earth' ? lowOrbitSpeedMS(from) : 0) + (stopping ? lowOrbitSpeedMS(to as BodyId) : 0);
      const name = to === 'belt' ? 'Ion cruise through the belt' : k === 0 ? `Ion cruise to ${BODIES[to].name}` : `Hop to ${BODIES[to].name}`;
      const roscoe = to === 'belt' ? 'Gentle push out through the belt' : k === 0 ? `Gentle push all the way to ${BODIES[to].name}` : `Hop over to ${BODIES[to].name}`;
      const days = ionLeg(k === 0 ? 'cruise' : 'hop', name, roscoe, neededMS);
      segments.push({ kind: 'spiral', from, to, startDay: day, days, fromAU: BODIES[from].aAU, toAU, fromAngle });
      const endAngle = fromAngle + spiralSweep(BODIES[from].aAU, toAU, days);
      day += days;
      if (to !== 'belt') {
        // Put the target where the spiral ends (pick the launch date that makes it so).
        angles[to] = mod2pi(endAngle - nPerDay(to) * day);
        from = to;
      }
      fromAngle = endAngle;
    });
    if (arrival === 'sample' && first) {
      const neededMS = lowOrbitSpeedMS(first) + Math.abs(vCircSun(rM(first)) - vCircSun(rM('earth')));
      const b = ionBurner!;
      const m0 = b.massKg;
      const availableMS = b.capacity();
      b.burn(neededMS);
      const homeDays = (Math.min(neededMS, availableMS) / (ionPart!.ion!.thrustN / ((m0 + b.massKg) / 2))) / DAY_S;
      add({ id: 'home', name: 'Ion cruise home', roscoe: 'Gentle push back to Earth', by: ionPart!.name, neededMS, availableMS, unit: 'm/s' });
      const sweep = spiralSweep(BODIES[first].aAU, 1, homeDays);
      const bodyAngleNow = (angles[first] ?? 0) + nPerDay(first) * day;
      const wait = waitForEarth(bodyAngleNow, first, nPerDay('earth') * day, sweep, homeDays);
      segments.push({ kind: 'wait', from: first, to: first, startDay: day, days: wait });
      day += wait;
      segments.push({ kind: 'spiral', from: first, to: 'earth', startDay: day, days: homeDays, fromAU: BODIES[first].aAU, toAU: 1, fromAngle: bodyAngleNow + nPerDay(first) * wait });
      day += homeDays;
      add(capsuleLeg(parts));
    }
  } else if (!first) {
    // The belt: a ring, so any launch day works. Coast out past its far edge.
    const h = hohmannSun(rM('earth'), BELT_CROSS_AU * AU_M);
    windowDepartMS = departureDvMS(h.vInfDepMS, parkingM);
    add({ id: 'depart', name: 'Leave Earth for the belt', roscoe: 'Blast off toward the asteroid belt', by: topStage, neededMS: windowDepartMS, availableMS: remainingDeltaVMS, unit: 'm/s' });
    const vE = vCircSun(rM('earth'));
    segments.push({ kind: 'conic', from: 'earth', to: 'belt', startDay: 0, days: h.tofDays, r1: [rM('earth'), 0], v1: [0, vE + h.vInfDepMS] });
    day = h.tofDays;
  } else {
    const stopping = arrival === 'orbit' || arrival === 'sample' || info.stops.length > 1;
    const t = bestTransfer(first, offsetDays, parkingM, stopping);
    windowDepartMS = departureDvMS(bestTransfer(first, 0, parkingM, stopping).vInfDepMS, parkingM);
    add({
      id: 'depart',
      name: `Leave Earth for ${there}`,
      roscoe: `Blast off toward ${there}`,
      by: topStage,
      neededMS: departureDvMS(t.vInfDepMS, parkingM),
      availableMS: remainingDeltaVMS,
      unit: 'm/s',
    });
    angles.earth = t.earthAngle;
    angles[first] = t.targetAngle;
    segments.push({ kind: 'conic', from: 'earth', to: first, startDay: 0, days: t.tofDays, r1: t.r1, v1: t.v1 });
    day = t.tofDays;

    if (stopping) {
      add({
        id: 'capture',
        name: `Brake into ${there} orbit`,
        roscoe: `Brake to stay at ${there}`,
        by: chemBy(),
        neededMS: captureDvMS(t.vInfArrMS, first),
        availableMS: chem.capacity(),
        unit: 'm/s',
      });
      chem.burn(captureDvMS(t.vInfArrMS, first));
    }

    if (info.stops.length > 1) {
      // Second stop: climb out, a Hohmann hop between the two, and brake again.
      const [a, b] = info.stops;
      const h = hohmannSun(rM(a), rM(b));
      const neededMS = departureDvMS(h.vInfDepMS, BODIES[a].captureOrbit.periAltM, a) + captureDvMS(h.vInfArrMS, b);
      add({ id: 'hop', name: `Hop to ${BODIES[b].name}`, roscoe: `Hop over to ${BODIES[b].name}`, by: chemBy(), neededMS, availableMS: chem.capacity(), unit: 'm/s' });
      chem.burn(neededMS);
      const startAngle = t.targetAngle + nPerDay(a) * day;
      const vA = vCircSun(rM(a));
      segments.push({ kind: 'conic', from: a, to: b, startDay: day, days: h.tofDays, r1: [rM(a) * Math.cos(startAngle), rM(a) * Math.sin(startAngle)], v1: [-(vA + h.vInfDepMS) * Math.sin(startAngle), (vA + h.vInfDepMS) * Math.cos(startAngle)] });
      day += h.tofDays;
      angles[b] = mod2pi(startAngle + Math.PI - nPerDay(b) * day);
    }

    if (arrival === 'sample') {
      const h = hohmannSun(rM(first), rM('earth'));
      const neededMS = departureDvMS(h.vInfDepMS, BODIES[first].captureOrbit.periAltM, first);
      add({ id: 'home', name: 'Fly home', roscoe: 'Head back to Earth', by: chemBy(), neededMS, availableMS: chem.capacity(), unit: 'm/s' });
      chem.burn(neededMS);
      const bodyAngleNow = t.targetAngle + nPerDay(first) * day;
      const wait = waitForEarth(bodyAngleNow, first, t.earthAngle + nPerDay('earth') * day, Math.PI, h.tofDays);
      segments.push({ kind: 'wait', from: first, to: first, startDay: day, days: wait });
      day += wait;
      const ang = bodyAngleNow + nPerDay(first) * wait;
      const vR = vCircSun(rM(first));
      const v = vR - h.vInfDepMS;
      segments.push({ kind: 'conic', from: first, to: 'earth', startDay: day, days: h.tofDays, r1: [rM(first) * Math.cos(ang), rM(first) * Math.sin(ang)], v1: [-v * Math.sin(ang), v * Math.cos(ang)] });
      day += h.tofDays;
      add(capsuleLeg(parts));
    }

    if (arrival === 'land') {
      const lander = parts.find((p) => p.planetLander) ?? parts.find((p) => p.lander);
      const pl = lander?.planetLander;
      const by = lander ? lander.name : 'No lander';
      add({
        id: 'entry',
        name: `Heat shield into ${there}'s air`,
        roscoe: 'Heat shield through the hot air',
        by: lander && !pl?.heatShield ? `${lander.name} (no heat shield)` : by,
        neededMS: 1,
        availableMS: pl?.heatShield ? 1 : 0,
        unit: 'check',
      });
      if (first === 'mars') {
        const r = pl?.rockets;
        add({
          id: 'touchdown',
          name: 'Landing rockets',
          roscoe: pl?.parachute ? 'Parachute, then rockets for a soft landing' : 'Rockets for a soft landing',
          by: r ? `${lander!.name} rockets` : lander ? `${lander.name} (no landing rockets)` : 'No lander',
          neededMS: pl?.parachute ? MARS_TOUCHDOWN_MS : NO_CHUTE_TOUCHDOWN_MS,
          availableMS: r ? rocketDv(r.ispS, r.massAtIgnitionKg, r.propellantKg) : 0,
          unit: 'm/s',
        });
      } else {
        // Venus: the thick air is a soft landing; the hard part is lasting in the heat and crush.
        surfaceMinutes = pl?.heatShield ? pl.venusMinutes ?? 2 : 0;
        add({ id: 'survive', name: 'Working on the surface', roscoe: 'Keep working on hot, crushing Venus', by, neededMS: VENUS_GOAL_MIN, availableMS: surfaceMinutes, unit: 'min' });
      }
    }
  }

  const short = legs.find((l) => !l.ok);
  return {
    destination,
    arrival,
    legs,
    shortLeg: short?.id,
    success: !short,
    segments,
    angles,
    totalDays: day,
    ion: useIon,
    offsetDays,
    windowDepartMS,
    surfaceMinutes,
  };
}

function capsuleLeg(parts: Payload[]): Omit<PlanetLeg, 'ok'> {
  const has = parts.some((p) => p.sampleCapsule);
  return {
    id: 'capsule',
    name: 'Sample capsule to Earth',
    roscoe: 'Drop the sample capsule home',
    by: has ? 'Sample capsule' : 'No sample capsule',
    neededMS: 1,
    availableMS: has ? 1 : 0,
    unit: 'check',
  };
}

/** Push needed to leave Earth orbit for this trip (for auto-size). */
export function planetDepartureNeededMS(spec: RocketSpec, catalog: Catalog) {
  return planetLedger(spec, catalog, Infinity).legs[0].neededMS;
}
