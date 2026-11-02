// Will it tumble? Centre of mass vs centre of pressure, and whether the steering can hold it.
//
// Centre of pressure uses the Barrowman method (nose and diameter changes, fins) plus
// Galejs body lift, which matters for long rockets at a few degrees angle of attack.
// Heights are measured up from the bottom of the whole stack.

import type { Vehicle } from './vehicle';

/** High-altitude wind shear the steering must be able to ride through. */
export const DESIGN_GUST_MS = 25;
/** Galejs body-lift coefficient. */
const BODY_LIFT_K = 1.1;
/** Fin tip chord as a fraction of the root chord (fins are not described in more detail). */
const FIN_TAPER = 1 / 3;
/** Attitude thrusters when the main engines are off: a small fraction of weight × length. */
export const RCS_FRACTION = 0.0001;

export interface StackState {
  stageIndex: number;
  boostersAttached: boolean;
  /** Booster propellant left, as a fraction of a full load. */
  boosterPropFraction: number;
  stagePropKg: number[];
  jettisoned: boolean[];
}

export interface Stability {
  /** Centre of mass height. */
  comM: number;
  /** Centre of pressure height at this angle of attack. */
  copM: number;
  /** Normal-force slope per radian, on refAreaM2. */
  cnAlpha: number;
  refAreaM2: number;
  /** Bottom of the stack still attached. */
  baseM: number;
  /** Total length still attached. */
  lengthM: number;
}

/** Supersonic fins lose lift roughly like Ackeret's 1/√(M²−1). */
function finMachFactor(mach: number): number {
  return mach <= 1.1 ? 1 : Math.min(1, 0.46 / Math.sqrt(mach * mach - 1));
}

export function stability(vehicle: Vehicle, st: StackState, mach: number, alphaRad: number): Stability {
  const k = st.stageIndex;
  const attached = (stageIndex: number, jettisonIndex?: number) =>
    (stageIndex >= k || stageIndex === -1) && (jettisonIndex === undefined || !st.jettisoned[jettisonIndex]);

  // ---- centre of mass ----
  let m = 0;
  let mx = 0;
  for (const p of vehicle.massPoints) {
    if (!attached(p.stageIndex, p.jettisonIndex)) continue;
    m += p.massKg;
    mx += p.massKg * p.xM;
  }
  for (const t of vehicle.tankSpans) {
    if (t.stageIndex < k) continue;
    const stage = vehicle.stages[t.stageIndex];
    const prop = st.stagePropKg[t.stageIndex] * t.share;
    const fill = stage.propellantCapacityKg > 0 ? st.stagePropKg[t.stageIndex] / stage.propellantCapacityKg : 0;
    m += prop;
    mx += prop * (t.bottomM + (fill * t.lengthM) / 2);
  }
  const stage = vehicle.stages[k];
  const b = stage?.boosters;
  const baseM = stage?.bottomM ?? 0;
  if (b && st.boostersAttached) {
    const len = b.booster.lengthM ?? 40;
    const mb = b.count * (b.dryMassKg + b.booster.propellantKg * st.boosterPropFraction);
    m += mb;
    // Solid propellant burns from the inside out, so its centre stays near the middle.
    mx += mb * (baseM + len / 2);
  }
  const comM = m > 0 ? mx / m : baseM;

  // ---- centre of pressure ----
  const segs = vehicle.segments.filter((s) => attached(s.stageIndex, s.jettisonIndex));
  const dRef = Math.max(1, ...segs.map((s) => Math.max(s.diameterBottomM, s.diameterTopM)));
  const refAreaM2 = (Math.PI * dRef * dRef) / 4;
  let cn = 0;
  let cnx = 0;
  const add = (c: number, x: number) => {
    cn += c;
    cnx += c * x;
  };

  // Walk down from the nose. Each diameter change is a Barrowman transition.
  let prevBottomD = 0;
  let planArea = 0;
  let planMoment = 0;
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const top = s.bottomM + s.lengthM;
    if (Math.abs(s.diameterTopM - prevBottomD) > 1e-3) {
      // A step at the joint (a blunt top counts as a step up from zero).
      add((2 * (s.diameterTopM ** 2 - prevBottomD ** 2)) / (dRef * dRef), top);
    }
    const d1 = s.diameterTopM;
    const d2 = s.diameterBottomM;
    if (Math.abs(d1 - d2) > 1e-3) {
      const r = d1 / d2;
      const xFromTop = (s.lengthM / 3) * (1 + (1 - r) / (1 - r * r));
      add((2 * (d2 * d2 - d1 * d1)) / (dRef * dRef), top - xFromTop);
    }
    prevBottomD = d2;
    const dAvg = (d1 + d2) / 2;
    planArea += s.lengthM * dAvg;
    planMoment += s.lengthM * dAvg * (s.bottomM + s.lengthM / 2);
  }

  if (b && st.boostersAttached) {
    const len = b.booster.lengthM ?? 40;
    const bd = b.booster.diameterM ?? 3.7;
    add((2 * b.count * bd * bd) / (dRef * dRef), baseM + len - 1.3 * bd);
    planArea += b.count * len * bd;
    planMoment += b.count * len * bd * (baseM + len / 2);
  }

  // Body lift grows with angle of attack, acting at the middle of the side view.
  const a = Math.abs(alphaRad);
  if (planArea > 0) add(((BODY_LIFT_K * planArea) / refAreaM2) * a, planMoment / planArea);

  for (const f of vehicle.fins) {
    if (f.stageIndex < k) continue;
    const d = vehicle.stages[f.stageIndex].diameterM || dRef;
    const s = f.spanM;
    const cr = f.rootM;
    const ct = cr * FIN_TAPER;
    const xr = cr - ct; // leading edge swept so the trailing edge is square
    const lm = Math.hypot(s, xr + ct / 2 - cr / 2);
    const rBody = d / 2;
    const cnFin =
      ((4 * f.count * (s / d) ** 2) / (1 + Math.sqrt(1 + ((2 * lm) / (cr + ct)) ** 2))) *
      (1 + rBody / (s + rBody)) *
      ((d * d) / (dRef * dRef)) *
      finMachFactor(mach);
    const xf = (xr * (cr + 2 * ct)) / (3 * (cr + ct)) + (cr + ct - (cr * ct) / (cr + ct)) / 6;
    add(cnFin, f.bottomM + cr - xf);
  }

  const top = segs.length ? segs[segs.length - 1].bottomM + segs[segs.length - 1].lengthM : baseM;
  return {
    comM,
    copM: cn > 0 ? cnx / cn : comM,
    cnAlpha: cn,
    refAreaM2,
    baseM,
    lengthM: top - baseM,
  };
}

/**
 * Turning push of the air about the centre of mass (positive = trying to flip it),
 * for a dynamic pressure and angle of attack.
 */
export function aeroMomentNm(s: Stability, qPa: number, alphaRad: number): number {
  return qPa * s.refAreaM2 * s.cnAlpha * Math.abs(alphaRad) * (s.copM - s.comM);
}
