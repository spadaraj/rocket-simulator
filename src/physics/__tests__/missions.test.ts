import { describe, expect, it } from 'vitest';
import { catalog, presets } from '../../data/catalog';
import { MISSIONS } from '../../missions/missions';
import { controlsFor, isUnlocked, rank } from '../../missions/progress';
import type { CheckContext, Mission } from '../../missions/types';
import { setPayloadSlot } from '../edit';
import { findFixes } from '../fixes';
import { flyMission } from '../mission';
import type { Fault, RocketSpec } from '../types';

const stats = { usedSlow: false, chaos: false, saved: false };
const check = (mission: Mission, spec: RocketSpec): CheckContext => ({ m: flyMission(spec, catalog, { faults: mission.faults }), spec, stats });

/** Missions whose starting rocket already does the job (they teach by watching). */
const STARTS_WINNING = new Set(['liftoff']);

describe('Mission Mode, Chapters 1–3', () => {
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
    for (const m of MISSIONS) p.stars[m.id] = 1;
    expect(rank(p)).toBe('Moon Walker');
  });
});

describe('The Moon chapter physics', () => {
  const sat = () => structuredClone(presets.find((p) => p.id === 'saturn-v')!);
  const apollo13: Fault[] = [{ kind: 'serviceModule' }];

  it('Apollo 13: with the service module broken, the lander lifeboat brings the crew home', () => {
    const m = flyMission(sat(), catalog, { faults: apollo13 });
    expect(m.moon?.emergency).toBe(true);
    expect(m.moon?.trip).toBe('flyby');
    expect(m.moon?.legs.map((l) => l.id)).toEqual(['tli', 'lifeboat']);
    expect(m.result.success).toBe(true);
    expect(m.reentry?.outcome).toBe('splashdown');
  });

  it('Apollo 13 without a lander: no lifeboat, and the fix is to bring one', () => {
    const spec = setPayloadSlot(sat(), 'lander', null);
    const m = flyMission(spec, catalog, { faults: apollo13 });
    expect(m.result.failure?.type).toBe('moonShort');
    expect(m.result.failure?.detail.legId).toBe('lifeboat');
    const { fixes } = findFixes(spec, catalog, 'moonShort', 3, m.result.failure!.detail, apollo13);
    expect(fixes[0]?.id).toBe('add-lander');
    expect(fixes[0]?.control).toBe('lander');
    expect(fixes[0]?.complete).toBe(true);
  });

  it('a cargo lander with no crew brakes into Moon orbit, lands, and stays', () => {
    const a139 = structuredClone(presets.find((p) => p.id === 'a1-39')!);
    let spec = (['lander', 'service', 'capsule', 'tower'] as const).reduce((s, slot) => setPayloadSlot(s, slot, null), a139);
    spec = setPayloadSlot(setPayloadSlot(spec, 'cargo', 'moon-base'), 'lander', 'spaceq-cargo-lander');
    const m = flyMission(spec, catalog);
    expect(m.moon?.oneWay).toBe(true);
    expect(m.moon?.legs.map((l) => l.id)).toEqual(['tli', 'loi', 'descent']);
    expect(m.reentry).toBeUndefined();
    expect(m.result.success).toBe(true);
    // The little Apollo lander can't brake and land an 8 t base by itself.
    const small = flyMission(setPayloadSlot(spec, 'lander', 'apollo-lm'), catalog);
    expect(small.result.failure?.detail.legId).toBe('descent');
  });
});
