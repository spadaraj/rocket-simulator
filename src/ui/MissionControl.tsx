// Systems check while coasting in orbit: each system gets a green tick, or a red flag
// if Chaos Mode broke something.

import type { ChecklistItem } from '../physics/types';

const ICONS: Record<ChecklistItem['system'], string> = {
  engines: '🔥',
  tanks: '🛢️',
  power: '🔋',
  guidance: '🧭',
  comms: '📡',
};

export function MissionControl({ items, t, roscoe }: { items: ChecklistItem[]; t: number; roscoe: boolean }) {
  if (!items.length || t < items[0].tS - 4) return null;
  return (
    <div className={`mission-control ${roscoe ? 'roscoe' : ''}`} role="status" aria-live="polite">
      <div className="mc-title">🎧 Mission control: systems check</div>
      <ul>
        {items.map((it) => {
          const checked = t >= it.tS;
          const cleared = it.clearedTS !== undefined && t >= it.clearedTS;
          const state = !checked ? 'pending' : it.status === 'go' || cleared ? 'go' : 'fault';
          return (
            <li key={it.system} className={state}>
              <span className="mc-icon">{ICONS[it.system]}</span>
              <span className="mc-name">{it.system[0].toUpperCase() + it.system.slice(1)}</span>
              <span className="mc-status">{state === 'pending' ? '…' : state === 'go' ? (cleared ? '✅ fixed' : '✅ GO') : '🚩'}</span>
              {checked && !roscoe && <span className="mc-note">{it.note}</span>}
              {checked && roscoe && it.status === 'fault' && <span className="mc-note">{it.note}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
