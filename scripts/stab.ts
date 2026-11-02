// Stability report: npx vite-node scripts/stab.ts [presetId]
import { catalog, presets } from '../src/data/catalog';
import { simulate } from '../src/physics/simulate';
for (const spec of presets) {
  const r = simulate(spec, catalog);
  const worst = r.samples.reduce((a, b) => (b.tumbleRatio > a.tumbleRatio ? b : a));
  console.log(`${spec.name}: margin ${r.summary.staticMarginCalibers.toFixed(2)} cal, max tumble ratio ${r.summary.maxTumbleRatio.toFixed(3)} at T+${worst.tS.toFixed(0)} (aoa ${worst.aoaDeg.toFixed(1)}°, q ${(worst.dynamicPressurePa/1000).toFixed(1)} kPa) → ${r.outcome.success ? 'orbit' : r.outcome.failure?.type}`);
}
