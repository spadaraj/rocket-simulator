import type { ReactNode } from 'react';
import type { FixResult } from '../physics/fixes';
import type { MissionStep } from '../physics/mission';
import type { ControlId } from '../physics/controls';
import { SKILLS } from '../missions/skills';
import type { Change } from './changes';
import { fmtMeter, meterBetter, type Lesson, type Meter } from './lessons';
import type { Feedback } from './messages';
import { Engineer } from './mission/Characters';
import { canSpeak, speak } from './speech';

export interface FixState {
  status: 'working' | 'done';
  fixes: FixResult[];
  tested: number;
}

function Face({ happy }: { happy: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="result-face" aria-hidden="true">
      <path d="M60 8c16 16 22 34 22 52v34H38V60c0-18 6-36 22-52z" fill="#f4f6fa" stroke="#1b2a44" strokeWidth="4" />
      <rect x="38" y="62" width="44" height="16" fill={happy ? '#d63a3a' : '#9aa7b8'} stroke="#1b2a44" strokeWidth="4" />
      <path d="M38 80 22 100h16zM82 80l16 20H82z" fill="#9aa7b8" stroke="#1b2a44" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="52" cy="40" r="4" fill="#1b2a44" />
      <circle cx="68" cy="40" r="4" fill="#1b2a44" />
      {happy ? (
        <path d="M50 49q10 9 20 0" stroke="#1b2a44" strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M50 54q10-8 20 0" stroke="#1b2a44" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
      {happy ? (
        <path d="M48 96h24l-12 20z" fill="#ffb02e" />
      ) : (
        <path d="M90 22c4-6 10-6 12 0" stroke="#5cc8ff" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

interface CardProps {
  fb: Feedback;
  fix?: FixState;
  steps: MissionStep[];
  replays: { label: string; onClick: () => void }[];
  onAgain: () => void;
  onTryFix: (f: FixResult) => void;
  /** Extra line under the steps (the real-flight badge). */
  badge?: ReactNode;
  /** Ghost and Guess: how the experiment came out. */
  lab?: ReactNode;
}

const STEP_ICON: Record<MissionStep['id'], string> = { ascent: '🚀', systems: '🎧', recovery: '🪂', raise: '🛰️', moon: '🌕', planet: '🪐', reentry: '🔥' };
const STATUS_ICON: Record<MissionStep['status'], string> = { ok: '✅', fail: '❌', warn: '⚠️', skipped: '➖' };

function Steps({ steps, roscoe }: { steps: MissionStep[]; roscoe: boolean }) {
  return (
    <ul className={`mission-steps ${roscoe ? 'roscoe' : ''}`}>
      {steps.map((s, i) => (
        <li key={i} className={s.status} title={s.note}>
          <span>{s.id === 'recovery' && s.status === 'skipped' ? '🌊' : STEP_ICON[s.id]}</span>
          {roscoe ? <span>{STATUS_ICON[s.status]}</span> : (
            <>
              <span className="ms-label">{s.label}</span>
              <span className="ms-note muted">{s.note}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RoscoeResult({ fb, fix, steps, replays, onAgain, onTryFix, badge, lab }: CardProps) {
  const best = fix?.status === 'done' ? fix.fixes[0] : undefined;
  const tip = best ? `Try this: ${best.roscoe.toLowerCase()}.` : fb.roscoeFix;
  return (
    <div className={`result-card roscoe ${fb.success ? 'win' : 'lose'}`}>
      <Face happy={fb.success} />
      <h2>
        {fb.success ? '🏆 ' : ''}
        {fb.roscoeTitle}
      </h2>
      <Steps steps={steps} roscoe />
      {fb.success && badge}
      {lab}
      <p className="result-fix">{fix?.status === 'working' ? '🔧 Thinking of a fix…' : tip}</p>
      <div className="result-actions">
        {canSpeak && (
          <button className="btn big" onClick={() => speak(`${fb.roscoeTitle} ${tip}`)} aria-label="Read aloud">
            🔊 Read to me
          </button>
        )}
        {best ? (
          <button className="btn big primary" onClick={() => onTryFix(best)}>
            🔧 Try this fix
          </button>
        ) : (
          <button className="btn big primary" onClick={onAgain}>
            🚀 Fly again
          </button>
        )}
      </div>
      {replays.length > 1 && (
        <div className="result-replays">
          {replays.map((r) => (
            <button key={r.label} className="btn small" onClick={r.onClick}>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EngineerResult({ fb, fix, steps, replays, onAgain, onTryFix }: CardProps) {
  return (
    <div className={`result-card engineer ${fb.success ? 'win' : 'lose'}`}>
      <div className="result-kicker">{fb.success ? 'Mission result' : 'Failure'}</div>
      <h3>{fb.title}</h3>
      <p>{fb.why}</p>
      <Steps steps={steps} roscoe={false} />
      {fb.success || !fix ? (
        <ul>
          {fb.fixes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : fix.status === 'working' ? (
        <p className="muted">Re-flying candidate fixes…</p>
      ) : (
        <>
          <p className="muted">
            Tested {fix.tested} fixes by re-flying the mission; {fix.fixes.length ? `${fix.fixes.length} got past this problem` : 'none fixed it on its own'}.
          </p>
          {fix.fixes.length ? (
            <ul className="fix-list">
              {fix.fixes.map((f) => (
                <li key={f.id}>
                  <span>
                    {f.title}
                    <span className="muted">
                      {' '}
                      → {f.complete ? 'whole mission works' : `next problem: ${f.nextProblem}`}, {(f.perigeeAltM / 1000).toFixed(0)} km orbit, {f.remainingDeltaVMS.toFixed(0)} m/s left
                    </span>
                  </span>
                  <button className="btn small" onClick={() => onTryFix(f)}>
                    Try this
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul>
              {fb.fixes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="result-replays">
        <button className="btn small" onClick={onAgain}>
          Fly again
        </button>
        {replays.map((r) => (
          <button key={r.label} className="btn small ghost" onClick={r.onClick}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Failures that teach ----------

function MeterBar({ meter, before }: { meter: Meter; before?: number }) {
  const top = Math.max(meter.value, meter.limit, before ?? 0) * 1.15 || 1;
  const bad = meter.want === 'below' ? meter.value > meter.limit : meter.value < meter.limit;
  return (
    <div className="lesson-meter" aria-label={`${meter.label}: ${fmtMeter(meter)}, ${meter.limitLabel} ${fmtMeter(meter, meter.limit)}`}>
      <div className="lm-head">
        <span>
          {meter.emoji} {meter.label}
        </span>
        <b className={bad ? 'bad' : 'ok'}>{fmtMeter(meter)}</b>
      </div>
      <div className="lm-bar">
        <span className={`lm-fill ${bad ? 'bad' : 'ok'}`} style={{ width: `${(meter.value / top) * 100}%` }} />
        {before !== undefined && (
          <span className="lm-before" style={{ left: `${(before / top) * 100}%` }} title={`Last try: ${fmtMeter(meter, before)}`}>
            <em>last try</em>
          </span>
        )}
        <span className="lm-line" style={{ left: `${(meter.limit / top) * 100}%` }}>
          <em>
            {meter.limitLabel}: {fmtMeter(meter, meter.limit)}
          </em>
        </span>
      </div>
    </div>
  );
}

/** How this try compares with the one before it. */
export interface TryNote {
  /** What Roscoe changed since the last flight. */
  changes: Change[];
  /** The same problem happened again. */
  same: boolean;
  /** What went wrong last time. */
  prevWhat: string;
  /** Last time's reading on the same meter. */
  before?: number;
}

export function ProgressNote({ note, meter }: { note: TryNote; meter?: Meter }) {
  if (!note.changes.length)
    return (
      <div className="lesson-progress same">
        🔁 That was the same rocket as last time, so the same thing happened. Change something in Build first!
      </div>
    );
  const changed = note.changes.slice(0, 3).map((c) => c.text).join(' · ');
  if (!note.same)
    return (
      <div className="lesson-progress better">
        <b>🎉 Your change worked!</b> Last time: {note.prevWhat.replace(/[.!]$/, '').toLowerCase()}. That’s fixed now. But there’s a new problem to solve:
        <small>You changed: {changed}</small>
      </div>
    );
  const moved = meter && note.before !== undefined ? meterBetter(meter, note.before) : undefined;
  const reading =
    meter && note.before !== undefined ? (
      <>
        {' '}
        {meter.label}: {fmtMeter(meter, note.before)} → <b>{fmtMeter(meter)}</b> ({meter.limitLabel} {fmtMeter(meter, meter.limit)}).
      </>
    ) : null;
  return (
    <div className={`lesson-progress ${moved ? 'closer' : 'same'}`}>
      <b>{moved === undefined ? '🤔 Same problem as last time.' : moved ? '📈 Getting closer!' : '📉 That went the wrong way.'}</b>
      {reading}{' '}
      {moved
        ? 'Keep going: a bit more of the same change, or add one of the fixes below.'
        : moved === false
          ? 'Try changing it the other way, or pick a different fix below.'
          : 'That change didn’t fix this one. Try a fix from the list below.'}
      <small>You changed: {changed}</small>
    </div>
  );
}

interface LessonProps {
  lesson: Lesson;
  fix?: FixState;
  steps: MissionStep[];
  replays: { label: string; onClick: () => void }[];
  onAgain: () => void;
  onTryFix: (f: FixResult) => void;
  onShowMe: (c: ControlId) => void;
  /** Mission Mode: only fixes using these controls are offered. */
  controls?: Set<ControlId>;
  /** Mission Mode: Did's hint for this try, if any. */
  hint?: ReactNode;
  /** How this try compares with the last one. */
  note?: TryNote | null;
  /** Ghost and Guess: how the experiment came out. */
  lab?: ReactNode;
}

export function LessonCard({ lesson, fix, steps, replays, onAgain, onTryFix, onShowMe, controls, hint, note, lab }: LessonProps) {
  const allowed = (c?: ControlId) => !controls || (!!c && controls.has(c));
  const working = fix?.status === 'done' ? fix.fixes.filter((f) => allowed(f.control)) : [];
  const testedFor = (c: ControlId) => working.find((f) => f.control === c);
  // Fixes Did has tried and seen work go first.
  const fixes = lesson.fixes.filter((f) => allowed(f.control)).sort((a, b) => Number(!!testedFor(b.control)) - Number(!!testedFor(a.control)));
  const tested = working[0];
  const skill = SKILLS[lesson.skill];
  const readAloud = `${lesson.what} ${lesson.why.join(' ')} ${lesson.analogy ?? ''} How to fix it: ${fixes.map((f) => f.text).join(' ')}`;
  return (
    <div className="result-card roscoe lose lesson">
      <div className="lesson-head">
        <Engineer size={110} mood="oops" />
        <div>
          <div className="result-kicker">What happened</div>
          <h2>{lesson.what}</h2>
        </div>
      </div>
      {note && <ProgressNote note={note} meter={lesson.meter} />}
      {lab}
      {lesson.meter && <MeterBar meter={lesson.meter} before={note?.same && note.changes.length ? note.before : undefined} />}
      <div className="lesson-why">
        <div className="result-kicker">🔬 Why</div>
        {lesson.why.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </div>
      <div className="lesson-rule">
        <div className="result-kicker">
          📐 Engineer’s rule: {skill.emoji} {skill.title}
        </div>
        {lesson.analogy && <p>{lesson.analogy}</p>}
      </div>
      {hint}
      <div className="lesson-fixes">
        <div className="result-kicker">🔧 How you can fix it</div>
        <ul>
          {fixes.map((f) => {
            const t = testedFor(f.control);
            return (
              <li key={f.text} className={t ? 'tested' : ''}>
                <span>
                  {f.text}
                  {t && <small className="lesson-tested">✅ Did tried it and it works: {t.roscoe.toLowerCase()}</small>}
                </span>
                <button className="btn small" onClick={() => onShowMe(f.control)}>
                  👉 Show me
                </button>
              </li>
            );
          })}
        </ul>
        {fix?.status === 'working' && <p className="lesson-testing">🔧 Did is testing fixes…</p>}
      </div>
      {steps.length > 1 && <Steps steps={steps} roscoe />}
      <div className="result-actions">
        {canSpeak && (
          <button className="btn big" onClick={() => speak(readAloud)} aria-label="Read aloud">
            🔊 Read to me
          </button>
        )}
        {tested && (
          <button className="btn big" onClick={() => onTryFix(tested)} title={tested.roscoe}>
            🧑‍🚀 Let Did fix it
          </button>
        )}
        <button className="btn big primary" onClick={onAgain}>
          🚀 Fly again
        </button>
      </div>
      {replays.length > 1 && (
        <div className="result-replays">
          {replays.map((r) => (
            <button key={r.label} className="btn small" onClick={r.onClick}>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
