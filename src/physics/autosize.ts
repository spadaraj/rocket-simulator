// "Make it reach the Moon": load each stage with just enough propellant to reach orbit
// with the trans-lunar delta-v still in the tanks. Every candidate is actually flown,
// so gravity and drag losses are counted, not just the rocket equation.

import { TLI_BUDGET_MS } from './deltaV';
import { setFill, stageFill } from './edit';
import { simulate } from './simulate';
import type { Catalog, FailureType, RocketSpec } from './types';

export interface AutoSizeResult {
  ok: boolean;
  spec: RocketSpec;
  message: string;
  flightsTried: number;
}

const SEARCH_DT_S = 0.1;

const FAILURE_WORDS: Record<FailureType, string> = {
  noLiftoff: "it's too heavy to lift off",
  outOfFuel: 'it runs out of fuel before orbit',
  breakup: 'it breaks apart at max-Q',
  crash: 'it falls back to Earth',
};
const MARGIN = 0.02;

export function autoSize(spec: RocketSpec, catalog: Catalog): AutoSizeResult {
  let flights = 0;
  const n = spec.stages.length;
  const withFills = (fills: number[]) => fills.reduce((s, f, i) => setFill(s, catalog, i, f), spec);
  const reaches = (s: RocketSpec, dtS = SEARCH_DT_S) => {
    flights++;
    const r = simulate(s, catalog, { dtS });
    return { ok: r.outcome.success && r.outcome.remainingDeltaVMS >= TLI_BUDGET_MS * (1 + MARGIN), r };
  };

  const full = reaches(withFills(Array(n).fill(1)), 0.05);
  if (!full.ok) {
    const o = full.r.outcome;
    const why = o.success
      ? `full tanks reach orbit with ${o.remainingDeltaVMS.toFixed(0)} m/s left, but the Moon needs about ${TLI_BUDGET_MS} m/s`
      : `even with full tanks ${FAILURE_WORDS[o.failure!.type]}`;
    return {
      ok: false,
      spec,
      message: `Can't reach the Moon yet: ${why}. Try bigger tanks, more engines or another stage.`,
      flightsTried: flights,
    };
  }

  // One fill level for every stage, then trim each stage on its own.
  let lo = 0.05;
  let hi = 1;
  for (let k = 0; k < 8; k++) {
    const mid = (lo + hi) / 2;
    if (reaches(withFills(Array(n).fill(mid))).ok) hi = mid;
    else lo = mid;
  }
  const fills = Array(n).fill(hi);
  for (let i = 0; i < n; i++) {
    let a = 0.05;
    let b = fills[i];
    for (let k = 0; k < 6; k++) {
      const mid = (a + b) / 2;
      const trial = [...fills];
      trial[i] = mid;
      if (reaches(withFills(trial)).ok) b = mid;
      else a = mid;
    }
    fills[i] = b;
  }

  // Add a small margin and confirm at full simulation accuracy.
  for (let bump = MARGIN; bump <= 0.2; bump += 0.04) {
    const candidate = withFills(fills.map((f) => Math.min(1, f + bump)));
    if (reaches(candidate, 0.05).ok) {
      const pct = candidate.stages.map((_, i) => `${Math.round(stageFill(candidate, catalog, i) * 100)}%`).join(' / ');
      return { ok: true, spec: candidate, message: `Sized for the Moon: tanks ${pct} full.`, flightsTried: flights };
    }
  }
  return { ok: true, spec: withFills(Array(n).fill(1)), message: 'Full tanks are just enough for the Moon.', flightsTried: flights };
}
