import type { Feedback } from './messages';
import { canSpeak, speak } from './speech';

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

export function RoscoeResult({ fb, onAgain }: { fb: Feedback; onAgain: () => void }) {
  const text = `${fb.roscoeTitle} ${fb.roscoeFix}`;
  return (
    <div className={`result-card roscoe ${fb.success ? 'win' : 'lose'}`}>
      <Face happy={fb.success} />
      <h2>{fb.success ? '🏆 ' : ''}{fb.roscoeTitle}</h2>
      <p className="result-fix">{fb.roscoeFix}</p>
      <div className="result-actions">
        {canSpeak && (
          <button className="btn big" onClick={() => speak(text)} aria-label="Read aloud">
            🔊 Read to me
          </button>
        )}
        <button className="btn big primary" onClick={onAgain}>
          🚀 Fly again
        </button>
      </div>
    </div>
  );
}

export function EngineerResult({ fb, onAgain }: { fb: Feedback; onAgain: () => void }) {
  return (
    <div className={`result-card engineer ${fb.success ? 'win' : 'lose'}`}>
      <div className="result-kicker">{fb.success ? 'Mission result' : 'Failure'}</div>
      <h3>{fb.title}</h3>
      <p>{fb.why}</p>
      <ul>
        {fb.fixes.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <button className="btn" onClick={onAgain}>
        Replay
      </button>
    </div>
  );
}
