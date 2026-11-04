// A trip around the Sun, fast-forwarded: the planets move, the probe follows its real
// transfer path (or an ion spiral), then brakes, flies past or lands. The ledger fills in
// beside it, burn by burn.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DESTINATIONS, spiralSweep, type PlanetLedger, type PlanetLegId, type Segment } from '../physics/planets';
import { BODIES, nPerDay, propagate, type BodyId, type Vec } from '../physics/solar';
import { at, makeScale, pathD, SolarBackdrop, toScreen } from './SolarMap';

interface Props {
  ledger: PlanetLedger;
  roscoe: boolean;
  /** Real seconds for the whole scene. */
  sceneSeconds?: number;
  onDone: () => void;
}

type BeatKind = 'leave' | 'stuck' | 'travel' | 'wait' | 'past' | 'orbit' | 'flyby' | 'land' | 'stranded' | 'capsule';

interface Beat {
  kind: BeatKind;
  share: number;
  /** Ledger legs that tick off when this beat starts. */
  legs: PlanetLegId[];
  seg?: number;
  /** Travel cut short: how far along the segment it got. */
  upTo?: number;
  /** Where it is (for beats that stay at a body). */
  at?: BodyId;
  /** Days that pass during the beat. */
  days?: number;
}

const S = makeScale(470, 315, 265, 1);

function segLeg(seg: Segment): PlanetLegId | undefined {
  if (seg.kind === 'wait') return undefined;
  if (seg.to === 'earth') return 'home';
  if (seg.from === 'earth') return seg.kind === 'spiral' ? 'cruise' : undefined;
  return 'hop';
}

