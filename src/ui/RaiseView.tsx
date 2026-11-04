// Climbing to a high orbit: around the parking orbit, burn, coast up the egg-shaped transfer
// orbit, burn again at the top to make it round. Distances squeezed to fit the screen.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MU_EARTH_M3S2, R_EARTH_M } from '../physics/constants';
import type { RaiseLedger } from '../physics/raise';

interface Props {
  ledger: RaiseLedger;
  roscoe: boolean;
  sceneSeconds?: number;
  onDone: () => void;
}

const C = { x: 500, y: 300 };
const EARTH_PX = 40;
const LOW_PX = 62;
const HIGH_PX = 250;

/** Screen radius for a distance from Earth's centre: squeezed so both orbits fit. */
function px(rM: number, ledger: RaiseLedger) {
  const r1 = R_EARTH_M + ledger.fromAltM;
  const r2 = R_EARTH_M + ledger.targetAltM;
  const f = Math.log(rM / r1) / Math.log(r2 / r1);
  return LOW_PX + (HIGH_PX - LOW_PX) * f;
}

/** Highest point reached if the first burn was only `dv` (vis-viva). */
function apogeeFor(ledger: RaiseLedger, dvMS: number) {
  const r1 = R_EARTH_M + ledger.fromAltM;
  const v = Math.sqrt(MU_EARTH_M3S2 / r1) + dvMS;
  const a = 1 / (2 / r1 - (v * v) / MU_EARTH_M3S2);
  return 2 * a - r1;
}

