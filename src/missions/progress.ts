// Mission progress, saved on this device: best stars per mission. One star unlocks the next.

import { ALL_CONTROLS, type ControlId } from '../physics/controls';
import { MISSIONS, RANKS } from './missions';
import type { SkillId } from './skills';

const KEY = 'spaceq-progress';

export interface Progress {
  stars: Record<string, number>;
  /** A grown-up opened every mission up to this one (an index), e.g. after moving to a new device. */
  openTo?: number;
}

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const stars = typeof p.stars === 'object' && p.stars ? p.stars : {};
    return Number.isInteger(p.openTo) && p.openTo > 0 ? { stars, openTo: p.openTo } : { stars };
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

export const isUnlocked = (p: Progress, index: number) => index === 0 || index <= (p.openTo ?? 0) || (p.stars[MISSIONS[index - 1].id] ?? 0) >= 1;

/** The furthest mission open right now (an index). */
export function furthestOpen(p: Progress): number {
  let i = 0;
  while (i + 1 < MISSIONS.length && isUnlocked(p, i + 1)) i++;
  return i;
}

// ---------- Save codes ----------
// A short code that carries progress to another device. Missions are listed in order and new
// ones are only ever added at the end, so old codes stay good.
// Layout: two characters for openTo, one per pair of missions (stars 0-3 each), then a check character.

const ABC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O or 1/I to mix up

export function saveCode(p: Progress): string {
  const vals: number[] = [];
  const open = Math.min(1023, p.openTo ?? 0);
  vals.push(open >> 5, open & 31);
  const pairs: number[] = [];
  for (let i = 0; i < MISSIONS.length; i += 2) {
    const a = Math.min(3, p.stars[MISSIONS[i].id] ?? 0);
    const b = i + 1 < MISSIONS.length ? Math.min(3, p.stars[MISSIONS[i + 1].id] ?? 0) : 0;
    pairs.push(a * 4 + b);
  }
  while (pairs.length && pairs[pairs.length - 1] === 0) pairs.pop();
  vals.push(...pairs);
  vals.push(vals.reduce((sum, v, k) => sum + v * (k + 1), 0) % 32);
  const text = vals.map((v) => ABC[v]).join('');
  return `Q-${text.match(/.{1,4}/g)!.join('-')}`;
}

/** Read a save code; null if it isn't one (a typo, most likely). */
export function readSaveCode(code: string): Progress | null {
  const text = code.toUpperCase().replace(/^\s*Q-?/, '').replace(/[^0-9A-Z]/g, '');
  if (text.length < 3) return null;
  const vals = [...text].map((c) => ABC.indexOf(c));
  if (vals.some((v) => v < 0)) return null;
  const check = vals.pop()!;
  if (vals.reduce((sum, v, k) => sum + v * (k + 1), 0) % 32 !== check) return null;
  const openTo = vals[0] * 32 + vals[1];
  const pairs = vals.slice(2);
  if (pairs.some((v) => v > 15)) return null;
  const stars: Record<string, number> = {};
  pairs.forEach((v, k) => {
    const a = MISSIONS[k * 2];
    const b = MISSIONS[k * 2 + 1];
    if (a && v >> 2) stars[a.id] = v >> 2;
    if (b && v & 3) stars[b.id] = v & 3;
  });
  const out: Progress = { stars };
  if (openTo > 0) out.openTo = Math.min(openTo, MISSIONS.length - 1);
  return out;
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
