// The whole mission: ascent, the pieces coming back down, the Moon leg and re-entry.

import { LAUNCH_SITES, OMEGA_EARTH_RADS } from './constants';
import { moonLedger, type MoonLedger } from './moon';
import { simulateRecovery, type RecoveryTrack } from './recovery';
import { simulateReentry, type ReentryRecord } from './reentry';
import { simulate, type SimOptions } from './simulate';
import type { Catalog, FlightRecord, MissionFailureType, RocketSpec } from './types';
import { buildVehicle } from './vehicle';

export type StepId = 'ascent' | 'systems' | 'recovery' | 'moon' | 'reentry';

export interface MissionStep {
  id: StepId;
  label: string;
  status: 'ok' | 'fail' | 'warn' | 'skipped';
  note: string;
}

export interface MissionResult {
  success: boolean;
  failure?: { type: MissionFailureType; detail: Record<string, number | string> };
  steps: MissionStep[];
}

export interface MissionRecord {
  ascent: FlightRecord;
  recoveries: RecoveryTrack[];
  moon?: MoonLedger;
  reentry?: ReentryRecord;
  result: MissionResult;
  /** Ascent plus everything still falling back: how long the flight scene plays. */
  flightDurationS: number;
}

/** Earlier steps win: a rocket that never reached orbit did not burn up coming home. */
const ORDER: MissionFailureType[] = [
  'noLiftoff', 'breakup', 'tumble', 'engineFailure', 'outOfFuel', 'crash',
  'moonShort', 'skipOut', 'burnUp', 'crewG', 'crashLanding',
];
export const failureRank = (t: MissionFailureType) => ORDER.indexOf(t);

export function flyMission(spec: RocketSpec, catalog: Catalog, opts: SimOptions = {}): MissionRecord {
  const ascent = simulate(spec, catalog, opts);
  const vehicle = buildVehicle(spec, catalog);
  const site = LAUNCH_SITES[spec.launchSite] ?? LAUNCH_SITES.KSC;
  const omega = (opts.earthRotation ?? true) ? OMEGA_EARTH_RADS * Math.cos((site.latitudeDeg * Math.PI) / 180) : 0;
  const steps: MissionStep[] = [];
  let failure: MissionResult['failure'];

  const o = ascent.outcome;
  steps.push({
    id: 'ascent',
    label: 'Launch to orbit',
    status: o.success ? 'ok' : 'fail',
    note: o.success ? `Orbit ${(o.orbit!.perigeeAltM / 1000).toFixed(0)} × ${(o.orbit!.apogeeAltM / 1000).toFixed(0)} km` : 'Did not reach orbit',
  });
  if (!o.success) failure = { type: o.failure!.type, detail: o.failure!.detail };

  if (ascent.checklist.length) {
    const faults = ascent.checklist.filter((c) => c.status === 'fault');
    steps.push({
      id: 'systems',
      label: 'Systems check',
      status: faults.length ? 'warn' : 'ok',
      note: faults.length ? faults.map((f) => f.note).join('. ') : 'All systems GO',
    });
  }

  // Recovery runs for every piece that came off, whatever happened afterwards.
  const recoveries = ascent.separations.map((sep) => simulateRecovery(sep, vehicle, omega));
  for (const r of recoveries) {
    steps.push({
      id: 'recovery',
      label: r.name,
      status: r.failed ? 'fail' : r.outcome === 'lost' ? 'skipped' : 'ok',
      note: r.reason,
    });
  }

  let moon: MoonLedger | undefined;
  let reentry: ReentryRecord | undefined;
  if (o.success) {
    const toMoon = spec.mission.target !== 'orbit';
    if (toMoon) {
      moon = moonLedger(spec, catalog, o.remainingDeltaVMS);
      const short = moon.legs.find((l) => !l.ok);
      steps.push({
        id: 'moon',
        label: 'Moon trip',
        status: short ? 'fail' : 'ok',
        note: short
          ? `${short.name}: needs ${short.neededMS.toFixed(0)} m/s, has ${short.availableMS.toFixed(0)}`
          : spec.mission.target === 'moonFlyby'
            ? 'Looped around the Moon and came back'
            : 'Landed on the Moon and came back',
      });
      if (short && !failure)
        failure = { type: 'moonShort', detail: { leg: short.name, by: short.by, neededMS: short.neededMS, availableMS: short.availableMS } };
    }
    if (!moon || moon.success) {
      reentry = simulateReentry(spec, catalog, toMoon) ?? undefined;
      if (reentry) {
        const ok = reentry.outcome === 'splashdown';
        steps.push({
          id: 'reentry',
          label: 'Coming home',
          status: ok ? 'ok' : 'fail',
          note: ok
            ? `Splashdown at ${reentry.splashSpeedMS.toFixed(1)} m/s after ${reentry.peakGLoad.toFixed(1)} g`
            : { burnUp: 'Heat shield overheated', skipOut: 'Skipped off the atmosphere', crewG: 'Too many g for the crew', hardSplash: 'Hit the water too hard', splashdown: '' }[reentry.outcome],
        });
        if (!ok && !failure) {
          const type: MissionFailureType = reentry.outcome === 'skipOut' ? 'skipOut' : reentry.outcome === 'crewG' ? 'crewG' : 'burnUp';
          failure = {
            type,
            detail: {
              entryAngleDeg: reentry.entryAngleDeg,
              entrySpeedMS: reentry.entrySpeedMS,
              peakHeatFluxWm2: reentry.peakHeatFluxWm2,
              maxHeatFluxWm2: reentry.maxHeatFluxWm2,
              heatLoadJm2: reentry.heatLoadJm2,
              maxHeatLoadJm2: reentry.maxHeatLoadJm2,
              peakGLoad: reentry.peakGLoad,
            },
          };
        }
      }
    }
  }

  const crashed = recoveries.find((r) => r.failed);
  if (crashed && !failure) {
    failure = {
      type: 'crashLanding',
      detail: {
        piece: crashed.name,
        touchdownSpeedMS: crashed.touchdownSpeedMS,
        limitMS: crashed.limitMS,
        reserveKg: crashed.reserveKg,
        propellantLeftKg: crashed.propellantLeftKg,
        entryBurnDeltaVMS: crashed.entryBurnDeltaVMS,
        reason: crashed.reason,
      },
    };
  }

  const lastRecovery = Math.max(0, ...recoveries.map((r) => r.endTS + 3));
  return {
    ascent,
    recoveries,
    moon,
    reentry,
    result: { success: !failure, failure, steps },
    flightDurationS: Math.max(ascent.durationS, lastRecovery),
  };
}
