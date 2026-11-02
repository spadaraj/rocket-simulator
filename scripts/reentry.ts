// Re-entry sweep: npx vite-node scripts/reentry.ts
import { catalog, presets } from '../src/data/catalog';
import { simulateReentry } from '../src/physics/reentry';
for (const spec of [presets[2], presets[0]]) for (const moon of [true, false])
  for (const a of moon ? [-4, -5, -5.5, -6, -6.5, -7, -7.5, -8, -9, -10] : [-0.5, -1, -1.5, -2, -3, -5]) {
    const r = simulateReentry({ ...spec, mission: { ...spec.mission, reentryAngleDeg: a } }, catalog, moon)!;
    console.log(`${spec.name} ${moon ? 'moon' : 'orbit'} ${a}°: ${r.outcome} flux ${(r.peakHeatFluxWm2 / 1e6).toFixed(2)} MW/m², load ${(r.heatLoadJm2 / 1e6).toFixed(0)} MJ/m², g ${r.peakGLoad.toFixed(1)}, splash ${r.splashSpeedMS.toFixed(1)} m/s, ${r.durationS.toFixed(0)} s`);
  }
