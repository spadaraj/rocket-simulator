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
const DEFAULT_GIMBAL_DEG = 5;
/** Shuttle SRB recovery system: drogue, three 41 m mains, frustum and flotation. */
export const BOOSTER_CHUTE_MASS_KG = 4000;
/** Three 41 m mains at Cd ≈ 0.8: splashdown near 23 m/s like the Shuttle SRBs. */
export const BOOSTER_CHUTE_DRAG_AREA_M2 = 3170;
/** Touchdown limit when a stage tries to land without legs. */
const NO_LEGS_LIMIT_MS = 1;

export interface EngineGroup {
  engine: LiquidEngine;
  count: number;
  /** Effective nozzle exit area, from the sea-level vs vacuum thrust difference. */
  exitAreaM2: number;
  gimbalRad: number;
}

export interface BoosterGroup {
  booster: SolidBooster;
  count: number;
  /** Vacuum thrust of one booster at a given fraction of its burn. */
  vacuumThrustAt: (burnFraction: number) => number;
  /** Fraction of propellant used after a given fraction of the burn. */
  propellantUsedAt: (burnFraction: number) => number;
  gimbalRad: number;
  /** Parachutes fitted (their mass is included in massKg below). */
  parachutes: boolean;
  /** Inert mass of one booster, parachutes included. */
  dryMassKg: number;
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
  recovery: 'none' | 'parachute' | 'propulsive';
  /** Propellant held back for landing (propulsive recovery only). */
  landingReserveKg: number;
  /** Highest touchdown speed the landing legs take (0 = no legs). */
  legLimitMS: number;
  /** Height of the stage's bottom above the bottom of the whole stack. */
  bottomM: number;
  lengthM: number;
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
  /** Index into Vehicle.jettisonables, for parts that leave in flight. */
  jettisonIndex?: number;
  /** Height of the segment's bottom above the bottom of the stack. */
  bottomM: number;
}

/** A dry mass at a height in the stack, for the centre of mass. */
export interface MassPoint {
  stageIndex: number; // -1 = payload
  jettisonIndex?: number;
  xM: number;
  massKg: number;
}

/** Where a stage's propellant sits: tanks as spans of the stack. */
export interface TankSpan {
  stageIndex: number;
  bottomM: number;
  lengthM: number;
  /** Share of the stage's propellant held in this tank. */
  share: number;
}

export interface FinSet {
  stageIndex: number;
  count: number;
  spanM: number;
  rootM: number;
  /** Height of the fins' trailing edge above the bottom of the stack. */
  bottomM: number;
}

/** A payload riding beside the stack (the Shuttle orbiter), drawn next to the bottom stage. */
export interface SidePayload {
  name: string;
  lengthM: number;
  diameterM: number;
  color: string;
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
  massPoints: MassPoint[];
  tankSpans: TankSpan[];
  sidePayload?: SidePayload;
}

/** The shared catalog plus this rocket's own free-design parts. */
export function resolveCatalog(spec: RocketSpec, catalog: Catalog): Catalog {
  if (!spec.customParts?.length) return catalog;
  return { ...catalog, ...Object.fromEntries(spec.customParts.map((p) => [p.id, p])) };
}

function lookup(catalog: Catalog, id: string): Part {
  const part = catalog[id];
  if (!part) throw new Error(`Unknown part "${id}"`);
  return part;
}

export function engineExitArea(engine: LiquidEngine): number {
  return Math.max(0, (engine.thrustVacuumN - engine.thrustSeaLevelN) / P0_PA);
}

export function makeBoosterGroup(booster: SolidBooster, count: number, parachutes = false): BoosterGroup {
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
  return {
    booster,
    count,
    vacuumThrustAt: (f) => relAt(f) * scaleN,
    propellantUsedAt: usedAt,
    gimbalRad: ((booster.gimbalDeg ?? DEFAULT_GIMBAL_DEG) * Math.PI) / 180,
    parachutes,
    dryMassKg: booster.massKg + (parachutes ? BOOSTER_CHUTE_MASS_KG : 0),
  };
}

function partShape(part: Part): Shape {
  if (part.shape) return part.shape;
  return 'cylinder';
}

