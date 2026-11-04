import { describe, expect, it } from 'vitest';
import { catalog, presets } from '../../data/catalog';
import { MISSIONS } from '../../missions/missions';
import { controlsFor, isUnlocked, rank } from '../../missions/progress';
import type { CheckContext, Mission } from '../../missions/types';
import { setMission, setPayloadSlot } from '../edit';
import { bestTransfer, hohmannSun, rM, synodicDays, departureDvMS } from '../solar';
import { findFixes } from '../fixes';
import { flyMission } from '../mission';
import type { Fault, RocketSpec } from '../types';

const stats = { usedSlow: false, chaos: false, saved: false };
const check = (mission: Mission, spec: RocketSpec): CheckContext => ({ m: flyMission(spec, catalog, { faults: mission.faults }), spec, stats });

/** Missions whose starting rocket already does the job (they teach by watching). */
const STARTS_WINNING = new Set(['liftoff']);

describe('Mission Mode, Chapters 1–5', () => {
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
    for (const m of MISSIONS.filter((x) => x.chapter <= 3)) p.stars[m.id] = 1;
    expect(rank(p)).toBe('Moon Walker');
    for (const m of MISSIONS) p.stars[m.id] = 1;
    expect(rank(p)).toBe('Deep Space Explorer');
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

describe('Planet trips', () => {
  const heavy = (part: string, slot: 'cargo' | 'lander' = 'cargo') => {
    const fh = structuredClone(presets.find((p) => p.id === 'falcon-heavy')!);
    return setPayloadSlot(setPayloadSlot(fh, 'cargo', null), slot, part);
  };
  const go = (spec: RocketSpec, destination: RocketSpec['mission']['destination'], arrival: RocketSpec['mission']['arrival'], launchOffsetDays = 0) =>
    setMission(spec, { target: 'planet', destination, arrival, launchOffsetDays });

  it('leaving Earth for Mars or Venus takes about 3.5 km/s, and windows come round every 19 and 26 months', () => {
    expect(departureDvMS(hohmannSun(rM('earth'), rM('mars')).vInfDepMS, 200e3)).toBeCloseTo(3610, -2);
    expect(departureDvMS(hohmannSun(rM('earth'), rM('venus')).vInfDepMS, 200e3)).toBeCloseTo(3500, -2);
    expect(synodicDays('mars')).toBeCloseTo(780, -1);
    expect(synodicDays('venus')).toBeCloseTo(584, -1);
  });

  it('launching on the best day matches the Hohmann transfer; months off costs much more', () => {
    const h = hohmannSun(rM('earth'), rM('mars'));
    const best = bestTransfer('mars', 0, 200e3, true);
    expect(best.vInfDepMS).toBeCloseTo(h.vInfDepMS, -2);
    expect(best.tofDays).toBeCloseTo(h.tofDays, -1);
    const late = bestTransfer('mars', -120, 200e3, false);
    expect(departureDvMS(late.vInfDepMS, 200e3)).toBeGreaterThan(departureDvMS(h.vInfDepMS, 200e3) + 1500);
  });

  it('missing the launch window: the first fix is to launch when the planets line up', () => {
    const mission = MISSIONS.find((m) => m.id === 'hello-venus')!;
    const spec = mission.rocket();
    const m = flyMission(spec, catalog);
    expect(m.result.failure?.detail.legId).toBe('depart');
    const { fixes } = findFixes(spec, catalog, 'planetShort', 3, m.result.failure!.detail);
    expect(fixes[0]?.id).toBe('launch-window');
    expect(fixes[0]?.control).toBe('launchDay');
  });

  it('a probe with no engine zooms past; an orbiter brakes into orbit', () => {
    const past = flyMission(go(heavy('planet-probe'), 'mars', 'orbit'), catalog);
    expect(past.result.failure?.detail.legId).toBe('capture');
    expect(past.result.failure?.detail.by).toBe('No braking engine');
    expect(flyMission(go(heavy('mars-orbiter'), 'mars', 'orbit'), catalog).result.success).toBe(true);
  });

  it('every world needs its own lander', () => {
    // No heat shield on a Moon lander: it burns up in Mars's air (Space Q Lands on Mars).
    const moonLander = MISSIONS.find((x) => x.id === 'mars-landing')!.rocket();
    const toMars = flyMission(go(moonLander, 'mars', 'land'), catalog);
    expect(toMars.result.failure?.detail.legId).toBe('entry');
    expect(toMars.result.failure?.detail.by).toContain('no heat shield');
    // A parachute alone is not enough on Mars.
    expect(flyMission(go(heavy('rover-chute', 'lander'), 'mars', 'land'), catalog).result.failure?.detail.legId).toBe('touchdown');
    expect(flyMission(go(heavy('rover-skycrane', 'lander'), 'mars', 'land'), catalog).result.success).toBe(true);
    // Venus cooks a Mars rover in minutes; a Venus lander lasts about two hours.
    const venus = flyMission(go(heavy('venus-lander', 'lander'), 'venus', 'land'), catalog);
    expect(venus.planet?.surfaceMinutes).toBe(127);
    expect(venus.result.success).toBe(true);
    expect(flyMission(go(heavy('rover-skycrane', 'lander'), 'venus', 'land'), catalog).result.failure?.detail.legId).toBe('survive');
  });

  it('an ion probe spirals out to Vesta, then hops to Ceres; it takes years', () => {
    const m = flyMission(go(heavy('ion-probe'), 'vestaCeres', 'orbit'), catalog);
    expect(m.planet?.ion).toBe(true);
    expect(m.planet?.legs.map((l) => l.id)).toEqual(['depart', 'cruise', 'hop']);
    expect(m.result.success).toBe(true);
    expect(m.planet!.totalDays).toBeGreaterThan(3 * 365);
    // A chemical orbiter can't even brake at Vesta.
    expect(flyMission(go(heavy('mars-orbiter'), 'vestaCeres', 'orbit'), catalog).result.failure?.detail.legId).toBe('capture');
  });

  it('a sample return needs as much push home as going out, and a capsule', () => {
    const dawn = flyMission(go(heavy('ion-probe'), 'rock', 'sample'), catalog);
    expect(dawn.result.failure?.detail.legId).toBe('home');
    const q = flyMission(go(heavy('sample-probe'), 'rock', 'sample'), catalog);
    expect(q.planet?.legs.map((l) => l.id)).toEqual(['depart', 'cruise', 'home', 'capsule']);
    expect(q.result.success).toBe(true);
    // No crew capsule re-entry is simulated for probe trips.
    expect(q.reentry).toBeUndefined();
  });
});
