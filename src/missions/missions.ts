// Mission Mode, Chapters 1–3: Launch School, Higher and Further, and the Moon.
// Each mission teaches one idea and unlocks the controls it needs. Some start with a
// rocket that fails on purpose, so the failure card can teach the fix.

import { catalog, presets } from '../data/catalog';
import {
  addStage,
  blankRocket,
  payloadSlot,
  setEngineCount,
  setMission,
  setName,
  setPayloadSlot,
  setRecovery,
  setTank,
} from '../physics/edit';
import type { MissionRecord } from '../physics/mission';
import type { RocketSpec } from '../physics/types';
import type { Chapter, CheckContext, Mission } from './types';

export const CHAPTERS: Chapter[] = [
  { n: 1, title: 'Launch School', rank: 'Cadet' },
  { n: 2, title: 'Higher and Further', rank: 'Pilot' },
  { n: 3, title: 'The Moon', rank: 'Commander' },
];

/** Rank earned by finishing each chapter (the first is where you start). */
export const RANKS = ['Cadet', 'Pilot', 'Commander', 'Moon Walker'];

// ---------- starting rockets ----------

/** Space Q's two-stage trainer: three Raptors below, one Raptor Vacuum above, a capsule on top. */
function trainer(): RocketSpec {
  return { ...setName(addStage(blankRocket(), catalog), 'Space Q Trainer'), id: 'trainer' };
}

const preset = (id: string): RocketSpec => structuredClone(presets.find((p) => p.id === id)!);

/** Saturn V with the lander left at home. */
const saturnNoLander = () => setPayloadSlot(preset('saturn-v'), 'lander', null);

/** Roscoe's A1-39 as a cargo rocket: the Moon base on top, but nothing to land it with. */
function a139Cargo(): RocketSpec {
  const bare = (['lander', 'service', 'capsule', 'tower'] as const).reduce((s, slot) => setPayloadSlot(s, slot, null), preset('a1-39'));
  return { ...setName(setPayloadSlot(bare, 'cargo', 'moon-base'), 'A1-39 Moon Base Delivery'), id: 'a1-39-cargo' };
}

/** The trainer carrying a little satellite instead of the capsule. */
function satTrainer(): RocketSpec {
  return setName(setPayloadSlot(setPayloadSlot(trainer(), 'capsule', null), 'cargo', 'satellite-small'), 'Space Q Sat Launcher');
}

// ---------- checks ----------

const orbit = (m: MissionRecord) => m.ascent.outcome.success;
const maxAltM = (m: MissionRecord) => Math.max(0, ...m.ascent.samples.map((s) => s.altitudeM));
const crewHome = (m: MissionRecord) => m.reentry?.outcome === 'splashdown';
const boosterLanded = (m: MissionRecord) => m.recoveries.some((r) => r.kind === 'stage' && r.stageIndex === 0 && r.outcome === 'landed');
const airPushShare = (m: MissionRecord) => m.ascent.summary.maxQPa / m.ascent.summary.structuralLimitPa;
const heatShare = (m: MissionRecord) =>
  m.reentry ? Math.max(m.reentry.peakHeatFluxWm2 / m.reentry.maxHeatFluxWm2, m.reentry.heatLoadJm2 / m.reentry.maxHeatLoadJm2) : 1;
const engines = (spec: RocketSpec, i = 0) => spec.stages[i]?.parts.find((p) => catalog[p.part]?.type === 'liquidEngine')?.count ?? 0;
const done = (c: CheckContext) => !c.m.result.failure;
const moonOk = (m: MissionRecord) => !!m.moon?.success;
const boostersSaved = (m: MissionRecord) => m.recoveries.some((r) => r.kind === 'boosters' && r.outcome === 'splashdown');
/** Spare push left after the big burn toward the Moon. */
const tliSpare = (m: MissionRecord) => {
  const tli = m.moon?.legs.find((l) => l.id === 'tli');
  return tli ? tli.availableMS - tli.neededMS : Infinity;
};

