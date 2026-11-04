// The solar system, flat: circular orbits in one plane around the Sun. Good enough for
// transfer budgets and launch windows; real orbits are a little stretched and tilted.

export const AU_M = 1.495978707e11;
export const MU_SUN_M3S2 = 1.32712440018e20;
const DAY_S = 86400;

export type BodyId = 'mercury' | 'venus' | 'earth' | 'mars' | 'vesta' | 'ceres' | 'rock' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

export interface Body {
  id: BodyId;
  name: string;
  emoji: string;
  aAU: number;
  muM3S2: number;
  radiusM: number;
  color: string;
  /** Drawn size on the map, in pixels. */
  drawPx: number;
  /** Air: thin (Mars) or crushing (Venus). Undefined means none worth counting. */
  air?: 'thin' | 'thick';
  /** Where an orbiter parks: periapsis and apoapsis heights. Small bodies use a low circle. */
  captureOrbit: { periAltM: number; apoAltM: number };
}

// Sources: NASA planetary fact sheets; Dawn (Vesta, Ceres); MRO and MESSENGER capture orbits.
export const BODIES: Record<BodyId, Body> = {
  mercury: { id: 'mercury', name: 'Mercury', emoji: '☿️', aAU: 0.387, muM3S2: 2.2032e13, radiusM: 2.4397e6, color: '#a9a29a', drawPx: 6, captureOrbit: { periAltM: 200e3, apoAltM: 15200e3 } },
  venus: { id: 'venus', name: 'Venus', emoji: '🟡', aAU: 0.723, muM3S2: 3.24859e14, radiusM: 6.0518e6, color: '#e8c56a', drawPx: 9, air: 'thick', captureOrbit: { periAltM: 300e3, apoAltM: 60000e3 } },
  earth: { id: 'earth', name: 'Earth', emoji: '🌍', aAU: 1, muM3S2: 3.986004418e14, radiusM: 6.378137e6, color: '#3f8fe0', drawPx: 9, captureOrbit: { periAltM: 200e3, apoAltM: 200e3 } },
  mars: { id: 'mars', name: 'Mars', emoji: '🔴', aAU: 1.524, muM3S2: 4.282837e13, radiusM: 3.3895e6, color: '#e2622b', drawPx: 7, air: 'thin', captureOrbit: { periAltM: 300e3, apoAltM: 45000e3 } },
  vesta: { id: 'vesta', name: 'Vesta', emoji: '🪨', aAU: 2.362, muM3S2: 1.729e10, radiusM: 2.627e5, color: '#bfb6a8', drawPx: 4, captureOrbit: { periAltM: 200e3, apoAltM: 200e3 } },
  ceres: { id: 'ceres', name: 'Ceres', emoji: '⚪', aAU: 2.766, muM3S2: 6.263e10, radiusM: 4.73e5, color: '#d8d2c4', drawPx: 5, captureOrbit: { periAltM: 200e3, apoAltM: 200e3 } },
  // Space Q's made-up target: a little rock in the inner belt, a few hundred metres across.
  rock: { id: 'rock', name: 'Space rock Q-7', emoji: '🪨', aAU: 2.4, muM3S2: 5, radiusM: 300, color: '#9c8f7e', drawPx: 3, captureOrbit: { periAltM: 1e3, apoAltM: 1e3 } },
  jupiter: { id: 'jupiter', name: 'Jupiter', emoji: '🟠', aAU: 5.203, muM3S2: 1.26687e17, radiusM: 7.1492e7, color: '#d9a066', drawPx: 14, captureOrbit: { periAltM: 4e6, apoAltM: 8e9 } },
  saturn: { id: 'saturn', name: 'Saturn', emoji: '🪐', aAU: 9.537, muM3S2: 3.7931e16, radiusM: 6.0268e7, color: '#e6cf8f', drawPx: 12, captureOrbit: { periAltM: 2e7, apoAltM: 9e9 } },
  uranus: { id: 'uranus', name: 'Uranus', emoji: '🔵', aAU: 19.19, muM3S2: 5.794e15, radiusM: 2.5559e7, color: '#8fd3dc', drawPx: 10, captureOrbit: { periAltM: 2e7, apoAltM: 2e9 } },
  neptune: { id: 'neptune', name: 'Neptune', emoji: '🔵', aAU: 30.07, muM3S2: 6.8365e15, radiusM: 2.4764e7, color: '#4f7bd8', drawPx: 10, captureOrbit: { periAltM: 2e7, apoAltM: 2e9 } },
};

/** The asteroid belt, as a ring (AU). */
export const BELT_AU = { inner: 2.1, outer: 3.3 };

