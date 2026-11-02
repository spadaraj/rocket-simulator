// Fix suggestions: re-fly the whole mission with each candidate fix for the failure, and keep
// only the ones that actually get past it, smallest change first.

import {
  addStage,
  finScale,
  setBoosters,
  setEngine,
  setEngineCount,
  setFill,
  setFins,
  setHeatShield,
  setMission,
  setRecovery,
  setTank,
  stageEngine,
  stageFill,
  stageTank,
} from './edit';
import { failureRank, flyMission } from './mission';
import { DEFAULT_ENTRY_ANGLE_DEG } from './reentry';
import type { SimOptions } from './simulate';
import type { Catalog, Fault, MissionFailureType, RocketSpec } from './types';

export interface FixCandidate {
  id: string;
  /** Engineer-mode wording. */
  title: string;
  /** Roscoe-mode wording: short and simple. */
  roscoe: string;
  /** Rough size of the change; smaller is preferred. */
  cost: number;
  apply: (spec: RocketSpec) => RocketSpec | null;
}

export interface FixResult {
  id: string;
  title: string;
  roscoe: string;
  cost: number;
  spec: RocketSpec;
  perigeeAltM: number;
  apogeeAltM: number;
  remainingDeltaVMS: number;
  /** The whole mission works with this fix. */
  complete: boolean;
  /** Otherwise, the next thing that goes wrong. */
  nextProblem?: MissionFailureType;
}

