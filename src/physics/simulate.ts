// The flight simulator: RocketSpec in, FlightRecord out. No UI imports.
//
// World: Earth-centred inertial 2D frame (the equatorial plane seen side-on).
// The launch site starts at (0, R); "east" is +x there and the Earth turns clockwise.

import { atmosphere, VACUUM, type AtmosphereState } from './atmosphere';
import {
  G0_MS2,
  LAUNCH_SITES,
  MU_EARTH_M3S2,
  OMEGA_EARTH_RADS,
  R_EARTH_M,
  SUCCESS_PERIGEE_ALT_M,
} from './constants';
import { dragCoefficient } from './drag';
import { rk4Step, type State } from './integrator';
import { orbitElements } from './orbit';
import { aeroMomentNm, DESIGN_GUST_MS, RCS_FRACTION, stability } from './stability';
import type {
  Catalog,
  ChecklistItem,
  Failure,
  Fault,
  FlightEvent,
  FlightRecord,
  Outcome,
  RocketSpec,
  Sample,
  Separation,
  SystemName,
} from './types';
import { buildVehicle, frontalAreaM2, type Vehicle } from './vehicle';

export interface SimOptions {
  dtS?: number;
  maxTimeS?: number;
  atmosphere?: boolean;
  earthRotation?: boolean;
  gravity?: boolean;
  /** Start somewhere other than the pad (used by tests). */
  initial?: { xM: number; yM: number; vxMS: number; vyMS: number };
  /** Point the engines in a fixed inertial direction (used by tests). */
  fixedAttitude?: { x: number; y: number };
  /** How long to keep coasting after reaching orbit (default 90 s). */
  coastAfterOrbitS?: number;
  /** Chaos Mode faults to inject. */
  faults?: Fault[];
}

/** Everything about the vehicle that changes only at events. */
interface Config {
  stageIndex: number;
  stagePropKg: number[];
  boostersAttached: boolean;
  boosterElapsedS: number;
  engineOn: boolean;
  jettisoned: boolean[];
  firstStagingTimeS: number | null;
  guidanceActive: boolean;
  /** Velocity has caught up with the pitch kick; follow it from now on. */
  kickDone: boolean;
  /** Engines shut down by faults, per stage. */
  enginesOut: number[];
  stageIgnitionS: number[];
}

const KICK_RAMP_S = 4;
const COAST_AFTER_ORBIT_S = 90;
const POST_FAILURE_COAST_S = 4;
const SAMPLE_POWERED_S = 0.2;
const SAMPLE_COAST_S = 1;
const CUTOFF_MARGIN_M = 10e3;
/** The air must out-twist the steering for this long before the rocket flips. */
const TUMBLE_HOLD_S = 0.5;
/** Guidance keeps dynamic pressure × angle of attack under this (Pa·rad). */
const Q_ALPHA_LIMIT = 1000;
const CHECK_START_S = 8;
const CHECK_EVERY_S = 9;
const GLITCH_RESET_S = 6;
const CHECK_ORDER: SystemName[] = ['engines', 'tanks', 'power', 'guidance', 'comms'];