export const rM = (b: BodyId) => BODIES[b].aAU * AU_M;
/** Circular orbit speed around the Sun. */
export const vCircSun = (rMeters: number) => Math.sqrt(MU_SUN_M3S2 / rMeters);
/** Angular speed around the Sun, radians per day. */
export const nPerDay = (b: BodyId) => Math.sqrt(MU_SUN_M3S2 / rM(b) ** 3) * DAY_S;
/** Days between launch windows (when the two line up the same way again). */
export const synodicDays = (b: BodyId) => (2 * Math.PI) / Math.abs(nPerDay('earth') - nPerDay(b));

export type Vec = [number, number];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const norm = (a: Vec) => Math.hypot(a[0], a[1]);

/** Position and velocity of a body on its circular orbit at this angle. */
export function bodyState(b: BodyId, angle: number): { r: Vec; v: Vec } {
  const r = rM(b);
  const v = vCircSun(r);
  return { r: [r * Math.cos(angle), r * Math.sin(angle)], v: [-v * Math.sin(angle), v * Math.cos(angle)] };
}

/** Hohmann transfer between two circular orbits around the Sun: speeds relative to each planet, and time. */
export function hohmannSun(r1: number, r2: number) {
  const a = (r1 + r2) / 2;
  const vPeri = Math.sqrt(MU_SUN_M3S2 * (2 / r1 - 1 / a));
  const vApo = Math.sqrt(MU_SUN_M3S2 * (2 / r2 - 1 / a));
  return { vInfDepMS: Math.abs(vPeri - vCircSun(r1)), vInfArrMS: Math.abs(vCircSun(r2) - vApo), tofDays: (Math.PI * Math.sqrt(a ** 3 / MU_SUN_M3S2)) / DAY_S };
}

// ---------- Lambert's problem: which orbit joins two points in a given time ----------

function stumpffC(z: number) {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2;
}
function stumpffS(z: number) {
  if (z > 1e-8) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / s ** 3;
  }
  if (z < -1e-8) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / s ** 3;
  }
  return 1 / 6;
}

/**
 * Prograde, single-revolution Lambert solution (universal variables, Curtis Algorithm 5.2),
 * in the plane. Returns the velocities at both ends, or null if there is none.
 */
export function lambert(r1: Vec, r2: Vec, tofS: number, mu = MU_SUN_M3S2): { v1: Vec; v2: Vec } | null {
  const n1 = norm(r1);
  const n2 = norm(r2);
  const cross = r1[0] * r2[1] - r1[1] * r2[0];
  let dTheta = Math.acos(Math.max(-1, Math.min(1, (r1[0] * r2[0] + r1[1] * r2[1]) / (n1 * n2))));
  if (cross < 0) dTheta = 2 * Math.PI - dTheta;
  // Exactly opposite points make the formula divide by zero; nudge a hair.
  if (Math.abs(Math.sin(dTheta)) < 1e-5) dTheta += 2e-5;
  const A = Math.sin(dTheta) * Math.sqrt((n1 * n2) / (1 - Math.cos(dTheta)));
  const y = (z: number) => n1 + n2 + (A * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));
  const tof = (z: number) => {
    const yz = y(z);
    if (yz < 0) return -Infinity;
    return ((yz / stumpffC(z)) ** 1.5 * stumpffS(z) + A * Math.sqrt(yz)) / Math.sqrt(mu);
  };
  let lo = -4 * Math.PI ** 2;
  let hi = 4 * Math.PI ** 2 - 1e-6;
  // Make sure y is positive at the low end.
  if (y(lo) < 0) {
    let a = lo;
    let b = 0;
    for (let k = 0; k < 80; k++) {
      const m = (a + b) / 2;
      if (y(m) < 0) a = m;
      else b = m;
    }
    lo = b;
  }
  if (tof(lo) > tofS || tof(hi) < tofS) return null;
  for (let k = 0; k < 100; k++) {
    const m = (lo + hi) / 2;
    if (tof(m) < tofS) lo = m;
    else hi = m;
  }
  const z = (lo + hi) / 2;
  const yz = y(z);
  const f = 1 - yz / n1;
  const g = A * Math.sqrt(yz / mu);
  const gdot = 1 - yz / n2;
  return {
    v1: [(r2[0] - f * r1[0]) / g, (r2[1] - f * r1[1]) / g],
    v2: [(gdot * r2[0] - r1[0]) / g, (gdot * r2[1] - r1[1]) / g],
  };
}

// ---------- Burns at each end ----------

/** Leave a circular parking orbit with this much leftover speed (hyperbolic excess). */
export function departureDvMS(vInfMS: number, parkingAltM: number, from: BodyId = 'earth') {
  const b = BODIES[from];
  const r = b.radiusM + parkingAltM;
  return Math.sqrt(vInfMS ** 2 + (2 * b.muM3S2) / r) - Math.sqrt(b.muM3S2 / r);
}

