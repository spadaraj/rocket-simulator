// The Space Q crew, from the painted art in public/art/characters (the prompts are in
// docs/design/art-brief.md). Each character breathes gently and blinks now and then.

type Mood = 'happy' | 'wow' | 'oops' | 'point' | 'chart';
type Who = 'roscoe' | 'did' | 'engineer' | 'scientist';

const DIR = './art/characters/';

/** width ÷ height of each character's full-body pictures (all of one character's pictures share a frame). */
const CREW: Record<Who, { label: string; ratio: number; moods: Partial<Record<Mood, string>>; portrait?: boolean }> = {
  roscoe: { label: 'Roscoe', ratio: 439 / 800, moods: { wow: 'wow', oops: 'oops' }, portrait: true },
  did: { label: 'Flight Director Did', ratio: 448 / 800, moods: { point: 'point' }, portrait: true },
  engineer: { label: 'The Chief Engineer', ratio: 688 / 800, moods: { oops: 'oops' } },
  scientist: { label: 'The Mission Scientist', ratio: 348 / 800, moods: { chart: 'chart' } },
};

/** Below this size the head-and-shoulders portrait reads better than a tiny full figure. */
const PORTRAIT_BELOW = 100;

function Crew({ who, size, mood = 'happy', full = false }: { who: Who; size: number; mood?: Mood; full?: boolean }) {
  const c = CREW[who];
  const label = c.label;
  if (c.portrait && size < PORTRAIT_BELOW && !full) {
    return (
      <span className={`character painted portrait ${who}`} style={{ width: size, height: size }} role="img" aria-label={label}>
        <img src={`${DIR}${who}-portrait.webp`} alt="" draggable={false} />
      </span>
    );
  }
  const h = Math.round(size * 1.1);
  const pose = c.moods[mood];
  return (
    <span className={`character painted ${who}`} style={{ width: Math.round(h * c.ratio), height: h }} role="img" aria-label={label}>
      <img src={`${DIR}${who}-${pose ?? 'neutral'}.webp`} alt="" draggable={false} />
      {!pose && <img className="blink-frame" src={`${DIR}${who}-blink.webp`} alt="" draggable={false} />}
    </span>
  );
}

type P = { size?: number; mood?: Mood; full?: boolean };

/** Roscoe, Space Q's newest cadet. */
export const Roscoe = ({ size = 120, ...p }: P) => <Crew who="roscoe" size={size} {...p} />;
/** Flight Director Did, the founder of Space Q. */
export const Did = ({ size = 120, ...p }: P) => <Crew who="did" size={size} {...p} />;
/** The Chief Engineer, a four-armed robot. */
export const Engineer = ({ size = 120, ...p }: P) => <Crew who="engineer" size={size} {...p} />;
/** The Mission Scientist, an astronomer. */
export const Scientist = ({ size = 120, ...p }: P) => <Crew who="scientist" size={size} {...p} />;
