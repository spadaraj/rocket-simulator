// Did's clue on a failed flight. It comes from a plan that was flown on the rocket Roscoe
// actually built, so it says how many things are wrong and never points somewhere unhelpful.
// How direct it is depends on the level.

import { CONTROL_INFO } from '../../missions/controlInfo';
import type { Level } from '../../missions/level';
import type { ControlId } from '../../physics/controls';
import type { Plan } from '../../physics/plan';
import { Did } from './Characters';

export interface PlanState {
  status: 'working' | 'done';
  plan?: Plan;
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const word = (n: number) => WORDS[n] ?? String(n);
const things = (n: number) => `thing${n === 1 ? '' : 's'}`;

/** The clue in words: how many things are wrong, and (by level) what to do first. */
export function clueText(plan: Plan, level: Level, prevCount?: number): { count: string; first: string | null } {
  const n = plan.steps.length;
  const step = plan.steps[0];
  const fixedSome = prevCount !== undefined && n < prevCount;
  const count = fixedSome
    ? `✅ That fixed ${prevCount - n === 1 ? 'one' : 'some'}! ${n === 1 ? 'One more' : `${word(n)} more`} to go.`
    : plan.complete
      ? `${word(n)} ${things(n)} to fix.`
      : `At least ${word(n).toLowerCase()} ${things(n)} to fix.`;
  if (level === 'hard') return { count, first: null };
  const lead = n > 1 ? 'First' : 'Here’s how';
  if (level === 'easy' || !step.control) return { count, first: `${lead}: ${step.roscoe.replace(/[.!]$/, '')}.` };
  return { count, first: `${n > 1 ? 'First, look' : 'Look'} at “${CONTROL_INFO[step.control].label}” in Build.` };
}

interface Props {
  plan?: PlanState;
  level: Level;
  /** Failed tries so far in this mission. */
  attempts: number;
  /** How many things the plan said were wrong after the last flight. */
  prevCount?: number;
  /** Said when there is no tested plan (the mission's own hint). */
  fallback?: string | null;
  onShowMe: (c: ControlId) => void;
  /** Go to Build without pointing at anything. */
  onBuild: () => void;
  /** Did walks through the whole fix, one change at a time. */
  onWalk?: () => void;
}

export function Clue({ plan, level, attempts, prevCount, fallback, onShowMe, onBuild, onWalk }: Props) {
  const steps = plan?.plan?.steps ?? [];
  if (plan?.status === 'working')
    return (
      <div className="lesson-hint">
        <Did size={56} />
        <div>
          <b>Did:</b> I’m testing fixes on your rocket…
        </div>
      </div>
    );
  const walk = onWalk && level !== 'hard' && attempts >= (level === 'easy' ? 2 : 3);
  if (!steps.length) {
    if (!fallback && !walk) return null;
    return (
      <div className="lesson-hint clue">
        <Did size={56} />
        <div>
          <b>Did:</b> {fallback ?? 'This one is tricky! Want me to walk you through it?'}
          <div className="clue-actions">
            <button className="btn big primary" onClick={onBuild}>
              🔧 Go to Build
            </button>
            {walk && (
              <button className="btn small" onClick={onWalk}>
                🧭 Walk me through it
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  const { count, first } = clueText(plan!.plan!, level, prevCount);
  const control = steps[0].control;
  // Easy (and Medium after a couple of tries): the button opens Build with the dial lit up.
  const point = control && (level === 'easy' || (level === 'medium' && attempts >= 2));
  return (
    <div className="lesson-hint clue">
      <Did size={56} />
      <div>
        <b>Did: {count}</b>
        {first ? <p>{first}</p> : <p>You have the dials. Which ones would fix it?</p>}
        <small>🧪 I flew {steps.length === 1 ? 'it' : 'them'} on your rocket. {steps.length === 1 ? 'It works' : 'They work'}.</small>
        <div className="clue-actions">
          <button className="btn big primary" onClick={point ? () => onShowMe(control) : onBuild}>
            🔧 Fix it in Build
          </button>
          {walk && (
            <button className="btn small" onClick={onWalk}>
              🧭 Walk me through it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
