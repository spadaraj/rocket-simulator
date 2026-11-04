// Mission Mode, Chapters 1–5: Launch School, Higher and Further, the Moon, the inner planets
// and the asteroid belt.
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
import type { Arrival, Destination, RocketSpec } from '../physics/types';
import type { Chapter, CheckContext, Mission } from './types';

export const CHAPTERS: Chapter[] = [
  { n: 1, title: 'Launch School', rank: 'Cadet' },
  { n: 2, title: 'Higher and Further', rank: 'Pilot' },
  { n: 3, title: 'The Moon', rank: 'Commander' },
  { n: 4, title: 'Inner Planets', rank: 'Moon Walker' },
  { n: 5, title: 'The Asteroid Belt', rank: 'Planet Hunter' },
];

/** Rank earned by finishing each chapter (the first is where you start). */
export const RANKS = ['Cadet', 'Pilot', 'Commander', 'Moon Walker', 'Planet Hunter', 'Deep Space Explorer'];

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

/** Take everything off the top except the nose cover. */
const clearTop = (s: RocketSpec) => (['kick', 'lander', 'cargo', 'service', 'capsule', 'tower'] as const).reduce((x, slot) => setPayloadSlot(x, slot, null), s);

const trip = (s: RocketSpec, destination: Destination, arrival: Arrival, launchOffsetDays = 0) =>
  setMission(s, { target: 'planet', destination, arrival, launchOffsetDays });

/** The trainer as a probe launcher: a probe under the nose cover instead of the capsule. */
const probeTrainer = (probe: string) => setName(setPayloadSlot(setPayloadSlot(clearTop(trainer()), 'cargo', probe), 'fairing', 'fairing-5m'), 'Space Q Probe Launcher');

/** Falcon Heavy with something else under the nose cover. */
const heavyWith = (slot: 'cargo' | 'lander', part: string) => setPayloadSlot(clearTop(preset('falcon-heavy')), slot, part);

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
const planetOk = (m: MissionRecord, dest: Destination, arrival?: Arrival) =>
  !!m.planet?.success && m.planet.destination === dest && (!arrival || m.planet.arrival === arrival);
