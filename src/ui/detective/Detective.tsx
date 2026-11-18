// Crash Detective screens: the case list, and the case room where Roscoe watches the crash,
// reads the flight recorder, flies test flights with parts swapped, and names the culprit.

import { useEffect, useMemo, useRef, useState } from 'react';
import { catalog } from '../../data/catalog';
import {
  CASES,
  accuse,
  cleared,
  flyCase,
  loadCaseStars,
  openCase,
  outcomeLine,
  pickCulprit,
  recorder,
  runTest,
  saveCaseStars,
  starChecks,
  starsFor,
  testNote,
  testsLeft,
  type Case,
  type CaseStars,
} from '../../detective/cases';
import type { MissionRecord } from '../../physics/mission';
import type { RecoveryTrack } from '../../physics/recovery';
import { buildVehicle, type Vehicle } from '../../physics/vehicle';
import { FlightCanvas } from '../FlightCanvas';
import { Did, Roscoe } from '../mission/Characters';
import { Stars } from '../mission/MissionScreens';
import { usePlayback } from '../playback';
import { canSpeak, speak } from '../speech';

const SPEEDS = [
  { label: '🐢', speed: 10, title: 'Slow' },
  { label: '🐇', speed: 30, title: 'Normal' },
  { label: '🚀', speed: 90, title: 'Fast' },
];

/** The case room shows the climb only, not the pieces falling back. */
const NO_PIECES: RecoveryTrack[] = [];

const STAR_TEXT = ['Solve the case', 'Name the culprit first time', 'Waste no test flights'];

// ---------- a flight playing in the case room ----------

interface ReplayProps {
  flight: MissionRecord;
  vehicle: Vehicle;
  /** How the rocket should fly, alongside as a ghost. */
  ghost?: MissionRecord;
  launchSite: string;
  title: string;
  /** Shown once the flight has played to the end. */
  result: string;
  onEnd: () => void;
}

