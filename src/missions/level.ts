// Difficulty: Easy, Medium or Hard. The physics never changes. The level sets how many dials
// are on the Build screen, how direct Did's clues are, and how long a flight takes to watch.

import { ALL_CONTROLS, type ControlId } from '../physics/controls';
import { PAYLOAD_SLOTS, payloadSlot, type PayloadSlot } from '../physics/edit';
import type { MissionRecord } from '../physics/mission';
import type { MissionFailureType } from '../physics/types';
import { describeChanges } from '../ui/changes';
import { MISSIONS } from './missions';
import type { Mission } from './types';

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: { id: Level; emoji: string; label: string; blurb: string }[] = [
  { id: 'easy', emoji: '🟢', label: 'Easy', blurb: 'A few big dials. Did’s clues say what to change.' },
  { id: 'medium', emoji: '🟡', label: 'Medium', blurb: 'The dials you have learned. Did’s clues say where to look.' },
  { id: 'hard', emoji: '🔴', label: 'Hard', blurb: 'Every dial. Did only says how many things are wrong.' },
];

const KEY = 'spaceq-level';

export function loadLevel(): Level {
  try {
    const l = localStorage.getItem(KEY);
    return l === 'medium' || l === 'hard' ? l : 'easy';
  } catch {
    return 'easy';
  }
}

export function saveLevel(l: Level) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* storage unavailable: the level lasts for this visit */
  }
}

/** The big dials: engines, fuel, stages and what's on top (plus where to go, and naming the rocket). */
export const EASY_DIALS: ControlId[] = ['speed', 'build', 'stageStrip', 'engines', 'tank', 'addStage', 'payload', 'lander', 'whereTo', 'scratch'];

/** Dials the game looks after by itself on Easy, when they are not on screen. */
export const CARE_DIALS: ControlId[] = ['fins', 'stronger', 'easeOff', 'heatShield', 'comeHome', 'landingFuel'];

/** The "On top" rows shown on Easy. */
const EASY_SLOTS: PayloadSlot[] = ['capsule', 'cargo', 'lander'];

const solved = (m: Mission) => {
  const start = m.rocket();
  return { start, end: m.solve(start) };
};

/** Controls a mission's own answer changes: these must always be on screen. */
export function missionNeeds(m: Mission): ControlId[] {
  const { start, end } = solved(m);
  return [...m.unlocks, m.hintControl, ...describeChanges(start, end).flatMap((c) => (c.control ? [c.control] : []))];
}

/** Controls taught up to and including a mission. */
const taught = (m: Mission) => MISSIONS.slice(0, MISSIONS.indexOf(m) + 1).flatMap((x) => x.unlocks);

/**
 * Which controls are on screen. `undefined` means all of them.
 * In a mission: Easy shows the big dials taught so far plus whatever this mission needs;
 * Medium and Hard show everything taught so far.
 * In the Sandbox: Easy shows the big dials, Medium adds what finished missions have taught,
 * Hard shows everything.
 */
export function visibleControls(level: Level, mission: Mission | null, stars: Record<string, number>): Set<ControlId> | undefined {
  if (mission) {
    const known = taught(mission);
    if (level !== 'easy') return new Set(known);
    return new Set([...known.filter((c) => EASY_DIALS.includes(c)), ...missionNeeds(mission)]);
  }
  if (level === 'hard') return undefined;
  if (level === 'easy') return new Set(EASY_DIALS);
  const learned = MISSIONS.filter((m) => (stars[m.id] ?? 0) >= 1).flatMap((m) => m.unlocks);
  return new Set([...EASY_DIALS, ...learned]);
}

/** Which "On top" rows are on screen. `undefined` means all of them. */
export function visibleSlots(level: Level, mission: Mission | null): Set<PayloadSlot> | undefined {
  if (level !== 'easy') return undefined;
  const out = new Set<PayloadSlot>(EASY_SLOTS);
  if (mission) {
    const { start, end } = solved(mission);
    for (const { slot } of PAYLOAD_SLOTS) if (payloadSlot(start, slot) !== payloadSlot(end, slot)) out.add(slot);
  }
  return out;
}

/** Dials the game keeps right by itself: the care dials that are not on screen. Easy only. */
export function caredFor(level: Level, visible: Set<ControlId> | undefined): Set<ControlId> {
  if (level !== 'easy' || !visible) return new Set();
  return new Set(CARE_DIALS.filter((c) => !visible.has(c)));
}

/** Failures the care dials are there to prevent. */
export const CARE_FAILURES: MissionFailureType[] = ['breakup', 'tumble', 'burnUp', 'skipOut', 'crewG', 'crashLanding'];

/**
 * How long the launch is watched for. Easy skips the long waits: the coast after reaching
 * orbit, and the long fall after a flight has already failed.
 */
export function watchEndS(level: Level, m: MissionRecord): number {
  const full = m.flightDurationS;
  if (level !== 'easy') return full;
  const failure = m.ascent.outcome.failure;
  if (failure) return Math.min(full, failure.tS + 20);
  const orbit = m.ascent.events.find((e) => e.type === 'orbit');
  if (!orbit) return full;
  // Stay for anything that is being flown back to land or splash down.
  const pieces = m.recoveries.filter((r) => r.method !== 'none').map((r) => r.samples[r.samples.length - 1]?.tS ?? 0);
  return Math.min(full, Math.max(orbit.tS + 8, ...pieces.map((t) => t + 3)));
}

export { ALL_CONTROLS };
