// Coming home: the capsule hits the top of the atmosphere, heats up, slows down and
// splashes down on parachutes.
//
// Heating is the Sutton–Graves stagnation-point estimate. The capsule flies with a little
// lift (L/D 0.3, like Apollo) and rolls that lift up or down to stop itself climbing back out.
// Non-rotating Earth; the clock starts at entry interface.

import { atmosphere } from './atmosphere';
import { G0_MS2, MU_EARTH_M3S2, R_EARTH_M } from './constants';
import { rk4Step } from './integrator';
import { resolveCatalog } from './vehicle';
import type { Catalog, Payload, RocketSpec } from './types';

export const ENTRY_INTERFACE_ALT_M = 121.9e3;
/** Lunar return (Apollo 11: 11.03 km/s) and low-orbit return speeds at entry interface. */
export const MOON_RETURN_SPEED_MS = 11000;
export const ORBIT_RETURN_SPEED_MS = 7850;
export const DEFAULT_ENTRY_ANGLE_DEG = { moon: -6.5, orbit: -1.5 };
/** Peak sensed load trained astronauts can take briefly, lying on their backs. */
export const CREW_G_LIMIT = 12;
/** Splashdown speed the capsule is built for. */
const SPLASH_LIMIT_MS = 12;
const SUTTON_GRAVES_K = 1.7415e-4;
const CAPSULE_CD = 1.3;
const LIFT_TO_DRAG = 0.3;
/** How hard the lift is rolled to cancel a climb (m/s of climb for full lift down). */
const BANK_GAIN_MS = 100;
const MAINS_ALT_M = 3000;
const MAINS_INFLATE_S = 6;

export type ReentryPhase = 'entry' | 'parachute' | 'splashdown' | 'lost';

export interface ReentrySample {
  tS: number;
  altitudeM: number;
  downrangeM: number;
  speedMS: number;
  heatFluxWm2: number;
  heatLoadJm2: number;
  gLoad: number;
  phase: ReentryPhase;
}

export type ReentryOutcome = 'splashdown' | 'burnUp' | 'skipOut' | 'crewG' | 'hardSplash';

export interface ReentryRecord {
  capsuleName: string;
  entrySpeedMS: number;
  entryAngleDeg: number;
  samples: ReentrySample[];
  outcome: ReentryOutcome;
  peakHeatFluxWm2: number;
  heatLoadJm2: number;
  peakGLoad: number;
  maxHeatFluxWm2: number;
  maxHeatLoadJm2: number;
  splashSpeedMS: number;
  durationS: number;
}

export function findCapsule(spec: RocketSpec, catalog: Catalog): Payload | undefined {
  const cat = resolveCatalog(spec, catalog);
  return spec.payload.parts.map((r) => cat[r.part]).find((p): p is Payload => p?.type === 'payload' && !!p.heatShield);
}

