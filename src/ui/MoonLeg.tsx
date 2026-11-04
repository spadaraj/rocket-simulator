// The Moon trip: the real free-return flight path, seen with the Earth and Moon held still,
// and the delta-v ledger filling in beside it as each burn happens.

import { useEffect, useMemo, useRef, useState } from 'react';
import { R_EARTH_M } from '../physics/constants';
import type { LegId, MoonLedger } from '../physics/moon';
import { EARTH_X_M, MOON_X_M, moonTrajectory, R_MOON_M, type TripKind } from '../physics/trajectory';

interface Props {
  ledger: MoonLedger;
  parkingAltM: number;
  kind: TripKind;
  roscoe: boolean;
  /** Real seconds for the whole scene. */
  sceneSeconds?: number;
  onDone: () => void;
}

const E = { x: 150, y: 320, r: 30 };
const M = { x: 840, y: 320, r: 17 };
const SCALE = (M.x - E.x) / (MOON_X_M - EARTH_X_M);
/** Near each body the path is pushed outwards so it clears the (enlarged) drawing of it. */
const FISHEYE_M = 30000e3;

type Pt = [number, number];

function toScreen(xM: number, yM: number): Pt {
  let px = E.x + (xM - EARTH_X_M) * SCALE;
  let py = E.y - yM * SCALE;
  for (const [body, cxM, rM] of [
    [E, EARTH_X_M, R_EARTH_M],
    [M, MOON_X_M, R_MOON_M],
  ] as const) {
    const dM = Math.hypot(xM - cxM, yM);
    const grow = (body.r - rM * SCALE) * Math.exp(-Math.max(0, dM - rM) / FISHEYE_M);
    if (dM > 0 && grow > 0) {
      const k = grow / (dM * SCALE);
      px += (px - body.x) * k;
      py += (py - body.y) * k;
    }
  }
  return [px, py];
}

/** One part of the story: flying out, a burn while at the Moon, or flying home. */
interface Beat {
  kind: 'out' | 'stay' | 'home';
  /** Share of the scene's time. */
  share: number;
  /** Ledger legs that tick off when this beat starts. */
  legs: LegId[];
}

