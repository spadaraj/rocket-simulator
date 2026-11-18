// Crash Detective: a rocket that should work keeps failing, because one part has a hidden
// fault. The flight recorder shows how it should fly next to how it flew. Roscoe swaps parts
// for fresh ones on test flights (as few as he can), then names the culprit.
//
// Everything here is pure: the cases, the hidden faults, the recorder and the scoring.

import { catalog, presets } from '../data/catalog';
import { addStage, blankRocket, setFill, setName } from '../physics/edit';
import { flyMission, type MissionRecord } from '../physics/mission';
import type { Fault, MissionFailureType, RocketSpec } from '../physics/types';

// ---------- suspects: parts that might be hiding a fault ----------

/** What a hidden fault does to the rocket that flies (the rocket on screen still looks right). */
type Sabotage = (spec: RocketSpec) => { spec: RocketSpec; faults: Fault[] };

export interface Suspect {
  id: string;
  emoji: string;
  name: string;
  /** What the flight would look like if this were the broken part. */
  tell: string;
  /** Said when the case is closed: what was really wrong. */
  story: string;
  sabotage: Sabotage;
}

const ORDINAL = ['First', 'Second', 'Third'];

/** Some of a stage's engines quit soon after it lights. */
function engines(stage: number, out: number, afterS: number, single = false): Suspect {
  const st = ORDINAL[stage];
  return {
    id: `engine${stage + 1}`,
    emoji: '🔥',
    name: `${st}-stage ${single ? 'engine' : 'engines'}`,
    tell: single ? `The ${st.toLowerCase()}-stage engine quits early, before its fuel is gone.` : `Some ${st.toLowerCase()}-stage engines quit early.`,
    story: single
      ? `A blocked fuel pipe starved the ${st.toLowerCase()}-stage engine, so it quit early.`
      : `A blocked fuel pipe starved ${out === 1 ? 'one' : 'some'} of the ${st.toLowerCase()}-stage engines, so ${out === 1 ? 'it' : 'they'} quit early.`,
    sabotage: (spec) => ({ spec, faults: [{ kind: 'engineOut', stageIndex: stage, afterIgnitionS: afterS, engines: out }] }),
  };
}

/** A stuck valve: the tank was never filled all the way. */
function tank(stage: number, fill: number): Suspect {
  const st = ORDINAL[stage];
  return {
    id: `tank${stage + 1}`,
    emoji: '⛽',
    name: `${st}-stage fuel tank`,
    tell: `The rocket is too light on the pad (fuel is missing), and the ${st.toLowerCase()} stage burns for a shorter time.`,
    story: `A valve got stuck, so the ${st.toLowerCase()}-stage tank was only ${Math.round(fill * 100)}% full.`,
    sabotage: (spec) => ({ spec: setFill(spec, catalog, stage, fill), faults: [] }),
  };
}

/** Something heavy that should not be on board. */
function cargo(extraKg: number): Suspect {
  return {
    id: 'cargo',
    emoji: '📦',
    name: 'The cargo',
    tell: 'The rocket is too heavy on the pad. Every stage has to work harder.',
    story: `Someone left ${Math.round(extraKg / 1000)} tonnes of extra boxes on board. Too heavy!`,
    sabotage: (spec) => ({
      spec: {
        ...spec,
        customParts: [...(spec.customParts ?? []), { id: 'detective-extra-cargo', name: 'Extra boxes', type: 'payload', massKg: extraKg, source: 'Crash Detective', confidence: 'estimate' }],
        payload: { ...spec.payload, parts: [{ part: 'detective-extra-cargo' }, ...spec.payload.parts] },
      },
      faults: [],
    }),
  };
}

function shield(scale: number): Suspect {
  return {
    id: 'shield',
    emoji: '🛡️',
    name: 'Heat shield',
    tell: 'Everything goes right on the way up. Then it gets too hot coming home.',
    story: 'The heat shield was made too thin, so it could not take the heat coming home.',
    sabotage: (spec) => ({ spec: { ...spec, payload: { ...spec.payload, heatShieldScale: scale } }, faults: [] }),
  };
}

function body(scale: number): Suspect {
  return {
    id: 'body',
    emoji: '🔩',
    name: 'Body panels',
    tell: 'The rocket breaks apart in the thick air, about a minute after liftoff.',
    story: 'Some bolts were missing from the body panels, so the air push tore the rocket apart.',
    sabotage: (spec) => ({ spec: { ...spec, structureScale: scale }, faults: [] }),
  };
}

// ---------- the flight recorder ----------

export type GaugeId = 'weight' | `engines:${number}` | `burn:${number}` | 'body' | 'orbit' | 'moon' | 'home';

