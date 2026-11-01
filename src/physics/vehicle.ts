// Turns a RocketSpec + catalog into the numbers the simulator needs.

import { G0_MS2, P0_PA } from './constants';
import type {
  Catalog,
  LiquidEngine,
  Part,
  PartRef,
  Payload,
  RocketSpec,
  Shape,
  SolidBooster,
} from './types';

const DEFAULT_MAX_Q_PA = 80000;

export interface EngineGroup {
  engine: LiquidEngine;
  count: number;
  /** Effective nozzle exit area, from the sea-level vs vacuum thrust difference. */
  exitAreaM2: number;
}

export interface BoosterGroup {
  booster: SolidBooster;
  count: number;
  /** Vacuum thrust of one booster at a given fraction of its burn. */
  vacuumThrustAt: (burnFraction: number) => number;
  /** Fraction of propellant used after a given fraction of the burn. */
  propellantUsedAt: (burnFraction: number) => number;
}

export interface StageModel {
  name: string;
  color: string;
  dryMassKg: number;
  propellantKg: number;
  propellantCapacityKg: number;
  engines: EngineGroup[];
  boosters?: BoosterGroup;
  diameterM: number;
  maxDynamicPressurePa: number;
  /** Throttle floor across this stage's engines. */
  throttleMin: number;
}

/** One drawable piece of the stack, bottom to top. */
export interface Segment {
  stageIndex: number; // -1 = payload
  partId: string;
  name: string;
  shape: Shape;
  diameterBottomM: number;
  diameterTopM: number;
  lengthM: number;
  color: string;
  /** Present only while attached; payload parts that jettison carry the time rule. */
  jettisonAfterFirstStagingS?: number;
}

export interface FinSet {
  stageIndex: number;
  count: number;
  spanM: number;
  rootM: number;
}

export interface Vehicle {
  name: string;
  stages: StageModel[];
  payloadMassKg: number;
  /** Payload parts that jettison during flight (e.g. the escape tower). */
  jettisonables: { name: string; massKg: number; afterFirstStagingS: number }[];
  payloadMaxDynamicPressurePa: number;
  segments: Segment[];
  fins: FinSet[];
  heightM: number;
  maxDiameterM: number;
}

function lookup(catalog: Catalog, id: string): Part {
  const part = catalog[id];
  if (!part) throw new Error(`Unknown part "${id}"`);
  return part;
}

export function engineExitArea(engine: LiquidEngine): number {
  return Math.max(0, (engine.thrustVacuumN - engine.thrustSeaLevelN) / P0_PA);
}

export function makeBoosterGroup(booster: SolidBooster, count: number): BoosterGroup {
  const curve = booster.thrustCurve;
  // Cumulative integral of the relative thrust curve (trapezoids).
  const cumulative = [0];
  for (let i = 1; i < curve.length; i++) {
    const [f0, r0] = curve[i - 1];
    const [f1, r1] = curve[i];
    cumulative.push(cumulative[i - 1] + ((r0 + r1) / 2) * (f1 - f0));
  }
  const area = cumulative[cumulative.length - 1];
  // Peak vacuum thrust that makes total mass flow equal the loaded propellant.
  const scaleN = (booster.propellantKg * booster.ispVacuumS * G0_MS2) / (booster.burnTimeS * area);

  const relAt = (f: number) => {
    if (f <= 0) return curve[0][1];
    if (f >= 1) return 0;
    let i = 1;
    while (curve[i][0] < f) i++;
    const [f0, r0] = curve[i - 1];
    const [f1, r1] = curve[i];
    return r0 + ((f - f0) / (f1 - f0)) * (r1 - r0);
  };
  const usedAt = (f: number) => {
    if (f <= 0) return 0;
    if (f >= 1) return 1;
    let i = 1;
    while (curve[i][0] < f) i++;
    const [f0, r0] = curve[i - 1];
    const r = relAt(f);
    return (cumulative[i - 1] + ((r0 + r) / 2) * (f - f0)) / area;
  };
  return { booster, count, vacuumThrustAt: (f) => relAt(f) * scaleN, propellantUsedAt: usedAt };
}

function partShape(part: Part): Shape {
  if (part.shape) return part.shape;
  return 'cylinder';
}