/** Launched within two weeks of the best day. */
const onTime = (m: MissionRecord) => Math.abs(m.planet?.offsetDays ?? 99) <= 14;
const liftoffT = (m: MissionRecord) => m.ascent.summary.liftoffMassKg / 1000;
const legSpare = (m: MissionRecord, id: string) => {
  const l = m.planet?.legs.find((x) => x.id === id);
  return l ? l.availableMS - l.neededMS : -Infinity;
};
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

  // ---------------- Chapter 4: Inner Planets ----------------
  {
    id: 'hello-venus',
    chapter: 4,
    kind: 'history',
    title: 'Hello Venus',
    real: 'Mariner 2, 1962: the first visit to another planet',
    patch: '🟡',
    briefing: [
      'Welcome to Chapter 4, Moon Walker! Now we leave the Earth and the Moon behind.',
      'In 1962, a little probe called Mariner 2 flew past Venus. It was the first visit to another planet!',
      'Our probe is all set for Venus. But planets move… and the launch day is set six months late. Let’s see what happens.',
    ],
    goalText: 'Fly past Venus',
    rocket: () => trip(probeTrainer('planet-probe'), 'venus', 'flyby', 180),
    goal: (c) => planetOk(c.m, 'venus'),
    stars: [
      { text: 'Launch within 2 weeks of the best day 🎯', check: (c) => planetOk(c.m, 'venus') && onTime(c.m) },
      { text: 'Just enough fuel: weigh less than 400 t at liftoff', check: (c) => planetOk(c.m, 'venus') && liftoffT(c.m) < 400 },
    ],
    unlocks: ['launchDay'],
    skill: 'window',
    coach: [{ say: 'Launch it! After orbit, watch the map. Where is Venus when the probe gets there?', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { orbit: 'In orbit! Next, the top stage fires again to leave Earth for good.' },
    hints: ['The top stage couldn’t push hard enough. Were Earth and Venus lined up?', 'In Build, change “Launch day” until it says 🎯 Best day.'],
    hintControl: 'launchDay',
    debrief: 'Hello Venus! You launched when the planets lined up, so the trip took the smallest push. That’s a launch window.',
    solve: (s) => setMission(s, { launchOffsetDays: 0 }),
  },
  {
    id: 'mars-orbiter',
    chapter: 4,
    kind: 'history',
    title: 'Mars Orbiter',
    real: 'Mars Reconnaissance Orbiter, 2005: still taking pictures of Mars today',
    patch: '🔴',
    briefing: [
      'History sim! In 2005, NASA sent a big orbiter to Mars. It’s still up there, taking amazing pictures.',
      'Flying past is easy. Staying is harder: you have to brake when you get there.',
      'The Chief Engineer packed the little flyby probe again. Can it stay at Mars?',
    ],
    goalText: 'Get into orbit around Mars',
    rocket: () => trip(probeTrainer('planet-probe'), 'mars', 'orbit'),
    goal: (c) => planetOk(c.m, 'mars', 'orbit'),
    stars: [
      { text: 'Keep 700 m/s of braking fuel spare', check: (c) => planetOk(c.m, 'mars', 'orbit') && legSpare(c.m, 'capture') >= 700 },
      { text: 'Win with Chaos Mode on 🎲', check: (c) => planetOk(c.m, 'mars', 'orbit') && c.stats.chaos },
    ],
    unlocks: ['arrive'],
    skill: 'brake',
    coach: [{ say: 'Launch it, then watch closely when the probe gets to Mars.', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { orbit: 'Parked in Earth orbit. Next stop: Mars, about 8 months away!' },
    hints: ['It zoomed right past Mars! What could slow it down?', 'In Build, pick the Mars orbiter in the Cargo row. It has its own engine.'],
    hintControl: 'payload',
    debrief: 'In orbit at Mars! The orbiter fired its engine at just the right moment, and Mars’s gravity caught it.',
    solve: (s) => setPayloadSlot(s, 'cargo', 'mars-orbiter'),
  },
  {
    id: 'rover-drop',
    chapter: 4,
    kind: 'history',
    title: 'Rover Drop',
    real: 'Perseverance, 2020: a rover lowered onto Mars by a sky crane',
    patch: '🪂',
    briefing: [
      'History sim! Perseverance is a car-size rover driving around Mars right now.',
      'Mars has air, so a big parachute should slow it down, just like our capsules at home… right?',
      'Here’s a rover with only a parachute. Let’s try it.',
    ],
    goalText: 'Land a rover on Mars',
    rocket: () => setName(trip(heavyWith('lander', 'rover-chute'), 'mars', 'land'), 'Falcon Heavy Mars Rover'),
    goal: (c) => planetOk(c.m, 'mars', 'land') && !!payloadSlot(c.spec, 'lander')?.startsWith('rover'),
    stars: [
      { text: 'Bring the side boosters back with parachutes ♻️', check: (c) => planetOk(c.m, 'mars', 'land') && boostersSaved(c.m) },
      { text: 'Win with Chaos Mode on 🎲', check: (c) => planetOk(c.m, 'mars', 'land') && c.stats.chaos },
    ],
    unlocks: ['rover'],
    skill: 'marsLanding',
    coach: [{ say: 'Launch it, and watch the landing at the very end.', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { boosterSeparation: 'The two side boosters drop away!' },
    hints: ['The parachute wasn’t enough. Mars air is very thin…', 'In Build, pick the rover with a sky crane in the Lander row.'],
    hintControl: 'lander',
    debrief: 'Touchdown! Heat shield, parachute, then rockets: and the sky crane lowered the rover gently on ropes.',
    solve: (s) => setPayloadSlot(s, 'lander', 'rover-skycrane'),
  },
  {
    id: 'mars-landing',
    chapter: 4,
    kind: 'spaceq',
    title: 'Space Q Lands on Mars',
    patch: '🛬',
    briefing: [
      'This is it: Space Q’s first landing on Mars! It’s a big step toward our dream of sending a crew there.',
      'Your A1-39 still has the Moon cargo lander on top. You’ll plan this whole trip yourself.',
      'Where to, what to do there, when to go, and how to land. Let’s go!',
    ],
    goalText: 'Land the Space Q Mars lander on Mars',
    rocket: () => setName(setPayloadSlot(a139Cargo(), 'lander', 'spaceq-cargo-lander'), 'A1-39 Cargo'),
    goal: (c) => planetOk(c.m, 'mars', 'land') && payloadSlot(c.spec, 'lander') === 'spaceq-mars-lander',
    stars: [
      { text: 'Launch within 2 weeks of the best day 🎯', check: (c) => planetOk(c.m, 'mars', 'land') && onTime(c.m) },
      { text: 'Bring the Moon base along to Mars too 📦', check: (c) => planetOk(c.m, 'mars', 'land') && payloadSlot(c.spec, 'cargo') === 'moon-base' },
    ],
    unlocks: ['marsLander'],
    skill: 'tripPlan',
    coach: [
      { say: 'Tap Build. Right now we’re set for the Moon.', point: 'tab:build', until: (c) => c.tab === 'build' },
      { say: 'Change “Where to?” to Mars!', point: 'whereTo', until: (c) => c.spec.mission.target === 'planet' && c.spec.mission.destination === 'mars' },
      { say: 'Now change “What to do there” to Land.', point: 'arrive', until: (c) => c.spec.mission.arrival === 'land' },
      { say: 'Good! Now tap Fly and launch. Let’s see if the Moon lander can land on Mars.', point: 'tab:fly', until: (c) => c.tab === 'fly' },
    ],
    flightLines: { orbit: 'In orbit! Next, the big push toward Mars.' },
    hints: ['It burned up in Mars’s air! The Moon lander has no heat shield.', 'In Build, pick the Space Q Mars lander in the Lander row.'],
    hintControl: 'lander',
    debrief: 'Space Q has landed on Mars! The Moon lander had no heat shield, because the Moon has no air. Every world needs its own kind of lander.',
    solve: (s) => setMission(setPayloadSlot(s, 'lander', 'spaceq-mars-lander'), { target: 'planet', destination: 'mars', arrival: 'land', launchOffsetDays: 0 }),
  },
  {
    id: 'hot-hot-hot',
    chapter: 4,
    kind: 'spaceq',
    title: 'Hot Hot Hot',
    patch: '🥵',
    briefing: [
      'The Mission Scientist wants pictures from the ground on Venus. Space Q will send a lander!',
      'But Venus is hotter than a pizza oven, and its air would crush a submarine.',
      'The Chief Engineer says our Mars rover will be fine. Will it? We need an hour of pictures.',
    ],
    goalText: 'Land on Venus and keep working for an hour',
    rocket: () => setName(trip(heavyWith('lander', 'rover-skycrane'), 'venus', 'land'), 'Falcon Heavy Venus Lander'),
    goal: (c) => planetOk(c.m, 'venus', 'land'),
    stars: [
      { text: 'Keep working for 4 hours', check: (c) => planetOk(c.m, 'venus', 'land') && (c.m.planet?.surfaceMinutes ?? 0) >= 240 },
      { text: 'Win with Chaos Mode on 🎲', check: (c) => planetOk(c.m, 'venus', 'land') && c.stats.chaos },
    ],
    unlocks: [],
    skill: 'venus',
    coach: [{ say: 'Launch it, and keep an eye on the timer once it lands.', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { orbit: 'In orbit! Venus is our closest neighbour: only about 5 months away.' },
    hints: ['The rover cooked in two minutes! What’s built for Venus?', 'In Build, pick a Venus lander in the Lander row.'],
    hintControl: 'lander',
    debrief: 'Pictures from Venus! The real Venera 13 lasted just over two hours. A thick hull and lots of cooling buy more time.',
    solve: (s) => setPayloadSlot(s, 'lander', 'venus-lander'),
  },
  {
    id: 'closest-to-the-sun',
    chapter: 4,
    kind: 'history',
    title: 'Closest to the Sun',
    real: 'MESSENGER, 2004: the first probe to orbit Mercury',
    patch: '☀️',
    briefing: [
      'History sim! Mercury is the closest planet to the Sun. MESSENGER was the first probe to orbit it.',
      'Going toward the Sun sounds easy, like rolling downhill. But that’s the problem: you get faster and faster!',
      'We’re borrowing NASA’s big SLS rocket. Can the probe stop at Mercury?',
    ],
    goalText: 'Get into orbit around Mercury',
    rocket: () => setName(trip(setPayloadSlot(setPayloadSlot(clearTop(preset('sls')), 'cargo', 'messenger-probe'), 'fairing', 'fairing-5m'), 'mercury', 'orbit'), 'SLS Mercury Probe'),
    goal: (c) => planetOk(c.m, 'mercury', 'orbit'),
    stars: [
      { text: 'Bring the boosters back with parachutes ♻️', check: (c) => planetOk(c.m, 'mercury', 'orbit') && boostersSaved(c.m) },
      { text: 'Win with Chaos Mode on 🎲', check: (c) => planetOk(c.m, 'mercury', 'orbit') && c.stats.chaos },
    ],
    unlocks: ['kickStage'],
    skill: 'sunward',
    coach: [{ say: 'Launch it! Watch how fast the probe is going when it gets to Mercury.', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { boosterSeparation: 'The boosters drop away!' },
    hints: ['The probe was too fast to stop. Its own engine wasn’t enough.', 'In Build, add a Braking stage. It fires first to help slow down.'],
    hintControl: 'kickStage',
    debrief: 'In orbit at Mercury! You needed a huge brake. The real MESSENGER flew past Earth, Venus and Mercury six times to slow down instead. You’ll learn that trick later!',
    solve: (s) => setPayloadSlot(s, 'kick', 'spaceq-braking-stage'),
  },

  // ---------------- Chapter 5: The Asteroid Belt ----------------
  {
    id: 'through-the-belt',
    chapter: 5,
    kind: 'spaceq',
    title: 'Through the Belt',
    patch: '🪨',
    briefing: [
      'Welcome to Chapter 5, Planet Hunter! Out past Mars is the asteroid belt: millions of space rocks.',
      'The Chief Engineer is worried about crashing, so he wrapped our probe in thick armor.',
      'Let’s fly it out through the belt and see how many rocks we hit.',
    ],
    goalText: 'Fly a probe out through the asteroid belt',
    rocket: () => setName(trip(heavyWith('cargo', 'armored-probe'), 'belt', 'flyby'), 'Falcon Heavy Belt Probe'),
    goal: (c) => planetOk(c.m, 'belt'),
    stars: [
      { text: 'Keep 2,000 m/s spare after leaving Earth', check: (c) => planetOk(c.m, 'belt') && legSpare(c.m, 'depart') >= 2000 },
      { text: 'Bring the side boosters back with parachutes ♻️', check: (c) => planetOk(c.m, 'belt') && boostersSaved(c.m) },
    ],
    unlocks: [],
    skill: 'belt',
    coach: [{ say: 'Launch it and see how far it gets.', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { orbit: 'In orbit. Now, can the top stage throw all that armor out to the belt?' },
    hints: ['The armor was too heavy to throw out to the belt. Do we really need it?', 'In Build, swap the armored probe for the little planet probe in the Cargo row.'],
    hintControl: 'payload',
    debrief: 'Straight through, and not one rock! Asteroids are about a million kilometres apart. No armor needed.',
    solve: (s) => setPayloadSlot(s, 'cargo', 'planet-probe'),
  },
  {
    id: 'two-stops',
    chapter: 5,
    kind: 'history',
    title: 'Two Stops',
    real: 'Dawn, 2007: the first probe to orbit two different worlds',
    patch: '⚡',
    briefing: [
      'History sim! Vesta and Ceres are the two biggest things in the asteroid belt.',
      'The Dawn probe orbited Vesta, then left and flew on to orbit Ceres. Two stops in one trip!',
      'Every stop means braking, then speeding up again. Will our Mars orbiter have enough fuel?',
    ],
    goalText: 'Orbit Vesta, then Ceres',
    rocket: () => setName(trip(heavyWith('cargo', 'mars-orbiter'), 'vestaCeres', 'orbit'), 'Falcon Heavy Dawn'),
    goal: (c) => planetOk(c.m, 'vestaCeres'),
    stars: [
      { text: 'Use a smaller rocket: under 1,000 t at liftoff', check: (c) => planetOk(c.m, 'vestaCeres') && liftoffT(c.m) < 1000 },
      { text: 'Win with Chaos Mode on 🎲', check: (c) => planetOk(c.m, 'vestaCeres') && c.stats.chaos },
    ],
    unlocks: ['ion'],
    skill: 'ion',
    coach: [{ say: 'Launch it! Watch the list of burns. Which one runs out?', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { orbit: 'In orbit. Next, a long trip out to the belt.' },
    hints: ['The orbiter ran out of fuel braking at Vesta. Chemical rockets drink fuel fast.', 'In Build, pick the ion probe in the Cargo row.'],
    hintControl: 'payload',
    debrief: 'Two worlds in one trip! The ion engine pushed gently for years, using hardly any fuel. That’s how Dawn did it.',
    solve: (s) => setPayloadSlot(s, 'cargo', 'ion-probe'),
  },
  {
    id: 'space-rock-sample',
    chapter: 5,
    kind: 'spaceq',
    title: 'Space Rock Sample',
    patch: '🧪',
    briefing: [
      'The Mission Scientist has a big request: bring back a piece of a space rock!',
      'Space rock Q-7 is a little asteroid in the belt. Touch it, grab some dust, and bring it home.',
      'Our ion probe got to Vesta and Ceres. Can it get there and back?',
    ],
    goalText: 'Bring a sample home from space rock Q-7',
    rocket: () => setName(trip(heavyWith('cargo', 'ion-probe'), 'rock', 'sample'), 'Falcon Heavy Sample Return'),
    goal: (c) => planetOk(c.m, 'rock', 'sample'),
    stars: [
      { text: 'Bring the side boosters back with parachutes ♻️', check: (c) => planetOk(c.m, 'rock', 'sample') && boostersSaved(c.m) },
      { text: 'Win with Chaos Mode on 🎲', check: (c) => planetOk(c.m, 'rock', 'sample') && c.stats.chaos },
    ],
    unlocks: [],
    skill: 'sampleReturn',
    coach: [{ say: 'Launch it! This one is a long trip. Watch the days count up.', point: 'launch', until: (c) => c.phase !== 'ready' }],
    flightLines: { orbit: 'In orbit. Next stop: space rock Q-7!' },
    hints: ['It got there, but couldn’t get home. Coming back takes as much push as going!', 'In Build, pick the Space Q sample-return probe in the Cargo row.'],
    hintControl: 'payload',
    debrief: 'Sample delivered! A piece of the belt is in the Space Q lab. Coming home took just as much push as going out.',
    solve: (s) => setPayloadSlot(s, 'cargo', 'sample-probe'),
  },
];

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);
