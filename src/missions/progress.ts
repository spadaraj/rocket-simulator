// Mission progress, saved on this device: best stars per mission. One star unlocks the next.

import { ALL_CONTROLS, type ControlId } from '../physics/controls';
import { MISSIONS, RANKS } from './missions';
import type { SkillId } from './skills';

const KEY = 'spaceq-progress';

export interface Progress {
  stars: Record<string, number>;
}

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { stars: typeof p.stars === 'object' && p.stars ? p.stars : {} };
  } catch {
    return { stars: {} };
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress lasts for this visit */
  }
}

export const isUnlocked = (p: Progress, index: number) => index === 0 || (p.stars[MISSIONS[index - 1].id] ?? 0) >= 1;

/** Controls available while playing a mission: everything taught up to and including it. */
export function controlsFor(missionId: string): Set<ControlId> {
  const i = MISSIONS.findIndex((m) => m.id === missionId);
  return new Set(MISSIONS.slice(0, i + 1).flatMap((m) => m.unlocks));
}

/** Controls that are new in this mission. */
export const newControls = (missionId: string): ControlId[] => MISSIONS.find((m) => m.id === missionId)?.unlocks ?? [];

export const learnedSkills = (p: Progress): SkillId[] => MISSIONS.filter((m) => (p.stars[m.id] ?? 0) >= 1).map((m) => m.skill);

export function rank(p: Progress): string {
  let r = 0;
  for (let ch = 1; ch <= RANKS.length - 1; ch++) {
    const inChapter = MISSIONS.filter((m) => m.chapter === ch);
    if (inChapter.length && inChapter.every((m) => (p.stars[m.id] ?? 0) >= 1)) r = ch;
  }
  return RANKS[r];
}

export const totalStars = (p: Progress) => Object.values(p.stars).reduce((a, b) => a + b, 0);

export { ALL_CONTROLS };
