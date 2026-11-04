// Cartoon Roscoe (Space Q's newest cadet) and Flight Director Did, drawn in SVG.

type Mood = 'happy' | 'wow' | 'oops';

function SpaceQPatch({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#1f2a22" stroke="#9aa7b8" strokeWidth={r * 0.12} />
      <circle r={r * 0.62} fill="#e2622b" />
      <path d={`M0 ${-r * 0.75} q${r * 0.22} ${r * 0.3} ${r * 0.22} ${r * 0.85} v${r * 0.35} h${-r * 0.44} v${-r * 0.35} q0 ${-r * 0.55} ${r * 0.22} ${-r * 0.85}z`} fill="#f6ebcb" />
      <path d={`M${-r * 0.12} ${r * 0.48} l${r * 0.12} ${r * 0.32} l${r * 0.12} ${-r * 0.32}z`} fill="#ffb02e" />
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  if (mood === 'oops') return <path d="M86 132 q14 -8 28 0" stroke="#5a2a1a" strokeWidth="4" fill="none" strokeLinecap="round" />;
  if (mood === 'wow') return <ellipse cx="100" cy="134" rx="9" ry="11" fill="#7a2a22" />;
  return (
    <g>
      <path d="M78 124 q22 30 44 0 z" fill="#7a2a22" />
      <path d="M81 125 h38 l-2 5 h-34 z" fill="#fff" />
      <path d="M88 140 q12 6 24 0 q-12 -8 -24 0z" fill="#e8737a" />
    </g>
  );
}

/** Roscoe in his Space Q suit: brown hair, big brown eyes, a big smile. */
export function Roscoe({ size = 120, mood = 'happy' }: { size?: number; mood?: Mood }) {
  return (
    <svg viewBox="0 0 200 220" width={size} height={size * 1.1} className="character roscoe" aria-label="Roscoe">
      {/* Suit */}
      <path d="M28 220 q4 -52 44 -62 h56 q40 10 44 62z" fill="#f4f1ea" stroke="#c9ccd2" strokeWidth="2" />
      <path d="M36 196 l-6 24 M164 196 l6 24" stroke="#2a56b8" strokeWidth="9" />
      <ellipse cx="100" cy="160" rx="54" ry="16" fill="#f4f1ea" stroke="#c9ccd2" strokeWidth="3" />
      <ellipse cx="100" cy="160" rx="42" ry="10" fill="#22408f" />
      <path d="M46 166 q54 18 108 0" stroke="#2a56b8" strokeWidth="5" fill="none" />
      <SpaceQPatch x={100} y={196} r={15} />
      {/* Ears */}
      <ellipse cx="44" cy="102" rx="11" ry="15" fill="#f0b48c" />
      <ellipse cx="156" cy="102" rx="11" ry="15" fill="#f0b48c" />
      {/* Face */}
      <ellipse cx="100" cy="100" rx="56" ry="58" fill="#f6c39f" />
      <ellipse cx="68" cy="118" rx="10" ry="6" fill="#f29a8c" opacity="0.5" />
      <ellipse cx="132" cy="118" rx="10" ry="6" fill="#f29a8c" opacity="0.5" />
      {/* Hair: a full brown mop, swept up into tufts at the front */}
      <path d="M40 96 q-10 -40 14 -62 q20 -20 50 -20 q8 -12 22 -10 q-2 8 -6 12 q34 6 48 38 q10 24 6 42 q-6 -18 -18 -28 q0 12 -8 16 q-4 -18 -20 -24 q4 12 -4 18 q-8 -16 -24 -18 q2 12 -8 16 q-8 -14 -24 -12 q-16 6 -22 22 q-8 6 -10 20z" fill="#7a4524" />
      <path d="M58 52 q18 -18 44 -18 M80 36 q20 -10 44 -2 M118 40 q20 4 34 22" stroke="#a0643a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M100 18 q6 -10 14 -8" stroke="#7a4524" strokeWidth="6" fill="none" strokeLinecap="round" />
      {/* Eyebrows */}
      <path d="M64 78 q12 -8 24 -2 M112 76 q12 -6 24 2" stroke="#6a3a1c" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Eyes */}
      <ellipse cx="76" cy="98" rx="14" ry="15" fill="#fff" />
      <ellipse cx="124" cy="98" rx="14" ry="15" fill="#fff" />
      <circle cx="78" cy="100" r="9" fill="#6b3b1a" />
      <circle cx="122" cy="100" r="9" fill="#6b3b1a" />
      <circle cx="78" cy="100" r="5" fill="#1d120a" />
      <circle cx="122" cy="100" r="5" fill="#1d120a" />
      <circle cx="81" cy="96" r="3" fill="#fff" />
      <circle cx="125" cy="96" r="3" fill="#fff" />
      {/* Nose */}
      <path d="M96 110 q4 6 8 0" stroke="#d98d6a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Mouth mood={mood} />
    </svg>
  );
}

/** Flight Director Did: headset on, Space Q shirt, ready to help. */
export function Did({ size = 120, mood = 'happy' }: { size?: number; mood?: Mood }) {
  return (
    <svg viewBox="0 0 200 220" width={size} height={size * 1.1} className="character did" aria-label="Flight Director Did">
      {/* Shirt */}
      <path d="M24 220 q6 -56 52 -64 h48 q46 8 52 64z" fill="#1f2a22" />
      <path d="M84 156 l16 22 l16 -22" fill="#f6ebcb" />
      <SpaceQPatch x={142} y={190} r={13} />
      {/* Neck and face */}
      <rect x="84" y="134" width="32" height="26" rx="10" fill="#e9b48e" />
      <ellipse cx="100" cy="96" rx="50" ry="56" fill="#efbe98" />
      {/* Hair, short and neat */}
      <path d="M50 92 q-4 -50 50 -54 q52 2 50 54 q-8 -30 -50 -34 q-42 4 -50 34z" fill="#3b2a1e" />
      {/* Glasses */}
      <g stroke="#1f2a22" strokeWidth="3.5" fill="rgba(255,255,255,0.25)">
        <rect x="62" y="84" width="30" height="24" rx="8" />
        <rect x="108" y="84" width="30" height="24" rx="8" />
        <path d="M92 94 h16" />
      </g>
      <circle cx="77" cy="97" r="5" fill="#2a1a10" />
      <circle cx="123" cy="97" r="5" fill="#2a1a10" />
      <path d="M64 76 q12 -6 24 -1 M112 75 q12 -5 24 1" stroke="#3b2a1e" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M97 110 q3 6 6 0" stroke="#c98a66" strokeWidth="3" fill="none" strokeLinecap="round" />
      {mood === 'oops' ? (
        <path d="M84 130 q16 -8 32 0" stroke="#5a2a1a" strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M82 124 q18 16 36 0" stroke="#5a2a1a" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
      {/* Headset with microphone */}
      <path d="M48 96 q0 -66 52 -66 q52 0 52 66" stroke="#2b2f36" strokeWidth="7" fill="none" />
      <rect x="40" y="86" width="14" height="26" rx="6" fill="#e2622b" />
      <rect x="146" y="86" width="14" height="26" rx="6" fill="#e2622b" />
      <path d="M50 108 q6 30 34 26" stroke="#2b2f36" strokeWidth="4" fill="none" />
      <circle cx="86" cy="134" r="5" fill="#2b2f36" />
    </svg>
  );
}
