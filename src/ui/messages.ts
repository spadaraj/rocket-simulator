// Three layers of feedback per outcome: what happened, why (the number), how to fix it.
// Roscoe mode shows layers 1 and 3 in short words; Engineer mode shows all three.

import { TLI_BUDGET_MS } from '../physics/deltaV';
import type { MissionRecord } from '../physics/mission';
import { CREW_G_LIMIT } from '../physics/reentry';
import type { FlightRecord } from '../physics/types';

export interface Feedback {
  success: boolean;
  roscoeTitle: string;
  roscoeFix: string;
  title: string;
  why: string;
  fixes: string[];
}

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const kpa = (pa: number) => `${(pa / 1000).toFixed(1)} kPa`;
const mn = (n: number) => `${(n / 1e6).toFixed(1)} MN`;
const num = (x: number | string | undefined) => Number(x ?? 0);
const mw = (w: number) => `${(w / 1e6).toFixed(2)} MW/m²`;
const mj = (j: number) => `${(j / 1e6).toFixed(0)} MJ/m²`;

/** Feedback for the whole mission: launch problems first, then the Moon, re-entry and landing. */
export function missionFeedback(m: MissionRecord): Feedback {
  const f = m.result.failure;
  if (!f || ['noLiftoff', 'outOfFuel', 'breakup', 'crash', 'tumble', 'engineFailure'].includes(f.type)) {
    const fb = feedbackFor(m.ascent);
    if (!fb.success || !m.result.success) return fb;
    const toMoon = !!m.moon;
    const recovered = m.recoveries.filter((r) => r.outcome === 'landed' || r.outcome === 'splashdown').map((r) => r.name);
    const splash = m.reentry ? ` Splashdown at ${m.reentry.splashSpeedMS.toFixed(1)} m/s after a ${m.reentry.peakGLoad.toFixed(1)} g re-entry.` : '';
    return {
      success: true,
      roscoeTitle: m.planet ? 'Mission accomplished out in the solar system!' : toMoon ? 'You went to the Moon and back!' : m.raise ? 'Your satellite made it to the high orbit!' : m.reentry ? 'You went to space and back!' : 'You made it to space!',
      roscoeFix: recovered.length
        ? `And you got back the ${recovered.join(' and the ').toLowerCase()}!`
        : m.reentry
          ? 'The crew splashed down safely!'
          : 'Great flying!',
      title: m.planet ? `Mission complete: ${m.planet.arrival} at ${m.planet.destination}, ${Math.round(m.planet.totalDays)} days` : toMoon ? 'Mission complete: Moon landing and safe return' : 'Mission complete',
      why: `${fb.why}${splash}`,
      fixes: recovered.length ? [`Recovered: ${recovered.join(', ')}.`] : ['Nothing was recovered; every stage was thrown away.'],
    };
  }
  const d = f.detail;
  switch (f.type) {
    case 'orbitShort':
      return {
        success: false,
        roscoeTitle: 'Made it to space, but not enough fuel to climb high!',
        roscoeFix: 'Try this: more fuel in the top stage.',
        title: `High orbit short at ${d.leg}`,
        why: `The top stage needs ${num(d.neededMS).toFixed(0)} m/s for the ${String(d.leg).toLowerCase()} but has ${num(d.availableMS).toFixed(0)} m/s.`,
        fixes: ['More propellant in the upper stage.', 'A higher-Isp upper-stage engine.', 'A lighter payload.'],
      };
    case 'moonShort':
      return {
        success: false,
        roscoeTitle: d.leg === 'Trans-lunar injection' ? 'Made it to space, but not enough fuel for the Moon!' : `Ran out of fuel on the way: ${String(d.leg).toLowerCase()}!`,
        roscoeFix: 'Try this: more fuel in the top stage.',
        title: `Moon trip short at ${d.leg}`,
        why: `${d.by} needs ${num(d.neededMS).toFixed(0)} m/s for ${String(d.leg).toLowerCase()} but has ${num(d.availableMS).toFixed(0)} m/s.`,
        fixes: ['More propellant in the upper stage.', "Don't hold back fuel to land the first stage.", 'A higher-Isp upper-stage engine.'],
      };
    case 'planetShort':
      return {
        success: false,
        roscoeTitle:
          d.legId === 'depart'
            ? 'Made it to space, but not enough push to leave Earth!'
            : d.legId === 'capture'
              ? 'It zoomed right past!'
              : d.legId === 'entry'
                ? 'It burned up in the air!'
                : d.legId === 'touchdown'
                  ? 'Crash landing!'
                  : d.legId === 'survive'
                    ? 'Cooked and crushed!'
                    : 'Ran out of fuel on the way!',
        roscoeFix: 'Try the fixes below.',
        title: `Trip short at ${d.leg}`,
        why:
          d.unit === 'check'
            ? `${d.leg}: ${d.by}.`
            : d.unit === 'min'
              ? `${d.by} lasted ${num(d.availableMS).toFixed(0)} min on the surface; the goal is ${num(d.neededMS).toFixed(0)} min.`
              : `${d.by} needs ${num(d.neededMS).toFixed(0)} m/s for ${String(d.leg).toLowerCase()} but has ${num(d.availableMS).toFixed(0)} m/s.${
                  d.legId === 'depart' && Math.abs(num(d.offsetDays)) > 14 ? ` Launching ${Math.round(num(d.offsetDays))} days from the best day; on the best day it would need ${num(d.windowDepartMS).toFixed(0)} m/s.` : ''
                }`,
        fixes: ['Launch in the window.', 'More propellant in the upper stage.', 'A probe or lander built for this destination.'],
      };
    case 'burnUp':
      return {
        success: false,
        roscoeTitle: 'Too hot coming home!',
        roscoeFix: 'Try this: come home at a gentler angle, or use a thicker heat shield.',
        title: 'Heat shield overheated on re-entry',
        why: `At ${num(d.entryAngleDeg).toFixed(1)}° and ${num(d.entrySpeedMS).toFixed(0)} m/s, heating peaked at ${mw(num(d.peakHeatFluxWm2))} (shield rated ${mw(num(d.maxHeatFluxWm2))}); total heat ${mj(num(d.heatLoadJm2))} (rated ${mj(num(d.maxHeatLoadJm2))}).`,
        fixes: ['A shallower entry angle (less peak heating).', 'A thicker heat shield.', 'Too shallow and the capsule skips back out, so stay inside the corridor.'],
      };
    case 'skipOut':
      return {
        success: false,
        roscoeTitle: 'It skipped off the air like a stone on a pond!',
        roscoeFix: 'Try this: come home at a steeper angle.',
        title: 'Skipped out of the atmosphere',
        why: `At ${num(d.entryAngleDeg).toFixed(1)}° the capsule didn't bite into the air hard enough and bounced back out into space at ${num(d.entrySpeedMS).toFixed(0)} m/s.`,
        fixes: ['A steeper entry angle.'],
      };
    case 'crewG':
      return {
        success: false,
        roscoeTitle: 'Too bumpy for the astronauts!',
        roscoeFix: 'Try this: come home at a gentler angle.',
        title: 'Re-entry g-load too high for the crew',
        why: `Peak deceleration ${num(d.peakGLoad).toFixed(1)} g at a ${num(d.entryAngleDeg).toFixed(1)}° entry; the crew limit is ${CREW_G_LIMIT} g.`,
        fixes: ['A shallower entry angle spreads the braking out.'],
      };
    case 'crashLanding':
    default:
      return {
        success: false,
        roscoeTitle: `The crew made it, but the ${String(d.piece).toLowerCase()} landed too hard!`,
        roscoeFix: 'Try this: save more fuel for landing.',
        title: `${d.piece} crash landing`,
        why: `${d.reason}. It held back ${(num(d.reserveKg) / 1000).toFixed(0)} t of fuel; the entry burn took ${num(d.entryBurnDeltaVMS).toFixed(0)} m/s off before the landing burn.`,
        fixes: ['Hold back more landing fuel.', 'Stage earlier, so the stage comes back slower.', "Or don't land it."],
      };
  }
}

