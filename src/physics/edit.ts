// Pure edit operations on a RocketSpec. The builder, auto-size and fix search all use these.

import { designTank } from './design';
import type { AeroPart, Catalog, LiquidEngine, MissionSpec, Part, PartRef, RocketSpec, StageSpec, Tank } from './types';
import { resolveCatalog } from './vehicle';

const NEW_STAGE_COLORS = ['#d63a3a', '#f4f6fa', '#3a7bd5', '#ffb02e', '#8e99a8'];

interface Found<T extends Part> {
  index: number;
  ref: PartRef;
  part: T;
}

function findPart<T extends Part>(
  spec: RocketSpec,
  catalog: Catalog,
  stageIndex: number,
  type: T['type'],
): Found<T> | undefined {
  const cat = resolveCatalog(spec, catalog);
  const parts = spec.stages[stageIndex]?.parts ?? [];
  for (let index = 0; index < parts.length; index++) {
    const part = cat[parts[index].part];
    if (part?.type === type) return { index, ref: parts[index], part: part as T };
  }
  return undefined;
}

export const stageEngine = (spec: RocketSpec, catalog: Catalog, i: number) =>
  findPart<LiquidEngine>(spec, catalog, i, 'liquidEngine');

export const stageTank = (spec: RocketSpec, catalog: Catalog, i: number) =>
  findPart<Tank>(spec, catalog, i, 'tank');

function replaceRef(spec: RocketSpec, i: number, index: number, ref: PartRef): RocketSpec {
  return {
    ...spec,
    stages: spec.stages.map((s, si) =>
      si === i ? { ...s, parts: s.parts.map((p, pi) => (pi === index ? ref : p)) } : s,
    ),
  };
}

/** Drop custom parts nothing refers to any more. */
function prune(spec: RocketSpec): RocketSpec {
  if (!spec.customParts) return spec;
  const used = new Set(spec.stages.flatMap((s) => s.parts.map((p) => p.part)));
  const customParts = spec.customParts.filter((p) => used.has(p.id));
  return { ...spec, customParts: customParts.length ? customParts : undefined };
}

