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
  | 'freeReturn'
  | 'lander'
  | 'lifeboat'
  | 'cargo'
  | 'corridor'
  | 'window'
  | 'brake'
  | 'marsLanding'
  | 'tripPlan'
  | 'venus'
  | 'sunward'
  | 'belt'
  | 'ion'
  | 'sampleReturn';

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
  freeReturn: {
    id: 'freeReturn',
    emoji: '🔁',
    title: 'The free return: a loop home',
    text: "Aim just right, and the Moon's gravity swings you around its back side and throws you straight home, with no extra fuel. It's a figure-eight path, and it's a built-in way home if anything goes wrong.",
  },
  lander: {
    id: 'lander',
    emoji: '🌕',
    title: 'Reaching the Moon is not landing on it',
    text: "The big rocket throws you toward the Moon. To land, you must brake into Moon orbit, then brake again all the way down. There's no air for parachutes, so a lander brings its own rocket and fuel.",
  },
  lifeboat: {
    id: 'lifeboat',
    emoji: '🛟',
    title: 'Always have a way home',
    text: 'On Apollo 13, the service module broke on the way to the Moon. The crew moved into the lander and used it as a lifeboat, and the free return swung them around the Moon and home.',
  },
  cargo: {
    id: 'cargo',
    emoji: '📦',
    title: 'Heavy cargo needs a heavy lander',
    text: "A cargo lander has to brake twice: into Moon orbit, then down to the ground. The heavier the cargo, the more fuel that takes, and the bigger the rocket needed to throw it all to the Moon.",
  },
  corridor: {
    id: 'corridor',
    emoji: '🎳',
    title: 'Come home at just the right angle',
    text: 'Too steep, and the capsule gets too hot and too squished. Too shallow, and it bounces off the air like a stone skipping on water. There’s a safe angle in between.',
  },
  window: {
    id: 'window',
    emoji: '📅',
    title: 'Launch windows: go when the planets line up',
    text: "The planets are always moving around the Sun. You aim for where the planet will be when you get there, not where it is now. The cheapest trips only line up every so often: every 19 months for Venus, every 26 months for Mars.",
  },
  brake: {
    id: 'brake',
    emoji: '🛑',
    title: 'To stay, you have to brake',
    text: "A probe arrives going really fast. With no brakes, it zooms right past. To stay in orbit, it fires its own engine at just the right moment to slow down, and the planet's gravity catches it.",
  },
  marsLanding: {
    id: 'marsLanding',
    emoji: '🪂',
    title: 'Mars: heat shield, parachute, then rockets',
    text: "Mars has air, so a heat shield is needed for the hot dive in. But the air is so thin that a parachute only slows you to about 300 km/h. Rockets have to do the last part. Perseverance used a sky crane to lower the rover on ropes.",
  },
  tripPlan: {
    id: 'tripPlan',
    emoji: '🗺️',
    title: 'Every world needs its own lander',
    text: "The Moon has no air, so landers use only rockets. Mars has a little air, so landers need a heat shield and a parachute too. Plan the whole trip: where to, when to go, and how to land when you get there.",
  },
  venus: {
    id: 'venus',
    emoji: '🥵',
    title: 'Venus is hot and crushing',
    text: "Venus is hotter than a pizza oven (465 °C), and its air presses down 90 times harder than Earth's. The best landers lasted about two hours before they cooked. Thick walls and lots of cooling buy more time.",
  },
  sunward: {
    id: 'sunward',
    emoji: '☀️',
    title: 'Falling toward the Sun speeds you up',
    text: "Heading in toward the Sun is like rolling downhill: you go faster and faster. To stop at Mercury you need a really big brake. The real MESSENGER probe used six planet flybys to slow down instead, a trick you'll learn later.",
  },
  belt: {
    id: 'belt',
    emoji: '🪨',
    title: 'The asteroid belt is mostly empty',
    text: "In films, asteroids are crowded together. Really, they are about a million kilometres apart. Probes fly through without dodging anything, so they don't need heavy armour.",
  },
  ion: {
    id: 'ion',
    emoji: '⚡',
    title: 'Ion engines: gentle but tireless',
    text: "An ion engine pushes about as hard as a sheet of paper resting on your hand. But it uses hardly any fuel, so it can push for years and get faster and faster. Dawn used one to visit Vesta, then Ceres.",
  },
  sampleReturn: {
    id: 'sampleReturn',
    emoji: '🧪',
    title: 'Coming home takes fuel too',
    text: "Going out is only half the trip. To bring a sample home you need just as much push again for the way back, and a little capsule with a heat shield to drop it through Earth's air.",
  },
};
