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
    case 'moonShort': {
      const meter: Meter = { emoji: '⛽', label: 'Push left', value: num(d.availableMS), limit: num(d.neededMS), unit: 'm/s', want: 'above', limitLabel: 'needed' };
      const by = String(d.by ?? '');
      if (d.legId === 'lifeboat')
        return {
          what: 'On the way to the Moon, the service module broke, and there was no lifeboat!',
          why: [
            'The service module had the engine and the air. Without it, the crew needed somewhere else to live and an engine to steer.',
            'On Apollo 13, the Moon lander was the lifeboat. This time it was left at home.',
          ],
          fixes: [{ text: 'Bring a Moon lander, even if you are not landing.', control: 'lander' }],
          skill: 'lifeboat',
        };
      if (by.startsWith('No lander') || by.startsWith('No ascent'))
        return {
          what: by.startsWith('No ascent') ? 'It landed, but the lander had no way to take off again!' : 'It got to the Moon, but there was nothing to land with!',
          why: by.startsWith('No ascent')
            ? ['A cargo lander is one-way: it lands and stays.', 'Astronauts need a lander with a second little rocket on top to blast back up.']
            : [
                'The big rocket can only throw you toward the Moon. Slowing down to land takes another rocket.',
                'A lander carries its own fuel to brake and touch down gently. There is no air on the Moon for parachutes!',
              ],
          fixes: [{ text: by.startsWith('No ascent') ? 'Pick the Apollo lander for astronauts.' : 'Add a Moon lander.', control: 'lander' }],
          skill: 'lander',
        };
      if (d.legId === 'tli')
        return {
          what: "It reached space, but didn't have enough fuel for the big push toward the Moon.",
          why: ['Heading to the Moon takes another huge push after reaching space.', `${d.by} needed more fuel than it had.`],
          meter,
          fixes: [
            { text: 'Give the top stage a bigger tank.', control: 'tank' },
            { text: "Don't save fuel for landing the bottom stage.", control: 'landIt' },
            { text: 'Let "Make it reach the Moon" pick the fuel.', control: 'autoSize' },
          ],
          skill: 'moonTrip',
        };
      return {
        what: `It got to the Moon, but ${d.by} ran short (${String(d.leg).toLowerCase()}).`,
        why: [
          'Every burn at the Moon is paid for by the spacecraft itself, not the big rocket.',
          'The heavier the spacecraft, the more fuel each burn takes.',
        ],
        meter,
        fixes: [
          { text: 'Try a different service module or lander.', control: 'lander' },
          { text: 'Carry less on top.', control: 'payload' },
        ],
        skill: 'lander',
      };
    }
    case 'planetShort': {
      const where = String(d.destination ?? '');
      const name = { venus: 'Venus', mars: 'Mars', mercury: 'Mercury', belt: 'the belt', vesta: 'Vesta', ceres: 'Ceres', vestaCeres: 'Vesta', rock: 'the space rock' }[where] ?? 'the planet';
      const pushMeter: Meter = { emoji: '⛽', label: 'Push', value: num(d.availableMS), limit: num(d.neededMS), unit: 'm/s', want: 'above', limitLabel: 'needed' };
      const by = String(d.by ?? '');
      switch (d.legId) {
        case 'depart': {
          const missedWindow = Math.abs(num(d.offsetDays)) > 14 && num(d.windowDepartMS) <= num(d.availableMS);
          if (missedWindow)
            return {
              what: `The planets weren't lined up, so leaving Earth for ${name} took too big a push.`,
              why: [
                `${name} and Earth are always moving around the Sun. You have to aim for where ${name} will be when you get there.`,
                'On the best day, the path is short and easy. Months early or late, it takes a much bigger push.',
              ],
              meter: pushMeter,
              fixes: [{ text: 'Change the launch day to 🎯 Best day.', control: 'launchDay' }],
              skill: 'window',
            };
          const heavy = spec.payload.parts.some((r) => r.part === 'armored-probe');
          return {
            what: `It reached space, but couldn't push hard enough to leave Earth for ${name}.`,
            why: [
              'Leaving Earth for another world takes a second huge push after reaching space.',
              heavy ? 'The armor made the probe super heavy, and heavy things take a much bigger push.' : `${by} needed more fuel than it had.`,
            ],
            meter: pushMeter,
            fixes: [
              ...(heavy ? [{ text: 'Carry something lighter on top.', control: 'payload' as const }] : []),
              { text: 'Change the launch day to 🎯 Best day.', control: 'launchDay' },
              { text: 'Give the top stage a bigger tank.', control: 'tank' },
              { text: `Let "Make it reach" pick the fuel.`, control: 'autoSize' },
            ],
            skill: heavy ? 'belt' : 'window',
          };
        }
        case 'capture':
          return {
            what: by === 'No braking engine' ? `It zoomed right past ${name}! Nothing could brake.` : `It got to ${name}, but couldn't brake hard enough to stay.`,
            why:
              where === 'mercury'
                ? ['Heading toward the Sun is like rolling downhill: you go faster and faster.', 'By Mercury the probe is going so fast that its little engine can’t stop it.']
                : [`A probe arrives going super fast. To stay, it has to fire its own engine to slow down.`, by === 'No braking engine' ? 'This probe has no big engine, so it can only fly past.' : 'Every brake drinks fuel, and this one ran dry.'],
            meter: pushMeter,
            fixes:
              where === 'mercury'
                ? [{ text: 'Add a braking stage.', control: 'kickStage' }]
                : ['vesta', 'ceres', 'vestaCeres', 'rock'].includes(where)
                  ? [{ text: 'Try a probe with a super fuel-saving engine.', control: 'payload' }]
                  : [{ text: 'Pick a probe with its own engine.', control: 'payload' }],
            skill: where === 'mercury' ? 'sunward' : ['vesta', 'ceres', 'vestaCeres', 'rock'].includes(where) ? 'ion' : 'brake',
          };
        case 'hop':
        case 'cruise':
          return {
            what: `It ran out of fuel on the way (${String(d.leg).toLowerCase()}).`,
            why: ['Every stop means braking, then speeding up again to leave.', 'A normal rocket engine drinks fuel fast. An ion engine sips it.'],
            meter: pushMeter,
            fixes: [{ text: 'Try a probe with a super fuel-saving engine.', control: 'payload' }],
            skill: 'ion',
          };
        case 'entry':
          return {
            what: `It burned up diving into ${name}'s air!`,
            why: [`${name} has air. Diving in that fast makes things glow hot.`, `${by.replace(/ \(no heat shield\)$/, '')} has no heat shield. The Moon has no air, so Moon landers don't need one.`],
            fixes: [{ text: `Pick a lander built for ${name}.`, control: 'lander' }],
            skill: 'tripPlan',
          };
        case 'touchdown':
          return {
            what: by.includes('no landing rockets') ? 'The parachute opened, but it still hit the ground way too fast!' : 'The landing rockets ran out of fuel before touchdown!',
            why: ['Mars air is about 100 times thinner than Earth’s. A parachute only slows you to about 300 km/h.', 'Rockets have to do the last part of the landing.'],
            meter: pushMeter,
            fixes: [{ text: 'Pick a lander with landing rockets.', control: 'lander' }],
            skill: 'marsLanding',
          };
        case 'survive':
          return {
            what: `It landed, but Venus cooked and crushed it after ${num(d.availableMS).toFixed(0)} minutes!`,
            why: ['Venus is hotter than a pizza oven, and its air presses down 90 times harder than ours.', 'Landers need thick walls and lots of cooling to last.'],
            meter: { emoji: '⏱️', label: 'Working time', value: num(d.availableMS), limit: num(d.neededMS), unit: 'min', want: 'above', limitLabel: 'goal' },
            fixes: [{ text: 'Pick a lander built for Venus.', control: 'lander' }],
            skill: 'venus',
          };
        case 'home':
        case 'capsule':
        default:
          return {
            what: d.legId === 'capsule' ? 'It came home, but had no capsule to bring the sample down!' : 'It got to the space rock, but ran out of fuel to come home.',
            why: ['Going out is only half the trip. Coming home takes just as big a push again.', 'And the sample needs a little capsule with a heat shield to fall through Earth’s air.'],
            meter: d.legId === 'capsule' ? undefined : pushMeter,
            fixes: [{ text: 'Pick a probe built to bring a sample home.', control: 'payload' }],
            skill: 'sampleReturn',
          };
      }
    }
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
