// Ghost and Guess: every launch is an experiment. The last flight comes along as a ghost,
// Roscoe can call what will happen before he launches, and afterwards the game says whether
// the test was clean (one change, so we know what it did) or muddy (several, so we can't).

import type { MissionRecord } from '../physics/mission';
import type { ControlId } from '../physics/controls';
import type { RocketSpec } from '../physics/types';
import { describeChanges, type Change } from './changes';

/** A flight that has been flown: the rocket and how it went. */
export interface Flown {
  spec: RocketSpec;
  mission: MissionRecord;
}

// ---------- How far a flight got ----------

export type Reach = 'pad' | 'low' | 'space' | 'orbit';
export const SPACE_M = 100_000;

export const topHeightM = (m: MissionRecord) => m.ascent.samples.reduce((a, s) => Math.max(a, s.altitudeM), 0);

export function reachOf(m: MissionRecord): Reach {
  if (m.ascent.outcome.success) return 'orbit';
  if (m.ascent.outcome.failure?.type === 'noLiftoff') return 'pad';
  return topHeightM(m) >= SPACE_M ? 'space' : 'low';
}

export const REACHES: { id: Reach; emoji: string; label: string }[] = [
  { id: 'pad', emoji: '🧱', label: 'Stays on the pad' },
  { id: 'low', emoji: '☁️', label: 'Flies, but not to space' },
  { id: 'space', emoji: '🌌', label: 'Reaches space, then falls back' },
  { id: 'orbit', emoji: '🌍', label: 'Makes it to orbit' },
];

// ---------- This flight against the last one ----------

export type Dir = 'up' | 'same' | 'down';

export interface Compare {
  /** What is being measured, e.g. "Top height". */
  label: string;
  before: string;
  after: string;
  dir: Dir;
  /** The question to ask before launch, e.g. "Will it fly higher than last time?" */
  ask: string;
  /** Said instead of the numbers when the flight crossed a line, e.g. "It reached orbit this time!" */
  plain?: string;
  /** Button words for up, same and down. */
  words: [string, string, string];
}

const km = (m: number) => `${Math.round(m / 1000).toLocaleString()} km`;
const ms = (v: number) => `${Math.round(v).toLocaleString()} m/s`;

/** Up, down, or close enough to call the same (within 3%, or a small fixed amount). */
function dirOf(before: number, after: number, floor: number): Dir {
  const gap = after - before;
  if (Math.abs(gap) <= Math.max(floor, 0.03 * Math.abs(before))) return 'same';
  return gap > 0 ? 'up' : 'down';
}

/** What to measure depends on how far the last flight got. */
function yardstick(prev: MissionRecord): Pick<Compare, 'label' | 'ask' | 'words'> {
  const r = reachOf(prev);
  if (r === 'orbit')
    return { label: 'Fuel left in orbit (as extra speed)', ask: 'Will it have more fuel left in orbit than last time?', words: ['More', 'About the same', 'Less'] };
  if (r === 'pad')
    return { label: 'Push compared with weight', ask: 'Will it push harder against its weight than last time?', words: ['Harder', 'About the same', 'Weaker'] };
  return { label: 'Top height', ask: 'Will it fly higher than last time?', words: ['Higher', 'About the same', 'Lower'] };
}

export const askFor = (prev: MissionRecord) => yardstick(prev);

export function compareFlights(prev: MissionRecord, now: MissionRecord): Compare {
  const y = yardstick(prev);
  const rp = reachOf(prev);
  const rn = reachOf(now);
  if (rp === 'orbit') {
    const before = prev.ascent.outcome.remainingDeltaVMS;
    if (rn !== 'orbit') return { ...y, before: ms(before), after: 'did not reach orbit', dir: 'down', plain: 'It did not reach orbit this time' };
    const after = now.ascent.outcome.remainingDeltaVMS;
    return { ...y, before: ms(before), after: ms(after), dir: dirOf(before, after, 30) };
  }
  if (rp === 'pad') {
    const before = prev.ascent.summary.liftoffTWR;
    const after = now.ascent.summary.liftoffTWR;
    return { ...y, before: `${before.toFixed(2)}×`, after: `${after.toFixed(2)}×`, dir: dirOf(before, after, 0.01) };
  }
  const before = topHeightM(prev);
  if (rn === 'orbit') return { ...y, before: km(before), after: 'orbit!', dir: 'up', plain: `It reached orbit this time! (Last time it topped out at ${km(before)})` };
  const after = topHeightM(now);
  return { ...y, before: km(before), after: km(after), dir: dirOf(before, after, 2000) };
}

// ---------- What changed ----------

/** The parts of a rocket that decide how it flies (not its name or description). */
const flightKey = (s: RocketSpec) => JSON.stringify([s.stages, s.payload.parts, s.payload.heatShieldScale ?? 1, s.mission, s.customParts ?? [], s.structureScale ?? 1, s.launchSite]);

