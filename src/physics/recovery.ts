// What happens to the pieces that drop off: boosters on parachutes into the sea, and the
// core stage relighting its engines to land on its legs (on a drone ship downrange).
//
// Same inertial frame and clock as the ascent, so the UI can draw them alongside it.
// Not modelled: boostback burns (the stage lands where it falls) and grid fins.

import { atmosphere } from './atmosphere';
import { G0_MS2, MU_EARTH_M3S2, R_EARTH_M } from './constants';
import { dragCoefficient } from './drag';
import { rk4Step, type State } from './integrator';
import type { Separation } from './types';
import { BOOSTER_CHUTE_DRAG_AREA_M2, type Vehicle } from './vehicle';

export type RecoveryPhase = 'coast' | 'entryBurn' | 'falling' | 'parachute' | 'landingBurn' | 'down';

export interface RecoverySample {
  tS: number;
  xM: number;
  yM: number;
  altitudeM: number;
  /** Speed through the air. */
  speedMS: number;
  phase: RecoveryPhase;
  thrustN: number;
  propellantKg: number;
  dynamicPressurePa: number;
}

export type RecoveryOutcome = 'landed' | 'splashdown' | 'crashed' | 'lost';

export interface RecoveryTrack {
  kind: 'boosters' | 'stage';
  name: string;
  stageIndex: number;
  count: number;
  method: 'none' | 'parachute' | 'propulsive';
  samples: RecoverySample[];
  outcome: RecoveryOutcome;
  /** A recovery was tried and failed. Throwing a piece away on purpose is not a failure. */
  failed: boolean;
  reason: string;
  touchdownSpeedMS: number;
  limitMS: number;
  reserveKg: number;
  propellantLeftKg: number;
  /** Speed taken off by the entry burn. */
  entryBurnDeltaVMS: number;
  maxDynamicPressurePa: number;
  downrangeM: number;
  endTS: number;
}

/** Above this air speed the stage burns its engines on the way back in, like a Falcon 9. */
export const ENTRY_SPEED_LIMIT_MS = 2000;
const BOOSTER_CHUTE_ALT_M = 5000;
const CHUTE_INFLATE_S = 5;
const BOOSTER_SPLASH_LIMIT_MS = 30;
/** Landing engines: enough for this much thrust-to-weight at sea level. */
const LANDING_TWR = 2;
const MAX_TIME_S = 1800;
/** Average drag area of a tumbling booster, as a fraction of its side view. */
const TUMBLE_SIDE_FRACTION = 0.5;
/** Keep re-entry air pressure under this share of the structural limit... */
const ENTRY_Q_FRACTION = 0.6;
/** ...judged this far below the stage, so braking starts early enough. */
const ENTRY_LOOKAHEAD_M = 12e3;
/** The entry burn starts once the stage is coming down below this height. */
const ENTRY_BURN_START_ALT_M = 160e3;

