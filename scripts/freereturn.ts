// Grid search for a free-return trajectory: npx vite-node scripts/freereturn.ts [parkingAltKm]
import { solveFreeReturn, trialFlight } from '../src/physics/trajectory';

const alt = Number(process.argv[2] ?? 185) * 1000;
const t0 = performance.now();
let best = { phase: 0, burn: 0, cost: Infinity };
for (let phase = 0; phase < 360; phase += 4)
  for (let burn = 3080; burn <= 3180; burn += 10) {
    const r = trialFlight(alt, phase, burn);
    if (r.cost < best.cost) best = { phase, burn, cost: r.cost };
  }
console.log('grid best', best, trialFlight(alt, best.phase, best.burn), `${(performance.now() - t0).toFixed(0)} ms`);
const t1 = performance.now();
const fr = solveFreeReturn(alt, { phaseDeg: best.phase, burnMS: best.burn });
console.log('refined', { phaseDeg: (fr.phaseRad * 180) / Math.PI, burnMS: fr.burnMS }, trialFlight(alt, (fr.phaseRad * 180) / Math.PI, fr.burnMS), `${(performance.now() - t1).toFixed(0)} ms`);