export function RaiseView({ ledger, roscoe, sceneSeconds = 12, onDone }: Props) {
  const [transfer, circ] = ledger.legs;
  const reachedApoM = transfer.ok ? R_EARTH_M + ledger.targetAltM : apogeeFor(ledger, transfer.availableMS);
  const apoPx = px(reachedApoM, ledger);

  // Beats: lap in low orbit, coast up, then either a lap up high or fall back down.
  const beats = useMemo(() => {
    const b: { kind: 'low' | 'up' | 'high' | 'down'; share: number }[] = [{ kind: 'low', share: 0.25 }, { kind: 'up', share: 0.35 }];
    b.push(ledger.success ? { kind: 'high', share: 0.4 } : { kind: 'down', share: 0.35 });
    return b;
  }, [ledger]);
  const total = beats.reduce((a, x) => a + x.share, 0);

  const [p, setP] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const f = Math.min(1, (now - start) / 1000 / (sceneSeconds * total));
      setP(f);
      if (f >= 1) {
        setTimeout(() => doneRef.current(), ledger.success ? 700 : 1200);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ledger, sceneSeconds, total]);

  let acc = 0;
  let bi = 0;
  while (bi < beats.length - 1 && p * total > acc + beats[bi].share) acc += beats[bi++].share;
  const beat = beats[bi];
  const f = Math.min(1, (p * total - acc) / beat.share);

  // Transfer ellipse: perigee on the right at LOW_PX, apogee on the left at apoPx.
  const a = (LOW_PX + apoPx) / 2;
  const cx = C.x + LOW_PX - a;
  const b = Math.sqrt(LOW_PX * apoPx);
  const onEllipse = (t: number): [number, number] => [cx + a * Math.cos(t), C.y - b * Math.sin(t)];
  let craft: [number, number];
  if (beat.kind === 'low') craft = [C.x + LOW_PX * Math.cos(2 * Math.PI * f), C.y - LOW_PX * Math.sin(2 * Math.PI * f)];
  else if (beat.kind === 'up') craft = onEllipse(Math.PI * f);
  else if (beat.kind === 'high') craft = [C.x + HIGH_PX * Math.cos(Math.PI + 2 * Math.PI * f), C.y - HIGH_PX * Math.sin(Math.PI + 2 * Math.PI * f)];
  else craft = onEllipse(Math.PI + Math.PI * f);

  const burn1 = beat.kind === 'up' && f < 0.12;
  const burn2 = beat.kind === 'high' && f < 0.12;
  const failed = !ledger.success && beat.kind === 'down';
  const ticked = new Set<string>(beat.kind === 'low' ? [] : beat.kind === 'up' ? ['transfer'] : ['transfer', 'circularize']);
  const caption = failed
    ? roscoe
      ? 'Not enough fuel to climb all the way! 😟'
      : `${(!transfer.ok ? transfer : circ).name}: short by ${Math.round((!transfer.ok ? transfer : circ).neededMS - (!transfer.ok ? transfer : circ).availableMS)} m/s`
    : beat.kind === 'low'
      ? roscoe
        ? 'In orbit! Getting ready for the big climb…'
        : `Parking orbit, ${Math.round(ledger.fromAltM / 1000)} km`
      : beat.kind === 'up'
        ? roscoe
          ? 'Push #1: stretching the orbit into an egg shape!'
          : `Transfer orbit: ${ledger.transferHours.toFixed(1)} h coast to the top`
        : roscoe
          ? 'Push #2 at the top: now it stays up high!'
          : `Circular at ${Math.round(ledger.targetAltM / 1000).toLocaleString()} km`;

  return (
    <div className={`moon-leg ${roscoe ? 'roscoe' : ''}`}>
      <svg viewBox="0 0 1000 600" className="moon-svg" role="img" aria-label="Climbing to a high orbit">
        {Array.from({ length: 70 }, (_, k) => (
          <circle key={k} cx={(k * 137.5) % 1000} cy={(k * 251.3) % 600} r={k % 3 === 0 ? 1.6 : 1} fill="#fff" opacity={0.6} />
        ))}
        <circle cx={C.x} cy={C.y} r={LOW_PX} fill="none" stroke="rgba(255,255,255,0.25)" strokeDasharray="4 6" />
        <circle cx={C.x} cy={C.y} r={HIGH_PX} fill="none" stroke={ledger.success && beat.kind === 'high' ? 'rgba(255,214,120,0.9)' : 'rgba(255,255,255,0.25)'} strokeWidth={2} strokeDasharray={beat.kind === 'high' ? undefined : '4 6'} />
        <ellipse cx={cx} cy={C.y} rx={a} ry={b} fill="none" stroke={failed ? '#ff6b6b' : beat.kind === 'low' ? 'rgba(255,255,255,0.15)' : 'rgba(255,214,120,0.8)'} strokeWidth={2} />
        <circle cx={C.x} cy={C.y} r={EARTH_PX} fill="#2a74c9" />
        <path d={`M${C.x - 22} ${C.y - 16} q11 -11 22 -3 q8 11 -5 16 q-14 3 -17 -13z`} fill="#3f9b5a" opacity={0.85} />
        <text x={C.x + HIGH_PX + 12} y={C.y + 5} className="moon-label">
          {Math.round(ledger.targetAltM / 1000).toLocaleString()} km
        </text>
        <g transform={`translate(${craft[0].toFixed(1)} ${craft[1].toFixed(1)})`}>
          <rect x={-6} y={-6} width={12} height={12} rx={2} fill={failed ? '#ff6b6b' : '#fff'} />
          <path d="M-16 -2 h10 M6 -2 h10" stroke="#5cc8ff" strokeWidth={4} />
          {(burn1 || burn2) && <circle r={18} fill="none" stroke="#ffb02e" strokeWidth={3} />}
        </g>
        <text x={500} y={50} textAnchor="middle" className={`moon-caption ${failed ? 'bad' : ''}`}>
          {caption}
        </text>
        {!roscoe && (
          <text x={500} y={585} textAnchor="middle" className="moon-note">
            Hohmann transfer · distances squeezed to fit
          </text>
        )}
      </svg>
      <ol className="ledger" aria-label="Delta-v ledger">
        {ledger.legs.map((l) => {
          const shown = ticked.has(l.id);
          return (
            <li key={l.id} className={`${shown ? 'shown' : ''} ${shown ? (l.ok ? 'ok' : 'bad') : ''}`}>
              <span className="ledger-name">
                {shown ? (l.ok ? '✅' : '❌') : '⬜'} {roscoe ? l.roscoe : l.name}
              </span>
              <span className="ledger-bar" aria-hidden="true">
                <span style={{ width: `${shown ? Math.min(1, l.availableMS / l.neededMS) * 100 : 0}%` }} />
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
