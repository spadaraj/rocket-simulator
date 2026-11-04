// Preset flights and the Phase 1 failure modes.

import { describe, expect, it } from 'vitest';
import { catalog, presets } from '../../data/catalog';
import { simulate } from '../simulate';
import type { RocketSpec } from '../types';

const byId = (id: string) => presets.find((p) => p.id === id)!;

function withCoreEngines(spec: RocketSpec, count: number): RocketSpec {
  return {
    ...spec,
    stages: spec.stages.map((s, i) =>
      i === 0 ? { ...s, parts: s.parts.map((p) => (p.part === 'raptor-2' ? { ...p, count } : p)) } : s,
    ),
  };
}

describe('presets', () => {
  it('every part in every preset has a source', () => {
    for (const p of Object.values(catalog)) expect(p.source.length).toBeGreaterThan(10);
  });

  it('Saturn V reaches a parking orbit close to Apollo 11', () => {
    const rec = simulate(byId('saturn-v'), catalog);
    expect(rec.outcome.success).toBe(true);
    expect(rec.outcome.orbit!.perigeeAltM).toBeGreaterThan(150e3);
    expect(rec.outcome.orbit!.apogeeAltM).toBeLessThan(260e3);
    // Apollo 11: liftoff TWR ~1.16, max-Q ~35 kPa at T+83 s (loose bands for now).
    expect(rec.summary.liftoffTWR).toBeGreaterThan(1.1);
    expect(rec.summary.liftoffTWR).toBeLessThan(1.25);
    expect(rec.summary.maxQPa).toBeGreaterThan(25e3);
    expect(rec.summary.maxQPa).toBeLessThan(45e3);
    expect(rec.summary.maxQTimeS).toBeGreaterThan(65);
    expect(rec.summary.maxQTimeS).toBeLessThan(100);
    // S-IVB keeps propellant for the trip to the Moon.
    expect(rec.outcome.remainingDeltaVMS).toBeGreaterThan(2500);
  });

  it('A1-39 reaches orbit', () => {
    const rec = simulate(byId('a1-39'), catalog);
    expect(rec.outcome.success).toBe(true);
    expect(rec.outcome.orbit!.perigeeAltM).toBeGreaterThan(150e3);
  });
});

describe('failures', () => {
  it("won't lift off when thrust is below weight", () => {
    const rec = simulate(withCoreEngines(byId('a1-39'), 0), catalog);
    expect(rec.outcome.failure?.type).toBe('noLiftoff');
    expect(Number(rec.outcome.failure!.detail.thrustToWeight)).toBeLessThan(1);
  });

  it('runs out of fuel when the upper stage is nearly empty', () => {
    const spec = byId('saturn-v');
    const starved: RocketSpec = {
      ...spec,
      stages: spec.stages.map((s, i) =>
        i === 2
          ? { ...s, parts: s.parts.map((p) => (p.part === 's-ivb-tankage' ? { ...p, propellantKg: 1000 } : p)) }
          : i === 1
            ? { ...s, parts: s.parts.map((p) => (p.part === 's-ii-tankage' ? { ...p, propellantKg: 120000 } : p)) }
            : s,
      ),
    };
    const rec = simulate(starved, catalog);
    expect(rec.outcome.success).toBe(false);
    expect(rec.outcome.failure?.type).toBe('outOfFuel');
  });

  it('breaks apart when dynamic pressure exceeds the structure limit', () => {
    const spec = byId('saturn-v');
    // A body only 60% as strong can't take max-Q on the way up.
    const rec = simulate({ ...spec, structureScale: 0.6 }, catalog);
    expect(rec.outcome.failure?.type).toBe('breakup');
    expect(Number(rec.outcome.failure!.detail.dynamicPressurePa)).toBeGreaterThan(
      Number(rec.outcome.failure!.detail.limitPa),
    );
  });

  it('a rocket that tips over and breaks apart diving down has fallen back, not broken in the climb', () => {
    const spec = byId('saturn-v');
    const rec = simulate({ ...spec, mission: { ...spec.mission, pitchKick: { timeS: 8, angleDeg: 2 } } }, catalog);
    expect(rec.outcome.failure?.type).toBe('crash');
  });
});
