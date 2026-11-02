// The Moon trip as a picture: Earth, Moon and the spacecraft moving through each burn,
// with the delta-v ledger filling in beside it. A schematic, not a real trajectory.

import { useEffect, useRef, useState } from 'react';
import type { LegId, MoonLedger } from '../physics/moon';

interface Props {
  ledger: MoonLedger;
  roscoe: boolean;
  /** Seconds per leg at normal speed. */
  legSeconds?: number;
  onDone: () => void;
}

const E = { x: 170, y: 300, r: 70 };
const M = { x: 820, y: 250, r: 38 };
const ORBIT_R = 64;

type Pt = [number, number];
const bez = (a: Pt, c: Pt, b: Pt, f: number): Pt => [
  (1 - f) * (1 - f) * a[0] + 2 * (1 - f) * f * c[0] + f * f * b[0],
  (1 - f) * (1 - f) * a[1] + 2 * (1 - f) * f * c[1] + f * f * b[1],
];
const onCircle = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

/** Where the spacecraft is during each leg, for f from 0 to 1. */
const PATH: Record<LegId, (f: number) => Pt> = {
  tli: (f) => bez(onCircle(E.x, E.y, E.r + 14, -60), [480, 20], onCircle(M.x, M.y, ORBIT_R, 180), f),
  loi: (f) => onCircle(M.x, M.y, ORBIT_R, 180 + 360 * f),
  descent: (f) => {
    const a = onCircle(M.x, M.y, ORBIT_R, 270);
    const b = onCircle(M.x, M.y, M.r + 2, 270);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  },
  ascent: (f) => {
    const a = onCircle(M.x, M.y, M.r + 2, 270);
    const b = onCircle(M.x, M.y, ORBIT_R, 300);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  },
  tei: (f) => bez(onCircle(M.x, M.y, ORBIT_R, 60), [480, 560], onCircle(E.x, E.y, E.r + 2, 40), f),
};

const pathD = (id: LegId) => {
  const pts = Array.from({ length: 41 }, (_, i) => PATH[id](i / 40));
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
};

