// The card after a flight that didn't work, in Roscoe mode. Four things, most important
// first: what went wrong (with the one number that shows it), how it compares with the last
// try, Did's tested next step with one big button, and "why" folded away until asked for.

import { useState, type ReactNode } from 'react';
import { SKILLS } from '../missions/skills';
import type { MissionStep } from '../physics/mission';
import type { MissionFailureType } from '../physics/types';
import { effectText, type Verdict } from './lab';
import type { Lesson } from './lessons';
import { MeterBar, Steps, type TryNote } from './ResultCard';
import { canSpeak, speak } from './speech';

/** The short line above the headline: where it went wrong. */
const KICKER: Record<MissionFailureType | 'goal', string> = {
  noLiftoff: '🧱 Didn’t leave the pad',
  breakup: '💥 Broke apart',
  tumble: '🌀 Tumbled out of control',
  engineFailure: '🔥 Engine trouble',
  outOfFuel: '⛽ Didn’t reach orbit',
  crash: '💥 Didn’t reach orbit',
  orbitShort: '🛰️ Didn’t reach its orbit',
  moonShort: '🌕 Didn’t reach the Moon',
  planetShort: '🪐 Didn’t get there',
  skipOut: '🏓 Bounced off the air',
  burnUp: '🔥 Burned up coming home',
  crewG: '😵 Too rough for the crew',
  crashLanding: '💥 Crash landing',
  goal: '🎯 Mission not done yet',
};

/** One line on how this try compares with the last: the progress note and the experiment in one. */
function compareLine(note: TryNote | null | undefined, verdict: Verdict | null | undefined, lesson?: Lesson): { text: ReactNode; tone: string } | null {
  if (note && !note.changes.length) return { text: '🔁 Same rocket as last time, so the same thing happened. Change something in Build first!', tone: 'same' };
  if (note && !note.same) return { text: '🎉 Your change fixed the last problem! This one is new.', tone: 'good' };
  if (verdict?.kind === 'clean' && verdict.compare)
    return {
      text: (
        <>
          🔬 Clean test: you changed <b>{verdict.changes[0].text}</b>. {effectText(verdict)}.
        </>
      ),
      tone: verdict.compare.dir === 'up' ? 'good' : verdict.compare.dir === 'down' ? 'bad' : 'same',
    };
  if (verdict?.kind === 'muddy' && verdict.compare)
    return {
      text: `🌫️ You changed ${verdict.changes.length} things at once, so we can’t tell which one did what. Try changing just one.`,
      tone: 'same',
    };
  if (note?.same && lesson?.meter && note.before !== undefined) return { text: '🤔 Same problem as last time. Look at the bar: did it move?', tone: 'same' };
  return null;
}

interface Props {
  failure: MissionFailureType | 'goal';
  /** The big sentence: what went wrong. */
  headline: string;
  lesson?: Lesson;
  note?: TryNote | null;
  verdict?: Verdict | null;
  /** Did's tested clue, with its own button. */
  clue: ReactNode;
  /** Said by "Read to me" after the headline (Did's clue in words). */
  say?: string;
  steps: MissionStep[];
  /** Ideas for this kind of problem, inside "Why" (Medium and Hard). */
  ideas?: string[];
  onBuild: () => void;
  onAgain: () => void;
  /** Let Did make the first fix (not on Hard). */
  onLetDid?: () => void;
  replays: { label: string; onClick: () => void }[];
}

export function FailCard({ failure, headline, lesson, note, verdict, clue, say, steps, ideas, onBuild, onAgain, onLetDid, replays }: Props) {
  const [why, setWhy] = useState(false);
  const line = compareLine(note, verdict, lesson);
  const skill = lesson ? SKILLS[lesson.skill] : undefined;
  const guess = verdict?.guess;
  const readAloud = [KICKER[failure].replace(/^\S+\s/, ''), headline, say, lesson?.why.join(' ')].filter(Boolean).join(' ');
  return (
    <div className="result-card roscoe lose fail-card">
      <div className="fail-kicker">{KICKER[failure]}</div>
      <h2>{headline}</h2>

      {lesson?.meter && <MeterBar meter={lesson.meter} before={note?.same && note.changes.length ? note.before : undefined} />}

      {(line || guess) && (
        <div className={`fail-compare ${line?.tone ?? 'same'}`}>
          {line && <p>{line.text}</p>}
          {guess && (
            <p className="fail-guess">{guess.right ? `🎯 You called it: “${guess.said}”!` : `😮 Surprise! You said “${guess.said}”, but it was “${guess.got}”.`}</p>
          )}
        </div>
      )}

      {clue ?? (
        <div className="lesson-hint clue">
          <div>
            <b>Change something in Build, then fly again.</b>
            <div className="clue-actions">
              <button className="btn big primary" onClick={onBuild}>
                🔧 Go to Build
              </button>
            </div>
          </div>
        </div>
      )}

      {(lesson || steps.length > 1) && (
        <div className="fail-why">
          <button className="fail-why-toggle" aria-expanded={why} onClick={() => setWhy(!why)}>
            🔬 Why did that happen? <span aria-hidden="true">{why ? '▴' : '▾'}</span>
          </button>
          {why && (
            <div className="fail-why-body">
              {lesson?.why.map((w) => (
                <p key={w}>{w}</p>
              ))}
              {skill && (
                <div className="lesson-rule">
                  <div className="result-kicker">
                    📐 Engineer’s rule: {skill.emoji} {skill.title}
                  </div>
                  {lesson?.analogy && <p>{lesson.analogy}</p>}
                </div>
              )}
              {ideas && ideas.length > 0 && (
                <>
                  <div className="result-kicker">💡 Ways to fix this kind of problem</div>
                  <ul className="fail-ideas">
                    {ideas.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </>
              )}
              {steps.length > 1 && <Steps steps={steps} roscoe />}
            </div>
          )}
        </div>
      )}

      <div className="fail-links">
        {onLetDid && (
          <button className="link" onClick={onLetDid}>
            🧑‍🚀 Let Did fix it
          </button>
        )}
        {replays.map((r) => (
          <button key={r.label} className="link" onClick={r.onClick}>
            {r.label}
          </button>
        ))}
        <button className="link" onClick={onAgain}>
          🚀 Fly again
        </button>
        {canSpeak && (
          <button className="link" onClick={() => speak(readAloud)}>
            🔊 Read to me
          </button>
        )}
      </div>
    </div>
  );
}
