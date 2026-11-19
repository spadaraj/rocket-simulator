// A fix plan: every change it takes to get from this rocket to one that flies the whole
// mission, found by re-flying. One fix often uncovers the next problem, so the plan follows
// the chain, and Did can say "two things to fix" and mean it.

import type { ControlId } from './controls';
import { findFixes, type FixResult } from './fixes';
import { flyMission } from './mission';
import type { Catalog, Fault, MissionFailureType, RocketSpec } from './types';

export interface PlanStep {
  /** What to change, in Roscoe's words. */
  roscoe: string;
  /** The builder control the change lives under. */
  control?: ControlId;
  /** The problem this change gets past. */
  problem?: MissionFailureType;
  /** The rocket after this change. */
  spec: RocketSpec;
  /** The tested fix behind the step, when it came from the fix finder. */
  fix?: FixResult;
}

export interface Plan {
  steps: PlanStep[];
  /** The rocket at the end of the plan has no failure left. */
  complete: boolean;
}

/**
 * Follow fixes from one problem to the next. Only fixes on `allowed` controls are used (all
 * of them when absent), so Did never points at a dial that is not on screen.
 */
export function planFixes(spec: RocketSpec, catalog: Catalog, faults: Fault[] = [], allowed?: ControlId[], maxSteps = 4): Plan {
  const ok = (c?: ControlId) => !allowed || (!!c && allowed.includes(c));
  const steps: PlanStep[] = [];
  let cur = spec;
  for (let k = 0; k < maxSteps; k++) {
    const failure = flyMission(cur, catalog, { faults }).result.failure;
    if (!failure) return { steps, complete: true };
    // Fixes come back with whole-mission fixes first, then the smallest change.
    const pick = findFixes(cur, catalog, failure.type, 12, failure.detail, faults).fixes.find((f) => ok(f.control));
    if (!pick) return { steps, complete: false };
    steps.push({ roscoe: pick.roscoe, control: pick.control, problem: failure.type, spec: pick.spec, fix: pick });
    cur = pick.spec;
    if (pick.complete) return { steps, complete: true };
  }
  return { steps, complete: !flyMission(cur, catalog, { faults }).result.failure };
}