export function MoonLeg({ ledger, roscoe, legSeconds = 3.2, onDone }: Props) {
  const legs = ledger.legs;
  const stopAt = legs.findIndex((l) => !l.ok);
  const lastLeg = stopAt >= 0 ? stopAt : legs.length;
  // Progress in legs: 2.5 means halfway through the third leg.
  const [p, setP] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let prog = 0;
    // A short leg that fails still gets a moment on screen before stopping.
    const end = stopAt >= 0 ? stopAt + 0.35 : legs.length;
    const loop = (now: number) => {
      prog = Math.min(end, prog + (now - last) / 1000 / legSeconds);
      last = now;
      setP(prog);
      if (prog >= end) {
        setTimeout(() => doneRef.current(), stopAt >= 0 ? 900 : 600);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ledger, legSeconds, stopAt, legs.length]);

  const i = Math.min(Math.floor(p), legs.length - 1);
  const f = Math.min(1, p - i);
  const leg = legs[i];
  const failedHere = stopAt === i && p >= stopAt;
  const craft = failedHere ? PATH[leg.id](Math.min(f, 0.35)) : PATH[leg.id](f);
  // The lander rides down and back on its own; the main ship waits in Moon orbit.
  const onLander = leg.id === 'descent' || leg.id === 'ascent';
  const mothership = onLander ? PATH.loi((p - i) * 0.5) : null;

  return (
    <div className={`moon-leg ${roscoe ? 'roscoe' : ''}`}>
      <svg viewBox="0 0 1000 600" className="moon-svg" role="img" aria-label="Trip to the Moon">
        <defs>
          <radialGradient id="earthG" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#6ec6ff" />
            <stop offset="70%" stopColor="#2a74c9" />
            <stop offset="100%" stopColor="#174a8a" />
          </radialGradient>
          <radialGradient id="moonG" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#f2f2f0" />
            <stop offset="100%" stopColor="#a9abb0" />
          </radialGradient>
        </defs>
        {Array.from({ length: 70 }, (_, k) => (
          <circle key={k} cx={(k * 137.5) % 1000} cy={(k * 251.3) % 600} r={k % 3 === 0 ? 1.6 : 1} fill="#fff" opacity={0.6} />
        ))}
        {legs.slice(0, lastLeg + (stopAt >= 0 ? 1 : 0)).map((l, k) => (
          <path
            key={l.id}
            d={pathD(l.id)}
            fill="none"
            stroke={!l.ok ? '#ff6b6b' : k < p ? 'rgba(255,214,120,0.9)' : 'rgba(255,255,255,0.18)'}
            strokeWidth={roscoe ? 4 : 2.5}
            strokeDasharray={k < p ? undefined : '6 8'}
          />
        ))}
        <circle cx={E.x} cy={E.y} r={E.r} fill="url(#earthG)" />
        <path d={`M${E.x - 40} ${E.y - 30} q20 -20 40 -5 q15 20 -10 30 q-25 5 -30 -25z`} fill="#3f9b5a" opacity={0.85} />
        <circle cx={M.x} cy={M.y} r={M.r} fill="url(#moonG)" />
        <circle cx={M.x - 12} cy={M.y - 8} r={6} fill="#9a9ca1" />
        <circle cx={M.x + 10} cy={M.y + 12} r={4} fill="#9a9ca1" />
        <text x={E.x} y={E.y + E.r + 30} textAnchor="middle" className="moon-label">
          Earth
        </text>
        <text x={M.x} y={M.y + M.r + 50} textAnchor="middle" className="moon-label">
          Moon
        </text>
        {mothership && <circle cx={mothership[0]} cy={mothership[1]} r={roscoe ? 6 : 4} fill="#e8eef7" />}
        <g transform={`translate(${craft[0]} ${craft[1]})`}>
          {onLander ? (
            <path d="M-7 4 L0 -8 L7 4 Z M-9 8 L-5 3 M9 8 L5 3" stroke="#ffd36e" strokeWidth={2} fill="#ffd36e" />
          ) : (
            <circle r={roscoe ? 8 : 5} fill={failedHere ? '#ff6b6b' : '#ffffff'} />
          )}
          {!failedHere && f < 0.5 && <circle r={roscoe ? 14 : 10} fill="none" stroke="#ffb02e" strokeWidth={2} opacity={1 - f * 2} />}
        </g>
        <text x={500} y={60} textAnchor="middle" className={`moon-caption ${failedHere ? 'bad' : ''}`}>
          {failedHere ? (roscoe ? 'Not enough fuel! 😟' : `${leg.name}: short by ${(leg.neededMS - leg.availableMS).toFixed(0)} m/s`) : roscoe ? `${leg.roscoe}!` : leg.name}
        </text>
      </svg>

      <ol className="ledger" aria-label="Delta-v ledger">
        {legs.map((l, k) => {
          const shown = k <= p;
          const frac = Math.min(1, l.availableMS / l.neededMS);
          return (
            <li key={l.id} className={`${shown ? 'shown' : ''} ${shown ? (l.ok ? 'ok' : 'bad') : ''} ${k === i ? 'now' : ''}`}>
              <span className="ledger-name">
                {shown ? (l.ok ? '✅' : '❌') : '⬜'} {roscoe ? l.roscoe : l.name}
              </span>
              {!roscoe && <span className="ledger-by muted">{l.by}</span>}
              <span className="ledger-bar" aria-hidden="true">
                <span style={{ width: `${shown ? frac * 100 : 0}%` }} />
              </span>
              {!roscoe && (
                <span className="ledger-num mono">
                  {l.availableMS.toFixed(0)} / {l.neededMS.toFixed(0)} m/s
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