export function simulate(spec: RocketSpec, catalog: Catalog, opts: SimOptions = {}): FlightRecord {
  const vehicle = buildVehicle(spec, catalog);
  const baseDt = opts.dtS ?? 0.05;
  const maxTime = opts.maxTimeS ?? 4000;
  const useAtmosphere = opts.atmosphere ?? true;
  const useGravity = opts.gravity ?? true;
  const site = LAUNCH_SITES[spec.launchSite] ?? LAUNCH_SITES.KSC;
  // In a 2D equatorial-plane model, the site's eastward surface speed is what matters.
  const omega =
    (opts.earthRotation ?? true) ? OMEGA_EARTH_RADS * Math.cos((site.latitudeDeg * Math.PI) / 180) : 0;
  const mission = spec.mission;
  const cutoffPerigeeM = Math.max(SUCCESS_PERIGEE_ALT_M, mission.targetOrbitAltitudeM - CUTOFF_MARGIN_M);

  const cfg: Config = {
    stageIndex: 0,
    stagePropKg: vehicle.stages.map((s) => s.propellantKg),
    boostersAttached: !!vehicle.stages[0]?.boosters,
    boosterElapsedS: 0,
    engineOn: true,
    jettisoned: vehicle.jettisonables.map(() => false),
    firstStagingTimeS: null,
    guidanceActive: false,
    kickDone: false,
    enginesOut: vehicle.stages.map(() => 0),
    stageIgnitionS: vehicle.stages.map((_, i) => (i === 0 ? 0 : Infinity)),
  };
  const faults = opts.faults ?? [];
  const faultApplied = faults.map(() => false);
  const separations: Separation[] = [];
  const checklist: ChecklistItem[] = [];
  let checksDone = 0;
  let tumbleTimer = 0;
  let maxTumble = 0;

  const start = opts.initial ?? { xM: 0, yM: R_EARTH_M, vxMS: omega * R_EARTH_M, vyMS: 0 };
  let t = 0;
  let s: State = [start.xM, start.yM, start.vxMS, start.vyMS, massOf(vehicle, cfg)];
  const onPad = !opts.initial;

  const samples: Sample[] = [];
  const events: FlightEvent[] = [];
  let outcome: Outcome | null = null;
  let endTime = maxTime;
  let lastSampleT = -Infinity;
  let maxQ = 0;
  let maxQT = 0;
  let maxQAlt = 0;
  let maxG = 0;

  const event = (type: FlightEvent['type'], label: string) =>
    events.push({ tS: t, type, label, stageIndex: cfg.stageIndex });

  const atmo = (altM: number): AtmosphereState => (useAtmosphere ? atmosphere(altM) : VACUUM);

  // ---------- forces ----------

  const boosters = () => vehicle.stages[cfg.stageIndex]?.boosters;

  /** Share of a stage's engines still running after faults. */
  const working = (i: number) => {
    const n = vehicle.stages[i]?.engines.reduce((a, g) => a + g.count, 0) ?? 0;
    return n > 0 ? Math.max(0, (n - cfg.enginesOut[i]) / n) : 0;
  };
  /** Propellant the ascent may burn: the landing reserve stays in the tank. */
  const usable = (i: number) => Math.max(0, cfg.stagePropKg[i] - vehicle.stages[i].landingReserveKg);

  function throttleFor(qPa: number): number {
    const mq = mission.maxQThrottle;
    if (!mq || qPa < mq.aboveQPa) return 1;
    const stage = vehicle.stages[cfg.stageIndex];
    return Math.max(stage?.throttleMin ?? 1, Math.min(1, mq.throttle));
  }

  /** Liquid-stage mass flow (constant over a step for a given throttle). */
  function stageMassFlow(throttle: number): number {
    const stage = vehicle.stages[cfg.stageIndex];
    if (!stage || !cfg.engineOn || usable(cfg.stageIndex) <= 0) return 0;
    let mdot = 0;
    for (const g of stage.engines)
      mdot += (g.count * throttle * g.engine.thrustVacuumN) / (g.engine.ispVacuumS * G0_MS2);
    return mdot * working(cfg.stageIndex);
  }

  function propulsion(pressurePa: number, throttle: number, boosterTimeS: number) {
    let thrustN = 0;
    let mdot = 0;
    const stage = vehicle.stages[cfg.stageIndex];
    if (stage && cfg.engineOn && usable(cfg.stageIndex) > 0) {
      const w = working(cfg.stageIndex);
      for (const g of stage.engines) {
        const fVac = throttle * g.engine.thrustVacuumN;
        thrustN += w * g.count * Math.max(0, fVac - pressurePa * g.exitAreaM2);
        mdot += (w * g.count * fVac) / (g.engine.ispVacuumS * G0_MS2);
      }
    }
    const b = boosters();
    if (b && cfg.boostersAttached && boosterTimeS < b.booster.burnTimeS) {
      const fVac = b.vacuumThrustAt(boosterTimeS / b.booster.burnTimeS);
      thrustN += b.count * Math.max(0, fVac - pressurePa * b.booster.nozzleExitAreaM2);
      mdot += (b.count * fVac) / (b.booster.ispVacuumS * G0_MS2);
    }
    return { thrustN, mdot };
  }

  function airVelocity(st: State): [number, number] {
    // Air co-rotates with the Earth: v_air = v - omega x r (clockwise rotation).
    return [st[2] - omega * st[1], st[3] + omega * st[0]];
  }

  /** Most turning push the engines (by swivelling) and thrusters can give, about the centre of mass. */
  function steeringMomentNm(pressurePa: number, throttle: number, comM: number, lengthM: number, massKg: number) {
    let moment = RCS_FRACTION * massKg * G0_MS2 * lengthM;
    const stage = vehicle.stages[cfg.stageIndex];
    if (stage && cfg.engineOn && usable(cfg.stageIndex) > 0) {
      const w = working(cfg.stageIndex);
      for (const g of stage.engines) {
        const f = w * g.count * Math.max(0, throttle * g.engine.thrustVacuumN - pressurePa * g.exitAreaM2);
        moment += f * Math.sin(g.gimbalRad) * Math.max(0, comM - stage.bottomM);
      }
    }
    const b = boosters();
    if (b && cfg.boostersAttached && cfg.boosterElapsedS < b.booster.burnTimeS) {
      const f = b.count * Math.max(0, b.vacuumThrustAt(cfg.boosterElapsedS / b.booster.burnTimeS) - pressurePa * b.booster.nozzleExitAreaM2);
      moment += f * Math.sin(b.gimbalRad) * Math.max(0, comM - (stage?.bottomM ?? 0));
    }
    return moment;
  }

  function stackState() {
    const b = boosters();
    return {
      stageIndex: cfg.stageIndex,
      boostersAttached: cfg.boostersAttached && !!b,
      boosterPropFraction: b ? 1 - b.propellantUsedAt(cfg.boosterElapsedS / b.booster.burnTimeS) : 0,
      stagePropKg: cfg.stagePropKg,
      jettisoned: cfg.jettisoned,
    };
  }

  /** Angle of attack (with the design gust) and how close the air is to flipping the rocket. */
  function tumbleCheck(st: State, u: [number, number], throttle: number) {
    const alt = Math.hypot(st[0], st[1]) - R_EARTH_M;
    const a = atmo(alt);
    const [vax, vay] = airVelocity(st);
    const vAir = Math.hypot(vax, vay);
    if (vAir < 30 || a.densityKgM3 <= 0) return { aoaRad: 0, ratio: 0 };
    const cosA = clamp((u[0] * vax + u[1] * vay) / vAir, -1, 1);
    const aoaRad = Math.acos(cosA) + Math.atan(DESIGN_GUST_MS / vAir);
    const q = 0.5 * a.densityKgM3 * vAir * vAir;
    const stab = stability(vehicle, stackState(), vAir / a.speedOfSoundMS, aoaRad);
    const twist = aeroMomentNm(stab, q, aoaRad);
    if (twist <= 0) return { aoaRad, ratio: 0 };
    return { aoaRad, ratio: twist / steeringMomentNm(a.pressurePa, throttle, stab.comM, stab.lengthM, st[4]) };
  }

  // ---------- guidance ----------

  /** Burn time needed for a given delta-v, walking up through the remaining stages. */
  function timeToGo(dvMS: number, massKg: number): number {
    let tgo = 0;
    let m = massKg;
    for (let i = cfg.stageIndex; i < vehicle.stages.length && dvMS > 0; i++) {
      const stage = vehicle.stages[i];
      if (i > cfg.stageIndex) m = massOf(vehicle, { ...cfg, stageIndex: i, boostersAttached: false });
      let thrust = 0;
      let mdot = 0;
      for (const g of stage.engines) {
        thrust += working(i) * g.count * g.engine.thrustVacuumN;
        mdot += (working(i) * g.count * g.engine.thrustVacuumN) / (g.engine.ispVacuumS * G0_MS2);
      }
      const prop = usable(i);
      if (mdot <= 0 || prop <= 0) continue;
      const ve = thrust / mdot;
      const stageDv = ve * Math.log(m / (m - prop));
      if (dvMS <= stageDv) return tgo + (m / mdot) * (1 - Math.exp(-dvMS / ve));
      tgo += prop / mdot;
      dvMS -= stageDv;
    }
    return tgo + dvMS / 5; // out of stages: anything large
  }

  function attitude(st: State, thrustN: number): [number, number] {
    if (opts.fixedAttitude) return [opts.fixedAttitude.x, opts.fixedAttitude.y];
    const r = Math.hypot(st[0], st[1]);
    const up: [number, number] = [st[0] / r, st[1] / r];
    const east: [number, number] = [up[1], -up[0]];
    const [vax, vay] = airVelocity(st);
    const vAir = Math.hypot(vax, vay);
    const kick = (mission.pitchKick.angleDeg * Math.PI) / 180;
    const kickStart = mission.pitchKick.timeS;

    if (!cfg.engineOn && !(boosters() && cfg.boostersAttached)) {
      // Coasting: point along the direction of travel.
      const speed = Math.hypot(st[2], st[3]);
      return vAir > 1 ? [vax / vAir, vay / vAir] : [st[2] / speed, st[3] / speed];
    }

    if (cfg.guidanceActive) {
      // Closed-loop ascent. Estimate the time left until orbital speed (tgo), then pick
      // the vertical acceleration (linear in time) that arrives at the target altitude
      // with zero vertical speed at tgo. The rest of the thrust goes into horizontal speed.
      const alt = r - R_EARTH_M;
      const vr = st[2] * up[0] + st[3] * up[1];
      const vt = st[2] * east[0] + st[3] * east[1];
      const vCirc = Math.sqrt(MU_EARTH_M3S2 / (R_EARTH_M + mission.targetOrbitAltitudeM));
      const tgo = Math.max(15, timeToGo(Math.max(0, vCirc - vt), st[4]));
      const dh = mission.targetOrbitAltitudeM - alt;
      const a0 = (6 * dh - 4 * vr * tgo) / (tgo * tgo);
      const gEff = MU_EARTH_M3S2 / (r * r) - (vt * vt) / r;
      const arCmd = a0 + gEff;
      const aThrust = thrustN / st[4];
      const sinPitch = aThrust > 0 ? clamp(arCmd / aThrust, -0.5, 0.9) : 0;
      const cosPitch = Math.sqrt(1 - sinPitch * sinPitch);
      const cmd: [number, number] = [up[0] * sinPitch + east[0] * cosPitch, up[1] * sinPitch + east[1] * cosPitch];
      // While the air is still thick, don't swing the nose far from the airflow.
      const q = 0.5 * atmo(alt).densityKgM3 * vAir * vAir;
      if (vAir < 1 || q * Math.PI <= Q_ALPHA_LIMIT) return cmd;
      const velAng = Math.atan2(vay, vax);
      const diff = wrapAngle(Math.atan2(cmd[1], cmd[0]) - velAng);
      const maxA = Q_ALPHA_LIMIT / q;
      if (Math.abs(diff) <= maxA) return cmd;
      const ang = velAng + Math.sign(diff) * maxA;
      return [Math.cos(ang), Math.sin(ang)];
    }

    if (t < kickStart) return up;

    // Velocity angle from vertical, measured toward east.
    const velAngle = vAir > 1 ? Math.atan2(vax * east[0] + vay * east[1], vax * up[0] + vay * up[1]) : 0;
    if (!cfg.kickDone && t >= kickStart + KICK_RAMP_S && velAngle >= kick) cfg.kickDone = true;
    if (!cfg.kickDone) {
      // Hold the kick attitude until the velocity vector tips over to match it.
      const a = kick * Math.min(1, (t - kickStart) / KICK_RAMP_S);
      return [up[0] * Math.cos(a) + east[0] * Math.sin(a), up[1] * Math.cos(a) + east[1] * Math.sin(a)];
    }
    // Gravity turn: zero angle of attack.
    return [vax / vAir, vay / vAir];
  }

  // ---------- one integration step (pure w.r.t. cfg) ----------

  function step(st: State, dt: number) {
    const alt0 = Math.hypot(st[0], st[1]) - R_EARTH_M;
    const a0 = atmo(alt0);
    const [vax0, vay0] = airVelocity(st);
    const q0 = 0.5 * a0.densityKgM3 * (vax0 * vax0 + vay0 * vay0);
    const throttle = throttleFor(q0);
    const prop0 = propulsion(a0.pressurePa, throttle, cfg.boosterElapsedS);
    const u = attitude(st, prop0.thrustN);
    const area = frontalAreaM2(vehicle, cfg.stageIndex, cfg.boostersAttached);

    const deriv = (x: State, tOff: number): State => {
      const r = Math.hypot(x[0], x[1]);
      const a = atmo(r - R_EARTH_M);
      const { thrustN, mdot } = propulsion(a.pressurePa, throttle, cfg.boosterElapsedS + tOff);
      const [vax, vay] = airVelocity(x);
      const vAir = Math.hypot(vax, vay);
      let dx = 0;
      let dy = 0;
      if (vAir > 0 && a.densityKgM3 > 0) {
        const mach = vAir / a.speedOfSoundMS;
        const drag = 0.5 * a.densityKgM3 * vAir * vAir * dragCoefficient(mach) * area;
        dx = (-drag * vax) / vAir;
        dy = (-drag * vay) / vAir;
      }
      const g = useGravity ? MU_EARTH_M3S2 / (r * r * r) : 0;
      return [
        x[2],
        x[3],
        (thrustN * u[0] + dx) / x[4] - g * x[0],
        (thrustN * u[1] + dy) / x[4] - g * x[1],
        -mdot,
      ];
    };

    const next = rk4Step(st, dt, deriv);
    const stageUsed = stageMassFlow(throttle) * dt;
    return { next, stageUsed, throttle, u };
  }

  // ---------- liftoff check ----------

  {
    const a = atmo(0);
    const { thrustN } = propulsion(a.pressurePa, 1, 0);
    const weightN = s[4] * (MU_EARTH_M3S2 / (R_EARTH_M * R_EARTH_M) - omega * omega * R_EARTH_M);
    event('ignition', 'Ignition');
    if (onPad && thrustN <= weightN) {
      outcome = {
        success: false,
        failure: {
          type: 'noLiftoff',
          tS: 0,
          detail: { thrustN, weightN, thrustToWeight: thrustN / weightN },
        },
        remainingPropellantKg: 0,
        remainingDeltaVMS: 0,
      };
      event('failure', "Won't lift off");
      endTime = 6;
    } else if (onPad) {
      event('liftoff', 'Liftoff');
    }
  }
  const liftoffMassKg = s[4];
  const liftoffThrustN = propulsion(atmo(0).pressurePa, 1, 0).thrustN;
  const liftedOff = !outcome;
  let kickLogged = false;

  // ---------- main loop ----------

  const record = (u: [number, number], throttle: number) => {
    const tc = liftedOff || !onPad ? tumbleCheck(s, u, throttle) : { aoaRad: 0, ratio: 0 };
    const r = Math.hypot(s[0], s[1]);
    const alt = r - R_EARTH_M;
    const a = atmo(alt);
    const [vax, vay] = airVelocity(s);
    const vAir = Math.hypot(vax, vay);
    const q = 0.5 * a.densityKgM3 * vAir * vAir;
    const { thrustN } = propulsion(a.pressurePa, throttle, cfg.boosterElapsedS);
    const area = frontalAreaM2(vehicle, cfg.stageIndex, cfg.boostersAttached);
    const dragN = q * dragCoefficient(vAir / a.speedOfSoundMS) * area;
    // Sensed acceleration (what the crew feels): thrust and drag, not gravity.
    const fx = thrustN * u[0] - (vAir > 0 ? (dragN * vax) / vAir : 0);
    const fy = thrustN * u[1] - (vAir > 0 ? (dragN * vay) / vAir : 0);
    const gLoad = liftedOff || !onPad ? Math.hypot(fx, fy) / s[4] / G0_MS2 : 1;
    const orbit = orbitElements(s[0], s[1], s[2], s[3]);
    // Downrange: angle travelled relative to the rotating launch site.
    const siteAngle = Math.PI / 2 - omega * t;
    const angle = Math.atan2(s[1], s[0]);
    const b = boosters();
    samples.push({
      tS: t,
      xM: s[0],
      yM: s[1],
      vxMS: s[2],
      vyMS: s[3],
      ux: u[0],
      uy: u[1],
      altitudeM: alt,
      downrangeM: wrapAngle(siteAngle - angle) * R_EARTH_M,
      speedMS: Math.hypot(s[2], s[3]),
      airSpeedMS: vAir,
      mach: vAir / a.speedOfSoundMS,
      dynamicPressurePa: q,
      gLoad,
      massKg: s[4],
      thrustN,
      throttle,
      stageIndex: cfg.stageIndex,
      boostersAttached: cfg.boostersAttached && !!b,
      propellantFraction: [
        ...vehicle.stages.map((st, i) =>
          st.propellantCapacityKg > 0 ? cfg.stagePropKg[i] / st.propellantCapacityKg : 0,
        ),
        b && cfg.boostersAttached
          ? 1 - b.propellantUsedAt(cfg.boosterElapsedS / b.booster.burnTimeS)
          : vehicle.stages.some((st) => st.boosters)
            ? 0
            : -1,
      ],
      perigeeAltM: orbit.perigeeAltM,
      apogeeAltM: orbit.apogeeAltM,
      aoaDeg: (tc.aoaRad * 180) / Math.PI,
      tumbleRatio: tc.ratio,
    });
    lastSampleT = t;
    if (q > maxQ) {
      maxQ = q;
      maxQT = t;
      maxQAlt = alt;
    }
    if (gLoad > maxG) maxG = gLoad;
  };

  const fail = (failure: Failure, label: string, coastS: number) => {
    outcome = { success: false, failure, remainingPropellantKg: 0, remainingDeltaVMS: 0 };
    event('failure', label);
    endTime = Math.min(endTime, t + coastS);
  };

  const succeed = () => {
    const o = orbitElements(s[0], s[1], s[2], s[3]);
    const remaining = cfg.stagePropKg[cfg.stageIndex] ?? 0;
    outcome = {
      success: true,
      orbit: { perigeeAltM: o.perigeeAltM, apogeeAltM: o.apogeeAltM },
      remainingPropellantKg: remaining,
      remainingDeltaVMS: remainingDeltaV(vehicle, cfg),
    };
    event('orbit', `Orbit ${(o.perigeeAltM / 1000).toFixed(0)} × ${(o.apogeeAltM / 1000).toFixed(0)} km`);
    endTime = Math.min(maxTime, t + (opts.coastAfterOrbitS ?? COAST_AFTER_ORBIT_S));
  };

  function systemCheck(system: SystemName, tS: number): ChecklistItem {
    if (system === 'engines') {
      const out = cfg.enginesOut.map((n, i) => ({ n, i })).filter((x) => x.n > 0);
      if (out.length)
        return {
          system,
          tS,
          status: 'fault',
          note: out.map((x) => `${x.n} ${vehicle.stages[x.i].name} engine${x.n > 1 ? 's' : ''} failed; the others burned longer to make up for it`).join('. '),
        };
      return { system, tS, status: 'go', note: 'All engines ran normally' };
    }
    if (system === 'tanks') {
      const leak = faults.find((f) => f.kind === 'leak');
      if (leak && leak.kind === 'leak' && outcome?.success) {
        const top = cfg.stageIndex;
        const lostKg = cfg.stagePropKg[top] * leak.fraction;
        const before = outcome.remainingDeltaVMS;
        cfg.stagePropKg[top] -= lostKg;
        outcome.remainingPropellantKg = cfg.stagePropKg[top];
        outcome.remainingDeltaVMS = remainingDeltaV(vehicle, cfg);
        return {
          system,
          tS,
          status: 'fault',
          note: `Leak! Lost ${(lostKg / 1000).toFixed(1)} t of propellant (${(before - outcome.remainingDeltaVMS).toFixed(0)} m/s of delta-v)`,
        };
      }
      return { system, tS, status: 'go', note: 'Pressures normal, no leaks' };
    }
    const glitch = faults.find((f) => f.kind === 'glitch' && f.system === system);
    if (glitch)
      return {
        system,
        tS,
        status: 'fault',
        note: { power: 'Battery bus dropped out; switched to the backup', guidance: 'Navigation computer froze; rebooted', comms: 'Lost signal; switched to the backup antenna' }[system as 'power' | 'guidance' | 'comms'],
        clearedTS: tS + GLITCH_RESET_S,
      };
    return { system, tS, status: 'go', note: { power: 'Batteries and solar normal', guidance: 'Navigation locked on', comms: 'Loud and clear' }[system as 'power' | 'guidance' | 'comms'] };
  }

  record(attitude(s, 0), 1);

  while (t < endTime - 1e-9) {
    if (!liftedOff) {
      // Sitting on the pad, turning with the Earth.
      t = Math.min(endTime, t + SAMPLE_POWERED_S);
      const theta = Math.PI / 2 - omega * t;
      s = [R_EARTH_M * Math.cos(theta), R_EARTH_M * Math.sin(theta), 0, 0, s[4]];
      s[2] = omega * s[1];
      s[3] = -omega * s[0];
      record([Math.cos(theta), Math.sin(theta)], 1);
      continue;
    }

    const powered = cfg.engineOn || (cfg.boostersAttached && !!boosters());
    const alt = Math.hypot(s[0], s[1]) - R_EARTH_M;
    let dt = powered || alt < 100e3 ? baseDt : 0.5;

    // Land exactly on burnout and jettison events.
    const thr = throttleFor(0);
    const mdot = stageMassFlow(thr);
    if (mdot > 0) dt = Math.min(dt, usable(cfg.stageIndex) / mdot);
    const b = boosters();
    if (b && cfg.boostersAttached) dt = Math.min(dt, b.booster.burnTimeS - cfg.boosterElapsedS);
    if (cfg.firstStagingTimeS !== null) {
      vehicle.jettisonables.forEach((j, i) => {
        const tj = cfg.firstStagingTimeS! + j.afterFirstStagingS;
        if (!cfg.jettisoned[i] && tj > t) dt = Math.min(dt, tj - t);
      });
    }
    dt = Math.min(dt, endTime - t);
    dt = Math.max(dt, 1e-6);

    let { next, stageUsed, throttle, u } = step(s, dt);

    // Refine steps that cross orbit cutoff or the ground.
    const crossesCutoff = (st: State) =>
      cfg.engineOn && !outcome && orbitElements(st[0], st[1], st[2], st[3]).perigeeAltM >= cutoffPerigeeM;
    const crossesGround = (st: State) => Math.hypot(st[0], st[1]) < R_EARTH_M && t > 1;
    if ((crossesCutoff(next) && !opts.fixedAttitude) || crossesGround(next)) {
      const test = crossesGround(next) ? crossesGround : crossesCutoff;
      let lo = 0;
      let hi = dt;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (test(step(s, mid).next)) hi = mid;
        else lo = mid;
      }
      dt = hi;
      ({ next, stageUsed, throttle, u } = step(s, dt));
    }

    // Commit.
    s = next;
    t += dt;
    const reserveKg = vehicle.stages[cfg.stageIndex]?.landingReserveKg ?? 0;
    if (cfg.engineOn) cfg.stagePropKg[cfg.stageIndex] = Math.max(reserveKg, cfg.stagePropKg[cfg.stageIndex] - stageUsed);
    if (usable(cfg.stageIndex) < 1e-6) cfg.stagePropKg[cfg.stageIndex] = reserveKg;
    if (b && cfg.boostersAttached) cfg.boosterElapsedS += dt;

    const r = Math.hypot(s[0], s[1]);
    const altNow = r - R_EARTH_M;
    const a = atmo(altNow);
    const [vax, vay] = airVelocity(s);
    const q = 0.5 * a.densityKgM3 * (vax * vax + vay * vay);

    if (!kickLogged && t >= mission.pitchKick.timeS && onPad) {
      kickLogged = true;
      event('pitchKick', `Pitch kick ${mission.pitchKick.angleDeg}°`);
    }

    // ---- events ----
    const separate = (kind: Separation['kind']) =>
      separations.push({
        kind,
        stageIndex: cfg.stageIndex,
        tS: t,
        xM: s[0],
        yM: s[1],
        vxMS: s[2],
        vyMS: s[3],
        propellantKg: kind === 'stage' ? cfg.stagePropKg[cfg.stageIndex] : 0,
      });

    faults.forEach((f, i) => {
      if (faultApplied[i] || f.kind !== 'engineOut' || f.stageIndex !== cfg.stageIndex || !cfg.engineOn || outcome) return;
      if (t < cfg.stageIgnitionS[f.stageIndex] + f.afterIgnitionS) return;
      faultApplied[i] = true;
      const stage = vehicle.stages[f.stageIndex];
      const n = stage.engines.reduce((a, g) => a + g.count, 0);
      const lost = Math.min(n - cfg.enginesOut[f.stageIndex], f.engines);
      cfg.enginesOut[f.stageIndex] += lost;
      event('engineOut', lost >= n ? `${stage.name}: all engines out!` : `${stage.name}: ${lost} of ${n} engines out`);
    });

    if (b && cfg.boostersAttached && cfg.boosterElapsedS >= b.booster.burnTimeS - 1e-9) {
      cfg.boostersAttached = false;
      separate('boosters');
      event('boosterSeparation', 'Booster separation');
    }

    const boostersBurning = !!b && cfg.boostersAttached;
    const stageDead = working(cfg.stageIndex) === 0 && !boostersBurning;
    if (cfg.engineOn && (usable(cfg.stageIndex) <= 0 || stageDead)) {
      const stage = vehicle.stages[cfg.stageIndex];
      event('stageBurnout', stageDead && usable(cfg.stageIndex) > 0 ? `${stage.name} engines dead: staging early` : `${stage.name} burnout`);
      if (cfg.stageIndex < vehicle.stages.length - 1) {
        if (cfg.boostersAttached && b) separate('boosters');
        separate('stage');
        cfg.stageIndex++;
        cfg.stageIgnitionS[cfg.stageIndex] = t;
        cfg.boostersAttached = !!vehicle.stages[cfg.stageIndex].boosters;
        cfg.boosterElapsedS = 0;
        if (cfg.firstStagingTimeS === null) cfg.firstStagingTimeS = t;
        event('staging', `${vehicle.stages[cfg.stageIndex].name} ignition`);
      } else {
        cfg.engineOn = false;
        if (!outcome) {
          const o = orbitElements(s[0], s[1], s[2], s[3]);
          if (o.perigeeAltM >= SUCCESS_PERIGEE_ALT_M) succeed();
          else
            fail(
              {
                type: 'outOfFuel',
                tS: t,
                detail: {
                  altitudeM: altNow,
                  speedMS: Math.hypot(s[2], s[3]),
                  perigeeAltM: o.perigeeAltM,
                  apogeeAltM: o.apogeeAltM,
                  orbitSpeedNeededMS: Math.sqrt(MU_EARTH_M3S2 / r),
                },
              },
              'Out of fuel',
              maxTime,
            );
        }
      }
    }

    if (cfg.firstStagingTimeS !== null) {
      vehicle.jettisonables.forEach((j, i) => {
        if (!cfg.jettisoned[i] && t >= cfg.firstStagingTimeS! + j.afterFirstStagingS - 1e-9) {
          cfg.jettisoned[i] = true;
          event('jettison', `${j.name} jettison`);
        }
      });
    }

    if (!cfg.guidanceActive && (cfg.stageIndex >= 1 || (altNow > 45e3 && q < 1500))) {
      cfg.guidanceActive = true;
    }

    if (cfg.engineOn && !outcome && !opts.fixedAttitude && crossesCutoff(s)) {
      cfg.engineOn = false;
      event('engineCutoff', `${vehicle.stages[cfg.stageIndex].name} cutoff`);
      succeed();
    }

    // Structural limit.
    if (!outcome) {
      const limit = structuralLimit(vehicle, cfg);
      if (q > limit) {
        fail(
          {
            type: 'breakup',
            tS: t,
            detail: {
              dynamicPressurePa: q,
              limitPa: limit,
              altitudeM: altNow,
              mach: Math.hypot(vax, vay) / a.speedOfSoundMS,
            },
          },
          'Structural breakup',
          POST_FAILURE_COAST_S,
        );
      }
    }

    // Tumbling: the air twists the rocket harder than the steering can hold, for a moment.
    if (!outcome) {
      const tc = tumbleCheck(s, u, throttle);
      maxTumble = Math.max(maxTumble, tc.ratio);
      tumbleTimer = tc.ratio > 1 ? tumbleTimer + dt : 0;
      if (tumbleTimer >= TUMBLE_HOLD_S) {
        const stab = stability(vehicle, stackState(), Math.hypot(vax, vay) / a.speedOfSoundMS, tc.aoaRad);
        fail(
          {
            type: 'tumble',
            tS: t,
            detail: {
              ratio: tc.ratio,
              aoaDeg: (tc.aoaRad * 180) / Math.PI,
              dynamicPressurePa: q,
              altitudeM: altNow,
              comM: stab.comM - stab.baseM,
              copM: stab.copM - stab.baseM,
              enginesRunning: cfg.engineOn ? 1 : 0,
              stageIndex: cfg.stageIndex,
            },
          },
          'Tumbled out of control',
          POST_FAILURE_COAST_S,
        );
      }
    }

    // Systems check while coasting in orbit.
    if (outcome?.success && checksDone < CHECK_ORDER.length) {
      const orbitT = events.find((e) => e.type === 'orbit')!.tS;
      const due = orbitT + CHECK_START_S + checksDone * CHECK_EVERY_S;
      if (t >= due) {
        const item = systemCheck(CHECK_ORDER[checksDone], due);
        checklist.push(item);
        events.push({ tS: t, type: 'systemCheck', label: `${item.system[0].toUpperCase()}${item.system.slice(1)}: ${item.status === 'go' ? 'GO' : 'FAULT'}`, stageIndex: cfg.stageIndex });
        checksDone++;
      }
    }

    // Mass bookkeeping is authoritative: whatever is still attached, with what is left in it.
    s[4] = massOf(vehicle, cfg);

    const ground = r <= R_EARTH_M + 0.01 && t > 1;
    const sampleEvery = powered || altNow < 100e3 ? SAMPLE_POWERED_S : SAMPLE_COAST_S;
    const lastEvent = events[events.length - 1];
    if (t - lastSampleT >= sampleEvery - 1e-9 || ground || (lastEvent && lastEvent.tS === t)) {
      record(u, throttle);
    }

    if (ground) {
      event('impact', 'Impact');
      if (!outcome)
        fail({ type: 'crash', tS: t, detail: { timeS: t } }, 'Crashed', 0);
      break;
    }
  }

  if (!outcome) {
    // Ran out of simulation time while still flying: judge the orbit as it stands.
    const o = orbitElements(s[0], s[1], s[2], s[3]);
    if (o.perigeeAltM >= SUCCESS_PERIGEE_ALT_M) succeed();
    else
      fail(
        {
          type: 'outOfFuel',
          tS: t,
          detail: { perigeeAltM: o.perigeeAltM, apogeeAltM: o.apogeeAltM },
        },
        'Did not reach orbit',
        0,
      );
  }

  // A failure after an engine-out fault is the fault's doing.
  const o = outcome as Outcome | null;
  const outEvent = events.find((e) => e.type === 'engineOut');
  if (o?.failure && outEvent && (o.failure.type === 'outOfFuel' || o.failure.type === 'crash')) {
    o.failure = { type: 'engineFailure', tS: o.failure.tS, detail: { ...o.failure.detail, faultTimeS: outEvent.tS, fault: outEvent.label, stageIndex: outEvent.stageIndex } };
  }

  if (maxQ > 0 && liftedOff) {
    events.push({ tS: maxQT, type: 'maxQ', label: 'Max-Q', stageIndex: 0 });
    events.sort((a, b) => a.tS - b.tS);
  }

  return {
    rocketName: spec.name,
    samples,
    events,
    outcome: outcome!,
    summary: {
      liftoffMassKg,
      liftoffThrustN,
      liftoffTWR:
        liftoffThrustN /
        (liftoffMassKg * (MU_EARTH_M3S2 / (R_EARTH_M * R_EARTH_M) - omega * omega * R_EARTH_M)),
      maxQPa: maxQ,
      maxQTimeS: maxQT,
      maxQAltitudeM: maxQAlt,
      maxGLoad: maxG,
      maxTumbleRatio: maxTumble,
      staticMarginCalibers: (() => {
        const st = stability(vehicle, { stageIndex: 0, boostersAttached: true, boosterPropFraction: 1, stagePropKg: vehicle.stages.map((x) => x.propellantKg), jettisoned: vehicle.jettisonables.map(() => false) }, 0.5, 0.03);
        return (st.comM - st.copM) / vehicle.maxDiameterM;
      })(),
      structuralLimitPa: structuralLimit(vehicle, {
        ...cfg,
        stageIndex: 0,
        boostersAttached: true,
      }),
    },
    durationS: t,
    separations,
    faults,
    checklist,
  };
}

