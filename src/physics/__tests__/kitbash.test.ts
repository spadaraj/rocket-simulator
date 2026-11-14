// Sandbox kitbashing: stages and parts from any rocket, and no limits on how much.

import { describe, expect, it } from 'vitest';
import { catalog, presets } from '../../data/catalog';
import { blankRocket, payloadSlot, setBoosters, setEngineCount, setTank, stageEngine, stageTank } from '../edit';
import { importBoosters, importEngines, importStage, importTank, importTop, kitOf } from '../kitbash';
import { flyMission } from '../mission';
import { buildVehicle } from '../vehicle';

const get = (id: string) => structuredClone(presets.find((p) => p.id === id)!);
const finite = (spec: Parameters<typeof flyMission>[0]) => {
  const m = flyMission(spec, catalog);
  for (const s of m.ascent.samples) {
    expect(Number.isFinite(s.altitudeM)).toBe(true);
    expect(Number.isFinite(s.speedMS)).toBe(true);
  }
  return m;
};

describe('Kitbashing', () => {
  it('every rocket offers its stages, engines, tanks and top pieces', () => {
    for (const p of presets) {
      const kit = kitOf(p, catalog);
      expect(kit.stages.length, p.id).toBe(p.stages.length);
      expect(kit.engines.length, p.id).toBeGreaterThan(0);
    }
    expect(kitOf(get('shuttle'), catalog).top.map((t) => t.part)).toContain('shuttle-orbiter');
    expect(kitOf(get('sls'), catalog).boosters?.part).toBe('srb-sls-5seg');
  });

  it('Saturn V bottom, Starship on top, the Space Shuttle riding along', () => {
    const sat = get('saturn-v');
    const ship = get('starship');
    let s = importStage(blankRocket(), sat, 0, { swap: 0 });
    s = importStage(s, ship, 1, { at: 'top' });
    s = importTop(s, 'orbiter', 'shuttle-orbiter');
    expect(s.stages.map((x) => x.name)).toEqual(['Saturn V: S-IC', 'Starship: Starship']);
    expect(payloadSlot(s, 'orbiter')).toBe('shuttle-orbiter');
    expect(buildVehicle(s, catalog).stages.length).toBe(2);
    finite(s);
  });

  it('takes engines with their count, tanks, and boosters', () => {
    const ship = get('starship');
    const sls = get('sls');
    let s = importEngines(blankRocket(), catalog, 0, ship, kitOf(ship, catalog).engines[0]);
    expect(stageEngine(s, catalog, 0)?.ref).toMatchObject({ part: 'raptor-2', count: 33 });
    s = importTank(s, catalog, 0, sls, kitOf(sls, catalog).tanks[0]);
    expect(stageTank(s, catalog, 0)?.part.id).toBe('sls-core-tank');
    s = importBoosters(s, kitOf(sls, catalog).boosters!);
    expect(s.stages[0].boosters).toMatchObject({ part: 'srb-sls-5seg', count: 2 });
    finite(s);
  });

  it('boosters stay on the bottom when a stage is added underneath', () => {
    const sls = get('sls');
    const s = importStage(sls, get('saturn-v'), 0, { at: 'bottom' });
    expect(s.stages[0].boosters?.part).toBe('srb-sls-5seg');
    expect(s.stages.slice(1).some((x) => x.boosters)).toBe(false);
  });

  it('brings designed parts along under new ids, so they never clash', () => {
    const a = blankRocket();
    const b = blankRocket();
    const s = importStage(a, b, 0, { at: 'top' });
    const ids = s.stages.map((st) => stageTank(s, catalog, s.stages.indexOf(st))!.part.id);
    expect(new Set(ids).size).toBe(2);
    finite(s);
  });

  it('has no limits: 200 F-1s, 20 boosters and a 500 m tank still fly without breaking the maths', () => {
    let s = importEngines(blankRocket(), catalog, 0, get('saturn-v'), { part: 'f-1', count: 5 });
    s = setEngineCount(s, catalog, 0, 200);
    s = setBoosters(s, 'srb-sls-5seg', 20);
    s = setTank(s, catalog, 0, { lengthM: 500 });
    expect(stageEngine(s, catalog, 0)?.ref.count).toBe(200);
    expect(s.stages[0].boosters?.count).toBe(20);
    finite(s);
  });
});