export function MoonLeg({ ledger, parkingAltM, kind, roscoe, sceneSeconds = 16, onDone }: Props) {
  const legs = ledger.legs;
  const stopAt = legs.findIndex((l) => !l.ok);
  const short = stopAt >= 0 ? legs[stopAt].id : undefined;
  const trip = useMemo(() => moonTrajectory(parkingAltM, legs[0].availableMS, kind), [parkingAltM, legs, kind]);

  // Screen path with cumulative length, split at the closest pass of the Moon.
  const path = useMemo(() => {
    const pts = trip.points.map((q) => toScreen(q.xM, q.yM));
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const periT = trip.events.find((e) => e.id === 'loi' || e.id === 'perilune' || e.id === 'crash')?.tS;
    const split = periT === undefined ? pts.length - 1 : trip.points.findIndex((q) => q.tS >= periT);
    return { pts, len, split: Math.max(1, split) };
  }, [trip]);

  // The story, beat by beat. A leg that comes up short ends the story there.
  const beats = useMemo((): Beat[] => {
    const reached = trip.outcome === 'home';
    const out: Beat[] = [{ kind: 'out', share: reached ? 0.4 : 1, legs: ['tli'] }];
    if (!reached || short === 'tli') return out;
    // Apollo 13: the service module breaks on the way; the lander lifeboat steers them home.
    if (ledger.emergency) return short === 'lifeboat' ? out : [...out, { kind: 'home', share: 0.45, legs: ['lifeboat'] }];
    if (kind === 'flyby') return [...out, { kind: 'home', share: 0.45, legs: ['flyby'] }];
    // Couldn't brake: the free return carries it round the Moon and home, like Apollo 13.
    if (short === 'loi') return [...out, { kind: 'home', share: 0.45, legs: ['loi'] }];
    out.push({ kind: 'stay', share: 0.08, legs: ['loi'] });
    out.push({ kind: 'stay', share: 0.08, legs: ['descent'] });
    if (short === 'descent' || ledger.oneWay) return out;
    out.push({ kind: 'stay', share: 0.08, legs: ['ascent'] });
    if (short === 'ascent') return out;
    out.push({ kind: 'home', share: 0.4, legs: ['tei'] });
    return out;
  }, [trip, short, kind, ledger]);
  const total = beats.reduce((a, b) => a + b.share, 0);

  const [p, setP] = useState(0); // 0–1 through the scene
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const seconds = sceneSeconds * total;
    const loop = (now: number) => {
      const f = Math.min(1, (now - start) / 1000 / seconds);
      setP(f);
      if (f >= 1) {
        setTimeout(() => doneRef.current(), short ? 1200 : 700);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [trip, sceneSeconds, short, total]);

  // Which beat, and how far through it.
  let acc = 0;
  let bi = 0;
  while (bi < beats.length - 1 && p * total > acc + beats[bi].share) acc += beats[bi++].share;
  const beat = beats[bi];
  const f = Math.min(1, (p * total - acc) / beat.share);
  const ticked = new Set(beats.slice(0, bi + 1).flatMap((b) => b.legs));

  const along = (from: number, to: number, g: number): Pt => {
    const target = path.len[from] + (path.len[to] - path.len[from]) * g;
    let i = from;
    while (i < to - 1 && path.len[i + 1] < target) i++;
    const a = path.pts[i];
    const b = path.pts[Math.min(i + 1, to)];
    const seg = path.len[Math.min(i + 1, to)] - path.len[i] || 1;
    const k = Math.min(1, (target - path.len[i]) / seg);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const last = path.pts.length - 1;
  const goesHome = beats.some((b) => b.kind === 'home') || trip.outcome !== 'home';
  const stayIndex = beats.filter((b) => b.kind === 'stay').indexOf(beat);
  let craft: Pt;
  let drawnTo: number;
  if (beat.kind === 'out') {
    const end = trip.outcome === 'home' ? path.split : last;
    craft = along(0, end, f);
    drawnTo = end;
  } else if (beat.kind === 'stay') {
    // Circling the Moon in lunar orbit.
    const ang = (-90 + 360 * (stayIndex + f)) * (Math.PI / 180);
    craft = [M.x + (M.r + 8) * Math.cos(ang), M.y + (M.r + 8) * Math.sin(ang)];
    drawnTo = path.split;
  } else {
    craft = along(path.split, last, f);
    drawnTo = last;
  }
  const landerLeg = beat.kind === 'stay' && (beat.legs[0] === 'descent' || beat.legs[0] === 'ascent') ? beat.legs[0] : undefined;
  const landerY = landerLeg ? M.y - M.r - 9 + 9 * Math.min(1, (landerLeg === 'descent' ? f : 1 - f) * 1.3) : 0;

  const endOfStory = bi === beats.length - 1 && f >= 1;
  const failedHere = !!short && short !== 'loi' && endOfStory;
  const fellBack = trip.outcome === 'fellBack';
  const bad = (fellBack && f > 0.5) || failedHere;
  const pathD = (to: number) => path.pts.slice(0, to + 1).map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');

  const caption = (() => {
    if (fellBack)
      return f < 0.5
        ? roscoe
          ? 'Blasting off toward the Moon!'
          : 'Trans-lunar injection (short)'
        : roscoe
          ? 'Not enough push! It fell back to Earth 😟'
          : `TLI ${trip.burnMadeMS.toFixed(0)} of ${trip.burnNeededMS.toFixed(0)} m/s: apogee ${Math.round(trip.apogeeAltM / 1000).toLocaleString()} km, then back down`;
    if (ledger.emergency && beat.kind === 'out' && f > 0.55 && !failedHere)
      return roscoe ? '💥 Bang! The service module broke!' : 'Service module failure: landing called off';
    if (ledger.emergency && failedHere) return roscoe ? 'No lifeboat! Nobody can steer home 😟' : 'Service module lost and no lander to use as a lifeboat';
    if (ledger.emergency && beat.kind === 'home' && f < 0.85)
      return roscoe ? 'The lander is the lifeboat! Looping around the Moon and home' : `Lifeboat burns on the lander's engine (${legs[1]?.availableMS.toFixed(0)} m/s available)`;
    if (ledger.oneWay && endOfStory && !short) return roscoe ? 'Delivered! The base is on the Moon 📦' : 'Cargo landed; the lander stays on the Moon';
    if (failedHere && legs[stopAt].by.startsWith('No '))
      return roscoe ? (legs[stopAt].id === 'ascent' ? 'No way to take off again! 😟' : 'No lander! Nothing to land with 😟') : `${legs[stopAt].name}: ${legs[stopAt].by.toLowerCase()}`;
    if (failedHere) return roscoe ? 'Not enough fuel! 😟' : `${legs[stopAt].name}: short by ${(legs[stopAt].neededMS - legs[stopAt].availableMS).toFixed(0)} m/s`;
    if (short === 'loi' && beat.kind === 'home')
      return roscoe ? "Couldn't slow down, so it swung around the Moon and home!" : 'No LOI: the free return brings it straight home (like Apollo 13)';
    if (beat.kind === 'out') return roscoe ? 'Blasting off toward the Moon!' : 'Trans-lunar coast';
    if (beat.kind === 'home' && f > 0.85) return roscoe ? 'Almost home!' : 'Approaching the atmosphere';
    if (beat.kind === 'home' && kind === 'flyby') return roscoe ? 'Swinging around the back of the Moon!' : 'Free-return flyby';
    const leg = legs.find((l) => l.id === beat.legs[0]);
    return leg ? (roscoe ? `${leg.roscoe}!` : leg.name) : '';
  })();

  return (
    <div className={`moon-leg ${roscoe ? 'roscoe' : ''}`}>
      <svg viewBox="0 0 1000 600" className="moon-svg" role="img" aria-label="Flight path to the Moon">
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
        {/* The whole route faintly, then the part flown so far brightly. */}
        <path d={pathD(goesHome ? last : path.split)} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={roscoe ? 3 : 2} strokeDasharray="6 8" />
        <path d={pathD(drawnTo)} fill="none" stroke={bad ? '#ff6b6b' : 'rgba(255,214,120,0.9)'} strokeWidth={roscoe ? 4 : 2.5} />
        <circle cx={E.x} cy={E.y} r={E.r} fill="url(#earthG)" />
        <path d={`M${E.x - 17} ${E.y - 13} q9 -9 17 -2 q6 9 -4 13 q-11 2 -13 -11z`} fill="#3f9b5a" opacity={0.85} />
        <circle cx={M.x} cy={M.y} r={M.r} fill="url(#moonG)" />
        <circle cx={M.x - 5} cy={M.y - 4} r={3} fill="#9a9ca1" />
        <circle cx={M.x + 5} cy={M.y + 6} r={2} fill="#9a9ca1" />
        {beat.kind === 'stay' && <circle cx={M.x} cy={M.y} r={M.r + 8} fill="none" stroke="rgba(255,214,120,0.5)" strokeDasharray="3 4" />}
        <text x={E.x} y={E.y + E.r + 26} textAnchor="middle" className="moon-label">
          Earth
        </text>
        <text x={M.x} y={M.y + M.r + 30} textAnchor="middle" className="moon-label">
          Moon
        </text>
        {landerLeg && (
          <path transform={`translate(${M.x} ${landerY})`} d="M-6 3 L0 -7 L6 3 Z M-8 7 L-4 2 M8 7 L4 2" stroke="#ffd36e" strokeWidth={2} fill="#ffd36e" />
        )}
        <g transform={`translate(${craft[0].toFixed(1)} ${craft[1].toFixed(1)})`}>
          <circle r={roscoe ? 7 : 5} fill={bad ? '#ff6b6b' : '#ffffff'} />
          {f < 0.15 && !bad && <circle r={roscoe ? 16 : 12} fill="none" stroke="#ffb02e" strokeWidth={2} opacity={1 - f / 0.15} />}
        </g>
        <text x={500} y={60} textAnchor="middle" className={`moon-caption ${bad ? 'bad' : ''}`}>
          {caption}
        </text>
        {!roscoe && (
          <text x={500} y={585} textAnchor="middle" className="moon-note">
            Moon held still (it really circles Earth once a month) · Earth and Moon drawn bigger than life · trip {(trip.durationS / 86400).toFixed(1)} days
            {trip.outcome === 'home' ? ` · closest pass ${Math.round(trip.periluneAltM / 1000)} km` : ''}
          </text>
        )}
      </svg>

      <ol className="ledger" aria-label="Delta-v ledger">
        {legs.map((l) => {
          const shown = ticked.has(l.id);
          const frac = Math.min(1, l.availableMS / l.neededMS);
          return (
            <li key={l.id} className={`${shown ? 'shown' : ''} ${shown ? (l.ok ? 'ok' : 'bad') : ''} ${beat.legs.includes(l.id) ? 'now' : ''}`}>
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
