import type { ReactNode } from 'react';
import type { FixResult } from '../physics/fixes';
import type { MissionStep } from '../physics/mission';
import type { Change } from './changes';
import { fmtMeter, type Meter } from './lessons';
import type { Feedback } from './messages';
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
  /** Did's tested clue, shown in place of the one-line tip. */
  hint?: ReactNode;
  /** Hard: no button that makes the fix for him. */
  noAutoFix?: boolean;
}

const STEP_ICON: Record<MissionStep['id'], string> = { ascent: '🚀', systems: '🎧', recovery: '🪂', raise: '🛰️', moon: '🌕', planet: '🪐', reentry: '🔥' };
const STATUS_ICON: Record<MissionStep['status'], string> = { ok: '✅', fail: '❌', warn: '⚠️', skipped: '➖' };

export function Steps({ steps, roscoe }: { steps: MissionStep[]; roscoe: boolean }) {
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

export function RoscoeResult({ fb, fix, steps, replays, onAgain, onTryFix, badge, lab, hint, noAutoFix }: CardProps) {
  const best = fix?.status === 'done' && !noAutoFix ? fix.fixes[0] : undefined;
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
      {!fb.success && hint ? hint : <p className="result-fix">{fix?.status === 'working' ? '🔧 Thinking of a fix…' : tip}</p>}
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

export function MeterBar({ meter, before }: { meter: Meter; before?: number }) {
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
