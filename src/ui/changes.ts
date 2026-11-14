// What changed between two rockets, in words Roscoe can follow, and which builder controls
// those changes live under. Used to say what Did's fix did, and what Roscoe changed since
// his last try.

import { catalog as baseCatalog } from '../data/catalog';
import type { ControlId } from '../physics/controls';
import { finScale, PAYLOAD_SLOTS, payloadSlot, stageEngine, stageFill, stageTank } from '../physics/edit';
import { ARRIVALS, launchDayLabel, TRIPS, tripKey } from '../physics/trips';
import { goesToMoon } from '../physics/raise';
import { DEFAULT_ENTRY_ANGLE_DEG } from '../physics/reentry';
import type { RocketSpec } from '../physics/types';
import { resolveCatalog } from '../physics/vehicle';

export interface Change {
  text: string;
  /** Where it lives in the builder (some of Did's fixes have no button of their own). */
  control?: ControlId;
}

const stageName = (i: number, n: number) => (n === 1 ? 'the rocket' : i === 0 ? 'the bottom stage' : i === n - 1 ? 'the top stage' : 'the middle stage');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tonnes = (kg: number) => `${Math.round(kg / 1000).toLocaleString()} t`;
const partName = (id?: string) => (id ? baseCatalog[id]?.name ?? id : 'nothing');

function fuelKg(spec: RocketSpec, i: number) {
  const cat = resolveCatalog(spec, baseCatalog);
  const t = stageTank(spec, cat, i);
  return t ? t.part.propellantCapacityKg * stageFill(spec, cat, i) : 0;
}

