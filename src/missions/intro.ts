// The Chief Engineer's tour of new controls at the start of a mission, built from what the
// mission unlocks. Missions with their own coaching (they teach by failing first) skip it.

import { CONTROL_INFO } from './controlInfo';
import type { CoachStep, Mission } from './types';

export function introSteps(m: Mission): CoachStep[] {
  if (m.coach) return m.coach;
  const build = m.unlocks.filter((c) => CONTROL_INFO[c].tab === 'build' && c !== 'build');
  const steps: CoachStep[] = [];
  if (build.length) {
    steps.push({ say: 'The Chief Engineer added something new to your rocket! Tap Build to see it.', point: 'tab:build', until: (c) => c.tab === 'build' });
    for (const c of build) steps.push({ say: `New: ${CONTROL_INFO[c].label}! ${CONTROL_INFO[c].explain}`, point: c, ok: true });
    steps.push({ say: 'When your rocket is ready, tap Fly.', point: 'tab:fly', until: (c) => c.tab === 'fly' });
  }
  if (m.unlocks.includes('chaos')) steps.push({ say: `New: ${CONTROL_INFO.chaos.label}! ${CONTROL_INFO.chaos.explain}`, point: 'chaos', ok: true });
  return steps;
}
