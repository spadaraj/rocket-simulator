// Three layers of feedback per outcome: what happened, why (the number), how to fix it.
// Roscoe mode shows layers 1 and 3 in short words; Engineer mode shows all three.

import { TLI_BUDGET_MS } from '../physics/deltaV';
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
        ? ['Enough left for trans-lunar injection (simulated in a later phase).']
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
