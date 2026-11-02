// Recovery report: npx vite-node scripts/recover.ts [reserveTonnes...]
import { catalog, presets } from '../src/data/catalog';
import { OMEGA_EARTH_RADS } from '../src/physics/constants';
import { simulateRecovery } from '../src/physics/recovery';
import { simulate } from '../src/physics/simulate';
import type { RocketSpec } from '../src/physics/types';
import { buildVehicle } from '../src/physics/vehicle';

const omega = OMEGA_EARTH_RADS * Math.cos((28.6083 * Math.PI) / 180);
const base = presets[0];
for (const t of (process.argv.slice(2).length ? process.argv.slice(2) : ['0', '100', '200', '300']).map(Number)) {
  const spec: RocketSpec = {
    ...base,
    stages: base.stages.map((s, i) =>
      i === 0 ? { ...s, landingReserveKg: t * 1000, boosters: { ...s.boosters!, recovery: 'parachute' } } : s,
    ),
  };
  const v = buildVehicle(spec, catalog);
  const r = simulate(spec, catalog);
  console.log(`reserve ${t} t → ${r.outcome.success ? 'orbit' : r.outcome.failure?.type}, Δv left ${r.outcome.remainingDeltaVMS.toFixed(0)}`);
  for (const sep of r.separations) {
    const tr = simulateRecovery(sep, v, omega);
    console.log(`  ${tr.name} (${tr.method}) sep T+${sep.tS.toFixed(0)}: ${tr.outcome} — ${tr.reason}; entry burn ${tr.entryBurnDeltaVMS.toFixed(0)} m/s, maxQ ${(tr.maxDynamicPressurePa / 1000).toFixed(1)} kPa, left ${(tr.propellantLeftKg / 1000).toFixed(1)} t, end T+${tr.endTS.toFixed(0)}, ${(tr.downrangeM / 1000).toFixed(0)} km`);
  }
}
