// Real flights to check the sim against: moments from actual launches, side by side with
// what the sim does with the same rocket. A scorecard, not a fit: nothing here is tuned
// to make the numbers match.

import type { FlightEvent, FlightRecord, Sample } from './types';

export type Grade = 'close' | 'near' | 'off' | 'missing';

/** Within 5% is close, within 15% near. */
const CLOSE = 0.05;
const NEAR = 0.15;

type Pick = 'maxQTime' | 'maxQ' | 'firstSepTime' | 'firstSepAlt' | 'firstSepSpeed' | 'firstSepAirSpeed' | 'orbitTime' | 'orbitSpeed';

interface Checkpoint {
  pick: Pick;
  real: number;
}

export interface GoldenFlight {
  presetId: string;
  flight: string;
  source: string;
  sourceUrl?: string;
  checkpoints: Checkpoint[];
}

const PICKS: Record<Pick, { label: string; roscoe: string; unit: string; scale: number; digits: number }> = {
  maxQTime: { label: 'Max-Q time', roscoe: 'When the air pushes hardest', unit: 's', scale: 1, digits: 0 },
  maxQ: { label: 'Max-Q', roscoe: 'Hardest air push', unit: 'kPa', scale: 1e-3, digits: 1 },
  firstSepTime: { label: 'First drop-off time', roscoe: 'When the first part drops off', unit: 's', scale: 1, digits: 0 },
  firstSepAlt: { label: 'First drop-off altitude', roscoe: 'How high, then', unit: 'km', scale: 1e-3, digits: 1 },
  firstSepSpeed: { label: 'First drop-off speed (inertial)', roscoe: 'How fast, then', unit: 'm/s', scale: 1, digits: 0 },
  firstSepAirSpeed: { label: 'First drop-off speed (vs ground)', roscoe: 'How fast, then', unit: 'm/s', scale: 1, digits: 0 },
  orbitTime: { label: 'Engine cutoff in orbit', roscoe: 'When it got to space', unit: 's', scale: 1, digits: 0 },
  orbitSpeed: { label: 'Orbit speed (inertial)', roscoe: 'Speed in space', unit: 'm/s', scale: 1, digits: 0 },
};

export const GOLDEN_FLIGHTS: GoldenFlight[] = [
  {
    presetId: 'saturn-v',
    flight: 'Apollo 11 (AS-506), July 1969',
    source: 'NASA Saturn V Flight Evaluation Report AS-506 and Apollo 11 sequence of events',
    sourceUrl: 'https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/A11_MissionReport.pdf',
    checkpoints: [
      { pick: 'maxQTime', real: 83 },
      { pick: 'maxQ', real: 35100 },
      { pick: 'firstSepTime', real: 161.6 },
      { pick: 'firstSepAlt', real: 67000 },
      { pick: 'firstSepSpeed', real: 2763 },
      { pick: 'orbitTime', real: 709 },
      { pick: 'orbitSpeed', real: 7793 },
    ],
  },
  {
    presetId: 'shuttle',
    flight: 'STS-30 (Atlantis), May 1989',
    source: 'NASA STS-30 ascent trajectory; STS-119 flight data file for max-Q pressure',
    sourceUrl: 'https://spaceflightnow.com/shuttle/sts119/fdf/119ascent.html',
    checkpoints: [
      { pick: 'maxQTime', real: 59 },
      { pick: 'maxQ', real: 34600 },
      { pick: 'firstSepTime', real: 125 },
      { pick: 'firstSepAlt', real: 46800 },
      { pick: 'firstSepAirSpeed', real: 1284 },
      { pick: 'orbitTime', real: 511 },
    ],
  },
  {
    presetId: 'falcon-9',
    flight: 'ISS cargo flights (CRS-7, CRS-19)',
    source: 'SpaceX launch timelines via Spaceflight Now; webcast telemetry. Approximate.',
    sourceUrl: 'https://spaceflightnow.com/?p=7150',
    checkpoints: [
      { pick: 'maxQTime', real: 78 },
      { pick: 'firstSepTime', real: 152 },
      { pick: 'firstSepAlt', real: 80000 },
      { pick: 'orbitTime', real: 530 },
    ],
  },
];

function sampleAt(samples: Sample[], tS: number): Sample {
  let best = samples[0];
  for (const s of samples) if (Math.abs(s.tS - tS) < Math.abs(best.tS - tS)) best = s;
  return best;
}

/** First thing to come off: boosters, or the first stage burning out. */
function firstSeparation(events: FlightEvent[]): FlightEvent | undefined {
  return events.find((e) => e.type === 'boosterSeparation' || e.type === 'stageBurnout');
}

function measure(pick: Pick, rec: FlightRecord): number | undefined {
  const sep = firstSeparation(rec.events);
  const orbit = rec.events.find((e) => e.type === 'orbit');
  const at = (e?: FlightEvent) => (e ? sampleAt(rec.samples, e.tS) : undefined);
  switch (pick) {
    case 'maxQTime':
      return rec.summary.maxQTimeS;
    case 'maxQ':
      return rec.summary.maxQPa;
    case 'firstSepTime':
      return sep?.tS;
    case 'firstSepAlt':
      return at(sep)?.altitudeM;
    case 'firstSepSpeed':
      return at(sep)?.speedMS;
    case 'firstSepAirSpeed':
      return at(sep)?.airSpeedMS;
    case 'orbitTime':
      return orbit?.tS;
    case 'orbitSpeed':
      return at(orbit)?.speedMS;
  }
}

export interface ScoreLine {
  label: string;
  roscoe: string;
  unit: string;
  real: number;
  sim?: number;
  /** (sim − real) / real */
  error?: number;
  grade: Grade;
  digits: number;
}

export interface Scorecard {
  flight: string;
  source: string;
  sourceUrl?: string;
  lines: ScoreLine[];
  /** Share of lines within 15%, 0–100. */
  score: number;
}

export const goldenFor = (presetId: string) => GOLDEN_FLIGHTS.find((g) => g.presetId === presetId);

export function scorecard(golden: GoldenFlight, rec: FlightRecord): Scorecard {
  const lines = golden.checkpoints.map((c): ScoreLine => {
    const p = PICKS[c.pick];
    const raw = measure(c.pick, rec);
    const base = { label: p.label, roscoe: p.roscoe, unit: p.unit, real: c.real * p.scale, digits: p.digits };
    if (raw === undefined) return { ...base, grade: 'missing' };
    const error = (raw - c.real) / c.real;
    const grade: Grade = Math.abs(error) <= CLOSE ? 'close' : Math.abs(error) <= NEAR ? 'near' : 'off';
    return { ...base, sim: raw * p.scale, error, grade };
  });
  const good = lines.filter((l) => l.grade === 'close' || l.grade === 'near').length;
  return { flight: golden.flight, source: golden.source, sourceUrl: golden.sourceUrl, lines, score: Math.round((100 * good) / lines.length) };
}