export function feedbackFor(record: FlightRecord): Feedback {
  const o = record.outcome;
  if (o.success) {
    const enough = o.remainingDeltaVMS >= TLI_BUDGET_MS;
    return {
      success: true,
      roscoeTitle: 'You made it to space!',
      roscoeFix: enough ? 'Next stop: the Moon!' : 'Almost enough fuel left for the Moon. Try a bit more fuel!',
      title: 'Orbit achieved',
      why: `Orbit ${km(o.orbit!.perigeeAltM)} × ${km(o.orbit!.apogeeAltM)}. ${o.remainingDeltaVMS.toFixed(0)} m/s of delta-v left in the upper stage; heading for the Moon needs about ${TLI_BUDGET_MS} m/s.`,
      fixes: enough
        ? ['Enough left for trans-lunar injection.']
        : ['Add propellant to the upper stage, use a higher-Isp engine, or lighten the payload.'],
    };
  }
  const f = o.failure!;
  const d = f.detail;
  switch (f.type) {
    case 'noLiftoff':
      return {
        success: false,
        roscoeTitle: "Too heavy! The engines can't push it up.",
        roscoeFix: 'Try this: add more engines or boosters.',
        title: "Won't lift off",
        why: `Liftoff thrust ${mn(num(d.thrustN))} vs weight ${mn(num(d.weightN))}: thrust-to-weight ${num(d.thrustToWeight).toFixed(2)}. It must be above 1; real rockets aim for about 1.2 or more.`,
        fixes: ['Add boosters or more core engines.', 'Use stronger engines.', 'Carry less propellant in the upper stages.'],
      };
    case 'outOfFuel':
      return {
        success: false,
        roscoeTitle: 'Ran out of fuel before space!',
        roscoeFix: 'Try this: add more fuel, or make the top lighter.',
        title: 'Out of propellant before orbit',
        why: `The last stage burned out at ${km(num(d.altitudeM))} going ${num(d.speedMS).toFixed(0)} m/s; staying in orbit there needs about ${num(d.orbitSpeedNeededMS).toFixed(0)} m/s. Lowest point of the path: ${km(num(d.perigeeAltM))}.`,
        fixes: ['More propellant in the upper stage.', 'A more efficient (higher-Isp) engine.', 'A lighter payload.', 'Add a stage.'],
      };
    case 'breakup': {
      // A sluggish liftoff lingers in thick air; otherwise the turn was too aggressive.
      const sluggish = record.summary.liftoffTWR < 1.2;
      const turnFix = 'A later or smaller pitch kick (a steeper climb out of thick air).';
      const thrustFix = 'More thrust at liftoff, so it is higher before it is fast.';
      return {
        success: false,
        roscoeTitle: 'The air pushed too hard and it broke!',
        roscoeFix: sluggish
          ? 'Try this: add more engines, so it climbs out of the thick air faster.'
          : 'Try this: turn more gently, so it climbs out of the thick air first.',
        title: 'Structural breakup',
        why: `Dynamic pressure reached ${kpa(num(d.dynamicPressurePa))}, above the ${kpa(num(d.limitPa))} structural limit, at ${km(num(d.altitudeM))} and Mach ${num(d.mach).toFixed(1)}.`,
        fixes: [
          sluggish ? thrustFix : turnFix,
          sluggish ? turnFix : thrustFix,
          'Throttle the liquid engines down through max-Q.',
          'Stronger structure.',
        ],
      };
    }
    case 'tumble': {
      const off = num(d.enginesRunning) === 0;
      return {
        success: false,
        roscoeTitle: 'It wobbled and flipped!',
        roscoeFix: off ? 'Try this: add fins, so it flies straight on its own.' : 'Try this: bigger fins, or engines that can steer.',
        title: 'Tumbled out of control',
        why: `The air's twist was ${num(d.ratio).toFixed(1)}× what the ${off ? 'attitude thrusters' : 'swivelling engines'} could hold, at ${num(d.aoaDeg).toFixed(1)}° angle of attack and ${kpa(num(d.dynamicPressurePa))}. Centre of pressure ${num(d.copM).toFixed(0)} m up vs centre of mass ${num(d.comM).toFixed(0)} m: the push is ahead of the weight.`,
        fixes: ['Bigger fins (moves the centre of pressure back).', 'Engines that gimbal further, or more of them.', 'A smaller pitch kick (less angle of attack).', 'Stage higher, where the air is thinner.'],
      };
    }
    case 'engineFailure':
      return {
        success: false,
        roscoeTitle: 'An engine stopped working!',
        roscoeFix: 'Try this: add spare engines, so the others can keep going.',
        title: 'Engine failure',
        why: `${d.fault} at T+${num(d.faultTimeS).toFixed(0)} s, and the rest could not make up for it.`,
        fixes: ['Add engines, so losing one leaves enough thrust (engine-out capability).', 'Carry more propellant for the longer burn.'],
      };
    case 'crash':
    default:
      return {
        success: false,
        roscoeTitle: 'It tipped over and fell back down!',
        roscoeFix: 'Try this: a gentler turn after liftoff, or more push.',
        title: 'Fell back to Earth',
        why: `The vehicle hit the ground at T+${f.tS.toFixed(0)} s without reaching orbit. Usually the pitch kick was too big, or thrust was too low after the boosters dropped.`,
        fixes: ['A smaller pitch kick.', 'More thrust on the core stage.', 'Less mass on top.'],
      };
  }
}
