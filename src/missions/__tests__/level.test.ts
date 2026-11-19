import { describe, expect, it } from 'vitest';
import { catalog } from '../../data/catalog';
import { addStage, blankRocket, setEngineCount } from '../../physics/edit';
import { flyMission } from '../../physics/mission';
import { planFixes } from '../../physics/plan';
import { describeChanges } from '../../ui/changes';
import { clueText } from '../../ui/mission/Clue';
import { EASY_DIALS, caredFor, visibleControls, visibleSlots, watchEndS } from '../level';
import { MISSIONS } from '../missions';
import { loadProgress, withStars } from '../progress';

describe('difficulty levels', () => {
  it('Easy shows fewer dials than Medium in every mission, and never hides one the mission needs', () => {
    for (const m of MISSIONS) {
      const easy = visibleControls('easy', m, {})!;
      const medium = visibleControls('medium', m, {})!;
      expect(easy.size, m.id).toBeLessThanOrEqual(medium.size);
      for (const c of easy) expect(medium.has(c), `${m.id}: ${c}`).toBe(true);
      // The mission's own answer can be made with the dials on screen.
      const start = m.rocket();
      for (const ch of describeChanges(start, m.solve(start))) if (ch.control) expect(easy.has(ch.control), `${m.id}: ${ch.text}`).toBe(true);
      for (const c of m.unlocks) expect(easy.has(c), `${m.id}: ${c}`).toBe(true);
    }
  });

  it('the Sandbox grows: big dials on Easy, learned dials on Medium, everything on Hard', () => {
    const easy = visibleControls('easy', null, {})!;
    expect([...easy].sort()).toEqual([...EASY_DIALS].sort());
    const first = MISSIONS.find((m) => m.unlocks.some((c) => !EASY_DIALS.includes(c)))!;
    const medium = visibleControls('medium', null, { [first.id]: 1 })!;
    for (const c of first.unlocks) expect(medium.has(c)).toBe(true);
    expect(visibleControls('medium', null, {})!.size).toBe(easy.size);
    expect(visibleControls('hard', null, {})).toBeUndefined();
    expect(visibleSlots('easy', null)!.has('capsule')).toBe(true);
    expect(visibleSlots('hard', null)).toBeUndefined();
  });

  it('only Easy has dials the game looks after, and only ones that are off screen', () => {
    const easy = visibleControls('easy', null, {});
    expect(caredFor('easy', easy).has('fins')).toBe(true);
    expect(caredFor('medium', easy).size).toBe(0);
    for (const c of caredFor('easy', easy)) expect(easy!.has(c)).toBe(false);
  });

  it('Easy stops watching soon after orbit or after a failure; other levels watch it all', () => {
    const good = flyMission(addStage(blankRocket(), catalog), catalog);
    expect(good.result.failure).toBeUndefined();
    expect(watchEndS('easy', good)).toBeLessThan(good.flightDurationS);
    expect(watchEndS('medium', good)).toBe(good.flightDurationS);
    const bad = flyMission(setEngineCount(addStage(blankRocket(), catalog), catalog, 0, 1), catalog);
    expect(watchEndS('easy', bad)).toBeLessThanOrEqual(bad.flightDurationS);
  });

  it('keeps stars per level, and counts old saves as Medium', () => {
    const p = withStars(loadProgress(), 'liftoff', 'easy', 2);
    expect(p.levels.easy.liftoff).toBe(2);
    expect(p.levels.medium.liftoff).toBeUndefined();
    expect(p.stars.liftoff).toBe(2);
    expect(withStars(p, 'liftoff', 'easy', 1).levels.easy.liftoff).toBe(2);
  });
});

describe('Did’s tested plan', () => {
  // Too few engines to lift off AND a heat shield too thin to come home.
  const oneEngine = setEngineCount(addStage(blankRocket(), catalog), catalog, 0, 1);
  const broken = { ...oneEngine, payload: { ...oneEngine.payload, heatShieldScale: 0.3 } };

  it('finds every change it takes, and the rocket at the end flies', () => {
    const plan = planFixes(broken, catalog);
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.complete).toBe(true);
    expect(flyMission(plan.steps[plan.steps.length - 1].spec, catalog).result.failure).toBeUndefined();
  });

  it('only uses dials that are on screen', () => {
    const plan = planFixes(broken, catalog, [], EASY_DIALS);
    expect(plan.steps.length).toBeGreaterThan(0);
    for (const s of plan.steps) expect(EASY_DIALS).toContain(s.control);
    // The heat shield is not an Easy dial, so the plan stops short and says so.
    expect(plan.complete).toBe(false);
    expect(clueText(plan, 'easy').count).toMatch(/^At least/);
  });

  it('says how many things are wrong, and is more direct on easier levels', () => {
    const plan = planFixes(broken, catalog);
    const n = plan.steps.length;
    const easy = clueText(plan, 'easy');
    expect(easy.count).toMatch(/things to fix/);
    expect(easy.first).toContain(plan.steps[0].roscoe.replace(/[.!]$/, ''));
    expect(clueText(plan, 'medium').first).toMatch(/look at/i);
    expect(clueText(plan, 'hard').first).toBeNull();
    expect(clueText(plan, 'easy', n + 1).count).toMatch(/That fixed one/);
  });
});