export function simulateReentry(spec: RocketSpec, catalog: Catalog, fromMoon: boolean): ReentryRecord | null {
  const capsule = findCapsule(spec, catalog);
  if (!capsule?.heatShield) return null;
  const scale = spec.payload.heatShieldScale ?? 1;
  const massKg = capsule.massKg + capsule.heatShield.massKg * (scale - 1);
  const d = capsule.diameterM ?? 3.9;
  const areaM2 = (Math.PI * d * d) / 4;
  const noseRadiusM = 1.2 * d; // Apollo: 4.69 m spherical heat shield on a 3.9 m capsule
  const maxFlux = capsule.heatShield.maxHeatFluxWm2 * scale;
  const maxLoad = capsule.heatShield.maxHeatLoadJm2 * scale;
  const chuteArea = capsule.parachuteDragAreaM2 ?? 0;

  const v0 = fromMoon ? MOON_RETURN_SPEED_MS : ORBIT_RETURN_SPEED_MS;
  const gammaDeg = spec.mission.reentryAngleDeg ?? DEFAULT_ENTRY_ANGLE_DEG[fromMoon ? 'moon' : 'orbit'];
  const g0 = (gammaDeg * Math.PI) / 180;
  const r0 = R_EARTH_M + ENTRY_INTERFACE_ALT_M;
  let s = [0, r0, v0 * Math.cos(g0), v0 * Math.sin(g0), massKg];
  let t = 0;
  let heatLoad = 0;
  let peakFlux = 0;
  let peakG = 0;
  let dipped = false;
  let chuteT = -1;
  let outcome: ReentryOutcome | null = null;
  let splash = 0;
  const samples: ReentrySample[] = [];
  let lastSample = -Infinity;

  const forces = (x: number[]) => {
    const r = Math.hypot(x[0], x[1]);
    const alt = r - R_EARTH_M;
    const a = atmosphere(Math.max(0, alt));
    const v = Math.hypot(x[2], x[3]);
    const vr = (x[0] * x[2] + x[1] * x[3]) / r;
    const qS = 0.5 * a.densityKgM3 * v * v;
    const area = chuteT >= 0 ? CAPSULE_CD * areaM2 + chuteArea * Math.min(1, (t - chuteT) / MAINS_INFLATE_S) : CAPSULE_CD * areaM2;
    const drag = qS * area;
    // Lift sits at right angles to the flight path, on the "up" side; roll it to cancel climbing.
    const cosBank = chuteT >= 0 ? 0 : Math.max(-1, Math.min(1, -vr / BANK_GAIN_MS));
    const lift = drag * LIFT_TO_DRAG * cosBank;
    const ux = v > 0 ? x[2] / v : 0;
    const uy = v > 0 ? x[3] / v : 0;
    // Perpendicular to velocity, pointing away from the Earth.
    let nx = -uy;
    let ny = ux;
    if (nx * x[0] + ny * x[1] < 0) {
      nx = -nx;
      ny = -ny;
    }
    const fx = -drag * ux + lift * nx;
    const fy = -drag * uy + lift * ny;
    return { fx, fy, a, v, alt, vr };
  };

  const deriv = (x: number[]) => {
    const { fx, fy } = forces(x);
    const r = Math.hypot(x[0], x[1]);
    const g = MU_EARTH_M3S2 / (r * r * r);
    return [x[2], x[3], fx / x[4] - g * x[0], fy / x[4] - g * x[1], 0] as [number, number, number, number, number];
  };

  const push = (phase: ReentryPhase, flux: number, gLoad: number) => {
    const r = Math.hypot(s[0], s[1]);
    samples.push({
      tS: t,
      altitudeM: r - R_EARTH_M,
      downrangeM: Math.atan2(s[0], s[1]) * R_EARTH_M,
      speedMS: Math.hypot(s[2], s[3]),
      heatFluxWm2: flux,
      heatLoadJm2: heatLoad,
      gLoad,
      phase,
    });
    lastSample = t;
  };

  push('entry', 0, 0);
  while (t < 3600) {
    const f = forces(s);
    const flux = SUTTON_GRAVES_K * Math.sqrt(f.a.densityKgM3 / noseRadiusM) * f.v ** 3;
    const gLoad = Math.hypot(f.fx, f.fy) / s[4] / G0_MS2;
    peakFlux = Math.max(peakFlux, flux);
    peakG = Math.max(peakG, gLoad);
    if (f.alt < 100e3) dipped = true;
    if (chuteT < 0 && f.alt < MAINS_ALT_M && f.vr < 0) chuteT = t;

    const dt = f.alt < 100e3 ? 0.05 : 0.5;
    const prev = s;
    s = rk4Step(s as [number, number, number, number, number], dt, deriv);
    heatLoad += flux * dt;
    t += dt;
    const phase: ReentryPhase = chuteT >= 0 ? 'parachute' : 'entry';
    if (t - lastSample >= (f.alt < 100e3 ? 0.5 : 2) - 1e-9) push(phase, flux, gLoad);

    if (dipped && Math.hypot(s[0], s[1]) - R_EARTH_M > ENTRY_INTERFACE_ALT_M + 5e3) {
      outcome = 'skipOut';
      push('lost', flux, gLoad);
      break;
    }
    if (!dipped && t > 1200) {
      outcome = 'skipOut';
      break;
    }
    if (Math.hypot(s[0], s[1]) <= R_EARTH_M) {
      // Interpolate to the surface for the splashdown speed.
      const h0 = Math.hypot(prev[0], prev[1]) - R_EARTH_M;
      const h1 = Math.hypot(s[0], s[1]) - R_EARTH_M;
      const k = h0 / (h0 - h1);
      splash = Math.hypot(prev[2] + k * (s[2] - prev[2]), prev[3] + k * (s[3] - prev[3]));
      push('splashdown', 0, gLoad);
      samples[samples.length - 1].altitudeM = 0;
      break;
    }
  }

  if (!outcome) {
    if (peakFlux > maxFlux || heatLoad > maxLoad) outcome = 'burnUp';
    else if (peakG > CREW_G_LIMIT) outcome = 'crewG';
    else if (splash > SPLASH_LIMIT_MS) outcome = 'hardSplash';
    else outcome = 'splashdown';
  }

  return {
    capsuleName: capsule.name,
    entrySpeedMS: v0,
    entryAngleDeg: gammaDeg,
    samples,
    outcome,
    peakHeatFluxWm2: peakFlux,
    heatLoadJm2: heatLoad,
    peakGLoad: peakG,
    maxHeatFluxWm2: maxFlux,
    maxHeatLoadJm2: maxLoad,
    splashSpeedMS: splash,
    durationS: t,
  };
}
