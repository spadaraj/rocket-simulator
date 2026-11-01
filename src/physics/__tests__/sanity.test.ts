// Layer 1 physics sanity tests (PLAN.md, "Validation against real flights").

import { describe, expect, it } from 'vitest';
import { catalog } from '../../data/catalog';
import { atmosphere } from '../atmosphere';
import { G0_MS2, MU_EARTH_M3S2, R_EARTH_M } from '../constants';
import { simulate } from '../simulate';
import type { RocketSpec } from '../types';
import { buildVehicle } from '../vehicle';

/** A rocket with no engines: just a lump of mass. */
function deadWeight(): RocketSpec {
  return {
    id: 'dead',
    name: 'Dead weight',
    description: '',
    launchSite: 'KSC',
    stages: [{ name: 'Lump', color: '#fff', parts: [{ part: 'apollo-cm' }] }],
    payload: { name: 'none', parts: [] },
    mission: { target: 'orbit', targetOrbitAltitudeM: 200e3, pitchKick: { timeS: 10, angleDeg: 2 } },
  };
}

describe('US Standard Atmosphere 1976', () => {
  // Published table values by geometric altitude: [m, K, Pa, kg/m^3]
  const table: [number, number, number, number][] = [
    [0, 288.15, 101325, 1.225],
    [5000, 255.68, 54048, 0.73643],
    [10000, 223.25, 26500, 0.41351],
    [20000, 216.65, 5529.3, 0.08891],
    [30000, 226.51, 1197.0, 0.01841],
    [50000, 270.65, 79.779, 1.0269e-3],
    [80000, 198.64, 1.0524, 1.8458e-5],
    [100000, 195.08, 0.032011, 5.604e-7],
    [200000, 854.56, 8.4736e-5, 2.541e-10],
  ];
  it.each(table)('matches the table at %d m', (z, T, P, rho) => {
    const a = atmosphere(z);
    expect(a.temperatureK).toBeCloseTo(T, 1);
    expect(Math.abs(a.pressurePa / P - 1)).toBeLessThan(0.002);
    expect(Math.abs(a.densityKgM3 / rho - 1)).toBeLessThan(0.002);
  });
  it('gives the sea-level speed of sound', () => {
    expect(atmosphere(0).speedOfSoundMS).toBeCloseTo(340.29, 1);
  });
});

describe('vacuum free fall', () => {
  it('falls 1000 m in the textbook time', () => {
    const h0 = 1000;
    const rec = simulate(deadWeight(), catalog, {
      atmosphere: false,
      earthRotation: false,
      initial: { xM: 0, yM: R_EARTH_M + h0, vxMS: 0, vyMS: 0 },
    });
    // g changes by ~0.03% over the drop; use the mean.
    const g = MU_EARTH_M3S2 / Math.pow(R_EARTH_M + h0 / 2, 2);
    const expected = Math.sqrt((2 * h0) / g);
    expect(rec.events.some((e) => e.type === 'impact')).toBe(true);
    expect(rec.durationS).toBeCloseTo(expected, 2);
    const last = rec.samples[rec.samples.length - 1];
    expect(last.speedMS).toBeCloseTo(g * expected, 1);
  });
});

describe('stable orbit', () => {
  it('conserves energy and radius over 10 laps', () => {
    const r0 = R_EARTH_M + 400e3;
    const v0 = Math.sqrt(MU_EARTH_M3S2 / r0);
    const period = 2 * Math.PI * Math.sqrt((r0 * r0 * r0) / MU_EARTH_M3S2);
    const rec = simulate(deadWeight(), catalog, {
      atmosphere: false,
      earthRotation: false,
      initial: { xM: 0, yM: r0, vxMS: v0, vyMS: 0 },
      coastAfterOrbitS: 10 * period,
      maxTimeS: 10 * period + 10,
    });
    expect(rec.outcome.success).toBe(true);
    const energy = (s: (typeof rec.samples)[0]) =>
      (s.speedMS * s.speedMS) / 2 - MU_EARTH_M3S2 / Math.hypot(s.xM, s.yM);
    const e0 = energy(rec.samples[0]);
    let worstRadiusErr = 0;
    for (const s of rec.samples) {
      worstRadiusErr = Math.max(worstRadiusErr, Math.abs(Math.hypot(s.xM, s.yM) - r0));
    }
    const last = rec.samples[rec.samples.length - 1];
    expect(rec.durationS).toBeGreaterThan(9.99 * period);
    expect(Math.abs(energy(last) / e0 - 1)).toBeLessThan(1e-8);
    expect(worstRadiusErr).toBeLessThan(1); // metres
  });
});

describe('rocket equation', () => {
  it('a stage burning in vacuum gains exactly Isp·g0·ln(m0/mf)', () => {
    const spec: RocketSpec = {
      ...deadWeight(),
      stages: [
        {
          name: 'S-IVB',
          color: '#fff',
          parts: [{ part: 'j-2' }, { part: 's-ivb-tankage' }],
        },
      ],
      payload: { name: 'CM', parts: [{ part: 'apollo-cm' }] },
    };
    const v = buildVehicle(spec, catalog);
    const m0 = v.stages[0].dryMassKg + v.stages[0].propellantKg + v.payloadMassKg;
    const mf = m0 - v.stages[0].propellantKg;
    const isp = 421;
    const expected = isp * G0_MS2 * Math.log(m0 / mf);

    const rec = simulate(spec, catalog, {
      atmosphere: false,
      gravity: false,
      earthRotation: false,
      initial: { xM: 0, yM: 1e9, vxMS: 0, vyMS: 0 },
      fixedAttitude: { x: 1, y: 0 },
      maxTimeS: 600,
    });
    const burnout = rec.events.find((e) => e.type === 'stageBurnout')!;
    const s = rec.samples.find((x) => x.tS === burnout.tS)!;
    expect(s.massKg).toBeCloseTo(mf, 3);
    expect(Math.abs(s.speedMS / expected - 1)).toBeLessThan(1e-6);
  });

  it('a solid booster burns exactly its loaded propellant over its burn time', () => {
    const b = buildVehicle(
      {
        ...deadWeight(),
        stages: [
          {
            name: 'Core',
            color: '#fff',
            parts: [{ part: 'apollo-cm' }],
            boosters: { part: 'srb-sls-5seg', count: 1, separate: 'onBurnout' },
          },
        ],
      },
      catalog,
    ).stages[0].boosters!;
    expect(b.propellantUsedAt(0)).toBe(0);
    expect(b.propellantUsedAt(1)).toBe(1);
    // Total impulse = propellant × Isp × g0 (integrate the thrust curve numerically).
    let impulse = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) impulse += b.vacuumThrustAt((i + 0.5) / n) * (b.booster.burnTimeS / n);
    const expected = b.booster.propellantKg * b.booster.ispVacuumS * G0_MS2;
    expect(Math.abs(impulse / expected - 1)).toBeLessThan(1e-3);
  });
});
