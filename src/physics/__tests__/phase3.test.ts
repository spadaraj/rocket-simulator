import { describe, expect, it } from 'vitest';
import { catalog, presets } from '../../data/catalog';
import { autoSize } from '../autosize';
import { setFins, setHeatShield, setMission, setRecovery } from '../edit';
import { rollFaults } from '../faults';
import { findFixes } from '../fixes';
import { flyMission } from '../mission';
import { simulateReentry } from '../reentry';
import { simulate } from '../simulate';
import type { LiquidEngine, RocketSpec, SolidBooster } from '../types';

const a139 = presets.find((p) => p.id === 'a1-39')!;
const saturn = presets.find((p) => p.id === 'saturn-v')!;
const withAngle = (spec: RocketSpec, a: number) => setMission(spec, { reentryAngleDeg: a });

describe('whole mission', () => {
  it('A1-39 and Saturn V fly the whole Moon mission', () => {
    for (const spec of [a139, saturn]) {
      const m = flyMission(spec, catalog);
      expect(m.result.failure, spec.name).toBeUndefined();
      expect(m.moon?.success).toBe(true);
      expect(m.reentry?.outcome).toBe('splashdown');
    }
  });

  it('runs the coasting systems checklist in order', () => {
    const r = simulate(a139, catalog);
    expect(r.checklist.map((c) => c.system)).toEqual(['engines', 'tanks', 'power', 'guidance', 'comms']);
    expect(r.checklist.every((c) => c.status === 'go')).toBe(true);
  });
});

describe('tumbling', () => {
  it('stays well inside its steering limit as designed', () => {
    const r = simulate(a139, catalog);
    expect(r.summary.maxTumbleRatio).toBeLessThan(0.2);
  });

  it('fins move the centre of pressure back', () => {
    const none = simulate(setFins(a139, catalog, 0, 0), catalog).summary.staticMarginCalibers;
    const big = simulate(setFins(a139, catalog, 0, 2), catalog).summary.staticMarginCalibers;
    expect(big).toBeGreaterThan(none + 0.3);
  });

  it('tumbles when the engines cannot swivel', () => {
    const stiff: LiquidEngine = { ...(catalog['raptor-2'] as LiquidEngine), id: 'stiff-raptor', gimbalDeg: 0 };
    const stiffSrb: SolidBooster = { ...(catalog['srb-sls-5seg'] as SolidBooster), id: 'stiff-srb', gimbalDeg: 0 };
    const spec: RocketSpec = {
      ...setFins(a139, catalog, 0, 0),
      customParts: [stiff, stiffSrb],
      stages: a139.stages.map((s, i) =>
        i === 0
          ? { ...s, parts: s.parts.map((p) => (p.part === 'raptor-2' ? { ...p, part: 'stiff-raptor' } : p)), boosters: { ...s.boosters!, part: 'stiff-srb' } }
          : s,
      ),
    };
    const r = simulate(spec, catalog);
    expect(r.outcome.failure?.type).toBe('tumble');
  });
});

describe('Chaos Mode', () => {
  it('rolls the same faults for the same seed', () => {
    expect(rollFaults(a139, catalog, 42)).toEqual(rollFaults(a139, catalog, 42));
  });

  it('survives one core engine out by burning longer', () => {
    const r = simulate(a139, catalog, { faults: [{ kind: 'engineOut', stageIndex: 0, afterIgnitionS: 50, engines: 1 }] });
    expect(r.outcome.success).toBe(true);
    expect(r.events.some((e) => e.type === 'engineOut')).toBe(true);
    expect(r.checklist[0].status).toBe('fault');
  });

  it('a single-engine stage that loses its engine is an engine failure', () => {
    const r = simulate(a139, catalog, { faults: [{ kind: 'engineOut', stageIndex: 1, afterIgnitionS: 20, engines: 1 }] });
    expect(r.outcome.failure?.type).toBe('engineFailure');
  });

  it('a leak costs delta-v; a glitch is cleared by mission control', () => {
    const clean = simulate(a139, catalog).outcome.remainingDeltaVMS;
    const leak = simulate(a139, catalog, { faults: [{ kind: 'leak', fraction: 0.3 }] });
    expect(leak.outcome.remainingDeltaVMS).toBeLessThan(clean - 300);
    const glitch = simulate(a139, catalog, { faults: [{ kind: 'glitch', system: 'comms' }] });
    const comms = glitch.checklist.find((c) => c.system === 'comms')!;
    expect(comms.status).toBe('fault');
    expect(comms.clearedTS).toBeGreaterThan(comms.tS);
  });
});

