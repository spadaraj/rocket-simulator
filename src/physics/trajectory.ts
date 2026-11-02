// The trip to the Moon as a real flight path, in two dimensions.
//
// Earth and Moon pull on the spacecraft together (the circular restricted three-body
// problem), worked in a frame that turns with the Moon so the Moon stays put on screen.
// The route is a free return, like Apollo 8–13 and Artemis II: aimed so that it swings
// round the far side of the Moon and falls back to Earth on its own. Lunar orbit
// insertion and the burn home happen at the closest point to the Moon, so the way home
// is the rest of the same free return.
//
// What depends on the rocket: how hard the push toward the Moon is. Too weak, and the
// path never reaches the Moon and falls back to Earth.

import { MU_EARTH_M3S2, R_EARTH_M } from './constants';

export const MU_MOON_M3S2 = 4.9048695e12;
export const R_MOON_M = 1737.4e3;
/** Mean Earth–Moon distance. */
export const EARTH_MOON_M = 384400e3;
const MASS_RATIO = MU_MOON_M3S2 / (MU_EARTH_M3S2 + MU_MOON_M3S2);
/** The frame turns once per sidereal month. */
export const OMEGA_MOON_RADS = Math.sqrt((MU_EARTH_M3S2 + MU_MOON_M3S2) / EARTH_MOON_M ** 3);
/** Earth and Moon positions on the x axis, measured from their balance point. */
export const EARTH_X_M = -EARTH_MOON_M * MASS_RATIO;
export const MOON_X_M = EARTH_MOON_M * (1 - MASS_RATIO);

/** Closest approach to aim for behind the Moon (Apollo 13's free return: about 250 km). */
export const TARGET_PERILUNE_ALT_M = 200e3;
/** Height at which the returning craft should graze the atmosphere. */
export const TARGET_RETURN_ALT_M = 50e3;
const ENTRY_INTERFACE_ALT_M = 121.9e3;
const MAX_DAYS = 12;

type Vec = [number, number, number, number];

function accel(s: Vec): Vec {
  const [x, y, vx, vy] = s;
  const dxE = x - EARTH_X_M;
  const dxM = x - MOON_X_M;
  const rE3 = Math.hypot(dxE, y) ** 3;
  const rM3 = Math.hypot(dxM, y) ** 3;
  const w = OMEGA_MOON_RADS;
  return [
    vx,
    vy,
    2 * w * vy + w * w * x - (MU_EARTH_M3S2 * dxE) / rE3 - (MU_MOON_M3S2 * dxM) / rM3,
    -2 * w * vx + w * w * y - (MU_EARTH_M3S2 * y) / rE3 - (MU_MOON_M3S2 * y) / rM3,
  ];
}

