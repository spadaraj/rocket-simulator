// Sandbox kitbashing: take whole stages or single parts (engines, tanks, boosters, things on
// top) from any rocket and put them on yours. Parts designed for the other rocket come along
// with new ids, so they never clash with yours.

import { nextCustomId, PAYLOAD_SLOTS, payloadSlot, prune, setEngine, setPayloadSlot, stageEngine, stageTank, type PayloadSlot } from './edit';
import type { BoosterRef, Catalog, PartRef, RocketSpec, StageSpec } from './types';
import { resolveCatalog } from './vehicle';

const PREFIX: Record<string, string> = { tank: 'custom-tank-', liquidEngine: 'custom-engine-', aero: 'custom-fin-' };

/** Copy refs from another rocket, bringing its own designed parts along under fresh ids. */
function bring(spec: RocketSpec, from: RocketSpec, refs: PartRef[]): { spec: RocketSpec; refs: PartRef[] } {
  let out = spec;
  const ids = new Map<string, string>();
  const mapped = refs.map((ref) => {
    const custom = from.customParts?.find((p) => p.id === ref.part);
    if (!custom) return { ...ref };
    let id = ids.get(custom.id);
    if (!id) {
      id = nextCustomId(out, PREFIX[custom.type] ?? 'custom-part-');
      ids.set(custom.id, id);
      out = { ...out, customParts: [...(out.customParts ?? []), { ...custom, id }] };
    }
    return { ...ref, part: id };
  });
  return { spec: out, refs: mapped };
}

export type StagePlace = { at: 'top' } | { at: 'bottom' } | { swap: number };

/**
 * Put another rocket's stage on yours: on top, at the bottom, or in place of one of yours.
 * Boosters always stay strapped to whatever is at the bottom.
 */
export function importStage(spec: RocketSpec, from: RocketSpec, si: number, place: StagePlace): RocketSpec {
  const src = from.stages[si];
  if (!src) return spec;
  const { spec: withParts, refs } = bring(spec, from, src.parts);
  const stage: StageSpec = { name: `${from.name.replace(/\s*\(.*\)$/, '')}: ${src.name}`, color: src.color, parts: refs };
  if (src.recovery) stage.recovery = src.recovery;
  if (src.landingReserveKg) stage.landingReserveKg = src.landingReserveKg;

  const stages = [...withParts.stages];
  const boosters = stages[0]?.boosters;
  if ('swap' in place) stages[place.swap] = stage;
  else if (place.at === 'top') stages.push(stage);
  else stages.unshift(stage);

  // Boosters belong to the bottom stage.
  const cleaned = stages.map((s, i) => {
    const rest = { ...s };
    delete rest.boosters;
    return i === 0 && boosters ? { ...rest, boosters } : rest;
  });
  return prune({ ...withParts, stages: cleaned });
}

/** Put another rocket's engines on one of your stages: the same kind and the same number. */
export function importEngines(spec: RocketSpec, catalog: Catalog, i: number, from: RocketSpec, engine: PartRef): RocketSpec {
  const { spec: withParts, refs } = bring(spec, from, [engine]);
  const ref = { ...refs[0], count: engine.count ?? 1 };
  const e = stageEngine(withParts, catalog, i);
  if (e) {
    const swapped = setEngine(withParts, catalog, i, ref.part);
    const after = stageEngine(swapped, catalog, i)!;
    return prune({
      ...swapped,
      stages: swapped.stages.map((s, si) => (si === i ? { ...s, parts: s.parts.map((p, pi) => (pi === after.index ? { ...p, count: ref.count } : p)) } : s)),
    });
  }
  // A stage with no engine yet: put them at the bottom of it.
  return { ...withParts, stages: withParts.stages.map((s, si) => (si === i ? { ...s, parts: [ref, ...s.parts] } : s)) };
}

/** Put another rocket's fuel tank on one of your stages, full. */
export function importTank(spec: RocketSpec, catalog: Catalog, i: number, from: RocketSpec, tank: PartRef): RocketSpec {
  const { spec: withParts, refs } = bring(spec, from, [{ part: tank.part, count: tank.count }]);
  const t = stageTank(withParts, catalog, i);
  const stages = withParts.stages.map((s, si) => {
    if (si !== i) return s;
    if (!t) return { ...s, parts: [...s.parts, refs[0]] };
    return { ...s, parts: s.parts.map((p, pi) => (pi === t.index ? refs[0] : p)) };
  });
  return prune({ ...withParts, stages });
}

/** Strap another rocket's boosters onto your bottom stage, as many as it had. */
export function importBoosters(spec: RocketSpec, b: BoosterRef): RocketSpec {
  return {
    ...spec,
    stages: spec.stages.map((s, i) => (i === 0 ? { ...s, boosters: { ...b, recovery: s.boosters?.recovery ?? b.recovery } } : s)),
  };
}

// ---------- What each rocket has to offer ----------

export interface Kit {
  rocket: RocketSpec;
  stages: { index: number; name: string }[];
  engines: PartRef[];
  tanks: PartRef[];
  boosters?: BoosterRef;
  top: { slot: PayloadSlot; part: string }[];
}

/** Every piece of a rocket that can be taken, each kind listed once. */
export function kitOf(rocket: RocketSpec, catalog: Catalog): Kit {
  const cat = resolveCatalog(rocket, catalog);
  const engines: PartRef[] = [];
  const tanks: PartRef[] = [];
  for (const st of rocket.stages)
    for (const ref of st.parts) {
      const type = cat[ref.part]?.type;
      const list = type === 'liquidEngine' ? engines : type === 'tank' ? tanks : null;
      if (list && !list.some((r) => r.part === ref.part && r.count === ref.count)) list.push(ref);
    }
  const top = PAYLOAD_SLOTS.flatMap(({ slot }) => {
    const part = payloadSlot(rocket, slot);
    return part ? [{ slot, part }] : [];
  });
  return {
    rocket,
    stages: rocket.stages.map((s, index) => ({ index, name: s.name })),
    engines,
    tanks,
    boosters: rocket.stages[0]?.boosters,
    top,
  };
}

/** Put a module on top (in its own spot: one of each kind). */
export const importTop = (spec: RocketSpec, slot: PayloadSlot, part: string) => setPayloadSlot(spec, slot, part);
