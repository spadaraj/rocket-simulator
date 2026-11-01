// Prints auto-size and fix-search results: npx vite-node scripts/whatif.ts [presetId]
import { catalog, presets } from '../src/data/catalog';
import { autoSize } from '../src/physics/autosize';
import { findFixes } from '../src/physics/fixes';
import { simulate } from '../src/physics/simulate';
const spec = presets.find((p) => p.id === (process.argv[2] ?? 'a1-39'))!;
let t = performance.now();
const a = autoSize(spec, catalog);
console.log(`autosize (${(performance.now() - t).toFixed(0)} ms, ${a.flightsTried} flights): ${a.message}`);
const rec = simulate(spec, catalog);
if (rec.outcome.failure) {
  t = performance.now();
  const f = findFixes(spec, catalog, rec.outcome.failure.type);
  console.log(`fixes (${(performance.now() - t).toFixed(0)} ms, tested ${f.tested}):`);
  for (const x of f.fixes) console.log(`  [${x.cost}] ${x.title} | "${x.roscoe}" -> ${(x.perigeeAltM / 1000).toFixed(0)} km, ${x.remainingDeltaVMS.toFixed(0)} m/s left`);
}