export function buildVehicle(spec: RocketSpec, baseCatalog: Catalog): Vehicle {
  const catalog = resolveCatalog(spec, baseCatalog);
  const segments: Segment[] = [];
  const fins: FinSet[] = [];
  const massPoints: MassPoint[] = [];
  const tankSpans: TankSpan[] = [];
  let topM = 0;

  /** Adds a drawn segment; returns the height of its middle (or the current top if not drawn). */
  const addSegment = (stageIndex: number, part: Part, ref: PartRef, fallbackColor: string, jettisonIndex?: number): number => {
    if (!part.lengthM || !part.diameterM) return topM;
    const bottomM = topM;
    topM += part.lengthM;
    segments.push({
      bottomM,
      jettisonIndex,
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
    return bottomM + part.lengthM / 2;
  };

  const stages: StageModel[] = spec.stages.map((s, stageIndex) => {
    let dryMassKg = 0;
    let propellantKg = 0;
    let propellantCapacityKg = 0;
    let diameterM = 0;
    let maxQ = DEFAULT_MAX_Q_PA;
    let legLimitMS = 0;
    const engines: EngineGroup[] = [];
    const bottomM = topM;
    const stageTanks: { bottomM: number; lengthM: number; cap: number }[] = [];

    for (const ref of s.parts) {
      const part = lookup(catalog, ref.part);
      const count = ref.count ?? 1;
      dryMassKg += part.massKg * count;
      if (part.maxDynamicPressurePa) maxQ = Math.min(maxQ, part.maxDynamicPressurePa);
      if (part.diameterM && part.type !== 'liquidEngine' && part.type !== 'aero')
        diameterM = Math.max(diameterM, part.diameterM);

      // Engines, fins and legs sit at the bottom of the stage; drawn parts at their middle.
      let xM = bottomM + 1;
      switch (part.type) {
        case 'liquidEngine':
          engines.push({
            engine: part,
            count,
            exitAreaM2: engineExitArea(part),
            gimbalRad: ((part.gimbalDeg ?? DEFAULT_GIMBAL_DEG) * Math.PI) / 180,
          });
          break;
        case 'tank': {
          const cap = part.propellantCapacityKg * count;
          propellantCapacityKg += cap;
          propellantKg += Math.min(cap, ref.propellantKg ?? cap);
          const tankBottom = topM;
          xM = addSegment(stageIndex, part, ref, s.color);
          stageTanks.push({ bottomM: tankBottom, lengthM: part.lengthM ?? 0, cap });
          break;
        }
        case 'aero':
          fins.push({
            stageIndex,
            count,
            spanM: part.diameterM ?? 3,
            rootM: part.lengthM ?? 6,
            bottomM,
          });
          xM = bottomM + (part.lengthM ?? 6) / 3;
          break;
        case 'recovery':
          if (part.maxTouchdownSpeedMS) legLimitMS = Math.max(legLimitMS, part.maxTouchdownSpeedMS);
          break;
        case 'structure':
          xM = addSegment(stageIndex, part, ref, s.color);
          break;
        default:
          break;
      }
      massPoints.push({ stageIndex, xM, massKg: part.massKg * count });
    }
    for (const t of stageTanks)
      tankSpans.push({ stageIndex, bottomM: t.bottomM, lengthM: t.lengthM, share: propellantCapacityKg > 0 ? t.cap / propellantCapacityKg : 0 });

    let boosters: BoosterGroup | undefined;
    if (s.boosters) {
      const b = lookup(catalog, s.boosters.part);
      if (b.type !== 'solidBooster') throw new Error(`"${b.id}" is not a strap-on booster`);
      boosters = makeBoosterGroup(b, s.boosters.count, s.boosters.recovery === 'parachute');
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
      recovery: s.recovery ?? 'none',
      landingReserveKg: s.recovery === 'propulsive' ? Math.min(propellantKg, s.landingReserveKg ?? 0) : 0,
      legLimitMS: legLimitMS || NO_LEGS_LIMIT_MS,
      bottomM,
      lengthM: topM - bottomM,
    };
  });

  const heatShieldScale = spec.payload.heatShieldScale ?? 1;
  let payloadMassKg = 0;
  let payloadMaxQ = DEFAULT_MAX_Q_PA;
  const jettisonables: Vehicle['jettisonables'] = [];
  let sidePayload: SidePayload | undefined;
  for (const ref of spec.payload.parts) {
    const part = lookup(catalog, ref.part);
    const count = ref.count ?? 1;
    if (part.maxDynamicPressurePa) payloadMaxQ = Math.min(payloadMaxQ, part.maxDynamicPressurePa);
    const jettison = part.type === 'payload' ? (part as Payload).jettisonAfterFirstStagingS : undefined;
    let jettisonIndex: number | undefined;
    let massKg = part.massKg * count;
    if (part.type === 'payload' && part.heatShield) massKg += part.heatShield.massKg * (heatShieldScale - 1);
    if (jettison !== undefined) {
      jettisonIndex = jettisonables.length;
      jettisonables.push({ name: part.name, massKg, afterFirstStagingS: jettison });
    } else {
      payloadMassKg += massKg;
    }
    if (part.type === 'payload' && part.sideMount) {
      sidePayload = { name: part.name, lengthM: part.lengthM ?? 30, diameterM: part.diameterM ?? 5, color: ref.color ?? '#f4f6fa' };
      massPoints.push({ stageIndex: -1, xM: (part.lengthM ?? 30) * 0.45, massKg });
      continue;
    }
    // Parts that are not drawn (the lander) ride inside the segment below them.
    const lastSeg = segments[segments.length - 1];
    const before = topM;
    const xM = addSegment(-1, part, ref, '#e8eef7', jettisonIndex);
    massPoints.push({
      stageIndex: -1,
      jettisonIndex,
      xM: topM > before ? xM : lastSeg ? lastSeg.bottomM + lastSeg.lengthM / 2 : topM,
      massKg,
    });
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
    massPoints,
    tankSpans,
    sidePayload,
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
  if (vehicle.sidePayload) area += (Math.PI * vehicle.sidePayload.diameterM ** 2) / 4;
  return area;
}
