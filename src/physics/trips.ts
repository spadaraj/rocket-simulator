// "Where to?" as one list: Earth orbit, the Moon, and the planet trips, plus what to do on
// arrival and when to launch. Shared by both builders and the mission checks.

import { DESTINATIONS } from './planets';
import { synodicDays, wrapOffsetDays } from './solar';
import type { Arrival, Destination, MissionSpec, RocketSpec } from './types';

export interface TripOption {
  key: string;
  label: string;
  roscoe: string;
  /** Needs the planet trips unlocked. */
  planet: boolean;
}

export const TRIPS: TripOption[] = [
  { key: 'orbit', label: 'Earth orbit', roscoe: '🌍 Space', planet: false },
  { key: 'highOrbit', label: 'High orbit', roscoe: '🛰️ High orbit', planet: false },
  { key: 'moonFlyby', label: 'Moon flyby (free return)', roscoe: '🌕 Around the Moon', planet: false },
  { key: 'moon', label: 'Moon landing', roscoe: '🌕 Land on the Moon', planet: false },
  { key: 'planet:venus', label: 'Venus', roscoe: '🟡 Venus', planet: true },
  { key: 'planet:mars', label: 'Mars', roscoe: '🔴 Mars', planet: true },
  { key: 'planet:mercury', label: 'Mercury', roscoe: '☿️ Mercury', planet: true },
  { key: 'planet:belt', label: 'Through the asteroid belt', roscoe: '🪨 Through the belt', planet: true },
  { key: 'planet:vesta', label: 'Vesta', roscoe: '🪨 Vesta', planet: true },
  { key: 'planet:ceres', label: 'Ceres', roscoe: '⚪ Ceres', planet: true },
  { key: 'planet:vestaCeres', label: 'Vesta, then Ceres', roscoe: '🪨 Vesta, then Ceres', planet: true },
  { key: 'planet:rock', label: 'Space rock Q-7', roscoe: '🪨 Space rock Q-7', planet: true },
];

export const ARRIVALS: Record<Arrival, { label: string; roscoe: string }> = {
  flyby: { label: 'Fly past', roscoe: '👋 Fly past' },
  orbit: { label: 'Orbit', roscoe: '🔄 Stay in orbit' },
  land: { label: 'Land', roscoe: '🛬 Land' },
  sample: { label: 'Sample and return', roscoe: '🧪 Grab a sample, come home' },
};

export const tripKey = (m: MissionSpec) => (m.target === 'planet' ? `planet:${m.destination ?? 'mars'}` : m.target);

/** Choose a trip; keep the arrival if the new destination allows it. */
export function applyTrip(spec: RocketSpec, key: string): RocketSpec {
  if (!key.startsWith('planet:')) {
    const mission = { ...spec.mission, target: key as MissionSpec['target'] };
    delete mission.destination;
    delete mission.arrival;
    delete mission.launchOffsetDays;
    return { ...spec, mission };
  }
  const destination = key.slice(7) as Destination;
  const allowed = DESTINATIONS[destination].arrivals;
  const arrival = allowed.includes(spec.mission.arrival ?? 'flyby') ? spec.mission.arrival ?? allowed[0] : allowed[0];
  return { ...spec, mission: { ...spec.mission, target: 'planet', destination, arrival } };
}

export const arrivalsFor = (m: MissionSpec): Arrival[] => (m.target === 'planet' ? DESTINATIONS[m.destination ?? 'mars'].arrivals : []);

/** The launch-day choices for a destination, in days from the best day: a month apart, one cycle wide. */
export function launchDays(m: MissionSpec): number[] {
  if (m.target !== 'planet') return [0];
  const first = DESTINATIONS[m.destination ?? 'mars'].stops[0];
  if (!first) return [0];
  const half = Math.min(180, Math.floor(synodicDays(first) / 2 / 15) * 15);
  const step = half >= 90 ? 30 : 15;
  const out: number[] = [];
  for (let d = -half; d <= half; d += step) out.push(d);
  return out;
}

export function launchDayLabel(days: number): string {
  if (Math.abs(days) < 8) return '🎯 Best day';
  const months = Math.round(Math.abs(days) / 30);
  const amount = months >= 1 ? `${months} month${months > 1 ? 's' : ''}` : `${Math.round(Math.abs(days) / 7)} weeks`;
  return `${amount} ${days < 0 ? 'early' : 'late'}`;
}

export const wrappedOffset = (m: MissionSpec) => {
  const first = m.target === 'planet' ? DESTINATIONS[m.destination ?? 'mars'].stops[0] : undefined;
  return first ? wrapOffsetDays(first, m.launchOffsetDays ?? 0) : 0;
};
