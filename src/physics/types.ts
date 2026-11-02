// Shared types: parts catalog, rocket spec (input) and flight record (output).

// ---------- Parts catalog ----------

export type Confidence = 'published' | 'estimate';
export type Propellant = 'CH4/LOX' | 'RP-1/LOX' | 'LH2/LOX' | 'solid';
/** How a part is drawn: a cylinder, a cone/taper between two diameters, a capsule, or a tower. */
export type Shape = 'cylinder' | 'frustum' | 'capsule' | 'tower' | 'lander' | 'orbiter';

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
  /** How far the engine can swivel to steer (default 5°). */
  gimbalDeg?: number;
  /** Free-design engines: the catalog engine this one started from. */
  basedOn?: string;
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
  /** Nozzle steering range (default 5°). */
  gimbalDeg?: number;
  /** Set for a liquid-fuelled strap-on run at full thrust until empty (Falcon Heavy side boosters). */
  propellant?: Exclude<Propellant, 'solid'>;
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
  /** Own engine, for the Moon leg (service module). Propellant is included in massKg. */
  propulsion?: { propellantKg: number; ispS: number };
  /** Two-stage lander. All masses are included in massKg; the rest is the descent stage's dry mass. */
  lander?: { descentPropellantKg: number; ascentPropellantKg: number; ascentDryKg: number; ispS: number };
  /** Re-entry capsule heat shield, at heat-shield scale 1. */
  heatShield?: { massKg: number; maxHeatFluxWm2: number; maxHeatLoadJm2: number };
  /** Splashdown parachutes: total drag area (Cd × area) of the mains. */
  parachuteDragAreaM2?: number;
  /** Rides on the side of the stack instead of on top (the Shuttle orbiter). */
  sideMount?: boolean;
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
  /** Parachutes bring them down into the sea. */
  recovery?: 'none' | 'parachute';
}

export interface StageSpec {
  name: string;
  color: string;
  /** Bottom to top. */
  parts: PartRef[];
  boosters?: BoosterRef;
  recovery?: 'none' | 'parachute' | 'propulsive';
  /** Propulsive recovery: propellant held back at staging for the landing burns. */
  landingReserveKg?: number;
}

export interface MissionSpec {
  /** moonFlyby: loop around the Moon and come straight home, no landing (Artemis II). */
  target: 'orbit' | 'moon' | 'moonFlyby';
  targetOrbitAltitudeM: number;
  pitchKick: { timeS: number; angleDeg: number };
  /** Throttle liquid engines down while dynamic pressure is above a threshold. */
  maxQThrottle?: { aboveQPa: number; throttle: number };
  /** Throttle liquid engines down to keep the push under this many g. */
  maxAccelG?: number;
  /** Flight-path angle at the top of the atmosphere coming home (negative = downward). */
  reentryAngleDeg?: number;
}

export interface RocketSpec {
  id: string;
  name: string;
  description: string;
  launchSite: string;
  /** Bottom stage first. */
  stages: StageSpec[];
  /** Sits on top of the last stage. Bottom to top. */
  payload: { name: string; parts: PartRef[]; /** Heat-shield thickness, 1 = standard. */ heatShieldScale?: number };
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
  /** Angle between the nose and the oncoming air, plus the design gust. */
  aoaDeg: number;
  /** Air's turning push divided by what the steering can resist (above 1 = tumbles). */
  tumbleRatio: number;
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
  | 'impact'
  | 'engineOut'
  | 'systemCheck';

export interface FlightEvent {
  tS: number;
  type: EventType;
  label: string;
  stageIndex: number;
}

/** Ascent failures. */
export type FailureType = 'noLiftoff' | 'outOfFuel' | 'breakup' | 'crash' | 'tumble' | 'engineFailure';
/** Everything that can go wrong on the whole mission. */
export type MissionFailureType = FailureType | 'moonShort' | 'burnUp' | 'skipOut' | 'crewG' | 'crashLanding';

// ---------- Chaos Mode ----------

export type SystemName = 'engines' | 'tanks' | 'power' | 'guidance' | 'comms';

export type Fault =
  /** Engines shut down on a stage, some seconds after that stage lights. */
  | { kind: 'engineOut'; stageIndex: number; afterIgnitionS: number; engines: number }
  /** The top stage loses part of its leftover propellant while coasting in orbit. */
  | { kind: 'leak'; fraction: number }
  /** A system flags red at its check, then mission control resets it. */
  | { kind: 'glitch'; system: 'power' | 'guidance' | 'comms' };

export interface ChecklistItem {
  system: SystemName;
  tS: number;
  status: 'go' | 'fault';
  note: string;
  /** Glitches are cleared by mission control at this time. */
  clearedTS?: number;
}

/** A piece that came off the rocket at this moment, for the recovery simulation. */
export interface Separation {
  kind: 'boosters' | 'stage';
  stageIndex: number;
  tS: number;
  xM: number;
  yM: number;
  vxMS: number;
  vyMS: number;
  /** Propellant still in the piece (the landing reserve). */
  propellantKg: number;
}

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
    /** Worst air-twist / steering ratio (above 1 tumbles). */
    maxTumbleRatio: number;
    /** (Centre of mass − centre of pressure) / diameter at liftoff: positive means passively stable. */
    staticMarginCalibers: number;
  };
  durationS: number;
  separations: Separation[];
  /** Chaos Mode faults this flight was given. */
  faults: Fault[];
  /** Systems check while coasting in orbit (empty if orbit was not reached). */
  checklist: ChecklistItem[];
}
