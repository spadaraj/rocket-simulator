// What a mission is: a story, a starting rocket, a goal the flight record can check,
// two more stars for doing it well, and what it teaches.

import type { ControlId } from '../physics/controls';
import type { MissionRecord } from '../physics/mission';
import type { EventType, Fault, RocketSpec } from '../physics/types';
import type { SkillId } from './skills';

/** Things the player did during the mission that stars can ask about. */
export interface PlayStats {
  usedSlow: boolean;
  chaos: boolean;
  saved: boolean;
}

export interface CheckContext {
  m: MissionRecord;
  spec: RocketSpec;
  stats: PlayStats;
}

export interface StarGoal {
  text: string;
  check: (c: CheckContext) => boolean;
}

/** What the coach is waiting for before the next tutorial step. */
export interface CoachContext {
  phase: string;
  tab: string;
  spec: RocketSpec;
  speed: number;
}

export interface CoachStep {
  say: string;
  /** Point at a control (or the launch button / a tab). */
  point?: ControlId | 'launch' | 'tab:build' | 'tab:fly';
  /** Wait for this; without it, the step waits for a tap on what it points at, or an OK. */
  until?: (c: CoachContext) => boolean;
  /** Show an OK button even while pointing at something. */
  ok?: boolean;
}

export interface Mission {
  id: string;
  chapter: number;
  /** History sims re-fly real missions; Space Q missions are Roscoe's own. */
  kind: 'history' | 'spaceq';
  title: string;
  /** For history sims: the real mission and year. */
  real?: string;
  patch: string;
  /** Flight Director Did's briefing, a few short lines. */
  briefing: string[];
  goalText: string;
  rocket: () => RocketSpec;
  faults?: Fault[];
  goal: (c: CheckContext) => boolean;
  stars: [StarGoal, StarGoal];
  /** Controls this mission introduces. */
  unlocks: ControlId[];
  skill: SkillId;
  /** Tutorial steps once the briefing is done. */
  coach?: CoachStep[];
  /** Did's lines during the flight, at these events. */
  flightLines?: Partial<Record<EventType, string>>;
  /** If the goal is missed: a nudge, then a specific tip. The third try offers "Show me". */
  hints: [string, string];
  hintControl: ControlId;
  debrief: string;
  /** A known way to win, for tests. */
  solve: (spec: RocketSpec) => RocketSpec;
}

export interface Chapter {
  n: number;
  title: string;
  rank: string;
}
