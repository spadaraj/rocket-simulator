// Chaos Mode: pick one random fault for a flight. Pure apart from the random source.

import type { Catalog, Fault, RocketSpec } from './types';
import { buildVehicle } from './vehicle';

/** Small seeded generator so a flight can be replayed exactly. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollFaults(spec: RocketSpec, catalog: Catalog, seed: number): Fault[] {
  const rand = rng(seed);
  const vehicle = buildVehicle(spec, catalog);
  const roll = rand();
  if (roll < 0.5) {
    // Engine trouble: mostly on the first stage, where it matters most.
    const withEngines = vehicle.stages.map((s, i) => ({ s, i })).filter((x) => x.s.engines.length);
    if (!withEngines.length) return [];
    const pick = rand() < 0.65 ? withEngines[0] : withEngines[Math.floor(rand() * withEngines.length)];
    const n = pick.s.engines.reduce((a, g) => a + g.count, 0);
    return [
      {
        kind: 'engineOut',
        stageIndex: pick.i,
        afterIgnitionS: Math.round(20 + rand() * 80),
        // Now and then an engine fails messily and takes its neighbour with it.
        engines: n > 4 && rand() < 0.3 ? 2 : 1,
      },
    ];
  }
  if (roll < 0.7) return [{ kind: 'leak', fraction: Math.round((0.08 + rand() * 0.22) * 100) / 100 }];
  const systems = ['power', 'guidance', 'comms'] as const;
  return [{ kind: 'glitch', system: systems[Math.floor(rand() * systems.length)] }];
}