/** One reading. A null key means the flight never got that far. */
interface Reading {
  text: string;
  key: number | string | null;
}

const NOT_REACHED: Reading = { text: '—', key: null };

const fired = (m: MissionRecord, stage: number) => m.ascent.samples.some((s) => s.stageIndex === stage && s.thrustN > 0);

/** Seconds a stage's engines were pushing. */
function burnS(m: MissionRecord, stage: number): number {
  const s = m.ascent.samples;
  let total = 0;
  for (let i = 1; i < s.length; i++) if (s[i - 1].stageIndex === stage && s[i - 1].thrustN > 0) total += s[i].tS - s[i - 1].tS;
  return total;
}

function gauge(id: GaugeId): { emoji: string; label: string; tolerance: number; read: (m: MissionRecord) => Reading } {
  const [kind, n] = id.split(':');
  const stage = Number(n ?? 0);
  const st = ORDINAL[stage];
  switch (kind) {
    case 'weight':
      return { emoji: '⚖️', label: 'Weight on the pad', tolerance: 0.005, read: (m) => ({ text: `${Math.round(m.ascent.summary.liftoffMassKg / 1000).toLocaleString()} t`, key: m.ascent.summary.liftoffMassKg }) };
    case 'engines':
      return {
        emoji: '🔥',
        label: `${st}-stage engines`,
        tolerance: 0,
        read: (m) => {
          if (!fired(m, stage)) return NOT_REACHED;
          const out = m.ascent.events.find((e) => e.type === 'engineOut' && e.stageIndex === stage);
          return out ? { text: `Quit early, at ${Math.round(out.tS)} s`, key: 'quit' } : { text: 'Burned fine', key: 'fine' };
        },
      };
    case 'burn':
      return {
        emoji: '⏱️',
        label: `${st} stage burned for`,
        tolerance: 0.04,
        read: (m) => (fired(m, stage) ? { text: `${Math.round(burnS(m, stage))} s`, key: burnS(m, stage) } : NOT_REACHED),
      };
    case 'body':
      return {
        emoji: '🔩',
        label: 'Rocket body',
        tolerance: 0,
        read: (m) => {
          const f = m.ascent.outcome.failure;
          return f?.type === 'breakup' ? { text: `Broke apart at ${Math.round(f.tS)} s`, key: 'broke' } : { text: 'Held together', key: 'held' };
        },
      };
    case 'orbit':
      return { emoji: '🌍', label: 'Reached orbit', tolerance: 0, read: (m) => (m.ascent.outcome.success ? { text: 'Yes', key: 'yes' } : { text: 'No', key: 'no' }) };
    case 'moon':
      return {
        emoji: '🌙',
        label: 'Trip to the Moon',
        tolerance: 0,
        read: (m) => (!m.moon ? NOT_REACHED : m.moon.success ? { text: 'Made it', key: 'yes' } : { text: 'Not enough fuel to go', key: 'no' }),
      };
    default:
      return {
        emoji: '🪂',
        label: 'Coming home',
        tolerance: 0,
        read: (m) => (!m.reentry ? NOT_REACHED : m.reentry.outcome === 'splashdown' ? { text: 'Safe splashdown', key: 'safe' } : { text: 'Burned up', key: 'lost' }),
      };
  }
}

export interface RecorderRow {
  id: GaugeId;
  emoji: string;
  label: string;
  /** How a healthy rocket reads. */
  should: string;
  /** How the crash read ("—" if it never got that far). */
  was: string;
  /** The two differ: a clue. */
  odd: boolean;
}

export function recorder(gauges: GaugeId[], healthy: MissionRecord, crash: MissionRecord): RecorderRow[] {
  return gauges.map((id) => {
    const g = gauge(id);
    const a = g.read(healthy);
    const b = g.read(crash);
    const odd =
      a.key !== null && b.key !== null && (typeof a.key === 'number' && typeof b.key === 'number' ? Math.abs(b.key - a.key) > g.tolerance * Math.abs(a.key) : a.key !== b.key);
    return { id, emoji: g.emoji, label: g.label, should: a.text, was: b.text, odd };
  });
}

/** How a flight ended, in a sentence. */
export function outcomeLine(m: MissionRecord): string {
  const f = m.result.failure?.type;
  if (!f) return 'A perfect flight!';
  const lines: Partial<Record<MissionFailureType, string>> = {
    noLiftoff: 'It never left the pad.',
    engineFailure: 'Engines quit, and it fell back.',
    outOfFuel: 'It ran out of fuel before orbit.',
    breakup: 'It broke apart in the thick air.',
    tumble: 'It tumbled out of control.',
    crash: 'It fell back and crashed.',
    orbitShort: 'It could not reach its orbit.',
    moonShort: 'It reached orbit, but did not have the fuel to go to the Moon.',
    burnUp: 'It reached orbit, then burned up coming home.',
  };
  return lines[f] ?? 'The mission failed.';
}

