// What each control is called and what it does, in Roscoe's words, for "Show me" and
// for the Chief Engineer when a control unlocks.

import type { ControlId } from '../physics/controls';

export interface ControlInfo {
  label: string;
  /** Which screen it lives on. */
  tab: 'build' | 'fly';
  explain: string;
}

export const CONTROL_INFO: Record<ControlId, ControlInfo> = {
  speed: { label: 'Speed buttons', tab: 'fly', explain: 'The turtle slows time down so you can watch closely. The rocket speeds it up.' },
  build: { label: 'Build', tab: 'build', explain: 'This is where you change your rocket.' },
  engines: { label: 'How many engines', tab: 'build', explain: 'More engines push harder, but each one adds weight and drinks fuel faster.' },
  engineType: { label: 'Engine', tab: 'build', explain: 'Some engines push harder, some save fuel better, and some only work in space.' },
  tank: { label: 'Fuel tank', tab: 'build', explain: 'A bigger tank holds more fuel, but it is heavier too.' },
  autoSize: { label: 'Make it reach…', tab: 'build', explain: 'This tries lots of fuel amounts and picks just enough for the job.' },
  stageStrip: { label: 'Stages', tab: 'fly', explain: 'These show each stage. Watch them drop away when they run out of fuel.' },
  addStage: { label: 'Add a stage', tab: 'build', explain: 'A new stage on top. When the bottom one runs out, it drops off and this one takes over.' },
  payload: { label: 'On top', tab: 'build', explain: 'Choose what your rocket carries: a capsule, a satellite, a lander and more. Lighter is easier.' },
  heatShield: { label: 'Heat shield', tab: 'build', explain: 'A thicker shield takes more heat coming home, but it weighs more.' },
  comeHome: { label: 'Coming home', tab: 'build', explain: 'How steeply the capsule dives into the air. Gentle is cooler but can bounce off. Steep is hotter and bumpier.' },
  fins: { label: 'Fins', tab: 'build', explain: 'Fins at the bottom keep the rocket pointing straight, like the feathers on an arrow.' },
  easeOff: { label: 'Ease off in thick air', tab: 'build', explain: 'Turns the engines down while the air pushes hardest, then back up. Less push from the air, so it does not break.' },
  stronger: { label: 'Body strength', tab: 'build', explain: 'A stronger body can take a harder air push, but it is heavier.' },
  airPush: { label: 'Air push', tab: 'fly', explain: 'Shows how hard the air pushes on the rocket. If it goes past the red line, the rocket breaks.' },
  landIt: { label: 'Land it', tab: 'build', explain: 'Save some fuel so this stage can fly back down and land.' },
  landingFuel: { label: 'Landing fuel', tab: 'build', explain: 'How much fuel to save for landing. More is safer, but leaves less for going up.' },
  boosters: { label: 'Boosters', tab: 'build', explain: 'Boosters strap onto the side for an extra big push at the start, then drop off.' },
  boosterChutes: { label: 'Booster parachutes', tab: 'build', explain: 'Parachutes bring the boosters down softly into the sea, so they can be used again.' },
  chaos: { label: 'Chaos Mode', tab: 'fly', explain: 'Something random goes wrong on each flight. Can your rocket handle it?' },
  targetHeight: { label: 'How high', tab: 'build', explain: 'Pick how high your orbit should be.' },
  whereTo: { label: 'Where to?', tab: 'build', explain: 'Pick where the rocket is going: space, a high orbit, around the Moon or onto the Moon.' },
  tinker: { label: 'Push and Fuel saving', tab: 'build', explain: 'Invent your own engine! But be careful: some numbers are science fiction.' },
  scratch: { label: 'Name and save', tab: 'build', explain: 'Give your rocket a name and save it to fly again later.' },
};
