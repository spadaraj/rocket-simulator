// Design-time check: the rocket equation, stage by stage (vacuum Isp, no losses).

import { G0_MS2 } from './constants';
import type { Catalog, RocketSpec } from './types';
import { buildVehicle } from './vehicle';

export interface StageDeltaV {
  name: string;
  deltaVMS: number;
  ignitionMassKg: number;
  burnoutMassKg: number;
}

/** Approximate textbook budget to low Earth orbit, including gravity and drag losses. */
export const LEO_BUDGET_MS = 9400;
/** Extra to leave Earth orbit for the Moon (trans-lunar injection). */
export const TLI_BUDGET_MS = 3100;

export function stageDeltaV(spec: RocketSpec, catalog: Catalog): StageDeltaV[] {
  const v = buildVehicle(spec, catalog);
  const jettison = v.jettisonables.reduce((m, j) => m + j.massKg, 0);
  const out: StageDeltaV[] = [];
  for (let i = 0; i < v.stages.length; i++) {
    let above = v.payloadMassKg + (i === 0 ? jettison : 0);
    for (let j = i + 1; j < v.stages.length; j++) above += v.stages[j].dryMassKg + v.stages[j].propellantKg;
    const st = v.stages[i];
    let thrust = 0;
    let mdot = 0;
    for (const g of st.engines) {
      thrust += g.count * g.engine.thrustVacuumN;
      mdot += (g.count * g.engine.thrustVacuumN) / (g.engine.ispVacuumS * G0_MS2);
    }
    let m0 = above + st.dryMassKg + st.propellantKg;
    if (st.boosters) {
      // Boosters burn alongside the core: count their delta-v as one combined phase.
      const b = st.boosters;
      const bProp = b.count * b.booster.propellantKg;
      const bMdot = bProp / b.booster.burnTimeS;
      const coreUsed = Math.min(st.propellantKg, mdot * b.booster.burnTimeS);
      const mStart = m0 + b.count * (b.booster.massKg + b.booster.propellantKg);
      const mEnd = mStart - bProp - coreUsed;
      const ve = (b.booster.ispVacuumS * G0_MS2 * bMdot + thrust) / (bMdot + mdot);
      out.push({
        name: `${st.name} + boosters`,
        deltaVMS: ve * Math.log(mStart / mEnd),
        ignitionMassKg: mStart,
        burnoutMassKg: mEnd,
      });
      m0 = mEnd - b.count * b.booster.massKg;
      const remaining = st.propellantKg - coreUsed;
      out.push({
        name: st.name,
        deltaVMS: mdot > 0 ? (thrust / mdot) * Math.log(m0 / (m0 - remaining)) : 0,
        ignitionMassKg: m0,
        burnoutMassKg: m0 - remaining,
      });
      continue;
    }
    out.push({
      name: st.name,
      deltaVMS: mdot > 0 ? (thrust / mdot) * Math.log(m0 / (m0 - st.propellantKg)) : 0,
      ignitionMassKg: m0,
      burnoutMassKg: m0 - st.propellantKg,
    });
  }
  return out;
}