// ---------- cases ----------

export interface Case {
  id: string;
  title: string;
  patch: string;
  rocketName: string;
  /** Detective Did hands over the case. */
  briefing: string[];
  /** A detective trick this case is good for. */
  tip: string;
  rocket: () => RocketSpec;
  suspects: Suspect[];
  /** Which gauges survived on the flight recorder. */
  gauges: GaugeId[];
  /** Test flights allowed. */
  tests: number;
}

const preset = (id: string): RocketSpec => structuredClone(presets.find((p) => p.id === id)!);
const trainer = (): RocketSpec => ({ ...setName(addStage(blankRocket(), catalog), 'Space Q Trainer'), id: 'trainer' });

export const CASES: Case[] = [
  {
    id: 'trainer-fell',
    title: 'The Trainer That Fell',
    patch: '🔍',
    rocketName: 'Space Q Trainer',
    briefing: [
      'Detective Roscoe! Our Trainer has flown to orbit a hundred times. Today it failed.',
      'The design is fine. One part has a hidden fault. There are three suspects.',
      'Watch the crash, read the flight recorder, and find the culprit!',
    ],
    tip: 'Ask WHEN it went wrong. Find the first odd thing on the recorder: everything after that is just what happened next.',
    rocket: trainer,
    suspects: [engines(0, 1, 3), engines(1, 1, 40, true), shield(0.3)],
    gauges: ['engines:0', 'engines:1', 'orbit', 'home'],
    tests: 2,
  },
  {
    id: 'falcon-down',
    title: 'Falcon Down',
    patch: '🦅',
    rocketName: 'Falcon 9',
    briefing: [
      'A Falcon 9 was carrying supplies to the space station. It never got there.',
      'Four suspects this time: two sets of engines and two fuel tanks.',
      'An engine that quits and a tank that runs dry can look alike. The recorder can tell them apart!',
    ],
    tip: 'Engine or tank? Look at how long each stage burned, and whether its engines burned fine.',
    rocket: () => preset('falcon-9'),
    suspects: [engines(0, 2, 3), tank(0, 0.7), engines(1, 1, 40, true), tank(1, 0.5)],
    gauges: ['engines:0', 'burn:0', 'engines:1', 'burn:1', 'orbit'],
    tests: 2,
  },
  {
    id: 'weighty-problem',
    title: 'A Weighty Problem',
    patch: '⚖️',
    rocketName: 'Falcon 9',
    briefing: [
      'Another Falcon 9 lost. This time the recorder has no engine gauges at all.',
      'But it did weigh the rocket on the pad. Too light? Too heavy? That is a clue!',
      'If two suspects fit the clue, a test flight can tell them apart.',
    ],
    tip: 'When two suspects fit the same clue, swap ONE of them and fly a test. Either answer tells you who did it.',
    rocket: () => preset('falcon-9'),
    suspects: [tank(0, 0.7), tank(1, 0.5), cargo(20000), body(0.6), shield(0.3)],
    gauges: ['weight', 'body', 'orbit', 'home'],
    tests: 2,
  },
  {
    id: 'broken-recorder',
    title: 'The Broken Recorder',
    patch: '📼',
    rocketName: 'Falcon 9',
    briefing: [
      'Bad news, Detective. The flight recorder was smashed. Only two gauges survived.',
      'Six suspects and three test flights. You cannot test them one by one!',
      'So watch the crash closely. And remember: you can swap more than one part in a test.',
    ],
    tip: 'Swap a few parts at once. If it STILL crashes, every one of them is innocent. If it flies, the culprit is one of them.',
    rocket: () => preset('falcon-9'),
    suspects: [engines(0, 2, 3), tank(0, 0.7), engines(1, 1, 40, true), tank(1, 0.5), cargo(20000), shield(0.3)],
    gauges: ['orbit', 'home'],
    tests: 3,
  },
  {
    id: 'moon-shot',
    title: 'Moon Shot Mystery',
    patch: '🌙',
    rocketName: 'Saturn V',
    briefing: [
      'The big one, Detective. A Saturn V was going to the Moon. It did not make it.',
      'Three stages, seven suspects, three test flights. The engine gauges are gone.',
      'Use everything you know: weight, burn times, and smart tests.',
    ],
    tip: 'Light on the pad means fuel is missing. A stage that burned for an odd time is where to look.',
    rocket: () => preset('saturn-v'),
    suspects: [engines(0, 1, 3), tank(0, 0.7), engines(1, 2, 40), tank(1, 0.5), engines(2, 1, 40, true), tank(2, 0.5), cargo(20000)],
    gauges: ['weight', 'burn:0', 'burn:1', 'burn:2', 'orbit', 'moon'],
    tests: 3,
  },
];

