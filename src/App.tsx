import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalog, presets } from './data/catalog';
import { stageDeltaV } from './physics/deltaV';
import { blankRocket, setMission } from './physics/edit';
import { goldenFor, scorecard } from './physics/golden';
import { rollFaults } from './physics/faults';
import type { FixResult } from './physics/fixes';
import { flyMission } from './physics/mission';
import type { RocketSpec } from './physics/types';
import { buildVehicle } from './physics/vehicle';
import { Charts, RUN_COLORS, type Run } from './ui/Charts';
import { Countdown } from './ui/Countdown';
import { EngineerBuilder } from './ui/EngineerBuilder';
import { EngineerPanel } from './ui/EngineerPanel';
import { FlightCanvas } from './ui/FlightCanvas';
import { missionFeedback } from './ui/messages';
import { MissionControl } from './ui/MissionControl';
import { MoonLeg } from './ui/MoonLeg';
import { PlanetLeg } from './ui/PlanetLeg';
import { ReentryView } from './ui/ReentryView';
import { sampleAt, usePlayback } from './ui/playback';
import { EngineerResult, RoscoeResult, type FixState } from './ui/ResultCard';
import { RocketThumb } from './ui/RocketThumb';
import { RoscoeBuilder } from './ui/RoscoeBuilder';
import { PartsBox } from './ui/PartsBox';
import { RoscoeDials } from './ui/RoscoeDials';
import { RaiseView } from './ui/RaiseView';
import { fmtMeter, lessonFor, type Meter } from './ui/lessons';
import { describeChanges, type Change } from './ui/changes';
import { LessonCard, ProgressNote, type TryNote } from './ui/ResultCard';
import { Coach } from './ui/mission/Coach';
import { Did } from './ui/mission/Characters';
import { Briefing, Debrief, Home, MissionMap, SkillBook } from './ui/mission/MissionScreens';
import { MissionCard, missionChecks, type LastTry } from './ui/mission/MissionCard';
import { walkthroughSteps } from './missions/walkthrough';
import { SKILLS } from './missions/skills';
import { CONTROL_INFO } from './missions/controlInfo';
import { introSteps } from './missions/intro';
import { MISSIONS } from './missions/missions';
import { controlsFor, loadProgress, saveProgress, type Progress } from './missions/progress';
import type { CoachContext, Mission, PlayStats } from './missions/types';
import type { ControlId } from './physics/controls';
import { ScorecardBadge } from './ui/Scorecard';
import { StageStrip } from './ui/StageStrip';
import { autoSizeAsync, findFixesAsync } from './ui/whatIf';
import { changesSince, judge, loadLab, record as recordLab, saveLab, type Flown, type Guess, type Lab, type Verdict } from './ui/lab';
import { CallIt, LabNote } from './ui/LabNote';

type Mode = 'roscoe' | 'engineer';
type Phase = 'ready' | 'countdown' | 'flying' | 'raise' | 'moon' | 'planet' | 'reentry' | 'done';
type Scene = 'flight' | 'raise' | 'moon' | 'planet' | 'reentry';
type Screen = 'home' | 'map' | 'skills' | 'sandbox' | 'mission';

const NO_STATS: PlayStats = { usedSlow: false, chaos: false, saved: false };

/** How a mission flight went: the goal, and which star goals were met. */
interface MissionOutcome {
  won: boolean;
  starChecks: boolean[];
  earned: number;
  best: number;
}
type Tab = 'build' | 'fly' | 'charts';

const ROSCOE_SPEEDS = [
  { label: '🐢', speed: 3, title: 'Slow' },
  { label: '🐇', speed: 10, title: 'Normal' },
  { label: '🚀', speed: 30, title: 'Fast' },
];
const ENGINEER_SPEEDS = [1, 5, 10, 25, 50];

function loadMode(): Mode {
  try {
    return localStorage.getItem('mode') === 'engineer' ? 'engineer' : 'roscoe';
  } catch {
    return 'roscoe';
  }
}

function loadChaos(): boolean {
  try {
    return localStorage.getItem('chaos') === 'on';
  } catch {
    return false;
  }
}

function loadGhost(): boolean {
  try {
    return localStorage.getItem('ghost') !== 'off';
  } catch {
    return true;
  }
}

const MY_ROCKETS_KEY = 'myRockets';