function Replay({ flight, vehicle, ghost, launchSite, title, result, onEnd }: ReplayProps) {
  const duration = flight.ascent.durationS;
  // A crash on the pad is over in seconds, so it plays slowly; a long flight plays fast.
  const pb = usePlayback(flight, duration, duration < 150 ? 10 : duration < 700 ? 30 : 90);
  const ended = pb.t >= duration - 0.05;
  const { play } = pb;
  useEffect(() => play(), [play]);
  useEffect(() => {
    if (ended) onEnd();
    // Only when the flight reaches its end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);
  const ghostProp = useMemo(
    () => (ghost ? { record: ghost.ascent, vehicle, label: '👻 how it should fly', endLabel: '👻 a healthy rocket got here' } : undefined),
    [ghost, vehicle],
  );
  return (
    <div className="det-view">
      <FlightCanvas record={flight.ascent} vehicle={vehicle} tRef={pb.tRef} launchSite={launchSite} roscoe armed recoveries={NO_PIECES} ghost={ghostProp} />
      <div className={`det-caption ${ended ? 'ended' : ''}`}>
        <b>{title}</b>
        {ended ? <span>{result}</span> : <span>T+{Math.round(pb.t)} s</span>}
      </div>
      <div className="controls">
        <button className="btn" onClick={pb.playing ? pb.pause : pb.play} aria-label={pb.playing ? 'Pause' : ended ? 'Watch again' : 'Play'}>
          {pb.playing ? '⏸' : ended ? '↺' : '▶'}
        </button>
        {SPEEDS.map((s) => (
          <button key={s.speed} className={`btn ${pb.speed === s.speed ? 'on' : ''}`} onClick={() => pb.setSpeed(s.speed)} title={s.title}>
            {s.label}
          </button>
        ))}
        {!ended && (
          <button className="btn" onClick={() => pb.seek(duration)}>
            ⏭ Skip to the end
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- the case room ----------

interface RoomProps {
  c: Case;
  culprit: string;
  onSolved: (stars: number) => void;
  onBack: () => void;
  onAgain: () => void;
  onNext?: () => void;
}

function CaseRoom({ c, culprit, onSolved, onBack, onAgain, onNext }: RoomProps) {
  const healthy = useMemo(() => flyCase(c, null), [c]);
  const crash = useMemo(() => flyCase(c, culprit), [c, culprit]);
  const spec = useMemo(() => c.rocket(), [c]);
  const vehicle = useMemo(() => buildVehicle(spec, catalog), [spec]);
  const rows = useMemo(() => recorder(c.gauges, healthy, crash), [c, healthy, crash]);

  const [state, setState] = useState(() => openCase(culprit));
  const [pick, setPick] = useState<string[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const [brief, setBrief] = useState(true);
  /** Which flight is on screen: the crash (null) or a test flight. `n` restarts the replay. */
  const [view, setView] = useState<{ n: number; test: number | null }>({ n: 0, test: null });
  /** A test flight is in the air: its result stays secret until it ends. */
  const [flying, setFlying] = useState(false);
  const [oops, setOops] = useState<string | null>(null);

  const briefing = c.briefing.join(' ');
  useEffect(() => {
    if (canSpeak) speak(briefing);
  }, [briefing]);

  const seen = state.tests.length - (flying ? 1 : 0);
  const innocent = cleared(c, state, seen);
  const open = c.suspects.filter((s) => !innocent.has(s.id));
  const left = testsLeft(c, state);
  const shown = view.test === null ? null : state.tests[view.test];
  const name = (id: string) => c.suspects.find((s) => s.id === id)?.name ?? id;

  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const flyTest = () => {
    if (!pick.length || flying || left <= 0) return;
    setState(runTest(c, state, pick));
    setView({ n: view.n + 1, test: state.tests.length });
    setPick([]);
    setNaming(null);
    setOops(null);
    setFlying(true);
  };

  const nameIt = (id: string) => {
    const next = accuse(state, id);
    setState(next);
    setNaming(null);
    setPick((p) => p.filter((x) => x !== id));
    if (next.solved) onSolved(starsFor(next));
    else setOops(`Not the ${name(id).toLowerCase()}! That part is fine. Look at the clues again.`);
  };

  const culpritSuspect = c.suspects.find((s) => s.id === culprit)!;
  const checks = starChecks(state);

  let did = c.tip;
  if (oops) did = oops;
  else if (flying) did = 'Test flight in the air. Watch closely!';
  else if (open.length === 1) did = 'Only one suspect left. Name the culprit!';
  else if (left <= 0) did = 'No test flights left. Look at the clues, then name the culprit.';
  else if (shown && !shown.fixed && shown.wasted) did = 'Hmm. We already knew what that test would do. Pick parts we are not sure about.';
  else if (shown?.fixed && shown.swapped.length > 1) did = 'It flew! But you swapped more than one part. Which one was the broken one? One more test can tell.';

  return (
    <div className="det-room">
      {!brief && (
        <Replay
          key={view.n}
          flight={shown?.fixed ? healthy : crash}
          vehicle={vehicle}
          ghost={shown?.fixed ? undefined : healthy}
          launchSite={spec.launchSite}
          title={shown ? `🧪 Test flight ${view.test! + 1}` : '📼 The crash'}
          result={shown ? (shown.fixed ? '✅ It flew!' : `❌ Still failed. ${outcomeLine(crash)}`) : `💥 ${outcomeLine(crash)}`}
          onEnd={() => setFlying(false)}
        />
      )}
      {brief && <div className="det-view" />}

      <aside className="det-panel">
        <div className="det-head">
          <button className="sq-small" onClick={onBack}>
            ← Cases
          </button>
          <h2>
            {c.patch} {c.title}
          </h2>
        </div>

        <div className="det-did">
          <Did size={56} />
          <p className="sq-bubble">{did}</p>
        </div>

        <section className="det-box">
          <h3>📼 Flight recorder: {c.rocketName}</h3>
          <table className="det-recorder">
            <thead>
              <tr>
                <th />
                <th>Should be</th>
                <th>This flight</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.odd ? 'odd' : ''}>
                  <td>
                    {r.emoji} {r.label}
                  </td>
                  <td>{r.should}</td>
                  <td>
                    {r.odd && <span aria-label="Odd">⚠️ </span>}
                    {r.was}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.test !== null && !flying && (
            <button className="btn small det-rewatch" onClick={() => setView({ n: view.n + 1, test: null })}>
              📼 Watch the crash again
            </button>
          )}
        </section>

        <section className="det-box">
          <h3>🕵️ Suspects</h3>
          <ul className="det-suspects">
            {c.suspects.map((s) => {
              const out = innocent.has(s.id);
              const on = pick.includes(s.id);
              return (
                <li key={s.id} className={`${out ? 'out' : ''} ${on ? 'on' : ''}`}>
                  <div className="det-suspect-who">
                    <span className="det-emoji">{s.emoji}</span>
                    <div>
                      <b>{s.name}</b>
                      {out ? <small>✅ Innocent</small> : <small>If it’s this: {s.tell}</small>}
                    </div>
                  </div>
                  {!state.solved && (
                    <div className="det-suspect-do">
                      <button className={`btn small ${on ? 'on' : ''}`} aria-pressed={on} disabled={flying || left <= 0} onClick={() => toggle(s.id)}>
                        🔧 {on ? 'Swapping' : 'Swap'}
                      </button>
                      {!out && (
                        <button className="btn small" disabled={flying} onClick={() => setNaming(s.id)}>
                          👉 It was this!
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {naming ? (
            <div className="det-confirm">
              <b>Name the {name(naming).toLowerCase()} as the culprit?</b>
              <div>
                <button className="sq-small" onClick={() => setNaming(null)}>
                  Not yet
                </button>
                <button className="sq-big primary" onClick={() => nameIt(naming)}>
                  Yes, that’s it!
                </button>
              </div>
            </div>
          ) : (
            <div className="det-test">
              <span className="det-pips" aria-label={`${left} of ${c.tests} test flights left`}>
                {Array.from({ length: c.tests }, (_, i) => (
                  <span key={i} className={i < left ? 'on' : ''}>
                    🧪
                  </span>
                ))}
              </span>
              <button className="sq-big primary" disabled={!pick.length || flying || left <= 0} onClick={flyTest}>
                {left <= 0 ? 'No test flights left' : pick.length ? `Fly a test with ${pick.length === 1 ? 'a new part' : `${pick.length} new parts`}` : 'Pick a part to swap'}
              </button>
            </div>
          )}
        </section>

        {(seen > 0 || state.wrong.length > 0) && (
          <section className="det-box">
            <h3>📓 Case notes</h3>
            <ol className="det-notes">
              {state.tests.slice(0, seen).map((t, i) => (
                <li key={i}>
                  {testNote(c, t)}
                  {t.wasted && <em> (We already knew that: a wasted test.)</em>}
                </li>
              ))}
            </ol>
            {state.wrong.map((id) => (
              <p key={id} className="det-wrong">
                👉 Named the {name(id).toLowerCase()}: wrong. It is innocent.
              </p>
            ))}
          </section>
        )}
      </aside>

      {brief && (
        <div className="sq-modal">
          <div className="sq-card briefing">
            <div className="sq-card-top">
              <span className="sq-patch big">{c.patch}</span>
              <div>
                <div className="sq-kind">🕵️ Crash Detective</div>
                <h2>{c.title}</h2>
                <div className="sq-real">
                  {c.rocketName} · {c.suspects.length} suspects · {c.tests} test flights
                </div>
              </div>
            </div>
            <div className="sq-talk">
              <Did size={120} mood="point" full />
              <div className="sq-bubble">
                {c.briefing.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
            </div>
            <div className="sq-goals">
              {STAR_TEXT.map((t) => (
                <div key={t}>
                  <Stars n={0} of={1} /> {t}
                </div>
              ))}
            </div>
            <div className="sq-actions">
              <button className="sq-small" onClick={onBack}>
                ← Cases
              </button>
              <button className="sq-big primary" onClick={() => setBrief(false)}>
                Watch the crash 📼
              </button>
            </div>
          </div>
        </div>
      )}

      {state.solved && (
        <div className="sq-modal">
          <div className="sq-card debrief">
            <div className="sq-talk">
              <Roscoe size={120} mood="wow" />
              <div>
                <h2>Case closed!</h2>
                <Stars n={starsFor(state)} big />
              </div>
            </div>
            <div className="det-culprit">
              <span className="det-emoji">{culpritSuspect.emoji}</span>
              <div>
                <b>The culprit: {culpritSuspect.name}</b>
                <p>{culpritSuspect.story}</p>
              </div>
            </div>
            <ul className="sq-starlist">
              {STAR_TEXT.map((t, k) => (
                <li key={t} className={checks[k] ? 'on' : ''}>
                  {checks[k] ? '★' : '☆'} {t}
                </li>
              ))}
            </ul>
            <div className="sq-talk small">
              <Did size={64} />
              <p className="sq-bubble">
                {state.tests.length === 0
                  ? 'You solved it from the clues alone, with no test flights. That is real detective work!'
                  : `You used ${state.tests.length} of ${c.tests} test flights. Real engineers hunt for faults just like this.`}
              </p>
            </div>
            <div className="sq-actions">
              <button className="sq-small" onClick={onBack}>
                🗂️ Cases
              </button>
              <button className="sq-small" onClick={onAgain}>
                ↺ New culprit
              </button>
              {onNext && (
                <button className="sq-big primary" onClick={onNext}>
                  Next case →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- the detective office ----------

export function Detective({ onHome }: { onHome: () => void }) {
  const [stars, setStars] = useState<CaseStars>(loadCaseStars);
  const [room, setRoom] = useState<{ c: Case; culprit: string; n: number } | null>(null);
  const lastCulprit = useRef<Record<string, string>>({});

  const start = (c: Case) => {
    const culprit = pickCulprit(c, lastCulprit.current[c.id]);
    lastCulprit.current[c.id] = culprit;
    setRoom((r) => ({ c, culprit, n: (r?.n ?? 0) + 1 }));
  };

  if (room) {
    const i = CASES.indexOf(room.c);
    const next = CASES[i + 1];
    return (
      <CaseRoom
        key={room.n}
        c={room.c}
        culprit={room.culprit}
        onBack={() => setRoom(null)}
        onAgain={() => start(room.c)}
        onNext={next ? () => start(next) : undefined}
        onSolved={(n) =>
          setStars((s) => {
            const out = { ...s, [room.c.id]: Math.max(s[room.c.id] ?? 0, n) };
            saveCaseStars(out);
            return out;
          })
        }
      />
    );
  }

  const solved = CASES.filter((c) => (stars[c.id] ?? 0) > 0).length;
  return (
    <div className="sq-screen sq-map">
      <div className="sq-map-head">
        <button className="sq-small" onClick={onHome}>
          ← Home
        </button>
        <Did size={90} mood="point" />
        <h2>🕵️ Crash Detective</h2>
        <span className="sq-cadet">
          {solved} of {CASES.length} cases solved
        </span>
      </div>
      <section className="sq-chapter">
        <h2>A rocket failed. One part is hiding a fault. Can you find it?</h2>
        <div className="sq-tiles">
          {CASES.map((c, i) => (
            <button key={c.id} className={`sq-tile ${stars[c.id] ? 'done' : ''}`} onClick={() => start(c)}>
              <span className="sq-tile-n">{i + 1}</span>
              <span className="sq-patch">{c.patch}</span>
              <b>{c.title}</b>
              <span className="sq-kind">
                {c.rocketName} · {c.suspects.length} suspects
              </span>
              <Stars n={stars[c.id] ?? 0} />
            </button>
          ))}
        </div>
      </section>
      <p className="sq-coming">🔁 Every case hides a different culprit each time you open it.</p>
    </div>
  );
}