export function fixCandidates(
  type: MissionFailureType,
  spec: RocketSpec,
  catalog: Catalog,
  detail: Record<string, number | string> = {},
): FixCandidate[] {
  const top = spec.stages.length - 1;
  const core = stageEngine(spec, catalog, 0);
  const coreCount = core?.ref.count ?? 1;
  const boosters = spec.stages[0]?.boosters;
  const kick = spec.mission.pitchKick;
  const throttleable = (core?.part.throttleMin ?? 1) < 0.9;
  const out: FixCandidate[] = [];

  const moreEngines = (k: number, cost: number) =>
    core &&
    out.push({
      id: `engines+${k}`,
      title: `Add ${k} core engines (${coreCount} → ${coreCount + k} × ${core.part.name})`,
      roscoe: `Add ${k} more engines`,
      cost,
      apply: (s) => setEngineCount(s, catalog, 0, coreCount + k),
    });
  const addBoosters = (cost: number) =>
    (boosters?.count ?? 0) < 6 &&
    out.push({
      id: 'boosters+2',
      title: `Add 2 boosters (${boosters?.count ?? 0} → ${(boosters?.count ?? 0) + 2})`,
      roscoe: 'Add 2 more boosters',
      cost,
      apply: (s) => setBoosters(s, boosters?.part ?? 'srb-sls-5seg', (boosters?.count ?? 0) + 2),
    });
  const kickLater = (dt: number, cost: number) =>
    out.push({
      id: `kick-later-${dt}`,
      title: `Pitch kick ${dt} s later (T+${kick.timeS} → T+${kick.timeS + dt} s)`,
      roscoe: 'Wait a bit longer before turning',
      cost,
      apply: (s) => setMission(s, { pitchKick: { ...kick, timeS: kick.timeS + dt } }),
    });
  const kickSmaller = (cost: number) =>
    out.push({
      id: 'kick-smaller',
      title: `Halve the pitch kick (${kick.angleDeg}° → ${kick.angleDeg / 2}°)`,
      roscoe: 'Turn more gently',
      cost,
      apply: (s) => setMission(s, { pitchKick: { ...kick, angleDeg: kick.angleDeg / 2 } }),
    });

  switch (type) {
    case 'noLiftoff':
      moreEngines(2, 2);
      moreEngines(4, 3);
      moreEngines(8, 5);
      addBoosters(3);
      if (boosters && boosters.part !== 'srb-sls-5seg')
        out.push({
          id: 'boosters-sls',
          title: 'Switch to SLS five-segment boosters',
          roscoe: 'Use the big SLS boosters',
          cost: 2,
          apply: (s) => setBoosters(s, 'srb-sls-5seg', boosters.count),
        });
      if (top > 0)
        out.push({
          id: 'upper-lighter',
          title: 'Load the upper stage to 60%',
          roscoe: 'Put less fuel in the top stage',
          cost: 3,
          apply: (s) => setFill(s, catalog, top, 0.6 * stageFill(s, catalog, top)),
        });
      break;

    case 'outOfFuel': {
      const anyPartial = spec.stages.some((_, i) => stageFill(spec, catalog, i) < 0.999);
      if (anyPartial)
        out.push({
          id: 'fill-all',
          title: 'Fill every tank to 100%',
          roscoe: 'Fill the tanks all the way',
          cost: 1,
          apply: (s) => s.stages.reduce((acc, _, i) => setFill(acc, catalog, i, 1), s),
        });
      const tank = stageTank(spec, catalog, top);
      if (tank?.part.lengthM) {
        const len = tank.part.lengthM;
        out.push({
          id: 'upper-tank+25',
          title: `Stretch the upper-stage tank 25% (${len.toFixed(1)} → ${(len * 1.25).toFixed(1)} m)`,
          roscoe: 'Make the top fuel tank bigger',
          cost: 2,
          apply: (s) => setTank(s, catalog, top, { lengthM: len * 1.25 }),
        });
        out.push({
          id: 'upper-tank+50',
          title: `Stretch the upper-stage tank 50% (${len.toFixed(1)} → ${(len * 1.5).toFixed(1)} m)`,
          roscoe: 'Make the top fuel tank much bigger',
          cost: 3,
          apply: (s) => setTank(s, catalog, top, { lengthM: len * 1.5 }),
        });
      }
      const upper = stageEngine(spec, catalog, top);
      const best = upper?.part.propellant === 'LH2/LOX' ? 'j-2' : 'raptor-vacuum';
      if (upper && upper.part.id !== best && top > 0)
        out.push({
          id: 'upper-engine',
          title: `Use a vacuum engine on the upper stage (${upper.part.name} → ${catalog[best].name})`,
          roscoe: 'Use a space engine on top',
          cost: 2,
          apply: (s) => setEngine(s, catalog, top, best),
        });
      const coreTank = stageTank(spec, catalog, 0);
      if (coreTank?.part.lengthM && top > 0)
        out.push({
          id: 'core-tank+20',
          title: `Stretch the first-stage tank 20%`,
          roscoe: 'Make the bottom fuel tank bigger',
          cost: 3,
          apply: (s) => setTank(s, catalog, 0, { lengthM: coreTank.part.lengthM! * 1.2 }),
        });
      if (spec.stages.length < 4)
        out.push({
          id: 'add-stage',
          title: 'Add another stage on top',
          roscoe: 'Add another stage',
          cost: 4,
          apply: (s) => addStage(s, catalog),
        });
      break;
    }

    case 'breakup':
      kickLater(5, 1);
      kickSmaller(1);
      if (throttleable)
        out.push({
          id: 'maxq-throttle',
          title: 'Throttle the core to 70% while dynamic pressure is above 20 kPa',
          roscoe: 'Slow down through the windy part',
          cost: 1,
          apply: (s) => setMission(s, { maxQThrottle: { aboveQPa: 20000, throttle: 0.7 } }),
        });
      kickLater(10, 2);
      moreEngines(2, 2);
      moreEngines(4, 3);
      if (core)
        out.push({
          id: 'engines+2-kick-later',
          title: `Add 2 core engines and kick 5 s later`,
          roscoe: 'Add 2 engines and wait before turning',
          cost: 3,
          apply: (s) => setMission(setEngineCount(s, catalog, 0, coreCount + 2), { pitchKick: { ...kick, timeS: kick.timeS + 5 } }),
        });
      break;

    case 'tumble': {
      const fins = finScale(spec, catalog, 0);
      if (fins === 0)
        out.push({ id: 'fins-add', title: 'Add four fins to the first stage', roscoe: 'Add fins at the bottom', cost: 1, apply: (s) => setFins(s, catalog, 0, 1) });
      else {
        out.push({ id: 'fins-1.5', title: `Make the fins 1.5× bigger`, roscoe: 'Make the fins bigger', cost: 1, apply: (s) => setFins(s, catalog, 0, fins * 1.5) });
        out.push({ id: 'fins-2', title: `Make the fins 2× bigger`, roscoe: 'Make the fins much bigger', cost: 2, apply: (s) => setFins(s, catalog, 0, fins * 2) });
      }
      kickSmaller(1);
      // The stage that was flying when it flipped may need engines that can steer.
      const si = Number(detail.stageIndex ?? 0);
      const e = stageEngine(spec, catalog, si);
      if (e && (e.part.gimbalDeg ?? 5) < 10 && e.part.id !== 'raptor-2' && e.part.propellant === 'CH4/LOX')
        out.push({
          id: 'steer-engine',
          title: `Use Raptor 2 on ${spec.stages[si].name} (swivels 15° to steer)`,
          roscoe: 'Use engines that can steer',
          cost: 2,
          apply: (s) => setEngine(s, catalog, si, 'raptor-2'),
        });
      if (e)
        out.push({
          id: 'steer-more',
          title: `Add 2 engines to ${spec.stages[si].name} for more steering push`,
          roscoe: 'Add more engines to steer with',
          cost: 2,
          apply: (s) => setEngineCount(s, catalog, si, (e.ref.count ?? 1) + 2),
        });
      if (si > 0)
        out.push({
          id: 'stage-higher',
          title: `Fill ${spec.stages[si - 1].name} to 100% so staging happens higher`,
          roscoe: 'Fill the bottom stage so it goes higher first',
          cost: 2,
          apply: (s) => setFill(s, catalog, si - 1, 1),
        });
      break;
    }

    case 'engineFailure': {
      const si = Number(detail.stageIndex ?? 0);
      const e = stageEngine(spec, catalog, si);
      if (e) {
        const n = e.ref.count ?? 1;
        out.push({
          id: 'spare-engines',
          title: `Add 2 spare engines to ${spec.stages[si].name} (${n} → ${n + 2})`,
          roscoe: 'Add spare engines',
          cost: 2,
          apply: (s) => setEngineCount(s, catalog, si, n + 2),
        });
        if (n === 1)
          out.push({
            id: 'engine-out-pair',
            title: `Use 2 engines on ${spec.stages[si].name} so one can fail`,
            roscoe: 'Use two engines so one can break',
            cost: 2,
            apply: (s) => setEngineCount(s, catalog, si, 2),
          });
      }
      addBoosters(3);
      if (spec.stages.some((_, i) => stageFill(spec, catalog, i) < 0.999))
        out.push({ id: 'fill-all', title: 'Fill every tank to 100% for margin', roscoe: 'Fill the tanks all the way', cost: 1, apply: (s) => s.stages.reduce((acc, _, i) => setFill(acc, catalog, i, 1), s) });
      break;
    }

    case 'moonShort': {
      const landing = spec.stages.findIndex((s) => s.recovery === 'propulsive');
      if (landing >= 0)
        out.push({
          id: 'no-landing',
          title: `Don't land ${spec.stages[landing].name}: use its landing fuel to climb`,
          roscoe: "Don't land the bottom stage",
          cost: 2,
          apply: (s) => setRecovery(s, landing, 'none'),
        });
      for (const c of fixCandidates('outOfFuel', spec, catalog)) out.push(c);
      break;
    }

    case 'burnUp':
    case 'crewG':
    case 'skipOut': {
      const angle = spec.mission.reentryAngleDeg ?? DEFAULT_ENTRY_ANGLE_DEG[spec.mission.target === 'orbit' ? 'orbit' : 'moon'];
      const dir = type === 'skipOut' ? -1 : 1; // skipping out wants a steeper (more negative) angle
      for (const step of [0.5, 1, 1.5]) {
        const a = Math.round((angle + dir * step) * 10) / 10;
        out.push({
          id: `entry-${a}`,
          title: `Come in ${dir > 0 ? 'shallower' : 'steeper'}: ${angle}° → ${a}°`,
          roscoe: dir > 0 ? 'Come home at a gentler angle' : 'Come home at a steeper angle',
          cost: step,
          apply: (s) => setMission(s, { reentryAngleDeg: a }),
        });
      }
      if (type === 'burnUp') {
        const scale = spec.payload.heatShieldScale ?? 1;
        out.push({
          id: 'shield+50',
          title: `Make the heat shield 50% thicker (${scale.toFixed(1)}× → ${(scale * 1.5).toFixed(1)}×)`,
          roscoe: 'Use a thicker heat shield',
          cost: 2,
          apply: (s) => setHeatShield(s, scale * 1.5),
        });
      }
      break;
    }

    case 'crashLanding': {
      const si = spec.stages.findIndex((s) => s.recovery === 'propulsive');
      if (si < 0) break;
      const reserve = spec.stages[si].landingReserveKg ?? 0;
      for (const [k, cost] of [[1.25, 1], [1.5, 2], [2, 3]] as const)
        out.push({
          id: `reserve-${k}`,
          title: `Hold back ${Math.round((k - 1) * 100)}% more landing fuel (${(reserve / 1000).toFixed(0)} → ${((reserve * k) / 1000).toFixed(0)} t)`,
          roscoe: k < 1.6 ? 'Save more fuel for landing' : 'Save lots more fuel for landing',
          cost,
          apply: (s) => setRecovery(s, si, 'propulsive', Math.max(reserve * k, 50000)),
        });
      out.push({
        id: 'expend',
        title: `Don't try to land ${spec.stages[si].name}`,
        roscoe: "Don't land it: let it fall in the sea",
        cost: 4,
        apply: (s) => setRecovery(s, si, 'none'),
      });
      break;
    }

    case 'crash':
    default:
      kickSmaller(1);
      kickLater(5, 1);
      moreEngines(2, 2);
      moreEngines(4, 3);
      addBoosters(3);
      break;
  }
  return out;
}