/** What differs between the last rocket flown and this one. Empty means it is the same rocket. */
export function changesSince(prev: RocketSpec, now: RocketSpec, ignore?: Set<ControlId>): Change[] {
  if (prev === now || flightKey(prev) === flightKey(now)) return [];
  const all = describeChanges(prev, now);
  // Changes the game made by itself (dials it looks after on Easy) are not Roscoe's experiment.
  const list = ignore?.size ? all.filter((c) => !c.control || !ignore.has(c.control)) : all;
  if (all.length && !list.length) return [];
  // Something changed that has no plain-words name (a redesigned engine, say).
  return list.length ? list : [{ text: 'Changed the design' }];
}

// ---------- The verdict after a flight ----------

export type Guess = Dir | Reach;

export interface Verdict {
  /** first: nothing to compare with. same: the same rocket again. clean: one change. muddy: several. */
  kind: 'first' | 'same' | 'clean' | 'muddy';
  changes: Change[];
  compare?: Compare;
  /** The problem last time is gone, or there is a new one (in plain words). */
  problem?: 'fixed' | 'moved' | 'new';
  /** What Roscoe called, whether he was right, and what really happened. */
  guess?: { said: string; right: boolean; got: string };
}

const problemOf = (m: MissionRecord) => m.result.failure?.type;

export function judge(prev: Flown | null, now: Flown, guess: Guess | null, ignore?: Set<ControlId>): Verdict {
  if (!prev) {
    const r = reachOf(now.mission);
    const pick = REACHES.find((x) => x.id === guess);
    return { kind: 'first', changes: [], guess: pick ? { said: pick.label.toLowerCase(), right: pick.id === r, got: REACHES.find((x) => x.id === r)!.label.toLowerCase() } : undefined };
  }
  const changes = changesSince(prev.spec, now.spec, ignore);
  if (!changes.length) return { kind: 'same', changes };
  const compare = compareFlights(prev.mission, now.mission);
  const before = problemOf(prev.mission);
  const after = problemOf(now.mission);
  const problem = before && !after ? 'fixed' : before && before !== after ? 'moved' : !before && after ? 'new' : undefined;
  const k = (['up', 'same', 'down'] as Dir[]).indexOf(guess as Dir);
  return {
    kind: changes.length === 1 ? 'clean' : 'muddy',
    changes,
    compare,
    problem,
    guess: k >= 0 ? { said: compare.words[k].toLowerCase(), right: guess === compare.dir, got: compare.words[(['up', 'same', 'down'] as Dir[]).indexOf(compare.dir)].toLowerCase() } : undefined,
  };
}

const ARROW: Record<Dir, string> = { up: '📈', same: '➡️', down: '📉' };

const TAIL = { fixed: ', and it fixed the problem', moved: ', and it fixed that problem (now there’s a different one)', new: ', but it made a new problem', none: '' };

/** What the one change did, in a sentence for the Lab Notes. */
export function effectText(v: Verdict): string {
  const c = v.compare!;
  const moved = c.plain ? c.plain : c.dir === 'same' ? `${c.label} stayed about the same (${c.after})` : `${c.label}: ${c.before} → ${c.after}`;
  // Losing orbit already says what went wrong; no need to add "a new problem".
  const tail = c.plain && c.dir === 'down' ? '' : TAIL[v.problem ?? 'none'];
  return `${ARROW[c.dir]} ${moved}${tail}`;
}

// ---------- Lab Notes, saved on this device ----------

export interface Finding {
  change: string;
  effect: string;
  /** Where it was found: a mission title, or the Sandbox. */
  where: string;
}

export interface Lab {
  findings: Finding[];
  guesses: number;
  right: number;
  clean: number;
}

const KEY = 'spaceq-lab';
const MAX_FINDINGS = 40;
export const EMPTY_LAB: Lab = { findings: [], guesses: 0, right: 0, clean: 0 };

export function loadLab(): Lab {
  try {
    const l = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      findings: Array.isArray(l.findings) ? l.findings.filter((f: Finding) => f?.change && f?.effect) : [],
      guesses: Number(l.guesses) || 0,
      right: Number(l.right) || 0,
      clean: Number(l.clean) || 0,
    };
  } catch {
    return EMPTY_LAB;
  }
}

export function saveLab(lab: Lab) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lab));
  } catch {
    /* storage unavailable: the notes last for this visit */
  }
}

/** Add a flight's verdict to the notes: the guess tally, and a finding if the test was clean. */
export function record(lab: Lab, v: Verdict, where: string): Lab {
  const next = { ...lab };
  if (v.guess) {
    next.guesses++;
    if (v.guess.right) next.right++;
  }
  if (v.kind === 'clean') {
    next.clean++;
    const f: Finding = { change: v.changes[0].text, effect: effectText(v), where };
    // The same test again replaces its old note; newest first.
    next.findings = [f, ...lab.findings.filter((x) => x.change !== f.change)].slice(0, MAX_FINDINGS);
  }
  return next;
}
