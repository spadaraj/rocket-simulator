import { useCallback, useEffect, useMemo, useState } from 'react';
import { catalog, presets } from './data/catalog';
import { stageDeltaV } from './physics/deltaV';
import { simulate } from './physics/simulate';
import type { RocketSpec } from './physics/types';
import { buildVehicle } from './physics/vehicle';
import { Countdown } from './ui/Countdown';
import { EngineerPanel, type Tweaks } from './ui/EngineerPanel';
import { FlightCanvas } from './ui/FlightCanvas';
import { feedbackFor } from './ui/messages';
import { sampleAt, usePlayback } from './ui/playback';
import { EngineerResult, RoscoeResult } from './ui/ResultCard';
import { RocketThumb } from './ui/RocketThumb';
import { RoscoeDials } from './ui/RoscoeDials';
import { StageStrip } from './ui/StageStrip';

type Mode = 'roscoe' | 'engineer';
type Phase = 'ready' | 'countdown' | 'flying' | 'done';

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

function coreEngineRef(spec: RocketSpec) {
  return spec.stages[0]?.parts.find((p) => catalog[p.part]?.type === 'liquidEngine');
}

function defaultTweaks(spec: RocketSpec): Tweaks {
  const b = spec.stages[0]?.boosters;
  return {
    coreEngines: coreEngineRef(spec)?.count ?? 1,
    boosterCount: b?.count ?? 0,
    boosterPart: b?.part ?? 'srb-sls-5seg',
    kickTimeS: spec.mission.pitchKick.timeS,
    kickAngleDeg: spec.mission.pitchKick.angleDeg,
    targetAltKm: spec.mission.targetOrbitAltitudeM / 1000,
    maxQThrottle: spec.mission.maxQThrottle?.throttle ?? 1,
  };
}

function applyTweaks(spec: RocketSpec, t: Tweaks): RocketSpec {
  const engine = coreEngineRef(spec);
  const stages = spec.stages.map((s, i) => {
    if (i !== 0) return s;
    const parts = s.parts.map((p) => (p === engine ? { ...p, count: t.coreEngines } : p));
    const boosters =
      t.boosterCount > 0
        ? { part: t.boosterPart, count: t.boosterCount, separate: 'onBurnout' as const, color: '#f4f6fa' }
        : undefined;
    return { ...s, parts, boosters };
  });
  return {
    ...spec,
    stages,
    mission: {
      ...spec.mission,
      pitchKick: { timeS: t.kickTimeS, angleDeg: t.kickAngleDeg },
      targetOrbitAltitudeM: t.targetAltKm * 1000,
      maxQThrottle: t.maxQThrottle < 1 ? { aboveQPa: 20000, throttle: t.maxQThrottle } : undefined,
    },
  };
}

export default function App() {
  const [mode, setModeState] = useState<Mode>(loadMode);
  const [presetId, setPresetId] = useState(presets[0].id);
  const preset = presets.find((p) => p.id === presetId)!;
  const [tweaks, setTweaks] = useState<Tweaks>(() => defaultTweaks(preset));
  const [phase, setPhase] = useState<Phase>('ready');
  const roscoe = mode === 'roscoe';

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem('mode', m);
    } catch {
      /* storage unavailable: keep the in-memory choice */
    }
  };

  const spec = useMemo(() => applyTweaks(preset, tweaks), [preset, tweaks]);
  const vehicle = useMemo(() => buildVehicle(spec, catalog), [spec]);
  const record = useMemo(() => simulate(spec, catalog), [spec]);
  const deltaV = useMemo(() => stageDeltaV(spec, catalog), [spec]);
  const thumbs = useMemo(() => Object.fromEntries(presets.map((p) => [p.id, buildVehicle(p, catalog)])), []);
  const feedback = useMemo(() => feedbackFor(record), [record]);
  const pb = usePlayback(record, 10);
  const sample = sampleAt(record.samples, pb.t);

  const choosePreset = (id: string) => {
    const p = presets.find((x) => x.id === id)!;
    setPresetId(id);
    setTweaks(defaultTweaks(p));
    setPhase('ready');
  };

  // A changed design means a new flight: back to the pad.
  useEffect(() => {
    setPhase('ready');
  }, [record]);

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

  const speeds = roscoe ? ROSCOE_SPEEDS.map((s) => s.speed) : ENGINEER_SPEEDS;
  useEffect(() => {
    if (!speeds.includes(pb.speed)) pb.setSpeed(10);
  }, [roscoe]); // eslint-disable-line react-hooks/exhaustive-deps

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
              <RocketThumb vehicle={thumbs[p.id]} height={roscoe ? 60 : 40} />
              <span>{p.name}</span>
            </button>
          ))}
        </nav>
        <div className="mode-toggle" role="group" aria-label="Mode">
          <button className={roscoe ? 'on' : ''} onClick={() => setMode('roscoe')}>
            Roscoe
          </button>
          <button className={!roscoe ? 'on' : ''} onClick={() => setMode('engineer')}>
            Engineer
          </button>
        </div>
      </header>

      <main className="stage">
        <div className="view">
          <FlightCanvas record={record} vehicle={vehicle} tRef={pb.tRef} launchSite={spec.launchSite}
            roscoe={roscoe}
            armed={phase === 'flying' || phase === 'done'}
          />

          {roscoe && <StageStrip
              vehicle={vehicle}
              sample={sample}
              started={phase !== 'ready' && phase !== 'countdown'}
              live={phase === 'flying' && pb.t < record.durationS}
            />}
          {roscoe && phase !== 'ready' && <RoscoeDials sample={sample} />}

          {phase === 'ready' && (
            <div className="launch-wrap">
              <button className="launch-btn" onClick={launch}>
                LAUNCH
              </button>
            </div>
          )}

          {phase === 'countdown' && <Countdown from={10} onDone={startFlight} voice={roscoe} />}

          {phase === 'done' && roscoe && <RoscoeResult fb={feedback} onAgain={again} />}

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
            {phase === 'done' && <EngineerResult fb={feedback} onAgain={launch} />}
            <EngineerPanel
              record={record}
              vehicle={vehicle}
              sample={sample}
              deltaV={deltaV}
              tweaks={tweaks}
              setTweaks={setTweaks}
              canTweakCore={!!coreEngineRef(preset)}
              canTweakBoosters
              onSeek={(t) => {
                if (phase === 'ready' || phase === 'countdown') setPhase('flying');
                pb.seek(t);
              }}
            />
          </aside>
        )}
      </main>
    </div>
  );
}
