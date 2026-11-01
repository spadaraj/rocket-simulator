// Fix suggestions: re-fly the rocket with each candidate fix for the failure, and keep only
// the ones that actually reach orbit, smallest change first.

import { addStage, setBoosters, setEngine, setEngineCount, setFill, setMission, setTank, stageEngine, stageFill, stageTank } from './edit';
import { simulate } from './simulate';
import type { Catalog, FailureType, RocketSpec } from './types';

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
}

export function fixCandidates(type: FailureType, spec: RocketSpec, catalog: Catalog): FixCandidate[] {
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

/** Fly every candidate fix and return the ones that reach orbit, best first. */
export function findFixes(spec: RocketSpec, catalog: Catalog, type: FailureType, limit = 3) {
  const candidates = fixCandidates(type, spec, catalog);
  const working: FixResult[] = [];
  for (const c of candidates) {
    const fixed = c.apply(spec);
    if (!fixed) continue;
    const r = simulate(fixed, catalog);
    if (!r.outcome.success) continue;
    working.push({
      id: c.id,
      title: c.title,
      roscoe: c.roscoe,
      cost: c.cost,
      spec: fixed,
      perigeeAltM: r.outcome.orbit!.perigeeAltM,
      apogeeAltM: r.outcome.orbit!.apogeeAltM,
      remainingDeltaVMS: r.outcome.remainingDeltaVMS,
    });
  }
  working.sort((a, b) => a.cost - b.cost || b.remainingDeltaVMS - a.remainingDeltaVMS);
  return { fixes: working.slice(0, limit), tested: candidates.length };
}