function nextCustomId(spec: RocketSpec, prefix = 'custom-tank-'): string {
  let n = 1;
  const ids = new Set((spec.customParts ?? []).map((p) => p.id));
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Fraction of the stage's tank capacity that is loaded. */
export function stageFill(spec: RocketSpec, catalog: Catalog, i: number): number {
  const t = stageTank(spec, catalog, i);
  if (!t) return 0;
  return Math.min(1, (t.ref.propellantKg ?? t.part.propellantCapacityKg) / t.part.propellantCapacityKg);
}

export function setFill(spec: RocketSpec, catalog: Catalog, i: number, fraction: number): RocketSpec {
  const t = stageTank(spec, catalog, i);
  if (!t) return spec;
  const f = Math.max(0.01, Math.min(1, fraction));
  const ref: PartRef = { ...t.ref };
  if (f >= 0.999) delete ref.propellantKg;
  else ref.propellantKg = Math.round(f * t.part.propellantCapacityKg);
  return replaceRef(spec, i, t.index, ref);
}

/** Resize (or re-propellant) the stage's tank. Converts a catalog tank into an estimated custom one. */
export function setTank(
  spec: RocketSpec,
  catalog: Catalog,
  i: number,
  change: { diameterM?: number; lengthM?: number; propellant?: Tank['propellant'] },
): RocketSpec {
  const t = stageTank(spec, catalog, i);
  if (!t) return spec;
  const fill = stageFill(spec, catalog, i);
  const id = t.part.id.startsWith('custom-tank-') ? t.part.id : nextCustomId(spec);
  const tank = designTank(
    id,
    Math.max(1, change.diameterM ?? t.part.diameterM ?? 4),
    Math.max(1, change.lengthM ?? t.part.lengthM ?? 10),
    change.propellant ?? t.part.propellant,
    t.part.maxDynamicPressurePa,
  );
  const customParts = [...(spec.customParts ?? []).filter((p) => p.id !== id), tank];
  const ref: PartRef = { ...t.ref, part: id };
  delete ref.propellantKg;
  if (fill < 0.999) ref.propellantKg = Math.round(fill * tank.propellantCapacityKg);
  return prune({ ...replaceRef(spec, i, t.index, ref), customParts });
}

export function setEngine(spec: RocketSpec, catalog: Catalog, i: number, engineId: string): RocketSpec {
  const e = stageEngine(spec, catalog, i);
  const engine = resolveCatalog(spec, catalog)[engineId];
  if (!e || engine?.type !== 'liquidEngine') return spec;
  let out = replaceRef(spec, i, e.index, { ...e.ref, part: engineId });
  // Keep the tank's propellant matched to the engine.
  const t = stageTank(out, catalog, i);
  if (t && t.part.propellant !== engine.propellant) out = setTank(out, catalog, i, { propellant: engine.propellant });
  return out;
}

export function setEngineCount(spec: RocketSpec, catalog: Catalog, i: number, count: number): RocketSpec {
  const e = stageEngine(spec, catalog, i);
  if (!e) return spec;
  return replaceRef(spec, i, e.index, { ...e.ref, count: Math.max(0, Math.min(40, Math.round(count))) });
}

export function setBoosters(spec: RocketSpec, part: string, count: number): RocketSpec {
  return {
    ...spec,
    stages: spec.stages.map((s, i) => {
      if (i !== 0) return s;
      if (count <= 0) {
        const rest = { ...s };
        delete rest.boosters;
        return rest;
      }
      return {
        ...s,
        boosters: { part, count: Math.min(8, count), separate: 'onBurnout' as const, color: '#f4f6fa', recovery: s.boosters?.recovery },
      };
    }),
  };
}

/** Add a new top stage under the payload, sized to sit on the current top stage. */
export function addStage(spec: RocketSpec, catalog: Catalog): RocketSpec {
  const top = spec.stages.length - 1;
  const topTank = stageTank(spec, catalog, top);
  const topEngine = stageEngine(spec, catalog, top);
  const propellant = topEngine?.part.propellant ?? 'CH4/LOX';
  const engineId = propellant === 'LH2/LOX' ? 'j-2' : 'raptor-vacuum';
  const diameterM = Math.min(topTank?.part.diameterM ?? 6, 6);
  const id = nextCustomId(spec);
  const tank = designTank(id, diameterM, 8, catalog[engineId]?.type === 'liquidEngine' ? (catalog[engineId] as LiquidEngine).propellant : propellant);
  const n = spec.stages.length + 1;
  return {
    ...spec,
    customParts: [...(spec.customParts ?? []), tank],
    stages: [
      ...spec.stages,
      {
        name: `Stage ${n}`,
        color: NEW_STAGE_COLORS[(n - 2) % NEW_STAGE_COLORS.length],
        parts: [{ part: engineId, count: 1 }, { part: id }],
      },
    ],
  };
}

export function removeStage(spec: RocketSpec, i: number): RocketSpec {
  if (i <= 0 || spec.stages.length <= 1) return spec;
  return prune({ ...spec, stages: spec.stages.filter((_, si) => si !== i) });
}

export function setMission(spec: RocketSpec, patch: Partial<MissionSpec>): RocketSpec {
  return { ...spec, mission: { ...spec.mission, ...patch } };
}

export function liquidEngines(catalog: Catalog): LiquidEngine[] {
  return Object.values(catalog).filter((p): p is LiquidEngine => p.type === 'liquidEngine');
}

// ---------- Phase 3: fins, recovery, heat shield ----------

/** The A1-39 fin is the size-1 reference: 4 m span, 9 m root chord. */
const FIN_REF = { spanM: 4, rootM: 9, massKg: 2500, areaM2: 18 };

export const stageFins = (spec: RocketSpec, catalog: Catalog, i: number) =>
  findPart<AeroPart>(spec, catalog, i, 'aero');

/** Fin size relative to the A1-39 fin (0 = no fins). */
export function finScale(spec: RocketSpec, catalog: Catalog, i: number): number {
  const f = stageFins(spec, catalog, i);
  return f ? (f.part.diameterM ?? FIN_REF.spanM) / FIN_REF.spanM : 0;
}

export function setFins(spec: RocketSpec, catalog: Catalog, i: number, scale: number): RocketSpec {
  const f = stageFins(spec, catalog, i);
  if (scale <= 0) {
    if (!f) return spec;
    return prune({ ...spec, stages: spec.stages.map((s, si) => (si === i ? { ...s, parts: s.parts.filter((_, pi) => pi !== f.index) } : s)) });
  }
  if (f && Math.abs(finScale(spec, catalog, i) - scale) < 1e-6) return spec;
  // The reference fin needs no custom part.
  if (Math.abs(scale - 1) < 1e-6 && catalog['a139-fin']) {
    const ref: PartRef = { part: 'a139-fin', count: f?.ref.count ?? 4 };
    return prune(f ? replaceRef(spec, i, f.index, ref) : { ...spec, stages: spec.stages.map((s, si) => (si === i ? { ...s, parts: [...s.parts, ref] } : s)) });
  }
  const id = f?.part.id.startsWith('custom-fin-') ? f.part.id : nextCustomId(spec, 'custom-fin-');
  const fin: AeroPart = {
    id,
    type: 'aero',
    name: `Fin (${scale.toFixed(1)}× size)`,
    massKg: Math.round(FIN_REF.massKg * scale * scale),
    diameterM: FIN_REF.spanM * scale,
    lengthM: FIN_REF.rootM * scale,
    areaM2: FIN_REF.areaM2 * scale * scale,
    source: 'Free design: the A1-39 fin scaled; mass grows with area.',
    confidence: 'estimate',
  };
  const customParts = [...(spec.customParts ?? []).filter((p) => p.id !== id), fin];
  const ref: PartRef = { part: id, count: f?.ref.count ?? 4 };
  const withRef = f ? replaceRef(spec, i, f.index, ref) : { ...spec, stages: spec.stages.map((s, si) => (si === i ? { ...s, parts: [...s.parts, ref] } : s)) };
  return prune({ ...withRef, customParts });
}

export function setRecovery(spec: RocketSpec, i: number, method: NonNullable<StageSpec['recovery']>, landingReserveKg?: number): RocketSpec {
  return {
    ...spec,
    stages: spec.stages.map((s, si) => {
      if (si !== i) return s;
      const out: StageSpec = { ...s, recovery: method };
      if (method === 'propulsive') out.landingReserveKg = Math.max(0, Math.round(landingReserveKg ?? s.landingReserveKg ?? 0));
      else delete out.landingReserveKg;
      return out;
    }),
  };
}

export function setBoosterRecovery(spec: RocketSpec, method: 'none' | 'parachute'): RocketSpec {
  return {
    ...spec,
    stages: spec.stages.map((s, i) => (i === 0 && s.boosters ? { ...s, boosters: { ...s.boosters, recovery: method } } : s)),
  };
}

export function setHeatShield(spec: RocketSpec, scale: number): RocketSpec {
  return { ...spec, payload: { ...spec.payload, heatShieldScale: Math.max(0.5, Math.min(3, scale)) } };
}

// ---------- Free-design engines ----------

/** Put a free-design engine on the stage, replacing its main engine. Updates it if it already exists. */
export function fitCustomEngine(spec: RocketSpec, catalog: Catalog, i: number, engine: LiquidEngine): RocketSpec {
  const isNew = !engine.id.startsWith('custom-engine-');
  const part: LiquidEngine = isNew ? { ...engine, id: nextCustomId(spec, 'custom-engine-') } : engine;
  const withPart: RocketSpec = { ...spec, customParts: [...(spec.customParts ?? []).filter((p) => p.id !== part.id), part] };
  return prune(setEngine(withPart, catalog, i, part.id));
}

/** The catalog engine a free-design one started from (or the engine itself). */
export function baseEngine(spec: RocketSpec, catalog: Catalog, engine: LiquidEngine): LiquidEngine {
  const base = engine.basedOn ? resolveCatalog(spec, catalog)[engine.basedOn] : undefined;
  return base?.type === 'liquidEngine' ? base : engine;
}

/** Roscoe's tinkering: scale an engine's push and fuel saving from the engine it started as. */
export function tuneEngine(spec: RocketSpec, catalog: Catalog, i: number, thrustScale: number, ispScale: number): RocketSpec {
  const e = stageEngine(spec, catalog, i);
  if (!e) return spec;
  const base = baseEngine(spec, catalog, e.part);
  if (Math.abs(thrustScale - 1) < 1e-6 && Math.abs(ispScale - 1) < 1e-6) return prune(setEngine(spec, catalog, i, base.id));
  const tuned: LiquidEngine = {
    ...base,
    id: e.part.id.startsWith('custom-engine-') ? e.part.id : base.id,
    name: `Super ${base.name.replace(/^(SpaceX|Blue Origin|Rocketdyne|Aerojet) /, '')}`,
    basedOn: base.id,
    thrustSeaLevelN: Math.round(base.thrustSeaLevelN * thrustScale),
    thrustVacuumN: Math.round(base.thrustVacuumN * thrustScale),
    ispSeaLevelS: Math.round(base.ispSeaLevelS * ispScale),
    ispVacuumS: Math.round(base.ispVacuumS * ispScale),
    source: `Free design: ${base.name} with ${thrustScale.toFixed(2)}× push and ${ispScale.toFixed(2)}× fuel efficiency. Same weight.`,
    confidence: 'estimate',
  };
  return fitCustomEngine(spec, catalog, i, tuned);
}