/**
 * Fly every candidate fix (with the same Chaos faults) and keep the ones that get past this
 * failure. Fixes that make the whole mission work come first, then the smallest change.
 */
export function findFixes(
  spec: RocketSpec,
  catalog: Catalog,
  type: MissionFailureType,
  limit = 3,
  detail: Record<string, number | string> = {},
  faults: Fault[] = [],
) {
  const candidates = fixCandidates(type, spec, catalog, detail);
  const opts: SimOptions = { faults };
  const working: FixResult[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const fixed = c.apply(spec);
    if (!fixed || fixed === spec) continue;
    const m = flyMission(fixed, catalog, opts);
    const next = m.result.failure?.type;
    if (next && failureRank(next) <= failureRank(type)) continue;
    // A launch problem is only fixed if the rocket now reaches orbit.
    if (failureRank(type) <= failureRank('crash') && !m.ascent.outcome.success) continue;
    const o = m.ascent.outcome;
    working.push({
      id: c.id,
      title: c.title,
      roscoe: c.roscoe,
      cost: c.cost,
      spec: fixed,
      perigeeAltM: o.orbit?.perigeeAltM ?? 0,
      apogeeAltM: o.orbit?.apogeeAltM ?? 0,
      remainingDeltaVMS: o.remainingDeltaVMS,
      complete: !next,
      nextProblem: next,
    });
  }
  working.sort((a, b) => Number(b.complete) - Number(a.complete) || a.cost - b.cost || b.remainingDeltaVMS - a.remainingDeltaVMS);
  return { fixes: working.slice(0, limit), tested: seen.size };
}
