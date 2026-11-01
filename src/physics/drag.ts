// Generic launch-vehicle drag coefficient vs Mach, with the transonic peak.
// Shape follows typical wind-tunnel data for blunt-nosed boosters (e.g. Saturn V, Ariane);
// absolute values are an estimate and get tuned in golden-flight validation.

const CD_TABLE: [number, number][] = [
  [0, 0.3],
  [0.6, 0.3],
  [0.8, 0.35],
  [1.0, 0.52],
  [1.15, 0.6],
  [1.5, 0.5],
  [2.0, 0.4],
  [3.0, 0.33],
  [5.0, 0.28],
  [10.0, 0.25],
];

export function dragCoefficient(mach: number): number {
  if (mach <= CD_TABLE[0][0]) return CD_TABLE[0][1];
  for (let i = 1; i < CD_TABLE.length; i++) {
    const [m1, c1] = CD_TABLE[i];
    if (mach <= m1) {
      const [m0, c0] = CD_TABLE[i - 1];
      return c0 + ((mach - m0) / (m1 - m0)) * (c1 - c0);
    }
  }
  return CD_TABLE[CD_TABLE.length - 1][1];
}
