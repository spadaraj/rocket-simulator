import { describe, expect, it } from 'vitest';
import { catalog } from '../../data/catalog';
import { MISSIONS } from '../../missions/missions';
import { controlsFor, isUnlocked, rank } from '../../missions/progress';
import type { CheckContext, Mission } from '../../missions/types';
import { flyMission } from '../mission';
import type { RocketSpec } from '../types';

const stats = { usedSlow: false, chaos: false, saved: false };
const check = (mission: Mission, spec: RocketSpec): CheckContext => ({ m: flyMission(spec, catalog, { faults: mission.faults }), spec, stats });

/** Missions whose starting rocket already does the job (they teach by watching). */
const STARTS_WINNING = new Set(['liftoff']);

describe('Mission Mode, Chapters 1–2', () => {
  for (const mission of MISSIONS) {
    it(`${mission.title}: the starting rocket ${STARTS_WINNING.has(mission.id) ? 'works' : 'misses the goal'}, and the known fix wins`, () => {
      const start = mission.rocket();
      expect(mission.goal(check(mission, start))).toBe(STARTS_WINNING.has(mission.id));
      const solved = mission.solve(start);
      const c = check(mission, solved);
      expect(mission.goal(c), JSON.stringify(c.m.result.failure)).toBe(true);
    }, 30_000);
  }

  it('teaches each control only once, and only after the controls it builds on', () => {
    const seen = new Set<string>();
    for (const m of MISSIONS)
      for (const c of m.unlocks) {
        expect(seen.has(c), c).toBe(false);
        seen.add(c);
      }
    // Every hint points at a control the player has by then.
    for (const m of MISSIONS) expect(controlsFor(m.id).has(m.hintControl), m.id).toBe(true);
  });

  it('one star unlocks the next mission, and finishing a chapter raises the rank', () => {
    const p = { stars: {} as Record<string, number> };
    expect(isUnlocked(p, 0)).toBe(true);
    expect(isUnlocked(p, 1)).toBe(false);
    p.stars[MISSIONS[0].id] = 1;
    expect(isUnlocked(p, 1)).toBe(true);
    expect(rank(p)).toBe('Cadet');
    for (const m of MISSIONS.filter((x) => x.chapter === 1)) p.stars[m.id] = 1;
    expect(rank(p)).toBe('Pilot');
  });
});
