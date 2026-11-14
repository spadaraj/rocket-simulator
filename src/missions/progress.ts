// Mission progress, saved on this device: best stars per mission. Every mission is always open;
// stars just show which ones Roscoe has done.

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
    const stars = typeof p.stars === 'object' && p.stars ? p.stars : {};
    return { stars };
  } catch {
    return { stars: {} };
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    // Ask the browser not to clear the save when space runs low (it may say no; that's fine).
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* storage unavailable: progress lasts for this visit */
  }
}

/** The first mission with no stars yet: where Roscoe probably left off. */
export function upNext(p: Progress): number {
  const i = MISSIONS.findIndex((m) => !(p.stars[m.id] ?? 0));
  return i < 0 ? -1 : i;
}

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
