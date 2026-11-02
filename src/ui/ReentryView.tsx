// Coming home: the capsule glowing through the air, then parachutes and splashdown.
// Plays the re-entry record on its own clock, squeezed into a short scene.

import { useEffect, useRef, useState } from 'react';
import { CREW_G_LIMIT, type ReentryRecord, type ReentrySample } from '../physics/reentry';

interface Props {
  record: ReentryRecord;
  roscoe: boolean;
  /** Real seconds the whole scene takes. */
  sceneSeconds?: number;
  onDone: () => void;
}

function sampleAt(samples: ReentrySample[], t: number): ReentrySample {
  if (t <= samples[0].tS) return samples[0];
  const last = samples[samples.length - 1];
  if (t >= last.tS) return last;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].tS <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const f = (t - a.tS) / (b.tS - a.tS || 1);
  const mix = (x: number, y: number) => x + (y - x) * f;
  return {
    ...a,
    tS: t,
    altitudeM: mix(a.altitudeM, b.altitudeM),
    speedMS: mix(a.speedMS, b.speedMS),
    heatFluxWm2: mix(a.heatFluxWm2, b.heatFluxWm2),
    heatLoadJm2: mix(a.heatLoadJm2, b.heatLoadJm2),
    gLoad: mix(a.gLoad, b.gLoad),
  };
}

/** Scene time runs faster through the slow parachute part, so it doesn't drag. */
function sceneClock(record: ReentryRecord) {
  const s = record.samples;
  const chute = s.find((x) => x.phase === 'parachute')?.tS ?? record.durationS;
  // Weight: entry seconds count fully, parachute seconds a tenth.
  const weight = (t: number) => Math.min(t, chute) + Math.max(0, t - chute) * 0.1;
  const total = weight(record.durationS);
  const inverse = (w: number) => (w <= chute ? w : chute + (w - chute) / 0.1);
  return { total, inverse };
}