/** Rockets saved on this device. */
function loadMyRockets(): RocketSpec[] {
  try {
    const list = JSON.parse(localStorage.getItem(MY_ROCKETS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((r) => r?.id && Array.isArray(r.stages)) : [];
  } catch {
    return [];
  }
}

function storeMyRockets(list: RocketSpec[]) {
  try {
    localStorage.setItem(MY_ROCKETS_KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable: the rockets stay for this visit only */
  }
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Chrome-family browsers (including Silk) offer to install the app with this event. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const offer = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const installed = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  if (!prompt) return null;
  return () => {
    prompt.prompt().finally(() => setPrompt(null));
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [active, setActive] = useState<Mission | null>(null);
  const [missionStart, setMissionStart] = useState<RocketSpec | null>(null);
  const [briefing, setBriefing] = useState(false);
  const [coachSteps, setCoachSteps] = useState<ReturnType<typeof introSteps>>([]);
  const [stats, setStats] = useState<PlayStats>(NO_STATS);
  const [attempts, setAttempts] = useState(0);
  const [outcome, setOutcome] = useState<MissionOutcome | null>(null);
  const [showMe, setShowMe] = useState<{ target: string; say: string } | null>(null);
  // How the last mission try went, to compare the next one with.
  const prevTry = useRef<{ spec: RocketSpec; problem: string; what: string; meter?: Meter } | null>(null);
  const [lastTry, setLastTry] = useState<LastTry | null>(null);
  const [tryNote, setTryNote] = useState<TryNote | null>(null);
  // What "Let Did fix it" just changed, shown in the Build tab until the next launch.
  const [didFix, setDidFix] = useState<{ changes: Change[]; why?: string; rule?: string } | null>(null);
  // Ghost and Guess: the last flight flown, the one this flight is racing, and Roscoe's call.
  const [lastFlown, setLastFlown] = useState<Flown | null>(null);
  const [rival, setRival] = useState<Flown | null>(null);
  const [guess, setGuess] = useState<Guess | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [lab, setLab] = useState<Lab>(loadLab);
  const [showGhost, setShowGhostState] = useState(loadGhost);
  const judged = useRef<unknown>(null);
  const [line, setLine] = useState<string | null>(null);
  const firedLines = useRef(new Set<string>());
  const [mode, setModeState] = useState<Mode>(loadMode);
  const [presetId, setPresetId] = useState(presets[0].id);
  const [picking, setPicking] = useState(false);
  const [myRockets, setMyRockets] = useState<RocketSpec[]>(loadMyRockets);
  const blank = useMemo(blankRocket, []);
  const allRockets = useMemo(() => [blank, ...presets, ...myRockets], [blank, myRockets]);
  const preset = allRockets.find((p) => p.id === presetId) ?? presets[0];
  const [spec, setSpec] = useState<RocketSpec>(preset);
  const [tab, setTab] = useState<Tab>('fly');
  const [phase, setPhase] = useState<Phase>('ready');
  const [doneScene, setDoneScene] = useState<Scene>('flight');
  // Bumped on every replay so a scene that is still on screen starts again from the top.
  const [replayN, setReplayN] = useState(0);
  const replay = (p: Phase) => (setReplayN((n) => n + 1), setPhase(p));
  const [chaos, setChaosState] = useState(loadChaos);
  const [seed, setSeed] = useState(newSeed);
  const [fix, setFix] = useState<FixState | undefined>();
  const [autoSizing, setAutoSizing] = useState(false);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<Run[]>([]);
  const runId = useRef(1);
  const install = useInstallPrompt();
  const inMission = screen === 'mission' && !!active;
  // Missions are played in Roscoe mode, with only the controls taught so far.
  const roscoe = mode === 'roscoe' || inMission;
  const controls = useMemo(() => (inMission ? controlsFor(active!.id) : undefined), [inMission, active]);
  const fresh = useMemo(() => (inMission ? new Set<ControlId>(active!.unlocks) : undefined), [inMission, active]);
  const can = (c: ControlId) => !controls || controls.has(c);
  const base = inMission && missionStart ? missionStart : preset;
  const modified = spec !== base;

  const setMode = (m: Mode) => {
    setModeState(m);
    if (m === 'roscoe' && tab === 'charts') setTab('fly');
    try {
      localStorage.setItem('mode', m);
    } catch {
      /* storage unavailable: keep the in-memory choice */
    }
  };

  const setChaos = (on: boolean) => {
    setChaosState(on);
    setSeed(newSeed());
    try {
      localStorage.setItem('chaos', on ? 'on' : 'off');
    } catch {
      /* storage unavailable: keep the in-memory choice */
    }
  };

  const setShowGhost = (on: boolean) => {
    setShowGhostState(on);
    try {
      localStorage.setItem('ghost', on ? 'on' : 'off');
    } catch {
      /* storage unavailable: keep the in-memory choice */
    }
  };

  const vehicle = useMemo(() => buildVehicle(spec, catalog), [spec]);
  const chaosOn = chaos && can('chaos');
  const faults = useMemo(
    () => [...(inMission ? (active!.faults ?? []) : []), ...(chaosOn ? rollFaults(spec, catalog, seed) : [])],
    [chaosOn, seed, spec, inMission, active],
  );
  const mission = useMemo(() => flyMission(spec, catalog, { faults }), [spec, faults]);
  const record = mission.ascent;
  const deltaV = useMemo(() => stageDeltaV(spec, catalog), [spec]);
  const thumbs = useMemo(() => Object.fromEntries(allRockets.map((p) => [p.id, buildVehicle(p, catalog)])), [allRockets]);
  const feedback = useMemo(() => missionFeedback(mission), [mission]);
  const lesson = useMemo(() => lessonFor(mission, spec), [mission, spec]);
  /** What goes wrong with the mission's starting rocket: the problem its hints are about. */
  const expectedProblem = useMemo(
    () => (active ? (flyMission(active.rocket(), catalog, { faults: active.faults ?? [] }).result.failure?.type ?? 'goal') : null),
    [active],
  );
  const realFlight = useMemo(() => {
    const g = goldenFor(presetId);
    return g ? scorecard(g, record) : undefined;
  }, [presetId, record]);
  const pb = usePlayback(mission, mission.flightDurationS, 10);
  const sample = sampleAt(record.samples, pb.t);
  const current: Run = useMemo(
    () => ({ id: 0, label: spec.name, color: RUN_COLORS[0], record }),
    [record, spec.name],
  );

  const choosePreset = (id: string) => {
    const p = allRockets.find((x) => x.id === id)!;
    setPresetId(id);
    setSpec(p);
    setAutoMessage(null);
  };

  const startFromScratch = () => {
    choosePreset(blank.id);
    setTab('build');
  };

  // Saving overwrites the rocket if it is already one of yours, otherwise adds a new one.
  const isMine = presetId.startsWith('mine-');
  const saveRocket = () => {
    const id = isMine ? presetId : `mine-${Date.now()}`;
    const description = isMine ? spec.description : presetId === blank.id ? 'Your own rocket.' : `Your own rocket, based on the ${preset.name}.`;
    const mine: RocketSpec = { ...spec, id, description };
    const list = isMine ? myRockets.map((r) => (r.id === id ? mine : r)) : [...myRockets, mine];
    setMyRockets(list);
    storeMyRockets(list);
    setStats((st) => ({ ...st, saved: true }));
    if (inMission) {
      // Stay in the mission: the saved copy is now the mission rocket.
      setMissionStart(mine);
    } else setPresetId(id);
    setSpec(mine);
  };

  const deleteRocket = (id: string) => {
    const r = myRockets.find((x) => x.id === id);
    if (!r || !window.confirm(`Delete "${r.name}"?`)) return;
    const list = myRockets.filter((x) => x.id !== id);
    setMyRockets(list);
    storeMyRockets(list);
    if (presetId === id) choosePreset(presets[0].id);
  };

  // A changed design means a new flight: back to the pad, and start looking for fixes
  // right away so they are ready when the failure card appears.
  useEffect(() => {
    setPhase('ready');
    setDoneScene('flight');
    const failure = mission.result.failure;
    if (!failure) {
      setFix(undefined);
      return;
    }
    let live = true;
    setFix({ status: 'working', fixes: [], tested: 0 });
    findFixesAsync(spec, failure.type, failure.detail, faults).then((r) => {
      if (live) setFix({ status: 'done', ...r });
    });
    return () => {
      live = false;
    };
  }, [mission]); // eslint-disable-line react-hooks/exhaustive-deps

  // The story after the launch: the Moon trip, then coming home.
  const finish = (scene: Scene) => {
    setDoneScene(scene);
    setPhase('done');
  };
  const afterFlight = () => {
    if (!record.outcome.success) return finish('flight');
    if (mission.raise) return setPhase('raise');
    if (mission.moon) return setPhase('moon');
    if (mission.planet) return setPhase('planet');
    if (mission.reentry) return setPhase('reentry');
    finish('flight');
  };
  const afterMoon = () => (mission.moon?.success && mission.reentry ? setPhase('reentry') : finish('moon'));

  useEffect(() => {
    if (phase === 'flying' && !pb.playing && pb.t >= mission.flightDurationS) afterFlight();
  }, [phase, pb.playing, pb.t, mission.flightDurationS]); // eslint-disable-line react-hooks/exhaustive-deps

  const startFlight = useCallback(() => {
    setPhase('flying');
    pb.seek(0);
    pb.play();
  }, [pb]);

  const launch = () => {
    pb.seek(0);
    firedLines.current.clear();
    setLine(null);
    setOutcome(null);
    setDidFix(null);
    setRival(lastFlown);
    setVerdict(null);
    setPhase('countdown');
  };

  const again = () => {
    pb.pause();
    pb.seek(0);
    setPhase('ready');
    setDoneScene('flight');
    // Chaos Mode: a new surprise every flight.
    if (chaos) setSeed(newSeed());
  };

  const tryFix = (f: FixResult) => {
    if (roscoe) {
      // Show what changed, where, and why, then let Roscoe launch it himself.
      const why = lesson?.fixes.find((x) => x.control === f.control)?.text;
      const changes = describeChanges(spec, f.spec);
      setDidFix({ changes: changes.length ? changes : [{ text: f.roscoe }], why, rule: lesson ? `${SKILLS[lesson.skill].emoji} ${SKILLS[lesson.skill].title}` : undefined });
      setSpec(f.spec);
      setTab('build');
      return;
    }
    setSpec(f.spec);
    setTab('fly');
  };

  const autoSize = () => {
    setAutoSizing(true);
    setAutoMessage(null);
    autoSizeAsync(spec).then((r) => {
      setAutoSizing(false);
      setAutoMessage(r.message);
      // Even when the Moon is out of reach, keep the landing fuel it worked out.
      if (r.spec !== spec) setSpec(r.spec);
    });
  };

  const saveRun = () => {
    // Colour follows the run for its whole life; slot 0 is always "this flight".
    const used = new Set(saved.map((r) => r.color));
    const color = RUN_COLORS.slice(1).find((c) => !used.has(c));
    if (!color) return;
    const n = runId.current++;
    setSaved([...saved, { id: n, label: `${spec.name}${modified ? ' (modified)' : ''} #${n}`, color, record }]);
  };

  const scene: Scene =
    phase === 'raise' ? 'raise' : phase === 'moon' ? 'moon' : phase === 'planet' ? 'planet' : phase === 'reentry' ? 'reentry' : phase === 'done' ? doneScene : 'flight';

  // ---------- Mission Mode ----------

  const startMission = (m: Mission) => {
    const start = m.rocket();
    setActive(m);
    setMissionStart(start);
    setSpec(start);
    setScreen('mission');
    setTab('fly');
    setBriefing(true);
    setCoachSteps([]);
    setAttempts(0);
    setOutcome(null);
    prevTry.current = null;
    setLastFlown(null);
    setRival(null);
    setGuess(null);
    setVerdict(null);
    setLastTry(null);
    setTryNote(null);
    setDidFix(null);
    setStats(NO_STATS);
    setShowMe(null);
    setLine(null);
    setAutoMessage(null);
    pb.pause();
    pb.seek(0);
    setPhase('ready');
  };
  const nextMission = active ? MISSIONS[MISSIONS.indexOf(active) + 1] : undefined;
  const leaveMission = () => {
    pb.pause();
    setShowMe(null);
    setLine(null);
    setScreen('map');
  };
  const goSandbox = () => {
    setActive(null);
    setScreen('sandbox');
    setSpec(preset);
    setPhase('ready');
  };

  // Score the flight once it's over.
  useEffect(() => {
    if (!inMission || phase !== 'done' || outcome) return;
    const ctx = { m: mission, spec, stats: { ...stats, chaos: chaosOn } };
    const won = active!.goal(ctx);
    const starChecks = active!.stars.map((g) => won && g.check(ctx));
    const earned = won ? 1 + starChecks.filter(Boolean).length : 0;
    const best = Math.max(earned, progress.stars[active!.id] ?? 0);
    if (won && best > (progress.stars[active!.id] ?? 0)) {
      const next = { ...progress, stars: { ...progress.stars, [active!.id]: best } };
      setProgress(next);
      saveProgress(next);
    }
    if (!won) setAttempts((n) => n + 1);
    setOutcome({ won, starChecks, earned, best });

    // Compare with the last try, so the card can say what changed and whether it helped.
    const problem = mission.result.failure?.type ?? 'goal';
    const what = lesson ? lesson.what : `The flight went fine, but the mission was: ${active!.goalText}.`;
    const prev = prevTry.current;
    setTryNote(
      prev && !won
        ? {
            changes: describeChanges(prev.spec, spec),
            same: prev.problem === problem,
            prevWhat: prev.what,
            before: prev.meter && lesson?.meter && prev.meter.label === lesson.meter.label ? prev.meter.value : undefined,
          }
        : null,
    );
    prevTry.current = won ? null : { spec, problem, what, meter: lesson?.meter };
    const m = lesson?.meter;
    setLastTry(
      won
        ? { text: `You did it! ${'★'.repeat(earned)}${earned < 3 ? ' Can you get more stars?' : ''}`, good: true }
        : { text: m ? `${what} ${m.label}: ${fmtMeter(m)} (${m.limitLabel} ${fmtMeter(m, m.limit)}).` : what, good: false },
    );
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ghost and Guess: when a flight is over, judge the experiment and remember the flight.
  useEffect(() => {
    if (phase !== 'done' || judged.current === mission) return;
    judged.current = mission;
    if (roscoe) {
      const v = judge(rival, { spec, mission }, guess);
      setVerdict(v);
      if (v.guess || v.kind === 'clean') {
        const next = recordLab(lab, v, inMission ? active!.title : 'Sandbox');
        setLab(next);
        saveLab(next);
      }
    }
    setLastFlown({ spec, mission });
    setGuess(null);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // A changed rocket is a new try.
  useEffect(() => setOutcome(null), [spec]);

  // Slow motion counts for a star in the first mission.
  useEffect(() => {
    if (inMission && phase === 'flying' && pb.speed === 3 && !stats.usedSlow) setStats((st) => ({ ...st, usedSlow: true }));
  }, [inMission, phase, pb.speed, stats.usedSlow]);

  // Did talks during the flight at the mission's big moments.
  useEffect(() => {
    if (!inMission || phase !== 'flying' || !active!.flightLines) return;
    for (const e of record.events) {
      const say = active!.flightLines[e.type];
      const key = `${e.type}@${e.tS}`;
      if (say && pb.t >= e.tS && pb.t < e.tS + 8 && !firedLines.current.has(e.type)) {
        firedLines.current.add(e.type);
        firedLines.current.add(key);
        setLine(say);
      }
    }
  }, [pb.t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!line) return;
    const id = window.setTimeout(() => setLine(null), 6000);
    return () => window.clearTimeout(id);
  }, [line]);

  /** "Show me": go to where the control lives and have Did point at it. */
  /** After a few tries: Did walks Roscoe through a fix that he knows works, one change at a time. */
  const startWalkthrough = () => {
    const m = active!;
    const start = missionStart ?? m.rocket();
    const wins = (s: RocketSpec) => m.goal({ m: flyMission(s, catalog, { faults: m.faults ?? [] }), spec: s, stats: NO_STATS });
    const tested = fix?.status === 'done' ? fix.fixes.find((f) => f.complete && f.control && can(f.control)) : undefined;
    const plans: [RocketSpec, RocketSpec][] = [
      ...(tested ? [[spec, tested.spec] as [RocketSpec, RocketSpec]] : []),
      [spec, m.solve(spec)],
      [start, m.solve(start)],
    ];
    for (const [from, to] of plans) {
      const steps = walkthroughSteps(from, to, controls);
      if (!steps || !wins(to)) continue;
      setShowMe(null);
      again();
      if (from !== spec) {
        setSpec(from);
        steps.unshift({ say: 'Let’s start again from the mission rocket, and fix it together.', ok: true });
      }
      setCoachSteps(steps);
      return;
    }
    // No step-by-step plan: point at the main control instead.
    onShowMe(m.hintControl);
  };

  const onShowMe = (c: ControlId) => {
    const info = CONTROL_INFO[c];
    if (info.tab === 'build') {
      again();
      setTab('build');
    }
    setShowMe({ target: c, say: `${info.label}: ${info.explain}` });
  };

  const coachCtx: CoachContext = useMemo(() => ({ phase, tab, spec, speed: pb.speed }), [phase, tab, spec, pb.speed]);

  // The ghost flies along only when this rocket differs from the last one flown.
  const ghost = useMemo(
    () => (roscoe && showGhost && rival && changesSince(rival.spec, spec).length ? { record: rival.mission.ascent, vehicle: buildVehicle(rival.spec, catalog) } : undefined),
    [roscoe, showGhost, rival, spec],
  );
  const labNote = roscoe ? <LabNote verdict={verdict} /> : null;

  // Roscoe gets a big message when something surprising happens mid-flight.
  const toastEvent = record.events.find((e) => e.type === 'engineOut' && pb.t >= e.tS && pb.t < e.tS + 5);
  const toast = toastEvent ? 'Uh oh! An engine stopped! 😬' : null;

  const replays: { label: string; onClick: () => void }[] = [
    { label: roscoe ? '🚀 Watch the launch' : 'Replay launch', onClick: () => (setPhase('flying'), pb.seek(0), pb.play()) },
    ...(mission.raise ? [{ label: roscoe ? '🛰️ Watch the climb' : 'Replay orbit raise', onClick: () => replay('raise') }] : []),
    ...(mission.moon ? [{ label: roscoe ? '🌕 Watch the Moon trip' : 'Replay Moon leg', onClick: () => replay('moon') }] : []),
    ...(mission.planet ? [{ label: roscoe ? '🪐 Watch the trip' : 'Replay planet trip', onClick: () => replay('planet') }] : []),
    ...(mission.reentry && (!mission.moon || mission.moon.success)
      ? [{ label: roscoe ? '🔥 Watch coming home' : 'Replay re-entry', onClick: () => replay('reentry') }]
      : []),
  ];

  const speeds = roscoe ? ROSCOE_SPEEDS.map((s) => s.speed) : ENGINEER_SPEEDS;
  useEffect(() => {
    if (!speeds.includes(pb.speed)) pb.setSpeed(10);
  }, [roscoe]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { id: Tab; label: string }[] = [
    ...(can('build') ? [{ id: 'build' as Tab, label: roscoe ? '🔧 Build' : 'Build' }] : []),
    { id: 'fly', label: roscoe ? '🚀 Fly' : 'Fly' },
    ...(roscoe ? [] : [{ id: 'charts' as Tab, label: 'Charts' }]),
  ];

  if (screen === 'home')
    return <Home progress={progress} onMissions={() => setScreen('map')} onSandbox={goSandbox} onSkills={() => setScreen('skills')} />;
  if (screen === 'map') return <MissionMap progress={progress} onPlay={startMission} onHome={() => setScreen('home')} />;
  if (screen === 'skills') return <SkillBook progress={progress} lab={lab} onBack={() => setScreen('home')} />;


  // Mission Mode: Did's hint grows with each failed try, but only when the problem is the one
  // the mission is about; otherwise he points at what's still missing. On the third try he
  // offers to walk Roscoe through the fix.
  const nowProblem = mission.result.failure?.type ?? 'goal';
  const unmet = inMission ? missionChecks(active!).filter((c) => !c.ok(spec)) : [];
  const hintText = !inMission
    ? null
    : nowProblem === expectedProblem
      ? attempts === 1
        ? active!.hints[0]
        : active!.hints[1]
      : unmet.length
        ? `Look at my checklist in Build. Not done yet: ${unmet.map((c) => c.text.replace(/^\S+\s/, '')).join('; ')}.`
        : attempts >= 3
          ? 'This one is tricky! Want me to walk you through it?'
          : null;
  const hint =
    inMission && attempts > 0 && hintText ? (
      <div className="lesson-hint">
        <Did size={56} />
        <div>
          <b>Flight Director Did:</b> {hintText}
          {attempts >= 3 && (
            <button className="btn small primary" onClick={startWalkthrough}>
              🧭 Walk me through it
            </button>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className={`app ${mode} ${inMission ? 'in-mission' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => (inMission ? leaveMission() : setScreen('home'))} title={inMission ? 'Back to the mission map' : 'Home'}>
          {inMission ? (
            <img src="./brand/spaceq-logo.webp" alt="Space Q" className="brand-logo" />
          ) : (
            <>
              <span className="brand-mark">🏠 A1-39</span>
              <span className="brand-name">Sandbox</span>
            </>
          )}
        </button>
        {inMission ? (
          <div className="mission-chip">
            <span className="sq-patch">{active!.patch}</span>
            <span>
              <b>
                Mission {MISSIONS.indexOf(active!) + 1}: {active!.title}
              </b>
              <small>🎯 {active!.goalText}</small>
            </span>
          </div>
        ) : (
        <nav className="picker" aria-label="Choose a rocket">
          <button className="pick on" onClick={() => setPicking(!picking)} aria-expanded={picking} title="Choose a rocket">
            <RocketThumb vehicle={vehicle} height={roscoe ? 60 : 40} />
            <span>
              {spec.name}
              {modified && <em className="modified"> (modified)</em>}
            </span>
            <span aria-hidden="true">▾</span>
          </button>
          {picking && (
            <>
              <div className="picker-backdrop" onClick={() => setPicking(false)} />
              <div className="picker-menu">
                <button
                  className="pick-card scratch"
                  onClick={() => {
                    startFromScratch();
                    setPicking(false);
                  }}
                >
                  <span className="scratch-icon" aria-hidden="true">
                    🛠️
                  </span>
                  <b>Start from scratch</b>
                  <span className="muted">{roscoe ? 'Build your own!' : blank.description}</span>
                </button>
                {[...presets, ...myRockets].map((p, k) => (
                  <Fragment key={p.id}>
                    {k === presets.length && <div className="pick-section">⭐ Your rockets</div>}
                    <div className="pick-wrap">
                      <button
                        className={`pick-card ${p.id === presetId ? 'on' : ''}`}
                        onClick={() => {
                          choosePreset(p.id);
                          setPicking(false);
                        }}
                      >
                        <RocketThumb vehicle={thumbs[p.id]} height={110} />
                        <b>{p.name}</b>
                        {!roscoe && <span className="muted">{p.description}</span>}
                      </button>
                      {p.id.startsWith('mine-') && (
                        <button className="pick-delete" onClick={() => deleteRocket(p.id)} aria-label={`Delete ${p.name}`}>
                          ✕
                        </button>
                      )}
                    </div>
                  </Fragment>
                ))}
              </div>
            </>
          )}
        </nav>
        )}
        <div className="tabs" role="tablist" aria-label="Screen">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              data-coach={`tab:${t.id}`}
              aria-selected={tab === t.id}
              className={`${tab === t.id ? 'on' : ''}${t.id === 'build' && fresh?.has('build') ? ' fresh' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {install && (
          <button className="chaos-toggle" onClick={install} title="Put the simulator on the home screen as an app">
            📲 Install
          </button>
        )}
        {can('chaos') && (
        <button
          data-coach="chaos"
          className={`chaos-toggle ${chaos ? 'on' : ''}${fresh?.has('chaos') ? ' fresh' : ''}`}
          onClick={() => setChaos(!chaos)}
          aria-pressed={chaos}
          title="Chaos Mode: something random goes wrong on each flight"
        >
          🎲 Chaos{chaos ? ' on' : ''}
        </button>
        )}
        {inMission ? (
          <button className="chaos-toggle" onClick={leaveMission}>
            🗺️ Missions
          </button>
        ) : (
        <div className="mode-toggle" role="group" aria-label="Mode">
          <button className={roscoe ? 'on' : ''} onClick={() => setMode('roscoe')}>
            Roscoe
          </button>
          <button className={!roscoe ? 'on' : ''} onClick={() => setMode('engineer')}>
            Engineer
          </button>
        </div>
        )}
      </header>

      {tab === 'build' && (
        <main className="stage scroll">
          {roscoe && didFix && (
            <div className="did-fixed" role="status">
              <Did size={64} />
              <div>
                <b>🔧 Did changed {didFix.changes.length === 1 ? 'one thing' : `${didFix.changes.length} things`}:</b>
                <ul>
                  {didFix.changes.map((c) => (
                    <li key={c.text}>{c.text}</li>
                  ))}
                </ul>
                {didFix.why && (
                  <p>
                    💡 Why: {didFix.why}
                    {didFix.rule && <> Engineer’s rule: {didFix.rule}.</>}
                  </p>
                )}
                <p className="did-fixed-note">The changes are glowing below. Now launch it and see!</p>
                <button className="btn big primary" onClick={() => setTab('fly')}>
                  🚀 Go fly it
                </button>
              </div>
            </div>
          )}
          {roscoe && !inMission && <PartsBox spec={spec} setSpec={setSpec} rockets={[...presets.filter((p) => p.id !== 'a1-39-as-drawn'), ...myRockets]} />}
          {inMission && (
            <MissionCard mission={active!} spec={spec} liftoffTWR={record.summary.liftoffTWR} best={progress.stars[active!.id] ?? 0} lastTry={lastTry} />
          )}
          {roscoe ? (
            <RoscoeBuilder
              spec={spec}
              setSpec={setSpec}
              vehicle={vehicle}
              deltaV={deltaV}
              liftoffTWR={record.summary.liftoffTWR}
              autoSizing={autoSizing}
              autoMessage={autoMessage}
              onAutoSize={autoSize}
              onReset={() => setSpec(base)}
              onFly={() => setTab('fly')}
              onSave={saveRocket}
              saved={(isMine || (inMission && stats.saved)) && !modified}
              controls={controls}
              fresh={fresh}
              changed={didFix ? new Set(didFix.changes.flatMap((c) => (c.control ? [c.control] : []))) : undefined}
              unlimited={!inMission}
            />
          ) : (
            <EngineerBuilder
              spec={spec}
              setSpec={setSpec}
              vehicle={vehicle}
              deltaV={deltaV}
              liftoffTWR={record.summary.liftoffTWR}
              autoSizing={autoSizing}
              autoMessage={autoMessage}
              onAutoSize={autoSize}
              onReset={() => setSpec(preset)}
              onSave={saveRocket}
              saved={isMine && !modified}
            />
          )}
        </main>
      )}

      {tab === 'charts' && (
        <main className="stage scroll">
          <Charts current={current} saved={saved} onSave={saveRun} onRemove={(id) => setSaved(saved.filter((r) => r.id !== id))} />
        </main>
      )}

      {tab === 'fly' && (
        <main className="stage">
          <div className="view">
            {scene === 'flight' && (
              <>
                <FlightCanvas
                  record={record}
                  vehicle={vehicle}
                  tRef={pb.tRef}
                  launchSite={spec.launchSite}
                  roscoe={roscoe}
                  armed={phase !== 'ready' && phase !== 'countdown'}
                  recoveries={mission.recoveries}
                  ghost={phase === 'ready' || phase === 'countdown' ? undefined : ghost}
                />
                {roscoe && can('stageStrip') && (
                  <StageStrip
                    vehicle={vehicle}
                    sample={sample}
                    started={phase !== 'ready' && phase !== 'countdown'}
                    live={phase === 'flying' && pb.t < record.durationS}
                  />
                )}
                {roscoe && phase !== 'ready' && (
                  <RoscoeDials sample={sample} limitPa={can('airPush') ? record.summary.structuralLimitPa : undefined} />
                )}
                {phase !== 'ready' && phase !== 'countdown' && <MissionControl items={record.checklist} t={pb.t} roscoe={roscoe} />}
                {roscoe && phase === 'flying' && toast && <div className="toast">{toast}</div>}
              </>
            )}
            {scene === 'raise' && mission.raise && (
              <RaiseView
                key={replayN}
                ledger={mission.raise}
                roscoe={roscoe}
                sceneSeconds={roscoe ? 14 : 9}
                onDone={phase === 'raise' ? () => (mission.reentry ? setPhase('reentry') : finish('raise')) : () => {}}
              />
            )}
            {scene === 'moon' && mission.moon && (
              <MoonLeg
                key={replayN}
                ledger={mission.moon}
                parkingAltM={spec.mission.targetOrbitAltitudeM}
                kind={mission.moon.trip}
                roscoe={roscoe}
                sceneSeconds={roscoe ? 18 : 12}
                onDone={phase === 'moon' ? afterMoon : () => {}}
              />
            )}
            {scene === 'planet' && mission.planet && (
              <PlanetLeg key={replayN} ledger={mission.planet} roscoe={roscoe} sceneSeconds={roscoe ? 22 : 14} onDone={phase === 'planet' ? () => finish('planet') : () => {}} />
            )}
            {scene === 'reentry' && mission.reentry && (
              <ReentryView key={replayN} record={mission.reentry} roscoe={roscoe} sceneSeconds={roscoe ? 24 : 14} onDone={phase === 'reentry' ? () => finish('reentry') : () => {}} />
            )}
            {(phase === 'raise' || phase === 'moon' || phase === 'planet' || phase === 'reentry') && (
              <button
                className="btn small skip"
                onClick={
                  phase === 'raise'
                    ? () => (mission.reentry ? setPhase('reentry') : finish('raise'))
                    : phase === 'moon'
                      ? afterMoon
                      : phase === 'planet'
                        ? () => finish('planet')
                        : () => finish('reentry')
                }
              >
                Skip ⏭
              </button>
            )}

            {phase === 'ready' && (
              <div className="launch-wrap">
                {/* Not on a mission's first launch while Did is still showing the ropes. */}
                {roscoe && !briefing && !(inMission && !lastFlown && coachSteps.length > 0) && <CallIt last={lastFlown} spec={spec} guess={guess} setGuess={setGuess} showGhost={showGhost} setShowGhost={setShowGhost} />}
                <button className="launch-btn" data-coach="launch" onClick={launch}>
                  LAUNCH
                </button>
                {chaos && <div className="chaos-note">🎲 Chaos Mode is on: something might go wrong!</div>}
              </div>
            )}

            {phase === 'countdown' && <Countdown from={10} onDone={startFlight} voice={roscoe} />}

            {phase === 'done' && inMission && outcome?.won && (
              <Debrief
                mission={active!}
                earned={outcome.earned}
                best={outcome.best}
                starChecks={outcome.starChecks}
                onNext={nextMission ? () => startMission(nextMission) : undefined}
                onRetry={() => setSpec({ ...spec })}
                onMap={leaveMission}
                replays={replays}
                lab={labNote}
              />
            )}
            {phase === 'done' && inMission && outcome && !outcome.won && !lesson && (
              <div className="result-card roscoe lose lesson">
                <div className="lesson-head">
                  <Did size={84} />
                  <div>
                    <div className="result-kicker">Almost!</div>
                    <h2>The flight went fine, but the mission was: {active!.goalText}.</h2>
                  </div>
                </div>
                {tryNote && <ProgressNote note={tryNote} />}
                {labNote}
                {hint}
                <div className="result-actions">
                  {!hint && (
                    <button className="btn big" onClick={() => onShowMe(active!.hintControl)}>
                      👉 Show me
                    </button>
                  )}
                  <button className="btn big primary" onClick={again}>
                    🚀 Fly again
                  </button>
                </div>
              </div>
            )}
            {phase === 'done' && roscoe && lesson && (!inMission || outcome) && (
              <LessonCard
                lesson={lesson}
                fix={fix}
                steps={mission.result.steps}
                replays={replays}
                onAgain={again}
                onTryFix={tryFix}
                onShowMe={onShowMe}
                controls={controls}
                hint={hint}
                note={inMission ? tryNote : null}
                lab={labNote}
              />
            )}
            {phase === 'done' && roscoe && !inMission && !lesson && (
              <RoscoeResult
                fb={feedback}
                fix={fix}
                steps={mission.result.steps}
                replays={replays}
                onAgain={again}
                onTryFix={tryFix}
                badge={realFlight && <ScorecardBadge card={realFlight} modified={modified} />}
                lab={labNote}
              />
            )}

            {scene === 'flight' && (phase === 'flying' || phase === 'done') && (
              <div className="controls">
                <button className="btn" onClick={pb.playing ? pb.pause : pb.play} aria-label={pb.playing ? 'Pause' : 'Play'}>
                  {pb.playing ? '⏸' : '▶'}
                </button>
                <span className="speed-group" data-coach="speed">
                {!can('speed') ? null : roscoe
                  ? ROSCOE_SPEEDS.map((s) => (
                      <button
                        key={s.speed}
                        className={`btn ${pb.speed === s.speed ? 'on' : ''}`}
                        onClick={() => pb.setSpeed(s.speed)}
                        title={s.title}
                      >
                        {s.label}
                      </button>
                    ))
                  : ENGINEER_SPEEDS.map((sp) => (
                      <button key={sp} className={`btn small ${pb.speed === sp ? 'on' : ''}`} onClick={() => pb.setSpeed(sp)}>
                        {sp}×
                      </button>
                    ))}
                </span>
                <input
                  className="scrubber"
                  type="range"
                  min={0}
                  max={mission.flightDurationS}
                  step={0.1}
                  value={pb.t}
                  onChange={(e) => {
                    pb.seek(Number(e.target.value));
                    if (phase === 'done') setPhase('flying');
                  }}
                  aria-label="Flight time"
                />
                {!roscoe && <span className="mono time">T+{pb.t.toFixed(0)} s</span>}
              </div>
            )}
          </div>

          {!roscoe && (
            <aside className="side">
              {phase === 'done' && (
                <EngineerResult fb={feedback} fix={fix} steps={mission.result.steps} replays={replays} onAgain={again} onTryFix={tryFix} />
              )}
              <EngineerPanel
                record={record}
                mission={mission}
                vehicle={vehicle}
                sample={sample}
                t={pb.t}
                deltaV={deltaV}
                missionSpec={spec.mission}
                setMission={(patch) => setSpec(setMission(spec, patch))}
                scorecard={realFlight}
                modified={modified}
                onSeek={(t) => {
                  if (phase === 'ready' || phase === 'countdown' || phase === 'done') setPhase('flying');
                  pb.seek(t);
                }}
              />
            </aside>
          )}
        </main>
      )}

      {inMission && briefing && (
        <Briefing
          mission={active!}
          best={progress.stars[active!.id] ?? 0}
          onBack={leaveMission}
          onGo={() => {
            setBriefing(false);
            setCoachSteps(introSteps(active!));
          }}
        />
      )}
      {inMission && !briefing && (
        <Coach steps={coachSteps} ctx={coachCtx} showMe={showMe} onShowMeDone={() => setShowMe(null)} line={phase === 'flying' ? line : null} />
      )}
      {!inMission && showMe && <Coach steps={[]} ctx={coachCtx} showMe={showMe} onShowMeDone={() => setShowMe(null)} />}
    </div>
  );
}
