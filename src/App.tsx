import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalog, presets } from './data/catalog';
import { stageDeltaV } from './physics/deltaV';
import { setMission } from './physics/edit';
import type { FixResult } from './physics/fixes';
import { simulate } from './physics/simulate';
import type { RocketSpec } from './physics/types';
import { buildVehicle } from './physics/vehicle';
import { Charts, RUN_COLORS, type Run } from './ui/Charts';
import { Countdown } from './ui/Countdown';
import { EngineerBuilder } from './ui/EngineerBuilder';
import { EngineerPanel } from './ui/EngineerPanel';
import { FlightCanvas } from './ui/FlightCanvas';
import { feedbackFor } from './ui/messages';
import { sampleAt, usePlayback } from './ui/playback';
import { EngineerResult, RoscoeResult, type FixState } from './ui/ResultCard';
import { RocketThumb } from './ui/RocketThumb';
import { RoscoeBuilder } from './ui/RoscoeBuilder';
import { RoscoeDials } from './ui/RoscoeDials';
import { StageStrip } from './ui/StageStrip';
import { autoSizeAsync, findFixesAsync } from './ui/whatIf';

type Mode = 'roscoe' | 'engineer';
type Phase = 'ready' | 'countdown' | 'flying' | 'done';
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

export default function App() {
  const [mode, setModeState] = useState<Mode>(loadMode);
  const [presetId, setPresetId] = useState(presets[0].id);
  const preset = presets.find((p) => p.id === presetId)!;
  const [spec, setSpec] = useState<RocketSpec>(preset);
  const [tab, setTab] = useState<Tab>('fly');
  const [phase, setPhase] = useState<Phase>('ready');
  const [fix, setFix] = useState<FixState | undefined>();
  const [autoSizing, setAutoSizing] = useState(false);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<Run[]>([]);
  const runId = useRef(1);
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

  const vehicle = useMemo(() => buildVehicle(spec, catalog), [spec]);
  const record = useMemo(() => simulate(spec, catalog), [spec]);
  const deltaV = useMemo(() => stageDeltaV(spec, catalog), [spec]);
  const thumbs = useMemo(() => Object.fromEntries(presets.map((p) => [p.id, buildVehicle(p, catalog)])), []);
  const feedback = useMemo(() => feedbackFor(record), [record]);
  const pb = usePlayback(record, 10);
  const sample = sampleAt(record.samples, pb.t);
  const current: Run = useMemo(
    () => ({ id: 0, label: spec.name, color: RUN_COLORS[0], record }),
    [record, spec.name],
  );

  const choosePreset = (id: string) => {
    const p = presets.find((x) => x.id === id)!;
    setPresetId(id);
    setSpec(p);
    setAutoMessage(null);
  };

  // A changed design means a new flight: back to the pad, and start looking for fixes
  // right away so they are ready when the failure card appears.
  useEffect(() => {
    setPhase('ready');
    const failure = record.outcome.failure;
    if (!failure) {
      setFix(undefined);
      return;
    }
    let live = true;
    setFix({ status: 'working', fixes: [], tested: 0 });
    findFixesAsync(spec, failure.type).then((r) => {
      if (live) setFix({ status: 'done', ...r });
    });
    return () => {
      live = false;
    };
  }, [record]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'flying' && !pb.playing && pb.t >= record.durationS) setPhase('done');
  }, [phase, pb.playing, pb.t, record.durationS]);

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
      if (r.ok) setSpec(r.spec);
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
          {presets.map((p) => (
            <button
              key={p.id}
              className={`pick ${p.id === presetId ? 'on' : ''}`}
              onClick={() => choosePreset(p.id)}
              title={p.description}
            >
              <RocketThumb vehicle={p.id === presetId ? vehicle : thumbs[p.id]} height={roscoe ? 60 : 40} />
              <span>
                {p.name}
                {p.id === presetId && modified && <em className="modified"> (modified)</em>}
              </span>
            </button>
          ))}
        </nav>
        <div className="tabs" role="tablist" aria-label="Screen">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
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
            <FlightCanvas
              record={record}
              vehicle={vehicle}
              tRef={pb.tRef}
              launchSite={spec.launchSite}
              roscoe={roscoe}
              armed={phase === 'flying' || phase === 'done'}
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

            {phase === 'ready' && (
              <div className="launch-wrap">
                <button className="launch-btn" onClick={launch}>
                  LAUNCH
                </button>
              </div>
            )}

            {phase === 'countdown' && <Countdown from={10} onDone={startFlight} voice={roscoe} />}

            {phase === 'done' && roscoe && <RoscoeResult fb={feedback} fix={fix} onAgain={again} onTryFix={tryFix} />}

            {phase !== 'ready' && phase !== 'countdown' && (
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
                  max={record.durationS}
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
              {phase === 'done' && <EngineerResult fb={feedback} fix={fix} onAgain={launch} onTryFix={tryFix} />}
              <EngineerPanel
                record={record}
                vehicle={vehicle}
                sample={sample}
                deltaV={deltaV}
                mission={spec.mission}
                setMission={(patch) => setSpec(setMission(spec, patch))}
                onSeek={(t) => {
                  if (phase === 'ready' || phase === 'countdown') setPhase('flying');
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
