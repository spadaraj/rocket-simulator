/** State vector: [xM, yM, vxMS, vyMS, massKg]. */
export type State = [number, number, number, number, number];

/** Time derivative of the state at `tOffsetS` seconds into the current step. */
export type Derivative = (s: State, tOffsetS: number) => State;

function axpy(s: State, k: State, h: number): State {
  return [s[0] + k[0] * h, s[1] + k[1] * h, s[2] + k[2] * h, s[3] + k[3] * h, s[4] + k[4] * h];
}

/** Classic fourth-order Runge–Kutta step. */
export function rk4Step(s: State, dtS: number, f: Derivative): State {
  const k1 = f(s, 0);
  const k2 = f(axpy(s, k1, dtS / 2), dtS / 2);
  const k3 = f(axpy(s, k2, dtS / 2), dtS / 2);
  const k4 = f(axpy(s, k3, dtS), dtS);
  const out = [0, 0, 0, 0, 0] as State;
  for (let i = 0; i < 5; i++) out[i] = s[i] + (dtS / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}
