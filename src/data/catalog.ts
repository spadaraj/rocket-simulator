import type { Catalog, Part, RocketSpec } from '../physics/types';
import partsJson from './parts.json';
import a139 from './presets/a1-39.json';
import falcon9 from './presets/falcon-9.json';
import falconHeavy from './presets/falcon-heavy.json';
import saturnV from './presets/saturn-v.json';
import shuttle from './presets/shuttle.json';
import sls from './presets/sls.json';
import starship from './presets/starship.json';

export const catalog: Catalog = Object.fromEntries(
  (partsJson as unknown as Part[]).map((p) => [p.id, p]),
);

const a139Spec = a139 as unknown as RocketSpec;

/** Roscoe's first guess, as drawn: about five core engines. Shows what "too weak" looks like. */
const a139AsDrawn: RocketSpec = {
  ...a139Spec,
  id: 'a1-39-as-drawn',
  name: 'A1-39 (as drawn)',
  description: 'The A1-39 with the five core engines visible in the blueprint. Will it make it?',
  stages: a139Spec.stages.map((s, i) =>
    i === 0
      ? { ...s, parts: s.parts.map((p) => (p.part === 'raptor-2' ? { ...p, count: 5 } : p)) }
      : s,
  ),
};

export const presets: RocketSpec[] = [
  a139Spec,
  a139AsDrawn,
  ...[saturnV, falcon9, falconHeavy, shuttle, sls, starship].map((p) => p as unknown as RocketSpec),
];