export function ReentryView({ record, roscoe, sceneSeconds = 22, onDone }: Props) {
  const [t, setT] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const clock = sceneClock(record);
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const w = Math.min(clock.total, ((now - start) / 1000 / sceneSeconds) * clock.total);
      setT(clock.inverse(w));
      if (w >= clock.total) {
        setTimeout(() => doneRef.current(), 800);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [record, sceneSeconds]);

  const s = sampleAt(record.samples, t);
  const burnT = record.outcome === 'burnUp' ? record.samples.find((x) => x.heatFluxWm2 > record.maxHeatFluxWm2 || x.heatLoadJm2 > record.maxHeatLoadJm2)?.tS ?? Infinity : Infinity;
  const burning = t >= burnT;
  const heat = Math.min(1.5, s.heatFluxWm2 / record.maxHeatFluxWm2);
  const load = Math.min(1.2, s.heatLoadJm2 / record.maxHeatLoadJm2);
  const space = Math.min(1, s.altitudeM / 80000);
  const sky = `rgb(${Math.round(110 - 100 * space)},${Math.round(175 - 160 * space)},${Math.round(235 - 195 * space)})`;
  const seaY = s.altitudeM < 12000 ? 600 - (1 - s.altitudeM / 12000) * 170 : 640;
  const chutes = s.phase === 'parachute' || s.phase === 'splashdown';
  const done = s.phase === 'splashdown';
  const skipped = record.outcome === 'skipOut' && t > record.durationS * 0.6;
  // Capsule drifts up out of frame when it skips out.
  const capY = skipped ? 300 - (t / record.durationS - 0.6) * 900 : done ? seaY - 22 : 300;
  const gWarn = s.gLoad > CREW_G_LIMIT;
  const peakT = record.samples.reduce((a, b) => (b.heatFluxWm2 > a.heatFluxWm2 ? b : a)).tS;

  const msg = done
    ? roscoe
      ? 'SPLASHDOWN! 🌊 Welcome home!'
      : `Splashdown at ${record.splashSpeedMS.toFixed(1)} m/s`
    : burning
      ? roscoe
        ? 'Too hot! 🔥'
        : 'Heat shield failed'
      : skipped
        ? roscoe
          ? 'Boing! It skipped off the air!'
          : 'Skipping out of the atmosphere'
        : chutes
          ? roscoe
            ? 'Parachutes open! 🪂'
            : 'Main parachutes deployed'
          : heat > 0.15
            ? roscoe
              ? 'Hot hot hot! The heat shield is glowing'
              : 'Peak heating'
            : t > peakT
              ? roscoe
                ? 'Slowing down…'
                : 'Past peak heating'
              : roscoe
                ? 'Coming home…'
                : 'Entry interface';

  return (
    <div className={`reentry ${roscoe ? 'roscoe' : ''}`}>
      <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="reentry-svg" role="img" aria-label="Capsule re-entry">
        <defs>
          <radialGradient id="plasma" cx="50%" cy="80%" r="60%">
            <stop offset="0%" stopColor={burning ? '#ffffff' : '#fff2b0'} stopOpacity={Math.min(1, heat)} />
            <stop offset="45%" stopColor={burning ? '#ff5a3c' : '#ff9a2e'} stopOpacity={Math.min(0.9, heat * 0.8)} />
            <stop offset="100%" stopColor="#ff4d2e" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect width="1000" height="600" fill={sky} />
        {space > 0.3 &&
          Array.from({ length: 50 }, (_, k) => (
            <circle key={k} cx={(k * 197.3) % 1000} cy={(k * 113.7 + t * 3) % 600} r={1.2} fill="#fff" opacity={space * 0.8} />
          ))}
        {/* Speed streaks while it's fast. */}
        {!chutes &&
          Array.from({ length: 12 }, (_, k) => (
            <line
              key={k}
              x1={150 + k * 65}
              x2={150 + k * 65}
              y1={(k * 97 + t * Math.min(40, s.speedMS / 150)) % 600}
              y2={((k * 97 + t * Math.min(40, s.speedMS / 150)) % 600) - Math.min(120, s.speedMS / 60)}
              stroke="#fff"
              strokeOpacity={0.25}
              strokeWidth={2}
            />
          ))}
        <rect x={0} y={seaY} width={1000} height={600} fill="#1f6fb2" />
        {done && <ellipse cx={500} cy={seaY} rx={90} ry={10} fill="#e9f6ff" opacity={0.8} />}

        <g transform={`translate(500 ${capY})`}>
          {chutes && !burning && (
            <g>
              {[-70, 0, 70].map((x) => (
                <g key={x}>
                  <line x1={0} y1={-24} x2={x} y2={-150} stroke="#e8eef7" strokeWidth={1.5} />
                  <path d={`M${x - 45} -150 Q${x} -215 ${x + 45} -150 Z`} fill={x === 0 ? '#ffffff' : '#ff8a3c'} stroke="#c9d1dc" />
                </g>
              ))}
            </g>
          )}
          {/* Capsule, heat shield down. */}
          {!(burning && t > burnT + 3) && (
            <g opacity={burning ? Math.max(0.2, 1 - (t - burnT) / 3) : 1}>
              {!chutes && <ellipse cx={0} cy={34} rx={80} ry={70} fill="url(#plasma)" />}
              <path d="M-36 20 L-14 -26 L14 -26 L36 20 Z" fill="#c9d1dc" stroke="#1b2a44" strokeWidth={3} />
              <path d="M-38 20 Q0 34 38 20" fill={burning ? '#ff5a3c' : heat > 0.2 ? '#ff9a2e' : '#5b4a3a'} stroke="#1b2a44" strokeWidth={3} />
              <rect x={-6} y={-10} width={12} height={9} rx={2} fill="#1b2a44" />
            </g>
          )}
        </g>

        <text x={500} y={70} textAnchor="middle" className={`moon-caption ${burning || record.outcome === 'skipOut' ? 'bad' : ''}`}>
          {msg}
        </text>
      </svg>

      <div className="reentry-gauges">
        <div className="rg">
          <span>{roscoe ? '📏 Height' : 'Altitude'}</span>
          <b>{(s.altitudeM / 1000).toFixed(1)} km</b>
        </div>
        <div className="rg">
          <span>{roscoe ? '💨 Speed' : 'Speed'}</span>
          <b>{s.speedMS.toFixed(0)} m/s</b>
        </div>
        <div className={`rg ${gWarn ? 'warn' : ''}`}>
          <span>{roscoe ? '🫨 Squish' : 'g-load'}</span>
          <b>{s.gLoad.toFixed(1)} g</b>
          <span className="rg-bar">
            <span style={{ width: `${Math.min(100, (s.gLoad / CREW_G_LIMIT) * 100)}%` }} />
          </span>
        </div>
        <div className={`rg ${heat > 1 || load > 1 ? 'warn' : ''}`}>
          <span>{roscoe ? '🔥 Heat shield' : 'Heat (rate · total)'}</span>
          <b>{roscoe ? `${Math.round(Math.max(heat, load) * 100)}%` : `${(s.heatFluxWm2 / 1e6).toFixed(2)} MW/m² · ${(s.heatLoadJm2 / 1e6).toFixed(0)} MJ/m²`}</b>
          <span className="rg-bar">
            <span style={{ width: `${Math.min(100, Math.max(heat, load) * 100)}%` }} />
          </span>
        </div>
      </div>
    </div>
  );
}
