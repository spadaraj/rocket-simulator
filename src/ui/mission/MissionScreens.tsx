// Mission Mode screens: the Space Q home, the mission map, briefings, debriefs and the Skill Book.

import { useEffect, useState, type ReactNode } from 'react';
import type { Lab } from '../lab';
import { LEVELS, type Level } from '../../missions/level';
import { CONTROL_INFO } from '../../missions/controlInfo';
import { CHAPTERS, MISSIONS } from '../../missions/missions';
import { learnedSkills, rank, totalStars, upNext, type Progress } from '../../missions/progress';
import { SKILLS, type SkillId } from '../../missions/skills';
import type { Mission } from '../../missions/types';
import { canSpeak, speak } from '../speech';
import { Did, Roscoe, Scientist } from './Characters';

const LOGO = './brand/spaceq-logo.webp';

export function Stars({ n, of = 3, big = false }: { n: number; of?: number; big?: boolean }) {
  return (
    <span className={`stars ${big ? 'big' : ''}`} aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

/** Read lines aloud once when they appear (the first time only). */
function useReadAloud(text: string, on = true) {
  useEffect(() => {
    if (on && canSpeak) speak(text);
  }, [text, on]);
}

// ---------- Home ----------

export function Home({
  progress,
  onMissions,
  onSandbox,
  onSkills,
  onDetective,
  level,
  onLevel,
}: {
  progress: Progress;
  level: Level;
  onLevel: (l: Level) => void;
  onMissions: () => void;
  onSandbox: () => void;
  onSkills: () => void;
  onDetective: () => void;
}) {
  return (
    <div className="sq-screen sq-home">
      <div className="sq-home-roscoe">
        <Roscoe size={300} />
      </div>
      <div className="sq-home-menu">
        <img src={LOGO} alt="Space Q" className="sq-logo" />
        <div className="sq-cadet">
          <b>Roscoe</b> · {rank(progress)} · <Stars n={Math.min(3, Math.ceil(totalStars(progress) / 12))} /> {totalStars(progress)} stars
        </div>
        <button className="sq-big primary" onClick={onMissions}>
          🚀 Missions
          <small>Train with Flight Director Did</small>
        </button>
        <button className="sq-big" onClick={onSandbox}>
          🛠️ Sandbox
          <small>Build and fly anything</small>
        </button>
        <button className="sq-big" onClick={onDetective}>
          🕵️ Crash Detective
          <small>Find out why the rocket failed</small>
        </button>
        <button className="sq-small" onClick={onSkills}>
          📖 Skill Book
        </button>
        <div className="sq-level" role="group" aria-label="Level">
          <div className="sq-level-picks">
            {LEVELS.map((l) => (
              <button key={l.id} className={level === l.id ? 'on' : ''} aria-pressed={level === l.id} onClick={() => onLevel(l.id)}>
                {l.emoji} {l.label}
              </button>
            ))}
          </div>
          <small>{LEVELS.find((l) => l.id === level)!.blurb}</small>
        </div>
      </div>
    </div>
  );
}

// ---------- Mission map ----------

export function MissionMap({ progress, level, onPlay, onHome }: { progress: Progress; level: Level; onPlay: (m: Mission) => void; onHome: () => void }) {
  const lv = LEVELS.find((l) => l.id === level)!;
  const next = upNext(progress);
  return (
    <div className="sq-screen sq-map">
      <div className="sq-map-head">
        <button className="sq-small" onClick={onHome}>
          ← Home
        </button>
        <img src={LOGO} alt="Space Q" className="sq-logo small" />
        <span className="sq-cadet">
          {rank(progress)} Roscoe · {totalStars(progress)} ★ · {lv.emoji} {lv.label}
        </span>
      </div>
      {CHAPTERS.map((ch) => (
        <section key={ch.n} className="sq-chapter">
          <h2>
            Chapter {ch.n}: {ch.title}
          </h2>
          <div className="sq-tiles">
            {MISSIONS.filter((m) => m.chapter === ch.n).map((m) => {
              const i = MISSIONS.indexOf(m);
              const stars = progress.levels[level][m.id] ?? 0;
              return (
                <button key={m.id} className={`sq-tile ${progress.stars[m.id] ? 'done' : ''} ${i === next ? 'next' : ''}`} onClick={() => onPlay(m)}>
                  <span className="sq-tile-n">{i + 1}</span>
                  {i === next && <span className="sq-tile-next">▶ Up next</span>}
                  <span className="sq-patch">{m.patch}</span>
                  <b>{m.title}</b>
                  <span className="sq-kind">{m.kind === 'history' ? '📜 History sim' : '⭐ Space Q mission'}</span>
                  <Stars n={stars} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="sq-coming">🪐 More chapters coming: the giant planets, Pluto, and Space Q’s big dream!</p>
    </div>
  );
}

// ---------- Briefing ----------

export function Briefing({ mission, best, onGo, onBack }: { mission: Mission; best: number; onGo: () => void; onBack: () => void }) {
  const text = mission.briefing.join(' ');
  useReadAloud(text);
  return (
    <div className="sq-modal">
      <div className="sq-card briefing">
        <div className="sq-card-top">
          <span className="sq-patch big">{mission.patch}</span>
          <div>
            <div className="sq-kind">{mission.kind === 'history' ? '📜 History sim' : '⭐ Space Q mission'}</div>
            <h2>
              Mission {MISSIONS.indexOf(mission) + 1}: {mission.title}
            </h2>
            {mission.real && <div className="sq-real">{mission.real}</div>}
          </div>
        </div>
        <div className="sq-talk">
          <Did size={120} mood="point" full />
          <div className="sq-bubble">
            {mission.briefing.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </div>
        <div className="sq-goals">
          <div>
            <Stars n={best >= 1 ? 1 : 0} of={1} /> <b>{mission.goalText}</b>
          </div>
          {mission.stars.map((s, k) => (
            <div key={s.text}>
              <Stars n={best >= k + 2 ? 1 : 0} of={1} /> {s.text}
            </div>
          ))}
        </div>
        {mission.unlocks.length > 0 && (
          <div className="sq-new">
            🆕 New in this mission: {mission.unlocks.map((c) => CONTROL_INFO[c].label).join(', ')}
          </div>
        )}
        <div className="sq-actions">
          <button className="sq-small" onClick={onBack}>
            ← Missions
          </button>
          {canSpeak && (
            <button className="sq-small" onClick={() => speak(text)}>
              🔊 Again
            </button>
          )}
          <button className="sq-big primary" onClick={onGo}>
            Let’s go! 🚀
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Debrief ----------

export function Debrief({
  mission,
  earned,
  best,
  starChecks,
  onNext,
  onRetry,
  onMap,
  replays,
  lab,
}: {
  mission: Mission;
  earned: number;
  best: number;
  starChecks: boolean[];
  onNext?: () => void;
  onRetry: () => void;
  onMap: () => void;
  replays: { label: string; onClick: () => void }[];
  lab?: ReactNode;
}) {
  const skill = SKILLS[mission.skill];
  const text = `${mission.debrief} You learned: ${skill.title}. ${skill.text}`;
  useReadAloud(text);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= earned ? (clearInterval(id), n) : n + 1)), 450);
    return () => clearInterval(id);
  }, [earned]);
  return (
    <div className="sq-card debrief">
      <div className="sq-talk">
        <Roscoe size={120} mood="wow" />
        <div>
          <h2>Mission complete!</h2>
          <Stars n={shown} big />
          {best > earned && <div className="sq-real">Your best: {best} ★</div>}
        </div>
      </div>
      <ul className="sq-starlist">
        <li className="on">★ {mission.goalText}</li>
        {mission.stars.map((s, k) => (
          <li key={s.text} className={starChecks[k] ? 'on' : ''}>
            {starChecks[k] ? '★' : '☆'} {s.text}
          </li>
        ))}
      </ul>
      {lab}
      <div className="sq-talk small">
        <Did size={64} />
        <p className="sq-bubble">{mission.debrief}</p>
      </div>
      <div className="sq-learned">
        <Scientist size={80} />
        <div>
        <b>
          🧠 You learned: {skill.emoji} {skill.title}
        </b>
        <p>{skill.text}</p>
        </div>
      </div>
      <div className="sq-actions">
        <button className="sq-small" onClick={onMap}>
          🗺️ Missions
        </button>
        {earned < 3 && (
          <button className="sq-small" onClick={onRetry}>
            ↺ Try for more stars
          </button>
        )}
        {onNext && (
          <button className="sq-big primary" onClick={onNext}>
            Next mission →
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

// ---------- Skill Book ----------

export function SkillBook({ progress, lab, onBack }: { progress: Progress; lab: Lab; onBack: () => void }) {
  const learned = new Set<SkillId>(learnedSkills(progress));
  const all = Object.values(SKILLS);
  return (
    <div className="sq-screen sq-skills">
      <div className="sq-map-head">
        <button className="sq-small" onClick={onBack}>
          ← Back
        </button>
        <Scientist size={90} mood="chart" />
        <h2>📖 Roscoe’s Skill Book</h2>
        <span className="sq-cadet">
          {learned.size} of {all.length} learned
        </span>
      </div>
      <section className="sq-lab">
        <h3>🔬 Lab Notes: what your own tests found</h3>
        <p className="sq-lab-tally">
          🧪 Clean tests: <b>{lab.clean}</b> · 🎯 Guesses right: <b>{lab.right}</b> of {lab.guesses} · 😮 Surprises: <b>{lab.guesses - lab.right}</b>
        </p>
        {lab.findings.length ? (
          <ul>
            {lab.findings.map((f) => (
              <li key={f.change}>
                <b>{f.change}</b>
                <span>{f.effect}</span>
                <small>{f.where}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing here yet. Change just one thing on a rocket, fly it again, and what you find out gets written down here.</p>
        )}
      </section>
      <div className="sq-skill-grid">
        {all.map((s) =>
          learned.has(s.id) ? (
            <button key={s.id} className="sq-skill" onClick={() => canSpeak && speak(`${s.title}. ${s.text}`)}>
              <span className="sq-patch">{s.emoji}</span>
              <b>{s.title}</b>
              <p>{s.text}</p>
            </button>
          ) : (
            <div key={s.id} className="sq-skill locked">
              <span className="sq-patch">❔</span>
              <b>Not learned yet</b>
              <p>Keep flying missions to fill this page!</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
