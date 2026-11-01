// Prints a flight report: npx vite-node scripts/fly.ts [presetId] [kickTime] [kickAngle]
import { catalog, presets } from '../src/data/catalog';
import { simulate } from '../src/physics/simulate';

const id = process.argv[2] ?? 'saturn-v';
const base = presets.find((p) => p.id === id)!;
const spec =
  process.argv[3] !== undefined
    ? { ...base, mission: { ...base.mission, pitchKick: { timeS: +process.argv[3], angleDeg: +process.argv[4] } } }
    : base;
const t0 = performance.now();
const rec = simulate(spec, catalog);
const ms = performance.now() - t0;
const km = (m: number) => (m / 1000).toFixed(1);
console.log(`${rec.rocketName}: ${rec.samples.length} samples in ${ms.toFixed(0)} ms`);
console.log(`liftoff ${km(rec.summary.liftoffMassKg)} t, TWR ${rec.summary.liftoffTWR.toFixed(2)}`);
console.log(`maxQ ${km(rec.summary.maxQPa)} kPa at T+${rec.summary.maxQTimeS.toFixed(0)} s, ${km(rec.summary.maxQAltitudeM)} km (limit ${km(rec.summary.structuralLimitPa)}); max g ${rec.summary.maxGLoad.toFixed(2)}`);
for (const e of rec.events) {
  const s = rec.samples.reduce((a, b) => (Math.abs(b.tS - e.tS) < Math.abs(a.tS - e.tS) ? b : a));
  console.log(`T+${e.tS.toFixed(1).padStart(7)}  ${e.label.padEnd(28)} alt ${km(s.altitudeM).padStart(7)} km  v ${s.speedMS.toFixed(0).padStart(5)} m/s  downrange ${km(s.downrangeM)} km`);
}
console.log(JSON.stringify(rec.outcome, null, 0));
