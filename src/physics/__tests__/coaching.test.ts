// Help that fits the problem: Did's build checklist, "what changed" wording, and the
// step-by-step walkthrough after a few tries.

import { describe, expect, it } from 'vitest';
import { catalog } from '../../data/catalog';
import { MISSIONS } from '../../missions/missions';
import { controlsFor } from '../../missions/progress';
import { stepDone, walkthroughSteps } from '../../missions/walkthrough';
import { describeChanges } from '../../ui/changes';
import { missionChecks } from '../../ui/mission/MissionCard';
import { addStage, setEngineCount, setPayloadSlot, setTank } from '../edit';

describe('Did’s build checklist', () => {
  for (const m of MISSIONS)
    it(`${m.title}: the known answer ticks every box`, () => {
      const solved = m.solve(m.rocket());
      for (const c of missionChecks(m)) expect(c.ok(solved), c.text).toBe(true);
    });

  it('flags what the starting rocket is missing', () => {
    const sputnik = MISSIONS.find((m) => m.id === 'sputnik')!;
    expect(missionChecks(sputnik).filter((c) => !c.ok(sputnik.rocket())).map((c) => c.text)).toEqual(['🛰️ A satellite on top']);
    const moon = MISSIONS.find((m) => m.id === 'around-the-moon')!;
    expect(missionChecks(moon)[0].ok(moon.rocket())).toBe(false);
  });
});

describe('What changed', () => {
  const trainer = MISSIONS[0].rocket();

  it('names engines, stages and payload in plain words', () => {
    expect(describeChanges(trainer, setEngineCount(trainer, catalog, 0, 5)).map((c) => c.text)).toEqual(['The bottom stage: engines 3 → 5']);
    const two = addStage(trainer, catalog);
    expect(describeChanges(trainer, two)[0]).toMatchObject({ text: 'Added a stage (now 3)', control: 'addStage' });
    const sat = setPayloadSlot(trainer, 'cargo', 'satellite-small');
    expect(describeChanges(trainer, sat).map((c) => c.control)).toContain('payload');
    expect(describeChanges(trainer, trainer)).toEqual([]);
  });
});

describe('Walk me through it', () => {
  for (const m of MISSIONS.filter((x) => x.id !== 'liftoff'))
    it(`${m.title}: Did can walk from the starting rocket to the answer with buttons Roscoe has`, () => {
      const start = m.rocket();
      const steps = walkthroughSteps(start, m.solve(start), controlsFor(m.id));
      expect(steps, m.id).not.toBeNull();
      // Doing the answer finishes every change step.
      const ctx = { phase: 'ready', tab: 'build', spec: m.solve(start), speed: 10 };
      for (const s of steps!.slice(1, -2)) expect(s.until!(ctx), s.say).toBe(true);
      // And the starting rocket finishes none of them.
      for (const s of steps!.slice(1, -2)) expect(s.until!({ ...ctx, spec: start }), s.say).toBe(false);
    });

  it('counts a fuel tank pushed past the target as done', () => {
    const m = MISSIONS.find((x) => x.id === 'fuel-for-the-job')!;
    const start = m.rocket();
    const target = m.solve(start);
    const bigger = setTank(target, catalog, 1, { lengthM: 5 });
    expect(stepDone(start, target, target, 'tank')).toBe(true);
    expect(stepDone(start, bigger, target, 'tank')).toBe(true);
    expect(stepDone(start, start, target, 'tank')).toBe(false);
  });
});