/** Brake from this approach speed into the body's parking orbit (periapsis burn). */
export function captureDvMS(vInfMS: number, to: BodyId) {
  const b = BODIES[to];
  const rp = b.radiusM + b.captureOrbit.periAltM;
  const ra = b.radiusM + b.captureOrbit.apoAltM;
  const a = (rp + ra) / 2;
  return Math.sqrt(vInfMS ** 2 + (2 * b.muM3S2) / rp) - Math.sqrt(b.muM3S2 * (2 / rp - 1 / a));
}

/** Speed of a low circular orbit, for spiralling in or out with an ion engine. */
export const lowOrbitSpeedMS = (b: BodyId) => Math.sqrt(BODIES[b].muM3S2 / (BODIES[b].radiusM + BODIES[b].captureOrbit.periAltM));

// ---------- Launch windows ----------

export interface Transfer {
  /** Leftover speed leaving Earth, and arriving at the target. */
  vInfDepMS: number;
  vInfArrMS: number;
  tofDays: number;
  /** Where the planets are on launch day (radians; Earth's angle and the target's). */
  earthAngle: number;
  targetAngle: number;
  /** Starting velocity around the Sun, to draw the path. */
  r1: Vec;
  v1: Vec;
}

/** Where the target sits relative to Earth when the window is open (Hohmann geometry). */
export function windowPhase(target: BodyId) {
  const h = hohmannSun(rM('earth'), rM(target));
  return Math.PI - nPerDay(target) * h.tofDays;
}

/** Wrap an offset into the nearest window: -half a cycle to +half a cycle. */
export function wrapOffsetDays(target: BodyId, offsetDays: number) {
  const s = synodicDays(target);
  return offsetDays - s * Math.round(offsetDays / s);
}

/**
 * The cheapest transfer for a launch this many days after the window opens.
 * `withCapture` adds the braking at the far end to what gets minimised.
 */
export function bestTransfer(target: BodyId, offsetDays: number, parkingAltM: number, withCapture: boolean): Transfer {
  const d = wrapOffsetDays(target, offsetDays);
  const earthAngle = nPerDay('earth') * d;
  const targetAngle = windowPhase(target) + nPerDay(target) * d;
  const h = hohmannSun(rM('earth'), rM(target));
  const e = bodyState('earth', earthAngle);
  let best: Transfer | null = null;
  let bestCost = Infinity;
  const consider = (tofDays: number) => {
    const arr = bodyState(target, targetAngle + nPerDay(target) * tofDays);
    const sol = lambert(e.r, arr.r, tofDays * DAY_S);
    if (!sol) return;
    const vInfDepMS = norm(sub(sol.v1, e.v));
    const vInfArrMS = norm(sub(sol.v2, arr.v));
    const cost = departureDvMS(vInfDepMS, parkingAltM) + (withCapture ? captureDvMS(vInfArrMS, target) : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = { vInfDepMS, vInfArrMS, tofDays, earthAngle, targetAngle, r1: e.r, v1: sol.v1 };
    }
  };
  for (let k = 0; k <= 60; k++) consider(h.tofDays * (0.45 + (1.2 * k) / 60));
  // Refine around the best guess.
  const t0 = (best as Transfer | null)?.tofDays ?? h.tofDays;
  for (let k = -10; k <= 10; k++) consider(t0 * (1 + k * 0.002));
  return best!;
}

/** Push to leave Earth for this target if launching on the best day of the window. */
export const windowDepartureDvMS = (target: BodyId, parkingAltM: number, withCapture: boolean) =>
  departureDvMS(bestTransfer(target, 0, parkingAltM, withCapture).vInfDepMS, parkingAltM);

/** Move a point forward along a two-body orbit around the Sun (for drawing paths). */
export function propagate(r: Vec, v: Vec, days: number, steps = 200): Vec[] {
  const out: Vec[] = [r];
  let [x, y] = r;
  let [vx, vy] = v;
  const sub_ = 20;
  const h = (days * DAY_S) / steps / sub_;
  const acc = (px: number, py: number): Vec => {
    const k = -MU_SUN_M3S2 / Math.hypot(px, py) ** 3;
    return [k * px, k * py];
  };
  let a = acc(x, y);
  // Velocity Verlet: steady and plenty accurate for a picture.
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < sub_; j++) {
      vx += (a[0] * h) / 2;
      vy += (a[1] * h) / 2;
      x += vx * h;
      y += vy * h;
      a = acc(x, y);
      vx += (a[0] * h) / 2;
      vy += (a[1] * h) / 2;
    }
    out.push([x, y]);
  }
  return out;
}

export { DAY_S };