/** Everything that differs between two rockets, biggest ideas first. */
export function describeChanges(before: RocketSpec, after: RocketSpec): Change[] {
  const out: Change[] = [];
  const nb = before.stages.length;
  const na = after.stages.length;
  if (na > nb) out.push({ text: `Added ${na - nb === 1 ? 'a stage' : `${na - nb} stages`} (now ${na})`, control: 'addStage' });
  if (na < nb) out.push({ text: `Took off ${nb - na === 1 ? 'a stage' : `${nb - na} stages`} (now ${na})`, control: 'addStage' });

  // Compare stages that both rockets have, counting from the bottom.
  const catB = resolveCatalog(before, baseCatalog);
  const catA = resolveCatalog(after, baseCatalog);
  for (let i = 0; i < Math.min(na, nb); i++) {
    const where = stageName(i, na);
    const eb = stageEngine(before, catB, i);
    const ea = stageEngine(after, catA, i);
    if (eb && ea && eb.part.id !== ea.part.id) out.push({ text: `${cap(where)}: ${eb.part.name} → ${ea.part.name} engines`, control: 'engineType' });
    const cb = eb?.ref.count ?? 0;
    const ca = ea?.ref.count ?? 0;
    if (cb !== ca) out.push({ text: `${cap(where)}: engines ${cb} → ${ca}`, control: 'engines' });
    const fb = fuelKg(before, i);
    const fa = fuelKg(after, i);
    if (Math.abs(fa - fb) > 500) out.push({ text: `${cap(where)}: fuel ${tonnes(fb)} → ${tonnes(fa)}`, control: 'tank' });
    const finB = finScale(before, catB, i);
    const finA = finScale(after, catA, i);
    if (Math.abs(finA - finB) > 0.01)
      out.push({ text: `${cap(where)}: ${finA > finB ? 'bigger' : 'smaller'} fins${finA === 0 ? ' (none)' : ''}`, control: 'fins' });
    const sb = before.stages[i];
    const sa = after.stages[i];
    const landB = sb.recovery === 'propulsive';
    const landA = sa.recovery === 'propulsive';
    if (landB !== landA) out.push({ text: `${cap(where)}: “Land it” ${landA ? 'on' : 'off'}`, control: 'landIt' });
    else if (landA && Math.abs((sa.landingReserveKg ?? 0) - (sb.landingReserveKg ?? 0)) > 500)
      out.push({ text: `${cap(where)}: landing fuel ${tonnes(sb.landingReserveKg ?? 0)} → ${tonnes(sa.landingReserveKg ?? 0)}`, control: 'landingFuel' });
    if (i === 0) {
      const bb = sb.boosters;
      const ba = sa.boosters;
      if ((bb?.count ?? 0) !== (ba?.count ?? 0) || bb?.part !== ba?.part)
        out.push({ text: `Boosters ${bb ? `${bb.count} × ${partName(bb.part)}` : 'none'} → ${ba ? `${ba.count} × ${partName(ba.part)}` : 'none'}`, control: 'boosters' });
      else if (bb && ba && (bb.recovery ?? 'none') !== (ba.recovery ?? 'none'))
        out.push({ text: `Booster parachutes ${ba.recovery === 'parachute' ? 'on' : 'off'}`, control: 'boosterChutes' });
    }
  }

  for (const { slot, roscoe } of PAYLOAD_SLOTS) {
    const pb = payloadSlot(before, slot);
    const pa = payloadSlot(after, slot);
    if (pb === pa) continue;
    const control: ControlId = slot === 'lander' ? 'lander' : slot === 'kick' ? 'kickStage' : 'payload';
    out.push({ text: `${roscoe}: ${partName(pb)} → ${partName(pa)}`, control });
  }
  if ((before.payload.heatShieldScale ?? 1) !== (after.payload.heatShieldScale ?? 1))
    out.push({ text: `${(after.payload.heatShieldScale ?? 1) > (before.payload.heatShieldScale ?? 1) ? 'Thicker' : 'Thinner'} heat shield`, control: 'heatShield' });
  if ((before.structureScale ?? 1) !== (after.structureScale ?? 1))
    out.push({ text: `${(after.structureScale ?? 1) > (before.structureScale ?? 1) ? 'Stronger' : 'Lighter'} body`, control: 'stronger' });

  const mb = before.mission;
  const ma = after.mission;
  const trip = (k: string) => TRIPS.find((t) => t.key === k)?.roscoe ?? k;
  if (tripKey(mb) !== tripKey(ma)) out.push({ text: `Where to? ${trip(tripKey(mb))} → ${trip(tripKey(ma))}`, control: 'whereTo' });
  if (ma.target === 'planet' && mb.arrival !== ma.arrival && ma.arrival)
    out.push({ text: `What to do there: ${ARRIVALS[ma.arrival].roscoe}`, control: 'arrive' });
  if (ma.target === 'planet' && (mb.launchOffsetDays ?? 0) !== (ma.launchOffsetDays ?? 0))
    out.push({ text: `Launch day: ${launchDayLabel(mb.launchOffsetDays ?? 0)} → ${launchDayLabel(ma.launchOffsetDays ?? 0)}`, control: 'launchDay' });
  if (mb.targetOrbitAltitudeM !== ma.targetOrbitAltitudeM)
    out.push({ text: `How high: ${Math.round(mb.targetOrbitAltitudeM / 1000)} → ${Math.round(ma.targetOrbitAltitudeM / 1000)} km`, control: 'targetHeight' });
  if (!!mb.maxQThrottle !== !!ma.maxQThrottle) out.push({ text: `“Ease off in thick air” ${ma.maxQThrottle ? 'on' : 'off'}`, control: 'easeOff' });
  const angle = (m: typeof mb) => m.reentryAngleDeg ?? DEFAULT_ENTRY_ANGLE_DEG[goesToMoon(m.target) ? 'moon' : 'orbit'];
  if (tripKey(mb) === tripKey(ma) && Math.abs(angle(mb) - angle(ma)) > 0.05) {
    const steeper = angle(ma) < angle(mb);
    out.push({ text: `Coming home ${steeper ? 'steeper' : 'gentler'}`, control: 'comeHome' });
  }
  if (mb.pitchKick.angleDeg !== ma.pitchKick.angleDeg || mb.pitchKick.timeS !== ma.pitchKick.timeS)
    out.push({ text: 'Tips over more gently after liftoff' });
  return out;
}
