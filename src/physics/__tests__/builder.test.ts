// Phase 2: free-design rules, spec edits, auto-size and fix search.

import { describe, expect, it } from 'vitest';
import { catalog, presets } from '../../data/catalog';
import { autoSize } from '../autosize';
import { TLI_BUDGET_MS } from '../deltaV';
import { designTank, tankCapacityKg } from '../design';
import { addStage, removeStage, setEngine, setEngineCount, setFill, setTank, stageFill, stageTank } from '../edit';
import { findFixes } from '../fixes';
import { simulate } from '../simulate';
import { buildVehicle } from '../vehicle';

const byId = (id: string) => presets.find((p) => p.id === id)!;

describe('free-design tanks', () => {
  it('reproduce the A1-39 core tank from its dimensions', () => {
    const t = catalog['a139-core-tank'];
    expect(t.type).toBe('tank');
    const cap = tankCapacityKg(10, 49, 'CH4/LOX');
    expect(Math.abs(cap / (t as { propellantCapacityKg: number }).propellantCapacityKg - 1)).toBeLessThan(0.001);
  });
  it('are badged as estimates with a source', () => {
    const t = designTank('x', 6, 10, 'LH2/LOX');
    expect(t.confidence).toBe('estimate');
    expect(t.source).toMatch(/Free-design/);
    // Hydrogen is light: far less propellant mass than methalox in the same tank.
    expect(t.propellantCapacityKg).toBeLessThan(designTank('y', 6, 10, 'CH4/LOX').propellantCapacityKg / 2);
  });
});

describe('spec edits', () => {
  const a139 = byId('a1-39');

  it('change engine count and keep everything else', () => {
    const s = setEngineCount(a139, catalog, 0, 12);
    expect(buildVehicle(s, catalog).stages[0].engines[0].count).toBe(12);
    expect(s.stages[1]).toBe(a139.stages[1]);
  });

  it('resizing a tank makes an estimated custom tank and keeps the fill level', () => {
    const half = setFill(a139, catalog, 1, 0.5);
    const s = setTank(half, catalog, 1, { lengthM: 30 });
    const t = stageTank(s, catalog, 1)!;
    expect(t.part.id).toMatch(/^custom-tank-/);
    expect(t.part.confidence).toBe('estimate');
    expect(t.part.lengthM).toBe(30);
    expect(stageFill(s, catalog, 1)).toBeCloseTo(0.5, 2);
  });

  it('swapping to an engine with another propellant re-designs the tank to match', () => {
    const s = setEngine(a139, catalog, 1, 'j-2');
    expect(stageTank(s, catalog, 1)!.part.propellant).toBe('LH2/LOX');
  });

  it('adds and removes stages, cleaning up unused custom parts', () => {
    const three = addStage(a139, catalog);
    expect(three.stages).toHaveLength(3);
    expect(three.customParts).toHaveLength(1);
    expect(simulate(three, catalog).samples.length).toBeGreaterThan(10);
    const back = removeStage(three, 2);
    expect(back.stages).toHaveLength(2);
    expect(back.customParts).toBeUndefined();
    expect(removeStage(a139, 0)).toBe(a139);
  });
});

describe('auto-size', () => {
  it('trims the A1-39 to just enough propellant for the Moon', () => {
    const r = autoSize(byId('a1-39'), catalog);
    expect(r.ok).toBe(true);
    const rec = simulate(r.spec, catalog);
    expect(rec.outcome.success).toBe(true);
    expect(rec.outcome.remainingDeltaVMS).toBeGreaterThan(TLI_BUDGET_MS);
    // It should have taken some propellant out, not just left the tanks full.
    expect(rec.summary.liftoffMassKg).toBeLessThan(simulate(byId('a1-39'), catalog).summary.liftoffMassKg);
  });

  it('says why when even full tanks are not enough', () => {
    const r = autoSize(setEngineCount(byId('a1-39'), catalog, 0, 0), catalog);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Can't reach the Moon/);
  });
});

describe('fix suggestions', () => {
  it('finds working fixes for the as-drawn A1-39 breakup, smallest first', () => {
    const spec = byId('a1-39-as-drawn');
    expect(simulate(spec, catalog).outcome.failure?.type).toBe('breakup');
    const { fixes, tested } = findFixes(spec, catalog, 'breakup');
    expect(tested).toBeGreaterThan(3);
    expect(fixes.length).toBeGreaterThan(0);
    for (const f of fixes) expect(simulate(f.spec, catalog).outcome.success).toBe(true);
    for (let i = 1; i < fixes.length; i++) expect(fixes[i].cost).toBeGreaterThanOrEqual(fixes[i - 1].cost);
  });

  it('finds a fix for a rocket that is too heavy to lift off', () => {
    const { fixes } = findFixes(setEngineCount(byId('a1-39'), catalog, 0, 2), catalog, 'noLiftoff');
    expect(fixes.length).toBeGreaterThan(0);
  });
});
