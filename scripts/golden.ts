// Scorecard against real flights: npx vite-node scripts/golden.ts
import { catalog, presets } from '../src/data/catalog';
import { GOLDEN_FLIGHTS, scorecard } from '../src/physics/golden';
import { simulate } from '../src/physics/simulate';

const MARK = { close: '✅', near: '🟡', off: '❌', missing: '—' };
for (const g of GOLDEN_FLIGHTS) {
  const spec = presets.find((p) => p.id === g.presetId)!;
  const card = scorecard(g, simulate(spec, catalog));
  console.log(`\n${spec.name} vs ${card.flight}: ${card.score}%`);
  for (const l of card.lines) {
    const sim = l.sim === undefined ? '—' : l.sim.toFixed(l.digits);
    const err = l.error === undefined ? '' : `${l.error >= 0 ? '+' : ''}${(l.error * 100).toFixed(1)}%`;
    console.log(`  ${MARK[l.grade]} ${l.label.padEnd(34)} real ${l.real.toFixed(l.digits).padStart(7)}  sim ${sim.padStart(7)} ${l.unit.padEnd(4)} ${err}`);
  }
}