// ---------- helpers ----------

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function wrapAngle(a: number) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function massOf(vehicle: Vehicle, cfg: Config): number {
  let m = vehicle.payloadMassKg;
  vehicle.jettisonables.forEach((j, i) => {
    if (!cfg.jettisoned[i]) m += j.massKg;
  });
  for (let i = cfg.stageIndex; i < vehicle.stages.length; i++) {
    m += vehicle.stages[i].dryMassKg + cfg.stagePropKg[i];
  }
  const b = vehicle.stages[cfg.stageIndex]?.boosters;
  if (b && cfg.boostersAttached) {
    const used = b.propellantUsedAt(cfg.boosterElapsedS / b.booster.burnTimeS);
    m += b.count * (b.booster.massKg + b.booster.propellantKg * (1 - used));
  }
  return m;
}

function structuralLimit(vehicle: Vehicle, cfg: Config): number {
  let limit = vehicle.payloadMaxDynamicPressurePa;
  for (let i = cfg.stageIndex; i < vehicle.stages.length; i++) {
    limit = Math.min(limit, vehicle.stages[i].maxDynamicPressurePa);
  }
  return limit;
}

/** Vacuum delta-v left in the current stage (and any above it). */
function remainingDeltaV(vehicle: Vehicle, cfg: Config): number {
  let dv = 0;
  for (let i = cfg.stageIndex; i < vehicle.stages.length; i++) {
    const c = { ...cfg, stageIndex: i, boostersAttached: false };
    const m0 = massOf(vehicle, c);
    const prop = cfg.stagePropKg[i] - vehicle.stages[i].landingReserveKg;
    const stage = vehicle.stages[i];
    if (!stage.engines.length || prop <= 0) continue;
    let thrust = 0;
    let mdot = 0;
    for (const g of stage.engines) {
      thrust += g.count * g.engine.thrustVacuumN;
      mdot += (g.count * g.engine.thrustVacuumN) / (g.engine.ispVacuumS * G0_MS2);
    }
    dv += (thrust / mdot) * Math.log(m0 / (m0 - prop));
  }
  return dv;
}

// Re-exported so the mass bookkeeping can be tested directly.
export const _internal = { massOf };
