// How close the sim gets to a real flight of the same rocket.

import type { Grade, Scorecard as Card } from '../physics/golden';

const MARK: Record<Grade, string> = { close: '✅', near: '🟡', off: '❌', missing: '—' };

const fmt = (x: number, d: number) => x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

/** Engineer mode: the full table. */
export function ScorecardTable({ card, modified }: { card: Card; modified: boolean }) {
  return (
    <div className="scorecard">
      <p className="muted">
        vs {card.flight}. {card.score}% within 15%.{' '}
        {modified && <b className="warn-text">You've changed the rocket, so it no longer matches the real one.</b>}
      </p>
      <table>
        <thead>
          <tr>
            <th />
            <th>Checkpoint</th>
            <th>Real</th>
            <th>Sim</th>
            <th>Off by</th>
          </tr>
        </thead>
        <tbody>
          {card.lines.map((l, i) => (
            <tr key={i} className={l.grade}>
              <td>{MARK[l.grade]}</td>
              <td>{l.label}</td>
              <td className="mono">
                {fmt(l.real, l.digits)} {l.unit}
              </td>
              <td className="mono">{l.sim === undefined ? '—' : `${fmt(l.sim, l.digits)} ${l.unit}`}</td>
              <td className="mono">{l.error === undefined ? '' : `${l.error >= 0 ? '+' : ''}${(l.error * 100).toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Source:{' '}
        {card.sourceUrl ? (
          <a href={card.sourceUrl} target="_blank" rel="noreferrer">
            {card.source}
          </a>
        ) : (
          card.source
        )}
        . ✅ within 5%, 🟡 within 15%.
      </p>
    </div>
  );
}

/** Roscoe mode: one friendly line for the result card. */
export function ScorecardBadge({ card, modified }: { card: Card; modified: boolean }) {
  if (modified) return null;
  const good = card.lines.filter((l) => l.grade === 'close' || l.grade === 'near').length;
  const name = card.flight.split(/[,(]/)[0].trim();
  return (
    <p className="score-badge">
      🏆 Just like the real {name}: {good} out of {card.lines.length} numbers came out close!
    </p>
  );
}
