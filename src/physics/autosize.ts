// "Make it reach the Moon": load each stage with just enough propellant to reach orbit
// with the trans-lunar delta-v still in the tanks. Every candidate is actually flown,
// so gravity and drag losses are counted, not just the rocket equation.
// If a stage is set to land, first find how much fuel it must hold back to land.

import { tliNeededMS } from './moon';
import { GEO_ALTITUDE_M, goesToMoon, hohmann } from './raise';
import { setFill, setRecovery, stageFill } from './edit';
import { flyMission } from './mission';
import type { Catalog, FailureType, RocketSpec } from './types';
import { buildVehicle } from './vehicle';

export interface AutoSizeResult {
  ok: boolean;
  /** The sized rocket (may differ from the input even when ok is false: the landing fuel is set). */
  spec: RocketSpec;
  message: string;
  flightsTried: number;
}

/** Landing fuel is searched up to this share of the stage's load. */
const MAX_RESERVE_SHARE = 0.6;
const RESERVE_MARGIN = 1.08;
const RESERVE_STEPS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.45, MAX_RESERVE_SHARE];

const SEARCH_DT_S = 0.1;

const FAILURE_WORDS: Record<FailureType, string> = {
  noLiftoff: "it's too heavy to lift off",
  outOfFuel: 'it runs out of fuel before orbit',
  breakup: 'it breaks apart at max-Q',
  crash: 'it falls back to Earth',
  tumble: 'it tumbles out of control',
  engineFailure: 'an engine fails',
};
const MARGIN = 0.02;

export function autoSize(input: RocketSpec, catalog: Catalog): AutoSizeResult {
  let flights = 0;
  let spec = input;
  const n = spec.stages.length;
  const landIdx = spec.stages.findIndex((s) => s.recovery === 'propulsive');
  // Orbit-only flights just need to get there; Moon flights need the push toward the Moon left over.
  const target = spec.mission.target;
  const toMoon = goesToMoon(target);
  const raise = target === 'highOrbit' ? hohmann(spec.mission.targetOrbitAltitudeM, spec.mission.highOrbitAltitudeM ?? GEO_ALTITUDE_M) : undefined;
  const tliMS = toMoon ? tliNeededMS(spec.mission.targetOrbitAltitudeM) : raise ? Math.ceil(raise.dv1 + raise.dv2) : 0;
  const needDv = tliMS * (1 + MARGIN);
  const goal = toMoon ? 'the Moon' : raise ? 'the high orbit' : 'orbit';
  const withFills = (fills: number[]) => fills.reduce((s, f, i) => setFill(s, catalog, i, f), spec);
  const landed = (m: ReturnType<typeof flyMission>) =>
    landIdx < 0 || m.recoveries.some((r) => r.kind === 'stage' && r.stageIndex === landIdx && r.outcome === 'landed');
  const reaches = (s: RocketSpec, dtS = SEARCH_DT_S) => {
    flights++;
    const m = flyMission(s, catalog, { dtS });
    const o = m.ascent.outcome;
    return { ok: o.success && o.remainingDeltaVMS >= needDv && landed(m), r: m.ascent, m };
  };

  // Landing first: the least fuel that still brings the stage down softly with full tanks.
  let landingNote = '';
  if (landIdx >= 0) {
    const fullSpec = withFills(Array(n).fill(1));
    const loadKg = buildVehicle(fullSpec, catalog).stages[landIdx].propellantKg;
    const lands = (kg: number) => {
      flights++;
      const m = flyMission(setRecovery(fullSpec, landIdx, 'propulsive', kg), catalog, { dtS: SEARCH_DT_S });
      return m.ascent.outcome.success && landed(m);
    };
    // Too much reserve and the rocket never reaches orbit, so step up to the first that works.
    let lo = 0;
    let hi = -1;
    for (const share of RESERVE_STEPS) {
      if (lands(loadKg * share)) {
        hi = loadKg * share;
        break;
      }
      lo = loadKg * share;
    }
    if (hi < 0)
      return {
        ok: false,
        spec,
        message: `Can't land ${spec.stages[landIdx].name}: even holding back ${((loadKg * MAX_RESERVE_SHARE) / 1000).toFixed(0)} t of fuel isn't enough. It comes back too fast.`,
        flightsTried: flights,
      };
    for (let k = 0; k < 6; k++) {
      const mid = (lo + hi) / 2;
      if (lands(mid)) hi = mid;
      else lo = mid;
    }
    spec = setRecovery(spec, landIdx, 'propulsive', hi * RESERVE_MARGIN);
    landingNote = `${spec.stages[landIdx].name} holds back ${((hi * RESERVE_MARGIN) / 1000).toFixed(0)} t to land. `;
  }

  const full = reaches(withFills(Array(n).fill(1)), 0.05);
  if (!full.ok) {
    const o = full.r.outcome;
    const landingCost = landIdx >= 0 && o.success;
    const why = o.success
      ? `full tanks reach orbit with ${o.remainingDeltaVMS.toFixed(0)} m/s left, but ${goal} needs about ${tliMS} m/s`
      : `even with full tanks ${FAILURE_WORDS[o.failure!.type]}`;
    return {
      ok: false,
      spec,
      message: landingCost && needDv > 0
        ? `${landingNote}That leaves ${o.remainingDeltaVMS.toFixed(0)} m/s for ${goal}, which needs about ${tliMS}. Make the top stage bigger, or don't land.`
        : `${landingNote}Can't reach ${goal} yet: ${why}. Try bigger tanks, more engines or another stage.`,
      flightsTried: flights,
    };
  }

  // One fill level for every stage, then trim each stage on its own.
  let lo = 0.05;
  let hi = 1;
  for (let k = 0; k < 8; k++) {
    const mid = (lo + hi) / 2;
    if (reaches(withFills(Array(n).fill(mid))).ok) hi = mid;
    else lo = mid;
  }
  const fills = Array(n).fill(hi);
  for (let i = 0; i < n; i++) {
    let a = 0.05;
    let b = fills[i];
    for (let k = 0; k < 6; k++) {
      const mid = (a + b) / 2;
      const trial = [...fills];
      trial[i] = mid;
      if (reaches(withFills(trial)).ok) b = mid;
      else a = mid;
    }
    fills[i] = b;
  }

  // Add a small margin and confirm at full simulation accuracy.
  for (let bump = MARGIN; bump <= 0.2; bump += 0.04) {
    const candidate = withFills(fills.map((f) => Math.min(1, f + bump)));
    if (reaches(candidate, 0.05).ok) {
      const pct = candidate.stages.map((_, i) => `${Math.round(stageFill(candidate, catalog, i) * 100)}%`).join(' / ');
      return { ok: true, spec: candidate, message: `${landingNote}Sized for ${goal}: tanks ${pct} full.`, flightsTried: flights };
    }
  }
  return { ok: true, spec: withFills(Array(n).fill(1)), message: `Full tanks are just enough for ${goal}.`, flightsTried: flights };
}