/** Fly the case's rocket: healthy (no culprit), or with one suspect's fault hidden inside. */
export function flyCase(c: Case, culprit: string | null): MissionRecord {
  const clean = c.rocket();
  const s = c.suspects.find((x) => x.id === culprit);
  if (!s) return flyMission(clean, catalog);
  const bad = s.sabotage(clean);
  return flyMission(bad.spec, catalog, { faults: bad.faults });
}

// ---------- working a case ----------

export interface TestRun {
  /** Suspects swapped for fresh parts on this test flight. */
  swapped: string[];
  /** The test flight worked. */
  fixed: boolean;
  /** It could not have told us anything new. */
  wasted: boolean;
}

export interface CaseState {
  culprit: string;
  tests: TestRun[];
  /** Suspects named wrongly. */
  wrong: string[];
  solved: boolean;
}

export const openCase = (culprit: string): CaseState => ({ culprit, tests: [], wrong: [], solved: false });

/** Suspects proved innocent so far (optionally counting only the first `seen` tests). */
export function cleared(c: Case, s: CaseState, seen = s.tests.length): Set<string> {
  const out = new Set<string>(s.wrong);
  for (const t of s.tests.slice(0, seen)) {
    // Still crashed: none of the swapped parts was the fault. Flew: the fault was one of them.
    for (const x of c.suspects) if (t.fixed ? !t.swapped.includes(x.id) : t.swapped.includes(x.id)) out.add(x.id);
  }
  return out;
}

export const testsLeft = (c: Case, s: CaseState) => c.tests - s.tests.length;

/** Fly a test with these suspects swapped for fresh parts. Every test starts from the faulty rocket again. */
export function runTest(c: Case, s: CaseState, swapped: string[]): CaseState {
  if (s.solved || testsLeft(c, s) <= 0 || !swapped.length) return s;
  const innocent = cleared(c, s);
  const open = c.suspects.filter((x) => !innocent.has(x.id)).map((x) => x.id);
  const tested = open.filter((id) => swapped.includes(id));
  // Nothing new to learn if no open suspect is swapped, or if all of them are.
  const wasted = tested.length === 0 || tested.length === open.length;
  return { ...s, tests: [...s.tests, { swapped, fixed: swapped.includes(s.culprit), wasted }] };
}

/** Name the culprit. */
export function accuse(s: CaseState, id: string): CaseState {
  if (s.solved) return s;
  if (id === s.culprit) return { ...s, solved: true };
  return s.wrong.includes(id) ? s : { ...s, wrong: [...s.wrong, id] };
}

/** One star for solving it, one for naming the culprit first time, one for wasting no test flight. */
export function starChecks(s: CaseState): [boolean, boolean, boolean] {
  return [s.solved, s.solved && !s.wrong.length, s.solved && !s.tests.some((t) => t.wasted)];
}

export const starsFor = (s: CaseState) => starChecks(s).filter(Boolean).length;

const names = (c: Case, ids: string[]) => {
  const n = ids.map((id) => c.suspects.find((x) => x.id === id)?.name ?? id);
  return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};

/** A test flight in the case notes: what was swapped, what happened, and what that proves. */
export function testNote(c: Case, t: TestRun): string {
  const what = names(c, t.swapped);
  const one = t.swapped.length === 1;
  if (t.fixed) return one ? `Swapped: ${what}. ✅ It flew! That was the broken part.` : `Swapped: ${what}. ✅ It flew! The culprit is one of those. But which one?`;
  return one ? `Swapped: ${what}. ❌ Still failed. So that part is innocent.` : `Swapped: ${what}. ❌ Still failed. So ALL of those are innocent.`;
}

/** Pick a culprit at random, avoiding the one from last time. */
export function pickCulprit(c: Case, last?: string, random: () => number = Math.random): string {
  const pool = c.suspects.filter((x) => x.id !== last);
  return pool[Math.floor(random() * pool.length)].id;
}

// ---------- solved cases, saved on this device ----------

const KEY = 'spaceq-cases';
export type CaseStars = Record<string, number>;

export function loadCaseStars(): CaseStars {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return typeof p === 'object' && p ? p : {};
  } catch {
    return {};
  }
}

export function saveCaseStars(stars: CaseStars) {
  try {
    localStorage.setItem(KEY, JSON.stringify(stars));
  } catch {
    /* storage unavailable: stars last for this visit */
  }
}
