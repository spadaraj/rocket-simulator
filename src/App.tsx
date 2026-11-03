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
import { ReentryView } from './ui/ReentryView';
import { sampleAt, usePlayback } from './ui/playback';
import { EngineerResult, RoscoeResult, type FixState } from './ui/ResultCard';
import { RocketThumb } from './ui/RocketThumb';
import { RoscoeBuilder } from './ui/RoscoeBuilder';
import { RoscoeDials } from './ui/RoscoeDials';
import { ScorecardBadge } from './ui/Scorecard';
import { StageStrip } from './ui/StageStrip';
import { autoSizeAsync, findFixesAsync } from './ui/whatIf';

type Mode = 'roscoe' | 'engineer';
type Phase = 'ready' | 'countdown' | 'flying' | 'moon' | 'reentry' | 'done';
type Scene = 'flight' | 'moon' | 'reentry';
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
  const [chaos, setChaosState] = useState(loadChaos);
  const [seed, setSeed] = useState(newSeed);
  const [fix, setFix] = useState<FixState | undefined>();
  const [autoSizing, setAutoSizing] = useState(false);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<Run[]>([]);
  const runId = useRef(1);
  const install = useInstallPrompt();
  const roscoe = mode === 'roscoe';
  const modified = spec !== preset;

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

  const vehicle = useMemo(() => buildVehicle(spec, catalog), [spec]);
  const faults = useMemo(() => (chaos ? rollFaults(spec, catalog, seed) : []), [chaos, seed, spec]);
  const mission = useMemo(() => flyMission(spec, catalog, { faults }), [spec, faults]);
  const record = mission.ascent;
  const deltaV = useMemo(() => stageDeltaV(spec, catalog), [spec]);
  const thumbs = useMemo(() => Object.fromEntries(allRockets.map((p) => [p.id, buildVehicle(p, catalog)])), [allRockets]);
  const feedback = useMemo(() => missionFeedback(mission), [mission]);
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
    setPresetId(id);
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
    if (mission.moon) return setPhase('moon');
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

  const scene: Scene = phase === 'moon' ? 'moon' : phase === 'reentry' ? 'reentry' : phase === 'done' ? doneScene : 'flight';

  // Roscoe gets a big message when something surprising happens mid-flight.
  const toastEvent = record.events.find((e) => e.type === 'engineOut' && pb.t >= e.tS && pb.t < e.tS + 5);
  const toast = toastEvent ? 'Uh oh! An engine stopped! 😬' : null;

  const replays: { label: string; onClick: () => void }[] = [
    { label: roscoe ? '🚀 Watch the launch' : 'Replay launch', onClick: () => (setPhase('flying'), pb.seek(0), pb.play()) },
    ...(mission.moon ? [{ label: roscoe ? '🌕 Watch the Moon trip' : 'Replay Moon leg', onClick: () => setPhase('moon') }] : []),
    ...(mission.reentry && (!mission.moon || mission.moon.success)
      ? [{ label: roscoe ? '🔥 Watch coming home' : 'Replay re-entry', onClick: () => setPhase('reentry') }]
      : []),
  ];

  const speeds = roscoe ? ROSCOE_SPEEDS.map((s) => s.speed) : ENGINEER_SPEEDS;
  useEffect(() => {
    if (!speeds.includes(pb.speed)) pb.setSpeed(10);
  }, [roscoe]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { id: Tab; label: string }[] = [
    { id: 'build', label: roscoe ? '🔧 Build' : 'Build' },
    { id: 'fly', label: roscoe ? '🚀 Fly' : 'Fly' },
    ...(roscoe ? [] : [{ id: 'charts' as Tab, label: 'Charts' }]),
  ];

  return (
    <div className={`app ${mode}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">A1-39</span>
          <span className="brand-name">Rocket Simulator</span>
        </div>
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
        <div className="tabs" role="tablist" aria-label="Screen">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {install && (
          <button className="chaos-toggle" onClick={install} title="Put the simulator on the home screen as an app">
            📲 Install
          </button>
        )}
        <button
          className={`chaos-toggle ${chaos ? 'on' : ''}`}
          onClick={() => setChaos(!chaos)}
          aria-pressed={chaos}
          title="Chaos Mode: something random goes wrong on each flight"
        >
          🎲 Chaos{chaos ? ' on' : ''}
        </button>
        <div className="mode-toggle" role="group" aria-label="Mode">
          <button className={roscoe ? 'on' : ''} onClick={() => setMode('roscoe')}>
            Roscoe
          </button>
          <button className={!roscoe ? 'on' : ''} onClick={() => setMode('engineer')}>
            Engineer
          </button>
        </div>
      </header>

      {tab === 'build' && (
        <main className="stage scroll">
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
              onReset={() => setSpec(preset)}
              onFly={() => setTab('fly')}
              onSave={saveRocket}
              saved={isMine && !modified}
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
                />
                {roscoe && (
                  <StageStrip
                    vehicle={vehicle}
                    sample={sample}
                    started={phase !== 'ready' && phase !== 'countdown'}
                    live={phase === 'flying' && pb.t < record.durationS}
                  />
                )}
                {roscoe && phase !== 'ready' && <RoscoeDials sample={sample} />}
                {phase !== 'ready' && phase !== 'countdown' && <MissionControl items={record.checklist} t={pb.t} roscoe={roscoe} />}
                {roscoe && phase === 'flying' && toast && <div className="toast">{toast}</div>}
              </>
            )}
            {scene === 'moon' && mission.moon && (
              <MoonLeg
                ledger={mission.moon}
                parkingAltM={spec.mission.targetOrbitAltitudeM}
                kind={spec.mission.target === 'moonFlyby' ? 'flyby' : 'land'}
                roscoe={roscoe}
                sceneSeconds={roscoe ? 18 : 12}
                onDone={phase === 'moon' ? afterMoon : () => {}}
              />
            )}
            {scene === 'reentry' && mission.reentry && (
              <ReentryView record={mission.reentry} roscoe={roscoe} sceneSeconds={roscoe ? 24 : 14} onDone={phase === 'reentry' ? () => finish('reentry') : () => {}} />
            )}
            {(phase === 'moon' || phase === 'reentry') && (
              <button className="btn small skip" onClick={phase === 'moon' ? afterMoon : () => finish('reentry')}>
                Skip ⏭
              </button>
            )}

            {phase === 'ready' && (
              <div className="launch-wrap">
                <button className="launch-btn" onClick={launch}>
                  LAUNCH
                </button>
                {chaos && <div className="chaos-note">🎲 Chaos Mode is on: something might go wrong!</div>}
              </div>
            )}

            {phase === 'countdown' && <Countdown from={10} onDone={startFlight} voice={roscoe} />}

            {phase === 'done' && roscoe && (
              <RoscoeResult
                fb={feedback}
                fix={fix}
                steps={mission.result.steps}
                replays={replays}
                onAgain={again}
                onTryFix={tryFix}
                badge={realFlight && <ScorecardBadge card={realFlight} modified={modified} />}
              />
            )}

            {scene === 'flight' && (phase === 'flying' || phase === 'done') && (
              <div className="controls">
                <button className="btn" onClick={pb.playing ? pb.pause : pb.play} aria-label={pb.playing ? 'Pause' : 'Play'}>
                  {pb.playing ? '⏸' : '▶'}
                </button>
                {roscoe
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
    </div>
  );
}
