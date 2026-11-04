// The Skill Book: rocket science Roscoe learns, one page per idea. Missions teach them;
// failure cards link to the page that explains what went wrong.

export type SkillId =
  | 'thrust'
  | 'orbit'
  | 'stages'
  | 'fuel'
  | 'payload'
  | 'reentry'
  | 'maxQ'
  | 'stability'
  | 'landing'
  | 'engineOut'
  | 'height'
  | 'highOrbit'
  | 'design'
  | 'moonTrip'
  | 'corridor';

export interface Skill {
  id: SkillId;
  emoji: string;
  title: string;
  /** Two or three short sentences, read aloud. */
  text: string;
}

export const SKILLS: Record<SkillId, Skill> = {
  thrust: {
    id: 'thrust',
    emoji: '💪',
    title: 'Push beats weight',
    text: 'Engines push up. Gravity pulls down on everything: the rocket, the fuel and the crew. The push has to be bigger than the weight, or the rocket stays on the pad.',
  },
  orbit: {
    id: 'orbit',
    emoji: '🌍',
    title: 'Orbit means going sideways, fast',
    text: "Space starts about 100 km up, but to stay there you have to go sideways super fast: about 28,000 km/h. Then you keep falling around the Earth and never hit it. That's an orbit!",
  },
  stages: {
    id: 'stages',
    emoji: '🧩',
    title: 'Stages drop what they don’t need',
    text: 'An empty tank is just heavy. Rockets come in stages: when one runs out of fuel it drops away, so the rest is much lighter and goes faster.',
  },
  fuel: {
    id: 'fuel',
    emoji: '⛽',
    title: 'Fuel is heavy too',
    text: 'More fuel lets you go faster, but fuel is heavy, so you need more push to lift it. The best rockets carry just enough fuel for the job.',
  },
  payload: {
    id: 'payload',
    emoji: '📦',
    title: 'The payload is the point',
    text: "The payload is what the rocket is for: a satellite, a capsule with a crew, a lander. The nose cover keeps the air off it, then drops away once the air is thin.",
  },
  reentry: {
    id: 'reentry',
    emoji: '🔥',
    title: 'Coming home is hot',
    text: 'Coming back, the capsule rubs against the air so fast it glows. The heat shield takes the heat, then parachutes slow it down for a soft splash.',
  },
  maxQ: {
    id: 'maxQ',
    emoji: '💨',
    title: 'Max-Q: the air pushes back',
    text: 'The faster you go while the air is still thick, the harder the air pushes on the rocket. Every rocket has a strength limit. Ease off the engines in thick air, or build a stronger body.',
  },
  stability: {
    id: 'stability',
    emoji: '🎯',
    title: 'Fins keep it pointing straight',
    text: "If the air pushes harder near the nose than the tail, the rocket wants to flip, like a dart thrown backwards. Fins at the bottom move the push back so it flies straight. Engines that swivel help steer.",
  },
  landing: {
    id: 'landing',
    emoji: '🦿',
    title: 'Landing takes saved fuel',
    text: 'To land a booster, you save some fuel for braking on the way down. Saved fuel is fuel you can’t use going up, so landing costs you some speed.',
  },
  engineOut: {
    id: 'engineOut',
    emoji: '🛠️',
    title: 'Spare engines save the day',
    text: 'If one engine stops, the others can burn longer to make up for it, but only if there are enough of them. That is why big rockets have lots of engines.',
  },
  height: {
    id: 'height',
    emoji: '📏',
    title: 'Higher orbits go slower',
    text: 'You can pick how high to orbit. Higher takes more fuel to reach, but once you’re there you go a bit slower, and the thin air there doesn’t pull you down.',
  },
  highOrbit: {
    id: 'highOrbit',
    emoji: '🛰️',
    title: 'Two pushes to climb high',
    text: 'To get way up high, push forward once to stretch your orbit into an egg shape. At the top of the egg, push again to make it round. A satellite 36,000 km up goes around once a day, so it stays over the same spot.',
  },
  design: {
    id: 'design',
    emoji: '✏️',
    title: 'You can design your own',
    text: 'Every rocket is a balance: enough push to lift off, enough fuel to get there, strong enough for the air, and stages to drop what you don’t need.',
  },
  moonTrip: {
    id: 'moonTrip',
    emoji: '🌕',
    title: 'The Moon needs a second big push',
    text: "Getting to space is only the start. Heading to the Moon takes another push of about 3,200 m/s, so the top stage must still have lots of fuel once it's in orbit.",
  },
  corridor: {
    id: 'corridor',
    emoji: '🎳',
    title: 'Come home at just the right angle',
    text: 'Too steep, and the capsule gets too hot and too squished. Too shallow, and it bounces off the air like a stone skipping on water. There’s a safe angle in between.',
  },
};