function rk4(s: Vec, h: number): Vec {
  const add = (a: Vec, k: Vec, f: number): Vec => [a[0] + k[0] * f, a[1] + k[1] * f, a[2] + k[2] * f, a[3] + k[3] * f];
  const k1 = accel(s);
  const k2 = accel(add(s, k1, h / 2));
  const k3 = accel(add(s, k2, h / 2));
  const k4 = accel(add(s, k3, h));
  return [0, 1, 2, 3].map((i) => s[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as Vec;
}

const rEarth = (s: Vec) => Math.hypot(s[0] - EARTH_X_M, s[1]);
const rMoon = (s: Vec) => Math.hypot(s[0] - MOON_X_M, s[1]);

/** Step size: a small slice of the local orbit period around whichever body is closer. */
function stepFor(s: Vec): number {
  const tE = Math.sqrt(rEarth(s) ** 3 / MU_EARTH_M3S2);
  const tM = Math.sqrt(rMoon(s) ** 3 / MU_MOON_M3S2);
  return Math.max(0.5, Math.min(900, 0.02 * Math.min(tE, tM)));
}

/** Parking-orbit state just after a prograde burn, at angle `phaseRad` around the Earth in the Moon's frame. */
function afterBurn(parkingAltM: number, phaseRad: number, burnMS: number): Vec {
  const r = R_EARTH_M + parkingAltM;
  const v = Math.sqrt(MU_EARTH_M3S2 / r) + burnMS;
  const c = Math.cos(phaseRad);
  const sn = Math.sin(phaseRad);
  const x = EARTH_X_M + r * c;
  const y = r * sn;
  // Inertial velocity, counterclockwise like the Moon; then into the turning frame.
  const vxI = -v * sn;
  const vyI = v * c;
  return [x, y, vxI + OMEGA_MOON_RADS * y, vyI - OMEGA_MOON_RADS * x];
}

export interface PathPoint {
  tS: number;
  xM: number;
  yM: number;
}

interface Flown {
  points: PathPoint[];
  /** Closest approach to the Moon's centre, and when. */
  periluneRM: number;
  periluneTS: number;
  /** Closest approach to Earth on the way back (after leaving the parking orbit). */
  returnPerigeeRM: number;
  returnTS: number;
  /** Fastest speed through the top of the atmosphere coming home (Earth-centred, not turning). */
  entrySpeedMS?: number;
  /** Highest point above Earth reached (for a push too weak to get there). */
  apogeeRM: number;
  hitMoon: boolean;
}

/**
 * Fly from the burn until back at Earth (or out of time). Points are thinned for drawing.
 * `stopAtReturn` ends at the first Earth return; the search uses it to save time.
 */
function fly(start: Vec, record: boolean): Flown {
  let s = start;
  let t = 0;
  const points: PathPoint[] = record ? [{ tS: 0, xM: s[0], yM: s[1] }] : [];
  let peri = Infinity;
  let periT = 0;
  let apogee = rEarth(s);
  let leftEarth = false;
  let prevRE = rEarth(s);
  let returnPerigee = Infinity;
  let returnT = 0;
  let entrySpeed: number | undefined;
  let lastRec = 0;
  let hitMoon = false;
  while (t < MAX_DAYS * 86400) {
    const h = stepFor(s);
    s = rk4(s, h);
    t += h;
    const rE = rEarth(s);
    const rM = rMoon(s);
    if (rM < peri) {
      peri = rM;
      periT = t;
    }
    apogee = Math.max(apogee, rE);
    if (record && (t - lastRec > 600 || rM < 40e6 || rE < 40e6)) {
      points.push({ tS: t, xM: s[0], yM: s[1] });
      lastRec = t;
    }
    if (rM < R_MOON_M) {
      hitMoon = true;
      break;
    }
    if (rE > R_EARTH_M + 50000e3) leftEarth = true;
    // Coming back down: stop at the atmosphere or the lowest point.
    if (leftEarth || apogee > R_EARTH_M + 20000e3) {
      if (rE < R_EARTH_M + ENTRY_INTERFACE_ALT_M) {
        // Speed relative to a non-turning Earth.
        const vx = s[2] - OMEGA_MOON_RADS * s[1];
        const vy = s[3] + OMEGA_MOON_RADS * (s[0] - EARTH_X_M) + OMEGA_MOON_RADS * EARTH_X_M;
        entrySpeed = Math.hypot(vx, vy);
        returnPerigee = rE;
        returnT = t;
        break;
      }
      if (rE > prevRE && prevRE < apogee * 0.5 && t > 3600) {
        returnPerigee = prevRE;
        returnT = t;
        break;
      }
    }
    prevRE = rE;
  }
  if (record) points.push({ tS: t, xM: s[0], yM: s[1] });
  return { points, periluneRM: peri, periluneTS: periT, returnPerigeeRM: returnPerigee, returnTS: returnT, entrySpeedMS: entrySpeed, apogeeRM: apogee, hitMoon };
}

/** How far a trial is from a free return: miss distance behind the Moon and at Earth, in 1000 km. */
function cost(f: Flown): number {
  const peri = (f.periluneRM - (R_MOON_M + TARGET_PERILUNE_ALT_M)) / 1e6;
  const ret = Number.isFinite(f.returnPerigeeRM) ? (f.returnPerigeeRM - (R_EARTH_M + TARGET_RETURN_ALT_M)) / 1e6 : 400;
  return peri * peri + ret * ret + (f.hitMoon ? 100 : 0);
}

/** Nelder–Mead on two variables. */
function minimize(f: (p: [number, number]) => number, start: [number, number], scale: [number, number], iters: number): [number, number] {
  let simplex: { p: [number, number]; v: number }[] = [
    start,
    [start[0] + scale[0], start[1]],
    [start[0], start[1] + scale[1]],
  ].map((p) => ({ p: p as [number, number], v: f(p as [number, number]) }));
  for (let k = 0; k < iters; k++) {
    simplex.sort((a, b) => a.v - b.v);
    const [best, mid, worst] = simplex;
    const c: [number, number] = [(best.p[0] + mid.p[0]) / 2, (best.p[1] + mid.p[1]) / 2];
    const at = (t: number): [number, number] => [c[0] + t * (worst.p[0] - c[0]), c[1] + t * (worst.p[1] - c[1])];
    const r = at(-1);
    const fr = f(r);
    if (fr < best.v) {
      const e = at(-2);
      const fe = f(e);
      simplex[2] = fe < fr ? { p: e, v: fe } : { p: r, v: fr };
    } else if (fr < mid.v) {
      simplex[2] = { p: r, v: fr };
    } else {
      const ct = at(0.5);
      const fc = f(ct);
      if (fc < worst.v) simplex[2] = { p: ct, v: fc };
      else simplex = simplex.map((s, i) => (i === 0 ? s : { p: [(s.p[0] + best.p[0]) / 2, (s.p[1] + best.p[1]) / 2], v: f([(s.p[0] + best.p[0]) / 2, (s.p[1] + best.p[1]) / 2]) }));
    }
  }
  simplex.sort((a, b) => a.v - b.v);
  return simplex[0].p;
}

/** A free return found from a 185 km parking orbit; other heights start their search here. */
const SEED = { phaseDeg: 227.37, burnMS: 3170.3 };

export interface FreeReturn {
  parkingAltM: number;
  phaseRad: number;
  burnMS: number;
}

const solved = new Map<number, FreeReturn>();

/** Find the push and the moment to burn so the path loops behind the Moon and back to Earth. */
export function solveFreeReturn(parkingAltM: number, seed = SEED): FreeReturn {
  const key = Math.round(parkingAltM / 5000) * 5000;
  const hit = solved.get(key);
  if (hit) return hit;
  const f = ([phaseDeg, burnMS]: [number, number]) => cost(fly(afterBurn(key, (phaseDeg * Math.PI) / 180, burnMS), false));
  const [phaseDeg, burnMS] = minimize(f, [seed.phaseDeg, seed.burnMS], [3, 5], 60);
  const out = { parkingAltM: key, phaseRad: (phaseDeg * Math.PI) / 180, burnMS };
  solved.set(key, out);
  return out;
}

export type TripKind = 'land' | 'flyby';

export interface TripEvent {
  tS: number;
  id: 'tli' | 'perilune' | 'loi' | 'tei' | 'entry' | 'fellBack' | 'crash';
  label: string;
}

export interface MoonTrajectory {
  points: PathPoint[];
  events: TripEvent[];
  /** How the flight path ends. */
  outcome: 'home' | 'fellBack' | 'hitMoon';
  burnNeededMS: number;
  burnMadeMS: number;
  periluneAltM: number;
  apogeeAltM: number;
  entrySpeedMS?: number;
  /** Days from leaving Earth orbit to coming home. */
  durationS: number;
}

/**
 * The trip for a rocket with `pushMS` of delta-v left in Earth orbit.
 * `stopAtMoon`: the trip ends in lunar orbit (a later leg came up short).
 */
export function moonTrajectory(parkingAltM: number, pushMS: number, kind: TripKind): MoonTrajectory {
  const fr = solveFreeReturn(parkingAltM);
  const made = Math.min(pushMS, fr.burnMS);
  const flown = fly(afterBurn(fr.parkingAltM, fr.phaseRad, made), true);
  const events: TripEvent[] = [{ tS: 0, id: 'tli', label: 'Trans-lunar injection' }];
  const reached = flown.periluneRM < 60000e3;
  let outcome: MoonTrajectory['outcome'];
  if (flown.hitMoon) {
    outcome = 'hitMoon';
    events.push({ tS: flown.periluneTS, id: 'crash', label: 'Hit the Moon' });
  } else if (!reached) {
    outcome = 'fellBack';
    events.push({ tS: flown.returnTS || flown.points[flown.points.length - 1].tS, id: 'fellBack', label: 'Fell back to Earth' });
  } else {
    outcome = 'home';
    if (kind === 'land') {
      events.push({ tS: flown.periluneTS, id: 'loi', label: 'Lunar orbit insertion' });
      events.push({ tS: flown.periluneTS, id: 'tei', label: 'Trans-Earth injection' });
    } else {
      events.push({ tS: flown.periluneTS, id: 'perilune', label: 'Behind the Moon' });
    }
    events.push({ tS: flown.returnTS, id: 'entry', label: 'Back at Earth' });
  }
  return {
    points: flown.points,
    events,
    outcome,
    burnNeededMS: fr.burnMS,
    burnMadeMS: made,
    periluneAltM: flown.periluneRM - R_MOON_M,
    apogeeAltM: flown.apogeeRM - R_EARTH_M,
    entrySpeedMS: flown.entrySpeedMS,
    durationS: flown.points[flown.points.length - 1].tS,
  };
}

/** One trial flight, for the search script and tests: closest approaches in km of altitude. */
export function trialFlight(parkingAltM: number, phaseDeg: number, burnMS: number) {
  const f = fly(afterBurn(parkingAltM, (phaseDeg * Math.PI) / 180, burnMS), false);
  return {
    periluneAltKm: (f.periluneRM - R_MOON_M) / 1e3,
    returnAltKm: (f.returnPerigeeRM - R_EARTH_M) / 1e3,
    returnDays: f.returnTS / 86400,
    cost: cost(f),
  };
}
