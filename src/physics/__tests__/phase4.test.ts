import { describe, expect, it } from 'vitest';
import { catalog, presets } from '../../data/catalog';
import { autoSize } from '../autosize';
import { engineWarnings, worstLevel } from '../design';
import { stageEngine, tuneEngine } from '../edit';
import { GOLDEN_FLIGHTS, goldenFor, scorecard } from '../golden';
import { flyMission } from '../mission';
import { simulate } from '../simulate';
import { moonTrajectory, solveFreeReturn, trialFlight } from '../trajectory';
import type { LiquidEngine } from '../types';
import { buildVehicle } from '../vehicle';

const preset = (id: string) => presets.find((p) => p.id === id)!;

describe('new presets', () => {
  it('every preset except the as-drawn A1-39 flies its whole mission', () => {
    for (const spec of presets.filter((p) => p.id !== 'a1-39-as-drawn')) {
      const m = flyMission(spec, catalog);
      expect(m.result.failure, `${spec.name}: ${JSON.stringify(m.result.failure)}`).toBeUndefined();
    }
  }, 60_000);

  it('the Shuttle orbiter rides on the side and the push stays under 3 g', () => {
    const shuttle = preset('shuttle');
    const v = buildVehicle(shuttle, catalog);
    expect(v.sidePayload?.name).toMatch(/orbiter/);
    expect(v.segments.some((s) => s.name.includes('orbiter'))).toBe(false);
    expect(simulate(shuttle, catalog).summary.maxGLoad).toBeLessThan(3.1);
  });

  it('SLS loops around the Moon and comes home without a lander', () => {
    const m = flyMission(preset('sls'), catalog);
    expect(m.moon?.legs.map((l) => l.id)).toEqual(['tli', 'flyby']);
    expect(m.reentry?.outcome).toBe('splashdown');
  });

  it('Falcon 9 and Super Heavy boosters land', () => {
    for (const id of ['falcon-9', 'starship']) {
      const m = flyMission(preset(id), catalog);
      expect(m.recoveries.find((r) => r.kind === 'stage')?.outcome, id).toBe('landed');
    }
  });

  it('auto-size aims for orbit when the mission is orbit', () => {
    const r = autoSize(preset('falcon-heavy'), catalog);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/orbit/);
  }, 60_000);
});

describe('real-flight scorecard', () => {
  it('has a golden flight for Saturn V, Falcon 9 and the Shuttle', () => {
    expect(GOLDEN_FLIGHTS.map((g) => g.presetId).sort()).toEqual(['falcon-9', 'saturn-v', 'shuttle']);
  });

  it('Saturn V and the Shuttle land within 15% of every real checkpoint', () => {
    for (const id of ['saturn-v', 'shuttle']) {
      const card = scorecard(goldenFor(id)!, simulate(preset(id), catalog));
      expect(card.score, id).toBe(100);
    }
  });

  it('Falcon 9 gets most checkpoints within 15%', () => {
    const card = scorecard(goldenFor('falcon-9')!, simulate(preset('falcon-9'), catalog));
    expect(card.score).toBeGreaterThanOrEqual(75);
  });
});

describe('free-design engines', () => {
  it('no catalog engine trips a warning', () => {
    for (const e of Object.values(catalog).filter((p): p is LiquidEngine => p.type === 'liquidEngine')) {
      expect(worstLevel(engineWarnings(e)), e.name).not.toBe('impossible');
      expect(worstLevel(engineWarnings(e)), e.name).not.toBe('warn');
    }
  });

  it('flags better-than-real and impossible engines', () => {
    const raptor = catalog['raptor-2'] as LiquidEngine;
    expect(worstLevel(engineWarnings({ ...raptor, ispVacuumS: 385 }))).toBe('warn');
    expect(worstLevel(engineWarnings({ ...raptor, ispVacuumS: 450 }))).toBe('impossible');
    expect(worstLevel(engineWarnings({ ...raptor, massKg: 600 }))).toBe('impossible');
    expect(worstLevel(engineWarnings({ ...raptor, ispSeaLevelS: 400 }))).toBe('impossible');
  });

  it("Roscoe's super engine flies, and tuning back to 1× restores the real one", () => {
    const a139 = preset('a1-39');
    const tuned = tuneEngine(a139, catalog, 1, 1.5, 1.35);
    const eng = stageEngine(tuned, catalog, 1)!.part;
    expect(eng.id).toMatch(/^custom-engine-/);
    expect(eng.basedOn).toBe('raptor-vacuum');
    expect(worstLevel(engineWarnings(eng))).toBe('impossible');
    expect(simulate(tuned, catalog).outcome.remainingDeltaVMS).toBeGreaterThan(simulate(a139, catalog).outcome.remainingDeltaVMS);

    const back = tuneEngine(tuned, catalog, 1, 1, 1);
    expect(stageEngine(back, catalog, 1)!.part.id).toBe('raptor-vacuum');
    expect(back.customParts?.some((p) => p.type === 'liquidEngine')).toBeFalsy();
  });
});

describe('Earth–Moon flight path', () => {
  it('finds a free return like Apollo: about 3.1–3.2 km/s, home in about 6 days', () => {
    const fr = solveFreeReturn(185e3);
    expect(fr.burnMS).toBeGreaterThan(3100);
    expect(fr.burnMS).toBeLessThan(3250);
    const t = trialFlight(fr.parkingAltM, (fr.phaseRad * 180) / Math.PI, fr.burnMS);
    expect(t.periluneAltKm).toBeGreaterThan(100);
    expect(t.periluneAltKm).toBeLessThan(400);
    expect(t.returnAltKm).toBeLessThan(150);
    expect(t.returnDays).toBeGreaterThan(5);
    expect(t.returnDays).toBeLessThan(7);
  });

  it('comes home at about 11 km/s, and a weak push falls back to Earth', () => {
    const full = moonTrajectory(185e3, 4000, 'land');
    expect(full.outcome).toBe('home');
    expect(full.events.map((e) => e.id)).toEqual(['tli', 'loi', 'tei', 'entry']);
    expect(full.entrySpeedMS).toBeGreaterThan(10800);
    expect(full.entrySpeedMS).toBeLessThan(11300);

    const weak = moonTrajectory(185e3, 3000, 'land');
    expect(weak.outcome).toBe('fellBack');
    expect(weak.apogeeAltM).toBeLessThan(300000e3);
  });

  it('the ledger asks for the push the flight path needs', () => {
    const m = flyMission(preset('saturn-v'), catalog);
    expect(m.moon!.legs[0].neededMS).toBe(Math.ceil(solveFreeReturn(185e3).burnMS));
  });
});
