// Failures that teach: for every way a flight can go wrong, what happened, why (in rocket
// science a kid can follow), and fixes that point at controls Roscoe can change himself.

import type { ControlId } from '../physics/controls';
import type { MissionRecord } from '../physics/mission';
import { CREW_G_LIMIT } from '../physics/reentry';
import type { RocketSpec } from '../physics/types';
import type { SkillId } from '../missions/skills';

/** A bar showing the number that went wrong against its limit. */
export interface Meter {
  emoji: string;
  label: string;
  value: number;
  limit: number;
  unit: string;
  /** 'below': it had to stay under the line. 'above': it had to get past it. */
  want: 'below' | 'above';
  limitLabel: string;
}

export interface LessonFix {
  text: string;
  control: ControlId;
}

export interface Lesson {
  what: string;
  why: string[];
  meter?: Meter;
  fixes: LessonFix[];
  skill: SkillId;
}

const num = (x: number | string | undefined) => Number(x ?? 0);

export function lessonFor(m: MissionRecord, spec: RocketSpec): Lesson | undefined {
  const f = m.result.failure;
  if (!f) return undefined;
  const d = f.detail;
  const hasBoosters = !!spec.stages[0]?.boosters;
  const sluggish = m.ascent.summary.liftoffTWR < 1.25;
  switch (f.type) {
    case 'noLiftoff':
      return {
        what: "The rocket couldn't get off the ground.",
        why: ['Engines push up. Gravity pulls down on the rocket, its fuel and everything on top.', 'The push was smaller than the weight, so it stayed on the pad.'],
        meter: { emoji: '💪', label: 'Push vs weight', value: num(d.thrustN), limit: num(d.weightN), unit: 'MN', want: 'above', limitLabel: 'weight' },
        fixes: [
          { text: 'Add more engines for more push.', control: 'engines' },
          { text: hasBoosters ? 'Add more boosters.' : 'Add boosters for a big push at the start.', control: 'boosters' },
          { text: 'Use smaller tanks up top, so there is less to lift.', control: 'tank' },
        ],
        skill: 'thrust',
      };
    case 'breakup':
      return {
        what: 'The air pushed harder than the rocket could take, and it broke apart.',
        why: [
          'The faster you go while the air is still thick, the harder it pushes on the rocket.',
          sluggish
            ? 'Your rocket climbed slowly, so it was still in the thick air when it got fast.'
            : 'Your rocket got very fast while it was still low, where the air is thick.',
          "Every rocket has a strength limit. The air's push went over it.",
        ],
        meter: { emoji: '💨', label: 'Air push', value: num(d.dynamicPressurePa), limit: num(d.limitPa), unit: 'kPa', want: 'below', limitLabel: 'strength' },
        fixes: [
          { text: 'Ease off the engines in thick air, so it goes a bit slower there.', control: 'easeOff' },
          { text: 'Make the body stronger (it gets a bit heavier).', control: 'stronger' },
          sluggish
            ? { text: 'More engines, so it climbs out of the thick air sooner.', control: 'engines' }
            : { text: 'Fewer engines, so it speeds up more gently.', control: 'engines' },
        ],
        skill: 'maxQ',
      };
    case 'tumble':
      return {
        what: 'The rocket wobbled, flipped over and broke up.',
        why: [
          'The air was pushing hardest near the nose, so it wanted to flip, like a dart thrown backwards.',
          'The engines swivel to steer, but they could not hold it straight.',
        ],
        meter: { emoji: '🌀', label: 'Twist vs steering', value: num(d.ratio) * 100, limit: 100, unit: '%', want: 'below', limitLabel: 'steering' },
        fixes: [
          { text: 'Add bigger fins at the bottom to keep it pointing straight.', control: 'fins' },
          { text: 'Ease off in thick air, so the air pushes less.', control: 'easeOff' },
          { text: 'Pick engines that can swivel more to steer.', control: 'engineType' },
        ],
        skill: 'stability',
      };
    case 'outOfFuel':
      return {
        what: 'It ran out of fuel before it was going fast enough to stay in space.',
        why: [
          'Space is only about 100 km up, but staying up there means going sideways about 28,000 km/h.',
          'Your rocket ran out of fuel before it got that fast, so it fell back.',
        ],
        meter: { emoji: '🏎️', label: 'Speed', value: num(d.speedMS) * 3.6, limit: num(d.orbitSpeedNeededMS) * 3.6, unit: 'km/h', want: 'above', limitLabel: 'orbit speed' },
        fixes: [
          { text: 'Add a stage, so empty tanks drop away and the rest is lighter.', control: 'addStage' },
          { text: 'Give the top stage a bigger tank.', control: 'tank' },
          { text: 'Carry something lighter on top.', control: 'payload' },
        ],
        skill: spec.stages.length < 2 ? 'stages' : 'fuel',
      };
    case 'crash':
      return {
        what: 'It tipped over too soon and came back down.',
        why: ['After liftoff, a rocket slowly turns sideways. If it is too slow or too heavy, it turns over before it is high and fast enough.'],
        fixes: [
          { text: 'More engines, so it climbs faster.', control: 'engines' },
          { text: 'Add boosters for a stronger start.', control: 'boosters' },
          { text: 'Carry less fuel up top, so it is lighter.', control: 'tank' },
        ],
        skill: 'thrust',
      };
    case 'engineFailure':
      return {
        what: 'An engine stopped, and the others could not keep the rocket going.',
        why: ['When one engine stops, the others burn longer to make up for it.', 'With only a few engines, losing one is too much.'],
        fixes: [
          { text: 'Add spare engines.', control: 'engines' },
          { text: 'Add more fuel for the longer burn.', control: 'tank' },
        ],
        skill: 'engineOut',
      };
    case 'orbitShort':
      return {
        what: `It reached space, but ran out of fuel climbing to the high orbit (${String(d.leg).toLowerCase()}).`,
        why: ['Climbing high takes two more pushes after reaching space.', 'The top stage needs lots of fuel left over for them.'],
        meter: { emoji: '⛽', label: 'Push left', value: num(d.availableMS), limit: num(d.neededMS), unit: 'm/s', want: 'above', limitLabel: 'needed' },
        fixes: [
          { text: 'Give the top stage a bigger tank.', control: 'tank' },
          { text: 'Add another stage.', control: 'addStage' },
          { text: "Don't save fuel for landing.", control: 'landIt' },
        ],
        skill: 'highOrbit',
      };
    case 'moonShort':
      return {
        what: `It reached space, but didn't have enough fuel for the Moon (${String(d.leg).toLowerCase()}).`,
        why: ['Heading to the Moon takes another huge push after reaching space.', `${d.by} needed more fuel than it had.`],
        meter: { emoji: '⛽', label: 'Push left', value: num(d.availableMS), limit: num(d.neededMS), unit: 'm/s', want: 'above', limitLabel: 'needed' },
        fixes: [
          { text: 'Give the top stage a bigger tank.', control: 'tank' },
          { text: "Don't save fuel for landing the bottom stage.", control: 'landIt' },
          { text: 'Let "Make it reach the Moon" pick the fuel.', control: 'autoSize' },
        ],
        skill: 'moonTrip',
      };
    case 'burnUp':
      return {
        what: 'Coming home, the capsule got too hot for its heat shield.',
        why: ['The capsule rubs against the air so fast that it glows.', 'Diving in steeply makes it hotter. The heat shield can only take so much.'],
        meter: {
          emoji: '🔥',
          label: 'Heat',
          value: Math.max(num(d.peakHeatFluxWm2) / num(d.maxHeatFluxWm2), num(d.heatLoadJm2) / num(d.maxHeatLoadJm2)) * 100,
          limit: 100,
          unit: '%',
          want: 'below',
          limitLabel: 'shield',
        },
        fixes: [
          { text: 'Come home at a gentler angle.', control: 'comeHome' },
          { text: 'Use a thicker heat shield.', control: 'heatShield' },
        ],
        skill: 'corridor',
      };
    case 'skipOut':
      return {
        what: 'The capsule bounced off the air and back into space!',
        why: ['If the capsule comes in too flat, it skips off the air like a stone on a pond.'],
        fixes: [{ text: 'Come home at a steeper angle.', control: 'comeHome' }],
        skill: 'corridor',
      };
    case 'crewG':
      return {
        what: 'Coming home was too bumpy for the astronauts.',
        why: ['Diving in steeply slows the capsule down very hard, which squishes the crew.'],
        meter: { emoji: '🫨', label: 'Squish', value: num(d.peakGLoad), limit: CREW_G_LIMIT, unit: 'g', want: 'below', limitLabel: 'crew limit' },
        fixes: [{ text: 'Come home at a gentler angle.', control: 'comeHome' }],
        skill: 'corridor',
      };
    case 'crashLanding':
    default:
      return {
        what: `The ${String(d.piece).toLowerCase()} hit the ground too fast when it tried to land.`,
        why: ['Landing needs fuel saved for braking on the way down.', 'It ran out of braking fuel, or came back too fast.'],
        meter: { emoji: '🦿', label: 'Landing speed', value: num(d.touchdownSpeedMS), limit: num(d.limitMS), unit: 'm/s', want: 'below', limitLabel: 'legs' },
        fixes: [
          { text: 'Save more landing fuel.', control: 'landingFuel' },
          { text: "Or don't land it this time.", control: 'landIt' },
        ],
        skill: 'landing',
      };
  }
}