export function buildVehicle(spec: RocketSpec, catalog: Catalog): Vehicle {
  const segments: Segment[] = [];
  const fins: FinSet[] = [];

  const addSegment = (stageIndex: number, part: Part, ref: PartRef, fallbackColor: string) => {
    if (!part.lengthM || !part.diameterM) return;
    segments.push({
      stageIndex,
      partId: part.id,
      name: part.name,
      shape: partShape(part),
      diameterBottomM: part.diameterM,
      diameterTopM: part.diameterTopM ?? part.diameterM,
      lengthM: part.lengthM,
      color: ref.color ?? fallbackColor,
      jettisonAfterFirstStagingS:
        part.type === 'payload' ? part.jettisonAfterFirstStagingS : undefined,
    });
  };

  const stages: StageModel[] = spec.stages.map((s, stageIndex) => {
    let dryMassKg = 0;
    let propellantKg = 0;
    let propellantCapacityKg = 0;
    let diameterM = 0;
    let maxQ = DEFAULT_MAX_Q_PA;
    const engines: EngineGroup[] = [];

    for (const ref of s.parts) {
      const part = lookup(catalog, ref.part);
      const count = ref.count ?? 1;
      dryMassKg += part.massKg * count;
      if (part.maxDynamicPressurePa) maxQ = Math.min(maxQ, part.maxDynamicPressurePa);
      if (part.diameterM && part.type !== 'liquidEngine' && part.type !== 'aero')
        diameterM = Math.max(diameterM, part.diameterM);

      switch (part.type) {
        case 'liquidEngine':
          engines.push({ engine: part, count, exitAreaM2: engineExitArea(part) });
          break;
        case 'tank': {
          const cap = part.propellantCapacityKg * count;
          propellantCapacityKg += cap;
          propellantKg += Math.min(cap, ref.propellantKg ?? cap);
          addSegment(stageIndex, part, ref, s.color);
          break;
        }
        case 'aero':
          fins.push({
            stageIndex,
            count,
            spanM: part.diameterM ?? 3,
            rootM: part.lengthM ?? 6,
          });
          break;
        case 'structure':
          addSegment(stageIndex, part, ref, s.color);
          break;
        default:
          break;
      }
    }

    let boosters: BoosterGroup | undefined;
    if (s.boosters) {
      const b = lookup(catalog, s.boosters.part);
      if (b.type !== 'solidBooster') throw new Error(`"${b.id}" is not a solid booster`);
      boosters = makeBoosterGroup(b, s.boosters.count);
      if (b.maxDynamicPressurePa) maxQ = Math.min(maxQ, b.maxDynamicPressurePa);
    }

    const throttleMin = engines.length
      ? Math.max(...engines.map((g) => g.engine.throttleMin))
      : 1;

    return {
      name: s.name,
      color: s.color,
      dryMassKg,
      propellantKg,
      propellantCapacityKg,
      engines,
      boosters,
      diameterM,
      maxDynamicPressurePa: maxQ,
      throttleMin,
    };
  });

  let payloadMassKg = 0;
  let payloadMaxQ = DEFAULT_MAX_Q_PA;
  const jettisonables: Vehicle['jettisonables'] = [];
  for (const ref of spec.payload.parts) {
    const part = lookup(catalog, ref.part);
    const count = ref.count ?? 1;
    if (part.maxDynamicPressurePa) payloadMaxQ = Math.min(payloadMaxQ, part.maxDynamicPressurePa);
    const jettison = part.type === 'payload' ? (part as Payload).jettisonAfterFirstStagingS : undefined;
    if (jettison !== undefined) {
      jettisonables.push({ name: part.name, massKg: part.massKg * count, afterFirstStagingS: jettison });
    } else {
      payloadMassKg += part.massKg * count;
    }
    addSegment(-1, part, ref, '#e8eef7');
  }

  const heightM = segments.reduce((h, s) => h + s.lengthM, 0);
  const maxDiameterM = Math.max(...stages.map((s) => s.diameterM), 1);

  return {
    name: spec.name,
    stages,
    payloadMassKg,
    jettisonables,
    payloadMaxDynamicPressurePa: payloadMaxQ,
    segments,
    fins,
    heightM,
    maxDiameterM,
  };
}

/** Frontal area for drag: widest stage still attached plus any strap-on boosters. */
export function frontalAreaM2(vehicle: Vehicle, stageIndex: number, boostersAttached: boolean): number {
  let d = 0;
  for (let i = stageIndex; i < vehicle.stages.length; i++) d = Math.max(d, vehicle.stages[i].diameterM);
  if (stageIndex >= vehicle.stages.length) d = 4;
  let area = (Math.PI * d * d) / 4;
  const b = vehicle.stages[stageIndex]?.boosters;
  if (b && boostersAttached) {
    const bd = b.booster.diameterM ?? 3.7;
    area += (b.count * Math.PI * bd * bd) / 4;
  }
  return area;
}
