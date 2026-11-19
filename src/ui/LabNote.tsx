// Ghost and Guess on screen: the "Call it!" picker by the launch button, and the note on the
// result card that says whether the test was clean and whether the guess was right.

import { REACHES, askFor, changesSince, effectText, type Flown, type Guess, type Verdict } from './lab';
import type { ControlId } from '../physics/controls';
import type { RocketSpec } from '../physics/types';

const DIRS = ['up', 'same', 'down'] as const;
const DIR_EMOJI = { up: '📈', same: '➡️', down: '📉' };

interface CallItProps {
  /** The last flight, if there was one. */
  last: Flown | null;
  spec: RocketSpec;
  guess: Guess | null;
  setGuess: (g: Guess | null) => void;
  showGhost: boolean;
  setShowGhost: (on: boolean) => void;
  /** Dials the game looks after by itself: changes to them do not count. */
  ignore?: Set<ControlId>;
}

/** Above the launch button: what changed since the last flight, and a guess to make. Skippable. */
export function CallIt({ last, spec, guess, setGuess, showGhost, setShowGhost, ignore }: CallItProps) {
  const changes = last ? changesSince(last.spec, spec, ignore) : [];
  // The same rocket again: nothing to test, nothing to guess.
  if (last && !changes.length) return null;
  const pick = (g: Guess) => setGuess(guess === g ? null : g);
  const y = last ? askFor(last.mission) : null;
  return (
    <div className="call-it">
      {last && (
        <div className={`call-changes ${changes.length === 1 ? 'clean' : 'muddy'}`}>
          {changes.length === 1 ? (
            <>
              <b>🔬 Clean test!</b> You changed one thing: {changes[0].text}
            </>
          ) : (
            <>
              <b>🌫️ {changes.length} changes at once.</b> If it flies differently, we won’t know which one did it. For a clean test, change just one.
            </>
          )}
        </div>
      )}
      <div className="call-ask">
        <b>🔮 Call it!</b> {y ? y.ask : 'How far will it get?'}
      </div>
      <div className="call-picks">
        {y
          ? DIRS.map((d, k) => (
              <button key={d} className={`btn ${guess === d ? 'on' : ''}`} aria-pressed={guess === d} onClick={() => pick(d)}>
                {DIR_EMOJI[d]} {y.words[k]}
              </button>
            ))
          : REACHES.map((r) => (
              <button key={r.id} className={`btn ${guess === r.id ? 'on' : ''}`} aria-pressed={guess === r.id} onClick={() => pick(r.id)}>
                {r.emoji} {r.label}
              </button>
            ))}
      </div>
      {last && (
        <button className="btn small ghost-toggle" aria-pressed={showGhost} onClick={() => setShowGhost(!showGhost)}>
          👻 Ghost of your last flight: {showGhost ? 'on' : 'off'}
        </button>
      )}
    </div>
  );
}

/** On the result card: how the experiment came out. */
export function LabNote({ verdict }: { verdict: Verdict | null }) {
  if (!verdict || verdict.kind === 'same') return null;
  const { kind, changes, compare, guess } = verdict;
  if (kind === 'first' && !guess) return null;
  return (
    <div className={`lab-note ${kind}`}>
      {kind === 'clean' && compare && (
        <p>
          <b>🔬 Clean test!</b> You changed one thing: <em>{changes[0].text}</em>. What it did: <b>{effectText(verdict)}</b>.
          <small>📓 Saved in your Lab Notes.</small>
        </p>
      )}
      {kind === 'muddy' && compare && (
        <p>
          <b>🌫️ Muddy test.</b> You changed {changes.length} things at once. {compare.plain ?? `${compare.label}: ${compare.before} → ${compare.after}`}. But which change did
          that? We can’t tell! Change one thing at a time to find out.
        </p>
      )}
      {guess &&
        (guess.right ? (
          <p className="lab-guess right">
            <b>🎯 You called it!</b> You said “{guess.said}”, and you were right.
          </p>
        ) : (
          <p className="lab-guess surprise">
            <b>😮 Surprise!</b> You said “{guess.said}”, but it was “{guess.got}”. Surprises are how scientists learn. Why do you think it went that way?
          </p>
        ))}
    </div>
  );
}
