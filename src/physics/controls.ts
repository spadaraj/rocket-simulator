// The builder and flight controls by name, so failures, fixes and missions can point at them.
// Missions unlock these one by one; the sandbox shows them all.

export type ControlId =
  | 'speed' // playback speed buttons
  | 'build' // the Build tab
  | 'engines' // how many engines
  | 'engineType' // which engine
  | 'tank' // fuel tank size
  | 'autoSize' // "Make it reach…"
  | 'stageStrip' // stage list in flight
  | 'addStage'
  | 'payload' // payload modules
  | 'heatShield'
  | 'comeHome' // re-entry angle
  | 'fins'
  | 'easeOff' // throttle down in thick air
  | 'stronger' // structure strength
  | 'airPush' // air push dial in flight
  | 'landIt'
  | 'landingFuel'
  | 'boosters'
  | 'boosterChutes'
  | 'chaos'
  | 'targetHeight'
  | 'whereTo'
  | 'lander' // the lander slot (Moon, then Mars and Venus)
  | 'launchDay' // planet trips: where to, and when to go
  | 'arrive' // what to do when you get there
  | 'rover' // Mars rovers in the lander slot
  | 'marsLander' // Space Q's Mars lander and the Venus landers
  | 'kickStage' // a braking stage for the far end
  | 'ion' // ion probes
  | 'tinker' // invent an engine
  | 'scratch'; // start from scratch, name and save

export const ALL_CONTROLS: ControlId[] = [
  'speed', 'build', 'engines', 'engineType', 'tank', 'autoSize', 'stageStrip', 'addStage', 'payload', 'heatShield',
  'comeHome', 'fins', 'easeOff', 'stronger', 'airPush', 'landIt', 'landingFuel', 'boosters', 'boosterChutes', 'chaos',
  'targetHeight', 'whereTo', 'lander', 'tinker', 'scratch', 'launchDay', 'arrive', 'rover', 'marsLander', 'kickStage', 'ion',
];

/** Which control a fix changes, from its id. */
export function fixControl(fixId: string): ControlId | undefined {
  const rules: [RegExp, ControlId][] = [
    [/^engines\+|^spare-engines|^engine-out-pair/, 'engines'],
    [/^boosters/, 'boosters'],
    [/^upper-lighter/, 'payload'],
    [/^fill-all|tank/, 'tank'],
    [/^upper-engine|^steer/, 'engineType'],
    [/^add-stage/, 'addStage'],
    [/^maxq-throttle/, 'easeOff'],
    [/^stronger/, 'stronger'],
    [/^fins/, 'fins'],
    [/^no-landing|^expend/, 'landIt'],
    [/^entry-/, 'comeHome'],
    [/^shield/, 'heatShield'],
    [/^reserve-/, 'landingFuel'],
    [/^add-lander/, 'lander'],
    [/^launch-window/, 'launchDay'],
    [/^lander-/, 'lander'],
    [/^braking-stage/, 'kickStage'],
    [/^probe-/, 'payload'],
  ];
  return rules.find(([re]) => re.test(fixId))?.[1];
}