export const MISSIONS: Mission[] = [
  // ---------------- Chapter 1: Launch School ----------------
  {
    id: 'liftoff',
    chapter: 1,
    kind: 'spaceq',
    title: 'Liftoff!',
    patch: '🚀',
    briefing: [
      'Welcome to Space Q, Cadet Roscoe! I’m Flight Director Did.',
      'Every Space Q astronaut starts right here, with a first launch.',
      'This is the Space Q Trainer. Let’s see what it can do!',
    ],
    goalText: 'Reach space (100 km up)',
    rocket: trainer,
    goal: (c) => maxAltM(c.m) >= 100e3,
    stars: [
      { text: 'Get all the way to orbit', check: (c) => orbit(c.m) },
      { text: 'Watch it in slow motion with the 🐢', check: (c) => c.stats.usedSlow && maxAltM(c.m) >= 100e3 },
    ],
    unlocks: ['speed'],
    skill: 'orbit',
    coach: [
      { say: 'Tap the big LAUNCH button. Then count down with me!', point: 'launch', until: (c) => c.phase !== 'ready' },
      { say: 'These buttons change the speed of time. Try the turtle for slow motion!', point: 'speed', until: (c) => c.speed === 3 || c.phase === 'done' },
    ],
    flightLines: {
      liftoff: 'Liftoff! Watch the dials: speed, height and fuel.',
      maxQ: 'This is max-Q, where the air pushes hardest. Hold on!',
      staging: 'The bottom stage is empty, so it drops away!',
      orbit: 'You’re in orbit! Going sideways super fast, so you keep falling around the Earth.',
    },
    hints: ['Hmm, that didn’t go up very far. Let’s try again!', 'Just tap LAUNCH and watch. The Trainer knows the way.'],
    hintControl: 'speed',
    debrief: 'Your first launch, Cadet! Space starts 100 km up, and you flew right past it.',
    solve: (s) => s,
  },
  {
    id: 'too-heavy',
    chapter: 1,
    kind: 'spaceq',
    title: 'Too Heavy!',
    patch: '🏋️',
    briefing: [
      'Uh oh. The Chief Engineer took some engines off the Trainer to fix them.',
      'Now it only has one engine. Do you think it can lift off?',
      'Launch it and see. If it doesn’t work, we’ll fix it together.',
    ],
    goalText: 'Reach space (100 km up)',
    rocket: () => setEngineCount(trainer(), catalog, 0, 1),
    goal: (c) => maxAltM(c.m) >= 100e3,
    stars: [
      { text: 'Get all the way to orbit', check: (c) => orbit(c.m) },
      { text: 'Use 4 engines or fewer on the bottom stage', check: (c) => orbit(c.m) && engines(c.spec) <= 4 && !c.spec.stages[0].boosters },
    ],
    unlocks: ['build', 'engines', 'boosters'],
    skill: 'thrust',
    coach: [{ say: 'Launch it and see what happens!', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { liftoff: 'It’s lifting off! More push than weight!' },
    hints: ['The rocket didn’t move. What could push harder?', 'Go to Build and add more engines to the bottom stage.'],
    hintControl: 'engines',
    debrief: 'You fixed it! Engines must push harder than the whole rocket weighs.',
    solve: (s) => setEngineCount(s, catalog, 0, 3),
  },
  {
    id: 'first-orbit',
    chapter: 1,
    kind: 'history',
    title: 'First Orbit',
    real: 'Vostok 1, 1961: Yuri Gagarin, the first person in orbit',
    patch: '🌍',
    briefing: [
      'Time for a history sim! In 1961, Yuri Gagarin was the first person to orbit the Earth.',
      'This rocket has just one stage. Can one stage get all the way to orbit?',
      'Launch and find out.',
    ],
    goalText: 'Reach orbit and splash down',
    rocket: () => setName(blankRocket(), 'Space Q One-Stage'),
    goal: (c) => orbit(c.m) && crewHome(c.m),
    stars: [
      { text: 'Use only 2 stages', check: (c) => done(c) && c.spec.stages.length <= 2 },
      { text: 'Splash down slower than 9 m/s', check: (c) => crewHome(c.m) && (c.m.reentry?.splashSpeedMS ?? 99) < 9 },
    ],
    unlocks: ['addStage', 'stageStrip'],
    skill: 'stages',
    coach: [{ say: 'Launch the one-stage rocket and watch the fuel dial.', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: {
      staging: 'Stage separation! The empty stage drops away, and the next one lights.',
      orbit: 'Orbit! Just like Yuri Gagarin.',
    },
    hints: ['It ran out of fuel before it was fast enough. Empty tanks are heavy…', 'Go to Build and add a stage on top. The bottom stage will drop off when it is empty.'],
    hintControl: 'addStage',
    debrief: 'That’s staging: drop the empty tanks, and the rest flies faster. Every orbital rocket does it.',
    solve: (s) => addStage(s, catalog),
  },
  {
    id: 'fuel-for-the-job',
    chapter: 1,
    kind: 'spaceq',
    title: 'Fuel for the Job',
    patch: '⛽',
    briefing: [
      'Someone put a teeny tiny fuel tank on the Trainer’s top stage!',
      'The Chief Engineer has added fuel tank controls for you.',
      'Get to orbit, but don’t carry more fuel than you need. Fuel is heavy!',
    ],
    goalText: 'Reach orbit and splash down',
    rocket: () => setTank(trainer(), catalog, 1, { lengthM: 1 }),
    goal: (c) => orbit(c.m) && crewHome(c.m),
    stars: [
      { text: 'Weigh less than 400 t at liftoff', check: (c) => done(c) && c.m.ascent.summary.liftoffMassKg < 400e3 },
      { text: 'Just enough fuel: less than 1,000 m/s left over', check: (c) => done(c) && c.m.ascent.outcome.remainingDeltaVMS < 1000 },
    ],
    unlocks: ['tank', 'autoSize'],
    skill: 'fuel',
    flightLines: { staging: 'Watch the top stage’s fuel. Will it be enough?' },
    hints: ['The top stage ran dry. What does it need more of?', 'Make the top stage’s fuel tank bigger, or tap “Make it reach space”.'],
    hintControl: 'tank',
    debrief: 'Just enough fuel is the best fuel. More would only make the rocket heavier.',
    solve: (s) => setTank(s, catalog, 1, { lengthM: 3 }),
  },
  {
    id: 'sputnik',
    chapter: 1,
    kind: 'history',
    title: 'Beep Beep',
    real: 'Sputnik 1, 1957: the first satellite',
    patch: '🛰️',
    briefing: [
      'History sim! In 1957, a little satellite called Sputnik went beep… beep… beep… all the way around the Earth.',
      'It was the very first satellite. Now it’s your turn.',
      'Swap the capsule for a satellite and put it in orbit!',
    ],
    goalText: 'Put a satellite in orbit',
    rocket: trainer,
    goal: (c) => orbit(c.m) && !!payloadSlot(c.spec, 'cargo'),
    stars: [
      { text: 'Protect it with a nose cover', check: (c) => orbit(c.m) && !!payloadSlot(c.spec, 'cargo') && !!payloadSlot(c.spec, 'fairing') },
      { text: 'Launch the BIG satellite', check: (c) => orbit(c.m) && payloadSlot(c.spec, 'cargo') === 'satellite-heavy' },
    ],
    unlocks: ['payload'],
    skill: 'payload',
    flightLines: { jettison: 'The nose cover pops off now that the air is thin!', orbit: 'Beep… beep… beep! Your satellite is in orbit!' },
    hints: ['The goal is a satellite. What’s on top of the rocket right now?', 'In Build, under “On top”, pick a satellite in the Cargo row.'],
    hintControl: 'payload',
    debrief: 'Your first satellite! The payload is the whole point of a rocket.',
    solve: (s) => setPayloadSlot(s, 'cargo', 'satellite-small'),
  },
  {
    id: 'coming-home',
    chapter: 1,
    kind: 'history',
    title: 'Coming Home',
    real: 'Mercury, 1962: John Glenn, first American in orbit',
    patch: '🔥',
    briefing: [
      'History sim! John Glenn orbited the Earth in a little Mercury capsule, then came home.',
      'Our rocket has a satellite on top, but satellites don’t come home. Astronauts do!',
      'Put a crew capsule on top, reach orbit, and splash down safely.',
    ],
    goalText: 'Reach orbit and bring the crew home',
    rocket: satTrainer,
    goal: (c) => orbit(c.m) && crewHome(c.m),
    stars: [
      { text: 'Keep the heat shield under 80% used', check: (c) => crewHome(c.m) && heatShare(c.m) < 0.8 },
      { text: 'Use the normal (lightest) heat shield', check: (c) => crewHome(c.m) && (c.spec.payload.heatShieldScale ?? 1) <= 1 },
    ],
    unlocks: ['heatShield', 'comeHome'],
    skill: 'reentry',
    flightLines: { orbit: 'In orbit! After a few laps, the capsule comes home through the hot air.' },
    hints: ['Nothing came home. What brings astronauts back?', 'In Build, under “On top”, pick a Capsule.'],
    hintControl: 'payload',
    debrief: 'Welcome home! The heat shield took the heat, and the parachutes did the rest.',
    solve: (s) => setPayloadSlot(setPayloadSlot(s, 'cargo', null), 'capsule', 'a139-command-module'),
  },
  {
    id: 'dont-break-it',
    chapter: 1,
    kind: 'spaceq',
    title: 'Don’t Break It',
    patch: '💨',
    briefing: [
      'The Chief Engineer got excited and put FIVE engines on the Trainer.',
      'More push sounds great… but going too fast in thick air can break a rocket.',
      'Watch the new Air push dial. Can you keep it under the red line?',
    ],
    goalText: 'Reach orbit and splash down',
    rocket: () => setMission(setEngineCount(trainer(), catalog, 0, 5), { maxQThrottle: undefined }),
    goal: (c) => orbit(c.m) && crewHome(c.m),
    stars: [
      { text: 'Keep the air push under 85% of the strength', check: (c) => done(c) && airPushShare(c.m) < 0.85 },
      { text: 'Do it without making the body stronger', check: (c) => done(c) && (c.spec.structureScale ?? 1) <= 1 },
    ],
    unlocks: ['airPush', 'easeOff', 'stronger', 'fins'],
    skill: 'maxQ',
    flightLines: { maxQ: 'Max-Q! The air is pushing its hardest right now.' },
    hints: ['The air pushed past the rocket’s strength. Too fast, too low…', 'Turn on “Ease off in thick air”, or make the body stronger.'],
    hintControl: 'easeOff',
    debrief: 'Real rockets ease off at max-Q too. The Space Shuttle turned its engines down every time.',
    solve: (s) => setMission(s, { maxQThrottle: { aboveQPa: 25000, throttle: 0.6 } }),
  },
  {
    id: 'recycle',
    chapter: 1,
    kind: 'history',
    title: 'Recycle the Booster',
    real: 'Falcon 9, 2015: the first orbital booster to land',
    patch: '🦿',
    briefing: [
      'History sim! In 2015, a Falcon 9 booster flew back and landed standing up.',
      'Landing a booster means you can fly it again. But it needs fuel saved for braking.',
      'Turn on “Land it” for the bottom stage and bring it down gently!',
    ],
    goalText: 'Reach orbit and land the booster',
    rocket: () => setRecovery(presets.find((p) => p.id === 'falcon-9')!, 0, 'none'),
    goal: (c) => orbit(c.m) && boosterLanded(c.m),
    stars: [
      { text: 'Touch down slower than 3 m/s', check: (c) => boosterLanded(c.m) && (c.m.recoveries.find((r) => r.kind === 'stage')?.touchdownSpeedMS ?? 9) < 3 },
      { text: 'Save 60 t of landing fuel or less', check: (c) => boosterLanded(c.m) && (c.spec.stages[0].landingReserveKg ?? 0) <= 60e3 },
    ],
    unlocks: ['landIt', 'landingFuel', 'boosterChutes'],
    skill: 'landing',
    flightLines: { staging: 'Booster separation! Now watch the landing cam.' },
    hints: ['The booster fell into the sea. It needs to save fuel to land.', 'Turn on “Land it” on the bottom stage. If it crashes, save more landing fuel.'],
    hintControl: 'landIt',
    debrief: 'The booster landed! Saving fuel costs some speed going up, but you get the booster back.',
    solve: (s) => setRecovery(s, 0, 'propulsive', 70e3),
  },
  {
    id: 'houston',
    chapter: 1,
    kind: 'spaceq',
    title: 'Houston, We Have a Problem',
    patch: '🛠️',
    briefing: [
      'Today’s drill: an engine is going to stop during launch. On purpose!',
      'Real rockets plan for this. With enough engines, the others keep going.',
      'Make the Trainer tough enough to reach orbit with one engine out.',
    ],
    goalText: 'Reach orbit even with an engine out',
    rocket: trainer,
    faults: [{ kind: 'engineOut', stageIndex: 0, afterIgnitionS: 10, engines: 1 }],
    goal: (c) => orbit(c.m) && crewHome(c.m),
    stars: [
      { text: 'Still have 1,500 m/s left in orbit', check: (c) => done(c) && c.m.ascent.outcome.remainingDeltaVMS >= 1500 },
      { text: 'Win a flight with Chaos Mode on 🎲', check: (c) => done(c) && c.stats.chaos },
    ],
    unlocks: ['chaos'],
    skill: 'engineOut',
    flightLines: { engineOut: 'Engine out! Can the others make up for it?' },
    hints: ['With one engine gone, the rest couldn’t push hard enough.', 'Add a spare engine or two to the bottom stage.'],
    hintControl: 'engines',
    debrief: 'Engine-out drill passed! That’s why big rockets carry lots of engines.',
    solve: (s) => setEngineCount(s, catalog, 0, 4),
  },

  // ---------------- Chapter 2: Higher and Further ----------------
  {
    id: 'space-station',
    chapter: 2,
    kind: 'history',
    title: 'Visit the Space Station',
    real: 'International Space Station: about 400 km up',
    patch: '🏠',
    briefing: [
      'Welcome to Chapter 2, Pilot! The International Space Station flies about 400 km up.',
      'Our rocket is set to stop at 200 km. Too low to dock!',
      'Change how high you go, reach the station, and bring the crew home.',
    ],
    goalText: 'Orbit at least 380 km up and bring the crew home',
    rocket: trainer,
    goal: (c) => (c.m.ascent.outcome.orbit?.perigeeAltM ?? 0) >= 380e3 && crewHome(c.m),
    stars: [
      { text: 'Land the booster too', check: (c) => done(c) && boosterLanded(c.m) },
      { text: 'Weigh less than 420 t at liftoff', check: (c) => done(c) && c.m.ascent.summary.liftoffMassKg < 420e3 },
    ],
    unlocks: ['targetHeight'],
    skill: 'height',
    flightLines: { orbit: 'Station in sight! Docking… complete!' },
    hints: ['The orbit wasn’t high enough to reach the station.', 'In Build, set “How high” to 400 km.'],
    hintControl: 'targetHeight',
    debrief: 'Docked! Higher orbits take more fuel, but there’s less air up there to slow you down.',
    solve: (s) => setMission(s, { targetOrbitAltitudeM: 400e3 }),
  },
  {
    id: 'weather-watcher',
    chapter: 2,
    kind: 'spaceq',
    title: 'Weather Watcher',
    patch: '⛅',
    briefing: [
      'Space Q has a new weather satellite! It needs to go WAY up: 36,000 km.',
      'Up there it goes around once a day, so it watches the same spot all the time.',
      'Getting there takes two extra pushes after reaching orbit. Set “Where to?” to High orbit!',
    ],
    goalText: 'Put the satellite in a 36,000 km orbit',
    rocket: () => setTank(satTrainer(), catalog, 1, { lengthM: 2 }),
    goal: (c) => c.spec.mission.target === 'highOrbit' && !!c.m.raise?.success,
    stars: [
      { text: 'Protect it with a nose cover', check: (c) => !!c.m.raise?.success && !!payloadSlot(c.spec, 'fairing') },
      { text: 'Land the booster too', check: (c) => !!c.m.raise?.success && boosterLanded(c.m) },
    ],
    unlocks: ['whereTo'],
    skill: 'highOrbit',
    hints: ['The satellite has to climb to 36,000 km. Is “Where to?” set to High orbit? Is there enough fuel?', 'Set “Where to?” to High orbit, then make the top stage’s tank bigger.'],
    hintControl: 'whereTo',
    debrief: 'Two pushes: one to stretch the orbit into an egg, one at the top to make it round. That’s a Hohmann transfer!',
    solve: (s) => setTank(setMission(s, { target: 'highOrbit' }), catalog, 1, { lengthM: 4 }),
  },
  {
    id: 'own-rocket',
    chapter: 2,
    kind: 'spaceq',
    title: 'Space Q’s Own Rocket',
    patch: '✏️',
    briefing: [
      'This is your Pilot exam, and it’s a big one.',
      'No trainer this time: you start from scratch and design Space Q’s own rocket.',
      'Get a crew to orbit and back. Then give your rocket a name and save it!',
    ],
    goalText: 'Design a rocket that reaches orbit and brings the crew home',
    rocket: () => setName(blankRocket(), 'My Space Q rocket'),
    goal: (c) => orbit(c.m) && crewHome(c.m),
    stars: [
      { text: 'Land the booster too', check: (c) => done(c) && boosterLanded(c.m) },
      { text: 'Name it and save it 💾', check: (c) => done(c) && c.stats.saved },
    ],
    unlocks: ['engineType', 'tinker', 'scratch'],
    skill: 'design',
    hints: ['Think back: stages, fuel, enough push, not too fast in thick air.', 'Add a stage on top. Then check the push meter says it can lift off.'],
    hintControl: 'addStage',
    debrief: 'Pilot exam passed! You designed a real orbital rocket. Next stop: the Moon.',
    solve: (s) => addStage(s, catalog),
  },

  // ---------------- Chapter 3: The Moon ----------------
  {
    id: 'around-the-moon',
    chapter: 3,
    kind: 'history',
    title: 'Around the Moon',
    real: 'Artemis II, 2026: four astronauts loop around the Moon',
    patch: '🔁',
    briefing: [
      'Welcome to Chapter 3, Commander! Time to leave Earth behind.',
      'This is NASA’s SLS rocket with the Orion capsule. It’s set to stop in space, but we’re going around the Moon!',
      'And the Chief Engineer set it to come home steep. Coming back from the Moon is FAST, so pick the angle carefully.',
    ],
    goalText: 'Loop around the Moon and bring the crew home',
    rocket: () => setMission(preset('sls'), { target: 'orbit', reentryAngleDeg: -7.5 }),
    goal: (c) => moonOk(c.m) && crewHome(c.m),
    stars: [
      { text: 'Find the coolest way home: heat shield under 80%', check: (c) => moonOk(c.m) && crewHome(c.m) && heatShare(c.m) < 0.8 },
      { text: 'Bring the boosters back with parachutes ♻️', check: (c) => moonOk(c.m) && crewHome(c.m) && boostersSaved(c.m) },
    ],
    unlocks: [],
    skill: 'freeReturn',
    coach: [
      { say: 'Tap Build. “Where to?” says Space right now.', point: 'tab:build', until: (c) => c.tab === 'build' },
      { say: 'Change “Where to?” to Around the Moon!', point: 'whereTo', until: (c) => c.spec.mission.target === 'moonFlyby' || c.spec.mission.target === 'moon' },
      { say: 'Now tap Fly and launch. Watch for the big push toward the Moon!', point: 'tab:fly', until: (c) => c.tab === 'fly' },
    ],
    flightLines: {
      boosterSeparation: 'The two side boosters drop off.',
      orbit: 'In orbit! Next, the top stage fires again to throw Orion toward the Moon.',
    },
    hints: ['The crew only went to space. Where were we going?', 'In Build, set “Where to?” to Around the Moon.'],
    hintControl: 'whereTo',
    debrief: 'Around the Moon and home! The Moon’s gravity did the turning, with no extra fuel. That’s a free return.',
    solve: (s) => setMission(s, { target: 'moonFlyby', reentryAngleDeg: undefined }),
  },
  {
    id: 'moon-landing',
    chapter: 3,
    kind: 'history',
    title: 'Land on the Moon',
    real: 'Apollo 11, 1969: the first people on the Moon',
    patch: '👣',
    briefing: [
      'The biggest history sim of all! In 1969, Neil Armstrong and Buzz Aldrin landed on the Moon.',
      'Here’s their rocket, the mighty Saturn V. But wait… someone forgot to pack the lander!',
      'Launch it and see how far it gets. Then let’s fix it.',
    ],
    goalText: 'Land on the Moon and bring the crew home',
    rocket: () => setName(saturnNoLander(), 'Saturn V (no lander)'),
    goal: (c) => moonOk(c.m) && c.m.moon?.trip === 'land' && !c.m.moon.oneWay && crewHome(c.m),
    stars: [
      { text: 'Just enough fuel: less than 400 m/s spare after the Moon push', check: (c) => done(c) && c.m.moon?.trip === 'land' && tliSpare(c.m) < 400 },
      { text: 'Win with Chaos Mode on 🎲', check: (c) => done(c) && c.m.moon?.trip === 'land' && c.stats.chaos },
    ],
    unlocks: ['lander'],
    skill: 'lander',
    coach: [{ say: 'Launch it! Watch the list of Moon burns. Which one goes wrong?', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: {
      staging: 'Stage separation! The Saturn V has three stages.',
      orbit: 'Parked in orbit. Next, the top stage fires again, toward the Moon!',
    },
    hints: ['It got to the Moon but couldn’t land. What lands on the Moon?', 'In Build, under “On top”, pick the Apollo lander in the Moon lander row.'],
    hintControl: 'lander',
    debrief: 'The Eagle has landed! The lander’s bottom half brakes all the way down, and its top half blasts the crew back up.',
    solve: (s) => setPayloadSlot(s, 'lander', 'apollo-lm'),
  },
  {
    id: 'apollo-13',
    chapter: 3,
    kind: 'history',
    title: 'Get Them Home',
    real: 'Apollo 13, 1970: the successful failure',
    patch: '🛟',
    briefing: [
      'History sim! On the way to the Moon, Apollo 13’s oxygen tank exploded and broke the service module.',
      'This time we’re only flying around the Moon, so the Chief Engineer left the lander at home to save weight.',
      'But the same thing is going to break. Can you get the crew home anyway?',
    ],
    goalText: 'Bring the crew home after the service module breaks',
    rocket: () => setName(setMission(saturnNoLander(), { target: 'moonFlyby' }), 'Apollo 13'),
    faults: [{ kind: 'serviceModule' }],
    goal: (c) => moonOk(c.m) && crewHome(c.m),
    stars: [
      { text: 'Fly it as a landing mission, like the real Apollo 13', check: (c) => moonOk(c.m) && crewHome(c.m) && c.spec.mission.target === 'moon' },
      { text: 'Win with Chaos Mode on 🎲', check: (c) => moonOk(c.m) && crewHome(c.m) && c.stats.chaos },
    ],
    unlocks: [],
    skill: 'lifeboat',
    coach: [{ say: 'Launch it, and watch what happens on the way to the Moon.', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { orbit: 'In orbit. Everything looks good… for now.' },
    hints: ['The service module broke, and there was nowhere else for the crew to go.', 'Put the Apollo lander back on. It can be a lifeboat!'],
    hintControl: 'lander',
    debrief: 'Crew safe! The real Apollo 13 crew lived in their lander for four days, and the free return brought them home.',
    solve: (s) => setPayloadSlot(s, 'lander', 'apollo-lm'),
  },
  {
    id: 'moon-base',
    chapter: 3,
    kind: 'spaceq',
    title: 'Moon Base Delivery',
    patch: '🏗️',
    briefing: [
      'Big day for Space Q! We’re building a Moon base, and the first piece is ready.',
      'It’s riding on your very own A1-39. But reaching the Moon isn’t the same as landing on it…',
      'Get the base down on the Moon in one piece. No crew this time: the lander stays there.',
    ],
    goalText: 'Land the Moon base on the Moon',
    rocket: a139Cargo,
    goal: (c) => moonOk(c.m) && !!c.m.moon?.oneWay && payloadSlot(c.spec, 'cargo') === 'moon-base',
    stars: [
      { text: 'Protect the base with a nose cover', check: (c) => moonOk(c.m) && !!c.m.moon?.oneWay && !!payloadSlot(c.spec, 'fairing') },
      { text: 'Weigh less than 6,000 t at liftoff', check: (c) => moonOk(c.m) && !!c.m.moon?.oneWay && c.m.ascent.summary.liftoffMassKg < 6000e3 },
    ],
    unlocks: [],
    skill: 'cargo',
    flightLines: { orbit: 'Base in orbit! Now for the long trip to the Moon.' },
    hints: ['The base got to the Moon, but nothing could land it. What brakes and touches down?', 'In Build, pick the Space Q cargo lander in the Moon lander row.'],
    hintControl: 'lander',
    debrief: 'Space Q has a Moon base! Landing takes way more fuel than flying past: two big brakes, and no air to help.',
    solve: (s) => setPayloadSlot(s, 'lander', 'spaceq-cargo-lander'),
  },
];

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);
