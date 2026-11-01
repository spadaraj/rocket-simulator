// Physical constants. SI units everywhere.

/** Standard gravity, used to convert Isp (s) to exhaust velocity. */
export const G0_MS2 = 9.80665;
/** Earth's gravitational parameter. */
export const MU_EARTH_M3S2 = 3.986004418e14;
/** Earth's equatorial radius. */
export const R_EARTH_M = 6378137;
/** Earth's sidereal rotation rate. */
export const OMEGA_EARTH_RADS = 7.2921159e-5;
/** Sea-level standard pressure. */
export const P0_PA = 101325;

/** Lowest orbit point (perigee altitude) that counts as "made it to orbit". */
export const SUCCESS_PERIGEE_ALT_M = 130e3;

export interface LaunchSite {
  name: string;
  latitudeDeg: number;
}

export const LAUNCH_SITES: Record<string, LaunchSite> = {
  KSC: { name: 'Kennedy Space Center LC-39A', latitudeDeg: 28.6083 },
};