export function PlanetLeg({ ledger, roscoe, sceneSeconds = 18, onDone }: Props) {
  const info = DESTINATIONS[ledger.destination];
  const legs = ledger.legs;
  const legOf = (id: PlanetLegId) => legs.find((l) => l.id === id);
  const short = ledger.shortLeg;
  const first = info.stops[0];

  const maxAU = Math.max(1, ...ledger.segments.map((s) => (s.to === 'belt' ? s.toAU ?? 3.3 : s.to === 'earth' ? 1 : BODIES[s.to].aAU))) * 1.12;
  const s = useMemo(() => makeScale(S.cx, S.cy, 265, maxAU), [maxAU]);

  // Screen paths for each conic piece, a little longer than the trip so a miss can fly on.
  const paths = useMemo(
    () => ledger.segments.map((seg) => (seg.kind === 'conic' && seg.r1 && seg.v1 ? propagate(seg.r1, seg.v1, seg.days * 1.35, 270) : null)),
    [ledger],
  );

  const beats = useMemo((): Beat[] => {
    const out: Beat[] = [{ kind: 'leave', share: 0.08, legs: ['depart'] }];
    if (short === 'depart') return [...out, { kind: 'stuck', share: 0.22, legs: [] }];
    ledger.segments.forEach((seg, i) => {
      if (out[out.length - 1].kind === 'stranded' || out[out.length - 1].kind === 'past') return;
      if (seg.kind === 'wait') {
        out.push({ kind: 'wait', share: 0.08, legs: [], seg: i, at: seg.from, days: seg.days });
        return;
      }
      const leg = segLeg(seg);
      const l = leg ? legOf(leg) : undefined;
      if (l && !l.ok && seg.kind === 'conic') {
        // Couldn't make the burn to start this piece: stuck where it is.
        out.push({ kind: 'stranded', share: 0.2, legs: [leg!], at: seg.from });
        return;
      }
      const upTo = l && !l.ok ? Math.max(0.1, l.availableMS / l.neededMS) : 1;
      out.push({ kind: 'travel', share: seg.days > 600 ? 0.4 : 0.32, legs: leg ? [leg] : [], seg: i, upTo });
      if (upTo < 1) {
        out.push({ kind: 'stranded', share: 0.16, legs: [] });
        return;
      }
      // Arriving at a body (not on the way home, not the belt).
      if (seg.to === 'earth' || seg.to === 'belt') return;
      const isFirst = i === 0;
      if (seg.kind === 'conic' && isFirst) {
        if (ledger.arrival === 'flyby') out.push({ kind: 'flyby', share: 0.14, legs: [], seg: i });
        else if (ledger.arrival === 'land') out.push({ kind: 'land', share: legOf('survive') ? 0.36 : 0.3, legs: legOf('survive') ? ['entry', 'survive'] : ['entry', 'touchdown'], at: seg.to });
        else if (legOf('capture') && !legOf('capture')!.ok) out.push({ kind: 'past', share: 0.18, legs: ['capture'], seg: i });
        else out.push({ kind: 'orbit', share: 0.12, legs: ['capture'], at: seg.to, days: 20 });
      } else if (ledger.arrival !== 'flyby' || i < ledger.segments.length - 1) {
        out.push({ kind: 'orbit', share: 0.1, legs: [], at: seg.to, days: 20 });
      }
    });
    const last = out[out.length - 1].kind;
    if (legOf('capsule') && last !== 'stranded' && last !== 'past') out.push({ kind: 'capsule', share: 0.14, legs: ['capsule'] });
    if (ledger.segments.length && ledger.segments[ledger.segments.length - 1].to === 'belt' && last === 'travel') out.push({ kind: 'flyby', share: 0.12, legs: [] });
    return out;
  }, [ledger, short]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = beats.reduce((a, b) => a + b.share, 0);

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
        setTimeout(() => doneRef.current(), ledger.success ? 900 : 1400);
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
  const f = Math.min(1, Math.max(0, (p * total - acc) / beat.share));

  // Day on the calendar: the start of the current beat's piece, plus progress through it.
  const segStart = (i: number) => ledger.segments[i]?.startDay ?? 0;
  const lastSegBefore = (k: number) => {
    for (let j = k; j >= 0; j--) if (beats[j].seg !== undefined) return beats[j].seg!;
    return -1;
  };
  const dayAtEndOfSeg = (i: number) => (i < 0 ? 0 : segStart(i) + ledger.segments[i].days);
  let day = 0;
  if (beat.kind === 'travel') day = segStart(beat.seg!) + ledger.segments[beat.seg!].days * f * (beat.upTo ?? 1);
  else if (beat.kind === 'wait') day = segStart(beat.seg!) + (beat.days ?? 0) * f;
  else if (beat.kind === 'past' || beat.kind === 'flyby') day = dayAtEndOfSeg(beat.seg ?? lastSegBefore(bi)) + ledger.segments[beat.seg ?? Math.max(0, lastSegBefore(bi))].days * 0.3 * f;
  else if (beat.kind === 'leave' || beat.kind === 'stuck') day = 0;
  else {
    const j = lastSegBefore(bi - 1);
    const prev = beats.slice(0, bi).filter((b) => b.kind === 'travel').pop();
    day = j < 0 ? 0 : segStart(j) + ledger.segments[j].days * (prev?.upTo ?? 1) + (beat.days ?? 0) * f;
  }

  const bodyAt = (b: BodyId, d: number): Vec => at(s, BODIES[b].aAU, (ledger.angles[b] ?? 0) + nPerDay(b) * d);

  /** Where the probe is during a piece of the trip, at fraction g of its length. */
  const along = (i: number, g: number): Vec => {
    const seg = ledger.segments[i];
    if (seg.kind === 'conic') {
      const pts = paths[i]!;
      const idx = Math.min(pts.length - 1, (g * seg.days * (pts.length - 1)) / (seg.days * 1.35));
      const k = Math.floor(idx);
      const a = pts[k];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      return toScreen(s, [a[0] + (b[0] - a[0]) * (idx - k), a[1] + (b[1] - a[1]) * (idx - k)]);
    }
    if (seg.kind === 'spiral') {
      const r = seg.fromAU! + (seg.toAU! - seg.fromAU!) * g;
      return at(s, r, seg.fromAngle! + spiralSweep(seg.fromAU!, r, seg.days * g));
    }
    return bodyAt(seg.from, day);
  };

  let craft: Vec;
  const hereBody = beat.at ?? (beat.seg !== undefined ? (ledger.segments[beat.seg].to as BodyId) : 'earth');
  switch (beat.kind) {
    case 'leave':
    case 'stuck': {
      const e = bodyAt('earth', 0);
      const a = (beat.kind === 'leave' ? f : f * 2) * Math.PI * 2;
      craft = [e[0] + 16 * Math.cos(a), e[1] - 16 * Math.sin(a)];
      break;
    }
    case 'travel':
      craft = along(beat.seg!, f * (beat.upTo ?? 1));
      break;
    case 'past':
    case 'flyby':
      craft = beat.seg !== undefined && ledger.segments[beat.seg].kind === 'conic' ? along(beat.seg, 1 + 0.3 * f) : along(Math.max(0, lastSegBefore(bi)), 1);
      break;
    case 'orbit': {
      const c = bodyAt(hereBody, day);
      const a = f * Math.PI * 4;
      const r = BODIES[hereBody].drawPx + 9;
      craft = [c[0] + r * Math.cos(a), c[1] - r * Math.sin(a)];
      break;
    }
    case 'capsule':
      craft = bodyAt('earth', day);
      break;
    case 'stranded': {
      const prev = beats.slice(0, bi).filter((b) => b.kind === 'travel').pop();
      craft = beat.at ? bodyAt(beat.at, day) : prev ? along(prev.seg!, prev.upTo ?? 1) : bodyAt('earth', day);
      if (beat.at) craft = [craft[0] + 10, craft[1] - 10];
      break;
    }
    default:
      craft = bodyAt(hereBody, day);
  }

  // A landing ticks its rows one at a time: the heat shield first, then the touchdown or the timer.
  const ticked = new Set<PlanetLegId>([...beats.slice(0, bi).flatMap((b) => b.legs), ...(beat.kind === 'land' ? beat.legs.slice(0, f < 0.2 ? 0 : f < 0.6 ? 1 : 2) : beat.legs)]);
  const failed = beat.kind === 'stuck' || beat.kind === 'past' || beat.kind === 'stranded' || (beat.kind === 'land' && !ledger.success && f > 0.25);
  const burning = (beat.kind === 'leave' && f > 0.4) || (beat.kind === 'orbit' && f < 0.2 && beat.legs.includes('capture')) || (beat.kind === 'travel' && ledger.ion && f < 0.98);
  const name = first ? BODIES[first].name : 'the belt';
  const here = BODIES[hereBody]?.name ?? name;
  const years = day / 365.25;
  const dayText = day < 1 ? '' : years >= 1.5 ? `Day ${Math.round(day).toLocaleString()} (${years.toFixed(1)} years)` : `Day ${Math.round(day)}`;

  const depart = legOf('depart')!;
  const missedWindow = short === 'depart' && Math.abs(ledger.offsetDays) > 14 && ledger.windowDepartMS <= depart.availableMS;
  const seg = beat.seg !== undefined ? ledger.segments[beat.seg] : undefined;
  const landPhase = landStage(ledger, f);
  const caption = (() => {
    switch (beat.kind) {
      case 'leave':
        return roscoe ? 'Push! Leaving Earth behind 🚀' : `Departure burn: ${depart.neededMS.toFixed(0)} m/s`;
      case 'stuck':
        return roscoe
          ? missedWindow
            ? `The planets weren't lined up! Too big a push 😟`
            : 'Not enough push to leave Earth 😟'
          : `Departure short: ${depart.availableMS.toFixed(0)} of ${depart.neededMS.toFixed(0)} m/s${missedWindow ? ` (best day needs ${ledger.windowDepartMS.toFixed(0)})` : ''}`;
      case 'travel':
        if (seg?.kind === 'spiral') return roscoe ? 'Ion engine: a gentle push, for years ⚡' : `Ion spiral to ${seg.to === 'earth' ? 'Earth' : seg.to === 'belt' ? 'the belt' : BODIES[seg.to].name}`;
        if (seg?.to === 'earth') return roscoe ? 'Heading home with the sample 🧪' : 'Return transfer to Earth';
        if (seg?.to === 'belt') return roscoe ? 'Out through the asteroid belt…' : 'Coasting out through the belt';
        return roscoe ? `Falling around the Sun toward ${seg?.to ? BODIES[seg.to as BodyId].name : name}…` : `Transfer orbit: ${Math.round(seg?.days ?? 0)} days`;
      case 'wait':
        return roscoe ? 'Waiting for Earth to come round… ⏳' : `Waiting ${Math.round(beat.days ?? 0)} days for the return window`;
      case 'orbit':
        return roscoe ? (f < 0.2 && beat.legs.includes('capture') ? 'Brake! 🛑' : `In orbit at ${here}! 🎉`) : `Captured at ${here}`;
      case 'past': {
        const c = legOf('capture')!;
        return roscoe ? (c.availableMS === 0 ? `Zoomed right past ${name}! Nothing to brake with 😟` : `Couldn't brake enough. Zoomed past ${name} 😟`) : `Capture short: ${c.availableMS.toFixed(0)} of ${c.neededMS.toFixed(0)} m/s`;
      }
      case 'flyby':
        return ledger.destination === 'belt' ? (roscoe ? 'Through the belt! Rocks hit: 0 🎉' : 'Belt crossed: nearest asteroid about a million km away') : roscoe ? `Flying past ${name}! Say cheese 📸` : `Flyby of ${name}`;
      case 'stranded':
        return roscoe ? (ledger.ion ? 'Out of xenon! 😟' : 'Out of fuel! 😟') : `${legs.find((l) => !l.ok)?.name}: short`;
      case 'capsule':
        return roscoe ? 'The sample capsule parachutes home! 🪂🧪' : 'Sample capsule re-entry and recovery';
      case 'land':
        return landPhase.caption(roscoe, here);
    }
  })();

  return (
    <div className={`moon-leg ${roscoe ? 'roscoe' : ''}`}>
      <svg viewBox="0 0 1000 620" className="moon-svg" role="img" aria-label={`Trip to ${info.name}`}>
        {Array.from({ length: 70 }, (_, k) => (
          <circle key={k} cx={(k * 137.5) % 1000} cy={(k * 251.3) % 620} r={k % 3 === 0 ? 1.6 : 1} fill="#fff" opacity={0.5} />
        ))}
        <SolarBackdrop s={s} angles={ledger.angles} day={day} highlight={[...info.stops]} extra={info.stops.includes('rock') ? ['rock'] : []} />
        {ledger.segments.map((g, i) =>
          g.kind === 'conic' && paths[i] ? (
            <path key={i} d={pathD(paths[i]!.slice(0, Math.round(paths[i]!.length / 1.35)).map((q) => toScreen(s, q)))} fill="none" stroke="rgba(255,214,120,0.45)" strokeWidth={1.5} strokeDasharray="5 5" />
          ) : null,
        )}
        <g transform={`translate(${craft[0].toFixed(1)} ${craft[1].toFixed(1)})`}>
          <circle r={5} fill={failed ? '#ff6b6b' : '#fff'} />
          {burning && <circle r={11} fill="none" stroke={ledger.ion && beat.kind === 'travel' ? '#7fb8ff' : '#ffb02e'} strokeWidth={2.5} />}
        </g>
        <text x={470} y={34} textAnchor="middle" className={`moon-caption ${failed ? 'bad' : ''}`}>
          {caption}
        </text>
        {dayText && (
          <text x={30} y={600} className="moon-label">
            📅 {dayText}
          </text>
        )}
        {beat.kind === 'land' && <LandingInset ledger={ledger} f={f} />}
        {beat.kind === 'capsule' && <CapsuleInset f={f} />}
        {!roscoe && (
          <text x={980} y={600} textAnchor="end" className="moon-note">
            Flat circular orbits · distances squeezed to fit
          </text>
        )}
      </svg>
      <ol className="ledger" aria-label="Delta-v ledger">
        {legs.map((l) => {
          const shown = ticked.has(l.id);
          return (
            <li key={l.id} className={`${shown ? 'shown' : ''} ${shown ? (l.ok ? 'ok' : 'bad') : ''}`}>
              <span className="ledger-name">
                {shown ? (l.ok ? '✅' : '❌') : '⬜'} {roscoe ? l.roscoe : l.name}
              </span>
              {l.unit !== 'check' && (
                <span className="ledger-bar" aria-hidden="true">
                  <span style={{ width: `${shown ? Math.min(1, l.availableMS / l.neededMS) * 100 : 0}%` }} />
                </span>
              )}
              {!roscoe && (
                <span className="ledger-num mono">
                  {l.unit === 'check' ? (l.ok ? l.by : `${l.by}`) : `${l.availableMS.toFixed(0)} / ${l.neededMS.toFixed(0)} ${l.unit}`}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Which part of the landing is showing, and what went wrong if anything. */
function landStage(ledger: PlanetLedger, f: number) {
  const entry = ledger.legs.find((l) => l.id === 'entry');
  const touch = ledger.legs.find((l) => l.id === 'touchdown');
  const survive = ledger.legs.find((l) => l.id === 'survive');
  const burnUp = entry && !entry.ok;
  const venus = !!survive;
  const phase: 'entry' | 'chute' | 'rockets' | 'down' | 'timer' = f < 0.25 ? 'entry' : f < 0.45 ? 'chute' : venus ? (f < 0.6 ? 'down' : 'timer') : f < 0.75 ? 'rockets' : 'down';
  return {
    phase,
    burnUp,
    crash: !!touch && !touch.ok,
    caption: (roscoe: boolean, here: string) => {
      if (burnUp && f >= 0.2) return roscoe ? `No heat shield! It burned up in ${here}'s air 🔥` : 'Entry: no heat shield';
      if (phase === 'entry') return roscoe ? 'Diving into the air: the heat shield glows! 🔥' : 'Atmospheric entry';
      if (phase === 'chute') return roscoe ? 'Parachute out! 🪂' : 'Parachute deploy';
      if (phase === 'rockets') return touch?.ok ? (roscoe ? 'Rockets on for the last bit! 🚀' : 'Powered descent') : roscoe ? 'The air is too thin! Still falling fast 😟' : 'No landing rockets';
      if (venus && phase === 'down') return roscoe ? `Landed on ${here}! 🎉` : 'Touchdown';
      if (venus) {
        const min = Math.round(Math.min(survive!.availableMS, ((f - 0.6) / 0.4) * Math.max(survive!.availableMS, survive!.neededMS)));
        const over = survive!.availableMS < survive!.neededMS && min >= survive!.availableMS;
        return over ? (roscoe ? `Cooked and crushed after ${min} minutes 🥵` : `Lander failed after ${min} min`) : roscoe ? `Sending pictures… ${min} minutes 📸` : `Surface operations: ${min} min`;
      }
      return touch?.ok ? (roscoe ? `Touchdown on ${here}! 🎉` : 'Touchdown') : roscoe ? 'Crash! 💥' : 'Impact';
    },
  };
}

function LandingInset({ ledger, f }: { ledger: PlanetLedger; f: number }) {
  const st = landStage(ledger, f);
  const venus = ledger.destination === 'venus';
  const rover = ledger.legs.find((l) => l.id === 'touchdown')?.by.toLowerCase().includes('rover') ?? false;
  const X = 690;
  const Y = 360;
  const W = 290;
  const H = 210;
  // Height of the lander in the box: falls during entry and chute, slows with rockets.
  const ground = Y + H - 26;
  const y = st.burnUp
    ? Y + 30 + Math.min(1, f / 0.25) * 60
    : f < 0.45
      ? Y + 20 + (f / 0.45) * 90
      : st.phase === 'rockets'
        ? Y + 110 + ((f - 0.45) / 0.3) * (ground - Y - 130)
        : ground - 20;
  const fail = st.burnUp ? f >= 0.2 : st.crash && f >= 0.6;
  return (
    <g>
      <rect x={X} y={Y} width={W} height={H} rx={12} fill={venus ? '#6b4a1e' : '#b3643a'} opacity={0.92} />
      <rect x={X} y={ground} width={W} height={H - (ground - Y)} rx={0} fill={venus ? '#3b2a12' : '#7a3a1c'} />
      {!fail && (
        <g transform={`translate(${X + W / 2} ${y})`}>
          {st.phase === 'entry' && <ellipse cx={0} cy={12} rx={22} ry={8} fill="#ffb02e" opacity={0.8} />}
          {(st.phase === 'chute' || (venus && st.phase !== 'entry' && f < 0.6)) && (
            <g>
              <path d="M-28 -46 Q0 -78 28 -46 Z" fill="#f4f6fa" />
              <path d="M-28 -46 L-8 -6 M28 -46 L8 -6 M0 -60 L0 -6" stroke="#f4f6fa" strokeWidth={1} />
            </g>
          )}
          {st.phase === 'rockets' && !st.crash && (
            <g>
              <path d="M-12 10 L-16 28 L-8 10 Z M12 10 L16 28 L8 10 Z" fill="#ffb02e" />
            </g>
          )}
          <path d="M-18 8 L0 -10 L18 8 Z" fill={st.phase === 'entry' ? '#ffd6a0' : '#dfe5ee'} />
          {rover && st.phase === 'down' && (
            <g>
              <path d="M-6 8 L-8 22 M6 8 L8 22" stroke="#dfe5ee" strokeWidth={1} />
              <rect x={-12} y={10} width={24} height={8} rx={2} fill="#f4f6fa" />
            </g>
          )}
        </g>
      )}
      {fail && (
        <g transform={`translate(${X + W / 2} ${st.burnUp ? y : ground - 6})`}>
          <circle r={18} fill="#ff6b6b" opacity={0.55} />
          <circle r={9} fill="#ffb02e" opacity={0.8} />
        </g>
      )}
      {venus && st.phase === 'timer' && <VenusTimer ledger={ledger} f={f} x={X + 24} y={Y + 24} />}
    </g>
  );
}

function VenusTimer({ ledger, f, x, y }: { ledger: PlanetLedger; f: number; x: number; y: number }) {
  const sv = ledger.legs.find((l) => l.id === 'survive')!;
  const scaleMax = Math.max(sv.availableMS, sv.neededMS);
  const min = Math.min(sv.availableMS, ((f - 0.6) / 0.4) * scaleMax);
  return (
    <g>
      <rect x={x} y={y} width={120} height={12} rx={6} fill="rgba(255,255,255,0.25)" />
      <rect x={x} y={y} width={(120 * min) / scaleMax} height={12} rx={6} fill={min >= sv.neededMS ? '#7ee08a' : '#ffb02e'} />
      <line x1={x + (120 * sv.neededMS) / scaleMax} x2={x + (120 * sv.neededMS) / scaleMax} y1={y - 4} y2={y + 16} stroke="#fff" strokeWidth={2} />
      <text x={x} y={y + 32} className="moon-label">
        🌡️ 465 °C · ⏱️ {Math.round(min)} min
      </text>
    </g>
  );
}

function CapsuleInset({ f }: { f: number }) {
  const X = 690;
  const Y = 360;
  return (
    <g>
      <rect x={X} y={Y} width={290} height={210} rx={12} fill="#6fa8dc" opacity={0.92} />
      <rect x={X} y={Y + 184} width={290} height={26} fill="#c9b27a" />
      <g transform={`translate(${X + 145} ${Y + 30 + f * 140})`}>
        {f > 0.3 && <path d="M-22 -36 Q0 -62 22 -36 Z" fill="#e2622b" />}
        {f > 0.3 && <path d="M-22 -36 L-6 -4 M22 -36 L6 -4" stroke="#fff" strokeWidth={1} />}
        <path d="M-10 6 L0 -6 L10 6 Z" fill={f < 0.3 ? '#ffb02e' : '#dfe5ee'} />
      </g>
    </g>
  );
}
