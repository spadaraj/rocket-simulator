// Sweeps pitch-kick settings: npx vite-node scripts/sweep.ts presetId
import { catalog, presets } from '../src/data/catalog';
import { simulate } from '../src/physics/simulate';
const base = presets.find((p) => p.id === (process.argv[2] ?? 'saturn-v'))!;
for (const timeS of [8, 12, 16, 20]) {
  for (const angleDeg of [0.25, 0.5, 0.75, 1, 1.5, 2]) {
    const rec = simulate({ ...base, mission: { ...base.mission, pitchKick: { timeS, angleDeg } } }, catalog);
    const o = rec.outcome;
    console.log(
      `kick ${timeS}s ${angleDeg}°: ${o.success ? 'ORBIT' : o.failure!.type.padEnd(9)} maxQ ${(rec.summary.maxQPa / 1000).toFixed(1)} kPa @${rec.summary.maxQTimeS.toFixed(0)}s ${(rec.summary.maxQAltitudeM / 1000).toFixed(1)}km` +
        (o.success ? ` orbit ${(o.orbit!.perigeeAltM / 1000).toFixed(0)}x${(o.orbit!.apogeeAltM / 1000).toFixed(0)} dv left ${o.remainingDeltaVMS.toFixed(0)}` : ''),
    );
  }
}
