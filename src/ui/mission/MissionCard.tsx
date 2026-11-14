// The mission, pinned to the top of the Build tab: the goal, the star goals, how the last
// try went, and Did's checklist of things the goal needs, ticked live as Roscoe builds.

import { useMemo } from 'react';
import { MISSIONS } from '../../missions/missions';
import type { BuildCheck, Mission } from '../../missions/types';
import { ARRIVALS, TRIPS, tripKey } from '../../physics/trips';
import type { MissionSpec, RocketSpec } from '../../physics/types';
import { canSpeak, speak } from '../speech';
import { Stars } from './MissionScreens';

/** How the last flight went, in one line. */
export interface LastTry {
  text: string;
  good: boolean;
}

/** Where the goal says to go, taken from the mission's own known answer. */
function tripCheck(mission: Mission): BuildCheck | null {
  const want = mission.solve(mission.rocket()).mission;
  if (want.target === 'orbit') return null;
  const trip = TRIPS.find((t) => t.key === tripKey(want));
  if (!trip) return null;
  const arrival = want.target === 'planet' && want.arrival ? ` · ${ARRIVALS[want.arrival].roscoe}` : '';
  const same = (m: MissionSpec) =>
    want.target === 'moonFlyby'
      ? m.target === 'moonFlyby' || m.target === 'moon'
      : tripKey(m) === tripKey(want) && (want.target !== 'planet' || !want.arrival || m.arrival === want.arrival);
  return { text: `🎯 Where to? ${trip.roscoe}${arrival}`, ok: (s) => same(s.mission) };
}

export function missionChecks(mission: Mission): BuildCheck[] {
  const trip = tripCheck(mission);
  return [...(trip ? [trip] : []), ...(mission.checks ?? [])];
}

interface Props {
  mission: Mission;
  spec: RocketSpec;
  liftoffTWR: number;
  best: number;
  lastTry: LastTry | null;
}

export function MissionCard({ mission, spec, liftoffTWR, best, lastTry }: Props) {
  const checks = useMemo(() => missionChecks(mission), [mission]);
  const items = [{ text: '💪 Strong enough to lift off', ok: liftoffTWR > 1 }, ...checks.map((c) => ({ text: c.text, ok: c.ok(spec) }))];
  const readAloud = [
    `The mission: ${mission.goalText}.`,
    lastTry ? `Last try: ${lastTry.text}` : '',
    ...items.map((i) => `${i.text.replace(/^\S+\s/, '')}: ${i.ok ? 'yes' : 'not yet'}.`),
  ].join(' ');
  return (
    <section className="mission-card" aria-label="Mission">
      <div className="mc-head">
        <span className="sq-patch">{mission.patch}</span>
        <div className="mc-title">
          <small>
            Mission {MISSIONS.indexOf(mission) + 1}: {mission.title}
          </small>
          <b>🎯 {mission.goalText}</b>
        </div>
        {canSpeak && (
          <button className="btn small" onClick={() => speak(readAloud)} aria-label="Read the mission aloud">
            🔊
          </button>
        )}
      </div>
      <ul className="mc-stars">
        {mission.stars.map((s, k) => (
          <li key={s.text}>
            <Stars n={best >= k + 2 ? 1 : 0} of={1} /> {s.text}
          </li>
        ))}
      </ul>
      {lastTry && (
        <p className={`mc-last ${lastTry.good ? 'good' : 'bad'}`}>
          <b>Last try:</b> {lastTry.text}
        </p>
      )}
      <div className="mc-checks">
        <div className="mc-checks-head">✅ Did’s checklist</div>
        <ul>
          {items.map((i) => (
            <li key={i.text} className={i.ok ? 'ok' : 'todo'}>
              <span aria-hidden="true">{i.ok ? '✓' : '✗'}</span> {i.text}
            </li>
          ))}
        </ul>
        <p className="mc-note">The launch is the real test!</p>
      </div>
    </section>
  );
}
