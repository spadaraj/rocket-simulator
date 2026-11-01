// US Standard Atmosphere 1976.
// Below 86 km: the seven-layer analytic model (geopotential altitude).
// 86–1000 km: log-linear interpolation of the published tables.

import { G0_MS2 } from './constants';

const R_AIR_JKGK = 287.053;
const GAMMA_AIR = 1.4;
const R0_GEOPOTENTIAL_M = 6356766;
const LOWER_MODEL_TOP_M = 86000;

interface Layer {
  baseGeopotentialM: number;
  baseTempK: number;
  lapseKPerM: number;
  basePressurePa: number;
}

const LAYERS: Layer[] = [
  { baseGeopotentialM: 0, baseTempK: 288.15, lapseKPerM: -0.0065, basePressurePa: 101325 },
  { baseGeopotentialM: 11000, baseTempK: 216.65, lapseKPerM: 0, basePressurePa: 22632.06 },
  { baseGeopotentialM: 20000, baseTempK: 216.65, lapseKPerM: 0.001, basePressurePa: 5474.889 },
  { baseGeopotentialM: 32000, baseTempK: 228.65, lapseKPerM: 0.0028, basePressurePa: 868.0187 },
  { baseGeopotentialM: 47000, baseTempK: 270.65, lapseKPerM: 0, basePressurePa: 110.9063 },
  { baseGeopotentialM: 51000, baseTempK: 270.65, lapseKPerM: -0.0028, basePressurePa: 66.93887 },
  { baseGeopotentialM: 71000, baseTempK: 214.65, lapseKPerM: -0.002, basePressurePa: 3.95642 },
];

// [geometric altitude m, temperature K, pressure Pa, density kg/m^3]
const UPPER_TABLE: [number, number, number, number][] = [
  [86000, 186.87, 0.37338, 6.958e-6],
  [90000, 186.87, 0.18359, 3.416e-6],
  [100000, 195.08, 0.032011, 5.604e-7],
  [110000, 240.0, 0.0071042, 9.708e-8],
  [120000, 360.0, 0.0025382, 2.222e-8],
  [150000, 634.39, 4.5422e-4, 2.076e-9],
  [200000, 854.56, 8.4736e-5, 2.541e-10],
  [300000, 976.01, 8.7704e-6, 1.916e-11],
  [400000, 995.83, 1.4518e-6, 2.803e-12],
  [500000, 999.24, 3.0236e-7, 5.215e-13],
  [600000, 999.85, 8.213e-8, 1.137e-13],
  [700000, 999.97, 3.1908e-8, 3.07e-14],
  [800000, 999.99, 1.7036e-8, 1.136e-14],
  [1000000, 1000.0, 7.5138e-9, 3.561e-15],
];

export interface AtmosphereState {
  temperatureK: number;
  pressurePa: number;
  densityKgM3: number;
  speedOfSoundMS: number;
}

export const VACUUM: AtmosphereState = {
  temperatureK: 0,
  pressurePa: 0,
  densityKgM3: 0,
  speedOfSoundMS: 300,
};

function lowerAtmosphere(altitudeM: number): AtmosphereState {
  const h = (R0_GEOPOTENTIAL_M * altitudeM) / (R0_GEOPOTENTIAL_M + altitudeM);
  let layer = LAYERS[0];
  for (const l of LAYERS) if (h >= l.baseGeopotentialM) layer = l;
  const dh = h - layer.baseGeopotentialM;
  const temperatureK = layer.baseTempK + layer.lapseKPerM * dh;
  const pressurePa =
    layer.lapseKPerM === 0
      ? layer.basePressurePa * Math.exp((-G0_MS2 * dh) / (R_AIR_JKGK * layer.baseTempK))
      : layer.basePressurePa *
        Math.pow(layer.baseTempK / temperatureK, G0_MS2 / (R_AIR_JKGK * layer.lapseKPerM));
  return {
    temperatureK,
    pressurePa,
    densityKgM3: pressurePa / (R_AIR_JKGK * temperatureK),
    speedOfSoundMS: Math.sqrt(GAMMA_AIR * R_AIR_JKGK * temperatureK),
  };
}

function upperAtmosphere(altitudeM: number): AtmosphereState {
  let i = 0;
  while (i < UPPER_TABLE.length - 2 && altitudeM > UPPER_TABLE[i + 1][0]) i++;
  const [z0, t0, p0, d0] = UPPER_TABLE[i];
  const [z1, t1, p1, d1] = UPPER_TABLE[i + 1];
  const f = (altitudeM - z0) / (z1 - z0); // extrapolates past 1000 km
  const logLerp = (a: number, b: number) => Math.exp(Math.log(a) + f * (Math.log(b) - Math.log(a)));
  return {
    temperatureK: Math.min(t0 + f * (t1 - t0), 1000),
    pressurePa: logLerp(p0, p1),
    densityKgM3: logLerp(d0, d1),
    // Above 86 km "speed of sound" is not meaningful; drag is negligible there anyway.
    speedOfSoundMS: Math.sqrt(GAMMA_AIR * R_AIR_JKGK * 186.87),
  };
}

export function atmosphere(altitudeM: number): AtmosphereState {
  const z = Math.max(0, altitudeM);
  return z < LOWER_MODEL_TOP_M ? lowerAtmosphere(z) : upperAtmosphere(z);
}
