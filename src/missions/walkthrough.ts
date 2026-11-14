// After a few tries, Did walks Roscoe through a fix one change at a time: go to Build,
// change each thing (he points at it and waits until it's done), then fly.

import { catalog } from '../data/catalog';
import type { ControlId } from '../physics/controls';
import { stageFill, stageTank } from '../physics/edit';
import type { RocketSpec } from '../physics/types';
import { resolveCatalog } from '../physics/vehicle';
import { describeChanges } from '../ui/changes';
import { CONTROL_INFO } from './controlInfo';
import type { CoachStep } from './types';

const fuel = (s: RocketSpec, i: number) => {
  const cat = resolveCatalog(s, catalog);
  const t = stageTank(s, cat, i);
  return t ? t.part.propellantCapacityKg * stageFill(s, cat, i) : 0;
};

/** Close enough to the target for this control: the same, or past it in the right direction for amounts. */
export function stepDone(start: RocketSpec, now: RocketSpec, target: RocketSpec, control: ControlId): boolean {
  if (!describeChanges(now, target).some((c) => c.control === control)) return true;
  if (control === 'tank' && now.stages.length === target.stages.length) {
    return target.stages.every((_, i) => {
      const want = fuel(target, i);
      const dir = Math.sign(want - fuel(start, i));
      const have = fuel(now, i);
      return dir === 0 ? Math.abs(have - want) <= 0.1 * want + 500 : dir * (have - want) >= -0.05 * want;
    });
  }
  if (control === 'landingFuel') {
    return target.stages.every((st, i) => {
      const want = st.landingReserveKg ?? 0;
      const dir = Math.sign(want - (start.stages[i]?.landingReserveKg ?? 0));
      return dir * ((now.stages[i]?.landingReserveKg ?? 0) - want) >= -0.05 * want;
    });
  }
  return false;
}

/** Coach steps from one rocket to another; null if a change has no button Roscoe can press. */
export function walkthroughSteps(start: RocketSpec, target: RocketSpec, controls?: Set<ControlId>): CoachStep[] | null {
  const changes = describeChanges(start, target);
  if (!changes.length || changes.some((c) => !c.control || (controls && !controls.has(c.control)))) return null;
  // One step per control, in the order the changes were found.
  const seen = new Set<ControlId>();
  const byControl = changes.filter((c) => !seen.has(c.control!) && seen.add(c.control!));
  const n = byControl.length;
  return [
    { say: 'Let’s fix it together, one step at a time. First, tap Build.', point: 'tab:build', until: (c) => c.tab === 'build' },
    ...byControl.map(
      (ch, k): CoachStep => ({
        say: `Step ${k + 1} of ${n}, ${CONTROL_INFO[ch.control!].label}: ${changes
          .filter((x) => x.control === ch.control)
          .map((x) => x.text)
          .join(', ')}. ${CONTROL_INFO[ch.control!].explain}`,
        point: ch.control,
        until: (c) => stepDone(start, c.spec, target, ch.control!),
      }),
    ),
    { say: 'That’s everything! Now tap Fly.', point: 'tab:fly', until: (c) => c.tab === 'fly' },
    { say: 'Launch it, and let’s see if it works!', point: 'launch', until: (c) => c.phase !== 'ready' },
  ];
}
