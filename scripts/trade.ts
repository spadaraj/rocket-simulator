// Land-and-Moon trade: npx vite-node scripts/trade.ts
import { catalog, presets } from '../src/data/catalog';
import { OMEGA_EARTH_RADS } from '../src/physics/constants';
import { setFill, setTank } from '../src/physics/edit';
import { simulateRecovery } from '../src/physics/recovery';
import { simulate } from '../src/physics/simulate';
import type { RocketSpec } from '../src/physics/types';
import { buildVehicle } from '../src/physics/vehicle';
const omega = OMEGA_EARTH_RADS * Math.cos((28.6083 * Math.PI) / 180);
const base = presets[0];
for (const len of [15, 30, 40]) for (const fill of [0.5, 0.7, 1]) for (const res of [100, 200, 300]) {
  let spec: RocketSpec = setTank(base, catalog, 1, { lengthM: len });
  spec = setFill(spec, catalog, 0, fill);
  spec = { ...spec, stages: spec.stages.map((s, i) => (i === 0 ? { ...s, landingReserveKg: res * 1000 } : s)) };
  const r = simulate(spec, catalog, { dtS: 0.1 });
  const v = buildVehicle(spec, catalog);
  const core = r.separations.find((s) => s.kind === 'stage');
  const tr = core ? simulateRecovery(core, v, omega) : null;
  console.log(`s2 ${len} m, core ${fill * 100}%, reserve ${res} t: ${r.outcome.success ? `orbit, ${r.outcome.remainingDeltaVMS.toFixed(0)} m/s left` : r.outcome.failure?.type}; core ${tr?.outcome} (${tr?.reason})`);
}