describe('recovery', () => {
  it('boosters splash down gently under parachutes', () => {
    const m = flyMission(a139, catalog);
    const b = m.recoveries.find((r) => r.kind === 'boosters')!;
    expect(b.outcome).toBe('splashdown');
    expect(b.touchdownSpeedMS).toBeGreaterThan(15);
    expect(b.touchdownSpeedMS).toBeLessThan(30);
  });

  it('the core lands with enough reserve and crashes without', () => {
    const lands = flyMission(setRecovery(a139, 0, 'propulsive', 650e3), catalog);
    const core = lands.recoveries.find((r) => r.kind === 'stage')!;
    expect(core.outcome).toBe('landed');
    expect(core.touchdownSpeedMS).toBeLessThanOrEqual(6);

    const crash = flyMission(setRecovery(a139, 0, 'propulsive', 100e3), catalog);
    expect(crash.recoveries.find((r) => r.kind === 'stage')!.outcome).toBe('crashed');
  });

  it('auto-size finds the landing fuel and explains the Moon trade-off', () => {
    const r = autoSize(setRecovery(a139, 0, 'propulsive', 0), catalog);
    const reserve = r.spec.stages[0].landingReserveKg ?? 0;
    expect(reserve).toBeGreaterThan(300e3);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/for the Moon/);
    const m = flyMission(r.spec, catalog);
    expect(m.recoveries.find((x) => x.kind === 'stage')!.outcome).toBe('landed');
  }, 60_000);

  it('suggests saving more landing fuel after a crash landing', () => {
    const spec = setMission(setRecovery(a139, 0, 'propulsive', 450e3), { target: 'orbit' });
    const m = flyMission(spec, catalog);
    expect(m.result.failure?.type).toBe('crashLanding');
    const { fixes } = findFixes(spec, catalog, 'crashLanding');
    expect(fixes[0].complete).toBe(true);
    expect(fixes[0].id).toMatch(/^reserve-/);
  }, 30_000);
});

describe('re-entry', () => {
  it('has a lunar-return corridor like Apollo', () => {
    expect(simulateReentry(withAngle(saturn, -6.5), catalog, true)!.outcome).toBe('splashdown');
    expect(simulateReentry(withAngle(saturn, -4.5), catalog, true)!.outcome).toBe('skipOut');
    expect(simulateReentry(withAngle(saturn, -9), catalog, true)!.outcome).toBe('burnUp');
  });

  it('peaks near Apollo 11 g-loads and splashes down under parachutes', () => {
    const r = simulateReentry(saturn, catalog, true)!;
    expect(r.peakGLoad).toBeGreaterThan(5);
    expect(r.peakGLoad).toBeLessThan(8);
    expect(r.splashSpeedMS).toBeGreaterThan(7);
    expect(r.splashSpeedMS).toBeLessThan(10);
  });

  it('a thicker shield survives the heat, but the crew still feel the g', () => {
    const steep = setHeatShield(withAngle(saturn, -9), 2);
    expect(simulateReentry(steep, catalog, true)!.outcome).toBe('crewG');
  });

  it('suggests a shallower angle after burning up', () => {
    const spec = withAngle(a139, -8.5);
    expect(flyMission(spec, catalog).result.failure?.type).toBe('burnUp');
    const { fixes } = findFixes(spec, catalog, 'burnUp');
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0].complete).toBe(true);
  }, 30_000);
});