export function simulateRecovery(sep: Separation, vehicle: Vehicle, omega: number): RecoveryTrack {
  const stage = vehicle.stages[sep.stageIndex];
  const booster = sep.kind === 'boosters' ? stage.boosters! : undefined;
  const method = booster ? (booster.parachutes ? 'parachute' : 'none') : stage.recovery;
  const name = booster ? (booster.count > 1 ? `${booster.count} boosters` : 'Booster') : stage.name;
  const dryKg = booster ? booster.dryMassKg : stage.dryMassKg;
  const diameterM = booster ? (booster.booster.diameterM ?? 3.7) : stage.diameterM;
  // Boosters tumble on the way down, so they fall partly side-on; the stage flies engines-first.
  const areaM2 = booster
    ? TUMBLE_SIDE_FRACTION * diameterM * (booster.booster.lengthM ?? 40)
    : (Math.PI * diameterM * diameterM) / 4;
  const limitMS = booster ? BOOSTER_SPLASH_LIMIT_MS : stage.legLimitMS;
  const maxQPa = booster ? Infinity : stage.maxDynamicPressurePa;

  // Landing engines: the fewest that give a firm push (all of them for the entry burn).
  const engines = !booster && method === 'propulsive' ? stage.engines : [];
  const perEngine = engines[0];
  const totalEngines = engines.reduce((a, g) => a + g.count, 0);
  const mLand = dryKg + sep.propellantKg * 0.3;
  let landingEngines = 0;
  if (perEngine) {
    const sl = perEngine.engine.thrustSeaLevelN;
    landingEngines = Math.min(totalEngines, Math.max(1, Math.ceil((LANDING_TWR * mLand * G0_MS2) / sl)));
  }
  const entryEngines = totalEngines;
  const throttleMin = perEngine?.engine.throttleMin ?? 1;

  let prop = sep.propellantKg;
  let s: State = [sep.xM, sep.yM, sep.vxMS, sep.vyMS, dryKg + prop];
  let t = sep.tS;
  let phase: RecoveryPhase = 'coast';
  let chuteT = -1;
  let entryDv = 0;
  let maxQ = 0;
  let outcome: RecoveryOutcome | null = null;
  let reason = '';
  let touchdown = 0;
  const samples: RecoverySample[] = [];
  let lastSample = -Infinity;

  const air = (x: State): [number, number] => [x[2] - omega * x[1], x[3] + omega * x[0]];

  const push = (thrustN: number, q: number) => {
    const [vax, vay] = air(s);
    samples.push({
      tS: t,
      xM: s[0],
      yM: s[1],
      altitudeM: Math.hypot(s[0], s[1]) - R_EARTH_M,
      speedMS: Math.hypot(vax, vay),
      phase,
      thrustN,
      propellantKg: prop,
      dynamicPressurePa: q,
    });
    lastSample = t;
  };

  /** Thrust and mass flow of n engines at a throttle and outside pressure. */
  const engineOut = (n: number, throttle: number, pressurePa: number) => {
    if (!perEngine || n <= 0 || prop <= 0) return { thrustN: 0, mdot: 0 };
    const e = perEngine.engine;
    const fVac = throttle * e.thrustVacuumN;
    return { thrustN: n * Math.max(0, fVac - pressurePa * perEngine.exitAreaM2), mdot: (n * fVac) / (e.ispVacuumS * G0_MS2) };
  };

  push(0, 0);
  while (t < sep.tS + MAX_TIME_S) {
    const r = Math.hypot(s[0], s[1]);
    const alt = r - R_EARTH_M;
    const a = atmosphere(Math.max(0, alt));
    const [vax, vay] = air(s);
    const vAir = Math.hypot(vax, vay);
    const vr = (s[2] * s[0] + s[3] * s[1]) / r;
    const q = 0.5 * a.densityKgM3 * vAir * vAir;
    maxQ = Math.max(maxQ, q);

    // ---- decide what the engines and parachutes do this step ----
    let n = 0;
    let throttle = 1;
    if (method === 'propulsive' && prop > 0) {
      // Entry burn: brake whenever the air a little further down would push harder than
      // the stage can take. Looking ahead leaves time for the engines to slow it.
      const aBrake = engineOut(entryEngines, 1, a.pressurePa).thrustN / s[4];
      const lookM = ENTRY_LOOKAHEAD_M + (aBrake > 0 ? 0.5 * Math.max(0, -vr) * (vAir / aBrake) : 0);
      const ahead = atmosphere(Math.max(0, alt - lookM)).densityKgM3;
      const safeV = ahead > 0 ? Math.sqrt((2 * ENTRY_Q_FRACTION * maxQPa) / ahead) : Infinity;
      if (phase !== 'landingBurn' && vr < 0 && alt < ENTRY_BURN_START_ALT_M && vAir > Math.min(safeV, ENTRY_SPEED_LIMIT_MS)) {
        phase = 'entryBurn';
        n = entryEngines;
      } else if (phase === 'entryBurn') {
        phase = 'falling';
      }
      if (phase !== 'entryBurn' && vr < 0 && alt < 30e3) {
        // Hoverslam: light up when the stopping distance at full landing thrust reaches the ground.
        const full = engineOut(landingEngines, 1, a.pressurePa).thrustN;
        const g = MU_EARTH_M3S2 / (r * r);
        const net = full / s[4] - g;
        const stopM = net > 0 ? (vAir * vAir) / (2 * net) : Infinity;
        if (phase === 'landingBurn' || alt <= stopM * 1.15 + 20) {
          phase = 'landingBurn';
          n = landingEngines;
          const need = (vAir * vAir) / (2 * Math.max(alt, 0.5)) + g;
          throttle = Math.max(throttleMin, Math.min(1, (need * s[4]) / Math.max(1, engineOut(n, 1, a.pressurePa).thrustN)));
        }
      }
      if (phase === 'landingBurn' && vr >= 0) {
        // Stopped above the deck: engines off and fall again.
        phase = 'falling';
        n = 0;
      }
    } else if (method === 'propulsive' && phase !== 'coast') {
      phase = 'falling';
    }
    if (method === 'parachute' && chuteT < 0 && vr < 0 && alt < BOOSTER_CHUTE_ALT_M) {
      chuteT = t;
      phase = 'parachute';
    }
    if (phase === 'coast' && alt < 100e3 && vr < 0 && method !== 'propulsive') phase = 'falling';
    if (phase === 'coast' && alt < 100e3 && vr < 0 && method === 'propulsive' && n === 0) phase = 'falling';

    const chuteArea = chuteT >= 0 ? BOOSTER_CHUTE_DRAG_AREA_M2 * Math.min(1, (t - chuteT) / CHUTE_INFLATE_S) : 0;
    const burning = n > 0;
    const dt = burning || chuteT >= 0 ? 0.02 : alt < 90e3 ? 0.05 : 0.5;

    const deriv = (x: State): State => {
      const rr = Math.hypot(x[0], x[1]);
      const at = atmosphere(Math.max(0, rr - R_EARTH_M));
      const [ax, ay] = air(x);
      const v = Math.hypot(ax, ay);
      const { thrustN, mdot } = engineOut(n, throttle, at.pressurePa);
      let fx = 0;
      let fy = 0;
      if (v > 0) {
        const dragN = 0.5 * at.densityKgM3 * v * v * (dragCoefficient(v / at.speedOfSoundMS) * areaM2 + chuteArea);
        // Engines point back along the flight path, against the airflow.
        fx = (-(dragN + thrustN) * ax) / v;
        fy = (-(dragN + thrustN) * ay) / v;
      }
      const g = MU_EARTH_M3S2 / (rr * rr * rr);
      return [x[2], x[3], fx / x[4] - g * x[0], fy / x[4] - g * x[1], -mdot];
    };
    const { thrustN, mdot } = engineOut(n, throttle, a.pressurePa);
    let next = rk4Step(s, dt, deriv);
    let stepDt = dt;
    if (Math.hypot(next[0], next[1]) < R_EARTH_M) {
      // Shorten the step to land exactly on the surface.
      let lo = 0;
      let hi = dt;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (Math.hypot(...(rk4Step(s, mid, deriv).slice(0, 2) as [number, number])) < R_EARTH_M) hi = mid;
        else lo = mid;
      }
      stepDt = hi;
      next = rk4Step(s, stepDt, deriv);
    }
    s = next;
    t += stepDt;
    if (phase === 'entryBurn') entryDv += (thrustN / s[4]) * stepDt;
    prop = Math.max(0, prop - mdot * stepDt);
    s[4] = dryKg + prop;

    if (q > maxQPa && !outcome) {
      outcome = method === 'propulsive' ? 'crashed' : 'lost';
      reason = method === 'propulsive' ? 'Broke apart coming back through the air: too fast' : 'Broke apart falling back into the air';
      phase = 'down';
      push(thrustN, q);
      break;
    }

    const sampleEvery = burning || chuteT >= 0 || alt < 20e3 ? 0.2 : 1;
    const landed = Math.hypot(s[0], s[1]) <= R_EARTH_M + 1e-3;
    if (t - lastSample >= sampleEvery - 1e-9 || landed) push(thrustN, q);
    if (landed) {
      const [ax, ay] = air(s);
      touchdown = Math.hypot(ax, ay);
      phase = 'down';
      if (method === 'propulsive') {
        outcome = touchdown <= limitMS ? 'landed' : 'crashed';
        reason =
          touchdown <= limitMS
            ? `Landed at ${touchdown.toFixed(1)} m/s`
            : prop <= 0
              ? `Ran out of landing fuel and hit at ${touchdown.toFixed(0)} m/s`
              : `Hit at ${touchdown.toFixed(0)} m/s; the legs take ${limitMS} m/s`;
      } else if (method === 'parachute') {
        outcome = touchdown <= limitMS ? 'splashdown' : 'crashed';
        reason = `Splashed down at ${touchdown.toFixed(0)} m/s under parachutes`;
      } else {
        outcome = 'lost';
        reason = `Fell into the ocean at ${touchdown.toFixed(0)} m/s`;
      }
      samples[samples.length - 1].phase = 'down';
      break;
    }
  }

  if (!outcome) {
    outcome = 'lost';
    reason = 'Still falling when the simulation stopped';
  }

  const end = samples[samples.length - 1];
  const siteAngle = Math.PI / 2 - omega * end.tS;
  let d = siteAngle - Math.atan2(end.yM, end.xM);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;

  return {
    kind: sep.kind,
    name,
    stageIndex: sep.stageIndex,
    count: booster?.count ?? 1,
    method,
    samples,
    outcome,
    failed: method !== 'none' && outcome === 'crashed',
    reason,
    touchdownSpeedMS: touchdown,
    limitMS,
    reserveKg: sep.propellantKg,
    propellantLeftKg: prop,
    entryBurnDeltaVMS: entryDv,
    maxDynamicPressurePa: maxQ,
    downrangeM: d * R_EARTH_M,
    endTS: end.tS,
  };
}
