// Stage pictures that light up while burning and fade once dropped.

import type { Sample } from '../physics/types';
import type { Vehicle } from '../physics/vehicle';

export function StageStrip({
  vehicle,
  sample,
  started,
  live,
}: {
  vehicle: Vehicle;
  sample: Sample;
  started: boolean;
  /** Engines can only be burning while the flight is playing. */
  live: boolean;
}) {
  const items: { key: string; label: string; color: string; state: 'waiting' | 'burning' | 'gone' }[] = [];
  vehicle.stages.forEach((st, i) => {
    if (st.boosters) {
      items.push({
        key: `b${i}`,
        label: 'Boosters',
        color: '#f4f6fa',
        state:
          !started || i > sample.stageIndex
            ? 'waiting'
            : sample.boostersAttached && i === sample.stageIndex
              ? live
                ? 'burning'
                : 'waiting'
              : 'gone',
      });
    }
    items.push({
      key: `s${i}`,
      label: st.name,
      color: st.color,
      state:
        !started || i > sample.stageIndex
          ? 'waiting'
          : i < sample.stageIndex
            ? 'gone'
            : sample.thrustN > 0 && live
              ? 'burning'
              : 'waiting',
    });
  });
  return (
    <div className="stage-strip">
      {items.map((it) => (
        <div key={it.key} className={`stage-chip ${it.state}`}>
          <span className="stage-swatch" style={{ background: it.color }} />
          {it.label}
          {it.state === 'burning' && <span className="stage-fire">🔥</span>}
        </div>
      ))}
    </div>
  );
}
