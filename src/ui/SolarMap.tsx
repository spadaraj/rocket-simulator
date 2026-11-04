// Drawing the flat solar system: the Sun, planet orbits, the belt, and paths around the Sun.
// Distances are squeezed (a power law) so the inner planets and the belt fit on one screen.

import { useMemo } from 'react';
import { DESTINATIONS } from '../physics/planets';
import { AU_M, BELT_AU, BODIES, bestTransfer, departureDvMS, nPerDay, propagate, type BodyId, type Vec } from '../physics/solar';
import type { MissionSpec } from '../physics/types';

export interface MapScale {
  cx: number;
  cy: number;
  /** Screen radius for a distance from the Sun. */
  px: (rAU: number) => number;
  maxAU: number;
}

export function makeScale(cx: number, cy: number, radiusPx: number, maxAU: number): MapScale {
  return { cx, cy, maxAU, px: (rAU) => radiusPx * Math.pow(rAU / maxAU, 0.6) };
}

export function at(s: MapScale, rAU: number, angle: number): Vec {
  const r = s.px(rAU);
  return [s.cx + r * Math.cos(angle), s.cy - r * Math.sin(angle)];
}

/** A position around the Sun, in metres, to the screen. */
export function toScreen(s: MapScale, p: Vec): Vec {
  return at(s, Math.hypot(p[0], p[1]) / AU_M, Math.atan2(p[1], p[0]));
}

export const pathD = (pts: Vec[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');

const ALL: BodyId[] = ['mercury', 'venus', 'earth', 'mars', 'vesta', 'ceres', 'jupiter', 'saturn', 'uranus', 'neptune'];

/** The Sun, orbits, the belt, and the planets at a given day. */
export function SolarBackdrop({
  s,
  angles,
  day,
  highlight = [],
  labels = true,
  extra = [],
}: {
  s: MapScale;
  angles: Partial<Record<BodyId, number>>;
  day: number;
  highlight?: BodyId[];
  labels?: boolean;
  /** Bodies drawn even though they are not planets (the space rock). */
  extra?: BodyId[];
}) {
  const bodies = [...ALL, ...extra].filter((b) => BODIES[b].aAU <= s.maxAU * 1.02);
  const belt = BELT_AU.inner <= s.maxAU;
  return (
    <g>
      {belt && (
        <g opacity={0.55}>
          <circle cx={s.cx} cy={s.cy} r={(s.px(BELT_AU.inner) + s.px(Math.min(BELT_AU.outer, s.maxAU))) / 2} fill="none" stroke="#9c8f7e" strokeWidth={Math.max(2, s.px(Math.min(BELT_AU.outer, s.maxAU)) - s.px(BELT_AU.inner))} strokeDasharray="1 5" />
        </g>
      )}
      {bodies.map((b) => (
        <circle key={`o-${b}`} cx={s.cx} cy={s.cy} r={s.px(BODIES[b].aAU)} fill="none" stroke={highlight.includes(b) ? 'rgba(255,214,120,0.55)' : 'rgba(255,255,255,0.18)'} strokeDasharray={highlight.includes(b) ? undefined : '3 6'} />
      ))}
      <circle cx={s.cx} cy={s.cy} r={16} fill="#ffcf4a" />
      <circle cx={s.cx} cy={s.cy} r={24} fill="#ffcf4a" opacity={0.18} />
      {bodies.map((b) => {
        const body = BODIES[b];
        const [x, y] = at(s, body.aAU, (angles[b] ?? 0) + nPerDay(b) * day);
        return (
          <g key={b}>
            <circle cx={x} cy={y} r={body.drawPx} fill={body.color} />
            {labels && (highlight.includes(b) || b === 'earth') && (
              <text x={x} y={y - body.drawPx - 6} textAnchor="middle" className="moon-label">
                {body.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** A little map for the builder: where the planets are on launch day, and the path to take. */
export function WindowMap({ mission, size = 170 }: { mission: MissionSpec; size?: number }) {
  const info = DESTINATIONS[mission.destination ?? 'mars'];
  const first = info.stops[0];
  const data = useMemo(() => {
    if (!first) return null;
    const stopping = mission.arrival === 'orbit' || mission.arrival === 'sample' || info.stops.length > 1;
    const t = bestTransfer(first, mission.launchOffsetDays ?? 0, mission.targetOrbitAltitudeM, stopping);
    const best = bestTransfer(first, 0, mission.targetOrbitAltitudeM, stopping);
    const ratio = departureDvMS(t.vInfDepMS, mission.targetOrbitAltitudeM) / departureDvMS(best.vInfDepMS, mission.targetOrbitAltitudeM);
    return { t, ratio, pts: propagate(t.r1, t.v1, t.tofDays, 60) };
  }, [first, mission.arrival, mission.launchOffsetDays, mission.targetOrbitAltitudeM, info.stops.length]);
  const maxAU = Math.max(1, first ? BODIES[first].aAU : 3.3) * 1.12;
  const s = makeScale(size / 2, size / 2, size / 2 - 8, maxAU);
  if (!first || !data)
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="window-map" role="img" aria-label="The asteroid belt">
        <SolarBackdrop s={s} angles={{ earth: 0 }} day={0} labels={false} />
      </svg>
    );
  const { t, ratio, pts } = data;
  const arrive = at(s, BODIES[first].aAU, t.targetAngle + nPerDay(first) * t.tofDays);
  const level = ratio < 1.05 ? 'good' : ratio < 1.3 ? 'meh' : 'bad';
  return (
    <div className="window-map-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="window-map" role="img" aria-label={`Earth and ${BODIES[first].name} on launch day`}>
        <rect width={size} height={size} rx={10} fill="#0b1230" />
        <SolarBackdrop s={s} angles={{ earth: t.earthAngle, [first]: t.targetAngle }} day={0} highlight={[first]} labels={false} extra={first === 'rock' ? ['rock'] : []} />
        <path d={pathD(pts.map((q) => toScreen(s, q)))} fill="none" stroke={level === 'good' ? '#7ee08a' : level === 'meh' ? '#ffd166' : '#ff6b6b'} strokeWidth={2} strokeDasharray="4 3" />
        <circle cx={arrive[0]} cy={arrive[1]} r={BODIES[first].drawPx} fill="none" stroke={BODIES[first].color} strokeDasharray="2 2" />
      </svg>
      <div className={`window-push ${level}`}>
        {level === 'good' ? '🟢 Lined up: small push' : level === 'meh' ? '🟡 Not lined up: bigger push' : '🔴 Way off: huge push'}
      </div>
    </div>
  );
}
