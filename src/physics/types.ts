// Shared types: parts catalog, rocket spec (input) and flight record (output).

// ---------- Parts catalog ----------

export type Confidence = 'published' | 'estimate';
export type Propellant = 'CH4/LOX' | 'RP-1/LOX' | 'LH2/LOX' | 'solid';
/** How a part is drawn: a cylinder, a cone/taper between two diameters, a capsule, or a tower. */
export type Shape = 'cylinder' | 'frustum' | 'capsule' | 'tower' | 'lander';

interface PartBase {
  id: string;
  name: string;
  /** Inert (dry) mass of one part. */
  massKg: number;
  diameterM?: number;
  /** Top diameter for tapered parts (frustum, capsule, tower). */
  diameterTopM?: number;
  lengthM?: number;
  shape?: Shape;
  /** Highest dynamic pressure the part survives. */
  maxDynamicPressurePa?: number;
  source: string;
  confidence: Confidence;
  notes?: string;
}

export interface LiquidEngine extends PartBase {
  type: 'liquidEngine';
  propellant: Exclude<Propellant, 'solid'>;
  thrustSeaLevelN: number;
  thrustVacuumN: number;
  ispSeaLevelS: number;
  ispVacuumS: number;
  throttleMin: number;
  restartable: boolean;
  /** Vacuum-optimised nozzle: not meant to fire in thick air. */
  vacuumOnly?: boolean;
}

export interface SolidBooster extends PartBase {
  type: 'solidBooster';
  propellantKg: number;
  burnTimeS: number;
  ispSeaLevelS: number;
  ispVacuumS: number;
  nozzleExitAreaM2: number;
  /** [fraction of burn time, relative thrust]. Scaled so the burn uses exactly propellantKg. */
  thrustCurve: [number, number][];
}

export interface Tank extends PartBase {
  type: 'tank';
  propellant: Exclude<Propellant, 'solid'>;
  propellantCapacityKg: number;
}

export interface Structure extends PartBase {
  type: 'structure';
}

export interface Payload extends PartBase {
  type: 'payload';
  crew?: number;
  /** Jettisoned this many seconds after the first staging (e.g. the escape tower). */
  jettisonAfterFirstStagingS?: number;
}

export interface AeroPart extends PartBase {
  type: 'aero';
  areaM2?: number;
}

export interface RecoveryPart extends PartBase {
  type: 'recovery';
  maxTouchdownSpeedMS?: number;
}

export type Part = LiquidEngine | SolidBooster | Tank | Structure | Payload | AeroPart | RecoveryPart;
export type Catalog = Record<string, Part>;

// ---------- Rocket spec ----------

export interface PartRef {
  part: string;
  count?: number;
  /** Tanks only: propellant loaded, if less than full. */
  propellantKg?: number;
  /** Drawing colour override. */
  color?: string;
}

export interface BoosterRef {
  part: string;
  count: number;
  separate: 'onBurnout';
  color?: string;
}

export interface StageSpec {
  name: string;
  color: string;
  /** Bottom to top. */
  parts: PartRef[];
  boosters?: BoosterRef;
  recovery?: 'none' | 'parachute' | 'propulsive';
}

export interface MissionSpec {
  target: 'orbit' | 'moon';
  targetOrbitAltitudeM: number;
  pitchKick: { timeS: number; angleDeg: number };
  /** Throttle liquid engines down while dynamic pressure is above a threshold. */
  maxQThrottle?: { aboveQPa: number; throttle: number };
}

export interface RocketSpec {
  id: string;
  name: string;
  description: string;
  launchSite: string;
  /** Bottom stage first. */
  stages: StageSpec[];
  /** Sits on top of the last stage. Bottom to top. */
  payload: { name: string; parts: PartRef[] };
  mission: MissionSpec;
  /** Parts designed for this rocket (free-design tanks), layered over the catalog. */
  customParts?: Part[];
  notes?: string[];
}

// ---------- Flight record ----------

export interface Sample {
  tS: number;
  xM: number;
  yM: number;
  vxMS: number;
  vyMS: number;
  /** Attitude (nose direction) unit vector. */
  ux: number;
  uy: number;
  altitudeM: number;
  downrangeM: number;
  speedMS: number;
  airSpeedMS: number;
  mach: number;
  dynamicPressurePa: number;
  gLoad: number;
  massKg: number;
  thrustN: number;
  throttle: number;
  stageIndex: number;
  boostersAttached: boolean;
  /** Propellant fraction left per stage, then boosters last (or -1 if no boosters). */
  propellantFraction: number[];
  perigeeAltM: number;
  apogeeAltM: number;
}

export type EventType =
  | 'ignition'
  | 'liftoff'
  | 'pitchKick'
  | 'maxQ'
  | 'boosterSeparation'
  | 'stageBurnout'
  | 'staging'
  | 'jettison'
  | 'engineCutoff'
  | 'orbit'
  | 'failure'
  | 'impact';

export interface FlightEvent {
  tS: number;
  type: EventType;
  label: string;
  stageIndex: number;
}

export type FailureType = 'noLiftoff' | 'outOfFuel' | 'breakup' | 'crash';

export interface Failure {
  type: FailureType;
  tS: number;
  /** Numbers behind the failure, for Engineer mode. */
  detail: Record<string, number | string>;
}

export interface Outcome {
  success: boolean;
  failure?: Failure;
  orbit?: { perigeeAltM: number; apogeeAltM: number };
  /** Propellant left in the last stage at the end, for the Moon-leg ledger. */
  remainingPropellantKg: number;
  remainingDeltaVMS: number;
}

export interface FlightRecord {
  rocketName: string;
  samples: Sample[];
  events: FlightEvent[];
  outcome: Outcome;
  summary: {
    liftoffMassKg: number;
    liftoffThrustN: number;
    liftoffTWR: number;
    maxQPa: number;
    maxQTimeS: number;
    maxQAltitudeM: number;
    maxGLoad: number;
    structuralLimitPa: number;
  };
  durationS: number;
}
