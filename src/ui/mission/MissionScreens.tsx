// Mission Mode screens: the Space Q home, the mission map, briefings, debriefs and the Skill Book.

import { useEffect, useState } from 'react';
import { CONTROL_INFO } from '../../missions/controlInfo';
import { CHAPTERS, MISSIONS } from '../../missions/missions';
import { furthestOpen, isUnlocked, learnedSkills, rank, readSaveCode, saveCode, totalStars, type Progress } from '../../missions/progress';
import { SKILLS, type SkillId } from '../../missions/skills';
import type { Mission } from '../../missions/types';
import { canSpeak, speak } from '../speech';
import { Did, Roscoe } from './Characters';

const LOGO = './brand/spaceq-logo.jpg';

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

export function Home({ progress, onMissions, onSandbox, onSkills }: { progress: Progress; onMissions: () => void; onSandbox: () => void; onSkills: () => void }) {
  return (
    <div className="sq-screen sq-home">
      <div className="sq-home-art">
        <img src={LOGO} alt="Space Q" className="sq-logo" />
        <Roscoe size={220} />
      </div>
      <div className="sq-home-menu">
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
        <button className="sq-small" onClick={onSkills}>
          📖 Skill Book
        </button>
      </div>
    </div>
  );
}

// ---------- Mission map ----------

/** Two saves together: the best stars for each mission, and the furthest grown-up opening. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const stars = { ...a.stars };
  for (const [id, n] of Object.entries(b.stars)) stars[id] = Math.max(n, stars[id] ?? 0);
  const openTo = Math.max(a.openTo ?? 0, b.openTo ?? 0);
  return openTo > 0 ? { stars, openTo } : { stars };
}

export function MissionMap({
  progress,
  onPlay,
  onHome,
  onProgress,
}: {
  progress: Progress;
  onPlay: (m: Mission) => void;
  onHome: () => void;
  onProgress: (p: Progress) => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="sq-screen sq-map">
      {saving && <SavePanel progress={progress} onProgress={onProgress} onClose={() => setSaving(false)} />}
      <div className="sq-map-head">
        <button className="sq-small" onClick={onHome}>
          ← Home
        </button>
        <img src={LOGO} alt="Space Q" className="sq-logo small" />
        <span className="sq-cadet">
          {rank(progress)} Roscoe · {totalStars(progress)} ★
        </span>
        <button className="sq-small sq-save-btn" onClick={() => setSaving(true)}>
          🔑 Save code
        </button>
      </div>
      {CHAPTERS.map((ch) => (
        <section key={ch.n} className="sq-chapter">
          <h2>
            Chapter {ch.n}: {ch.title}
          </h2>
          <div className="sq-tiles">
            {MISSIONS.filter((m) => m.chapter === ch.n).map((m) => {
              const i = MISSIONS.indexOf(m);
              const open = isUnlocked(progress, i);
              const stars = progress.stars[m.id] ?? 0;
              return (
                <button key={m.id} className={`sq-tile ${open ? '' : 'locked'} ${stars ? 'done' : ''}`} disabled={!open} onClick={() => onPlay(m)}>
                  <span className="sq-tile-n">{i + 1}</span>
                  <span className="sq-patch">{open ? m.patch : '🔒'}</span>
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

// ---------- Save codes (for grown-ups) ----------

function SavePanel({ progress, onProgress, onClose }: { progress: Progress; onProgress: (p: Progress) => void; onClose: () => void }) {
  const code = saveCode(progress);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [startAt, setStartAt] = useState(furthestOpen(progress));
  const [copied, setCopied] = useState(false);

  const load = () => {
    const p = readSaveCode(typed);
    if (!p) return setNote({ ok: false, text: 'That code doesn’t look right. Check each letter and try again.' });
    const merged = mergeProgress(progress, p);
    onProgress(merged);
    setStartAt(furthestOpen(merged));
    setNote({ ok: true, text: `Loaded! Missions open up to ${furthestOpen(merged) + 1}.` });
    setTyped('');
  };
  const open = () => {
    const merged = mergeProgress(progress, { stars: {}, openTo: startAt });
    onProgress(merged);
    setNote({ ok: true, text: `Done! Missions 1 to ${furthestOpen(merged) + 1} are open.` });
  };
  const copy = () => {
    navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <div className="sq-modal" onClick={onClose}>
      <div className="sq-card sq-save" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Save code">
        <h2>🔑 Save code</h2>
        <p className="sq-save-hint">
          Progress saves by itself in this browser. To carry it to another device or browser, write this code down and type it in there.
        </p>
        <div className="sq-save-code">
          <code>{code}</code>
          <button className="sq-small" onClick={copy}>
            {copied ? '✅ Copied' : '📋 Copy'}
          </button>
        </div>

        <h3>Got a code?</h3>
        <div className="sq-save-row">
          <input
            value={typed}
            onChange={(e) => (setTyped(e.target.value), setNote(null))}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Q-…"
            aria-label="Save code to load"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="sq-small" onClick={load} disabled={!typed.trim()}>
            Load
          </button>
        </div>

        <h3>For grown-ups: start from a mission</h3>
        <p className="sq-save-hint">Already played on another device? Open every mission up to this one. Stars stay as they are.</p>
        <div className="sq-save-row">
          <select value={startAt} onChange={(e) => (setStartAt(Number(e.target.value)), setNote(null))} aria-label="Open missions up to">
            {MISSIONS.map((m, i) => (
              <option key={m.id} value={i}>
                Mission {i + 1}: {m.title}
              </option>
            ))}
          </select>
          <button className="sq-small" onClick={open}>
            Open
          </button>
        </div>

        {note && <p className={`sq-save-note ${note.ok ? 'ok' : 'bad'}`}>{note.text}</p>}
        <div className="sq-save-done">
          <button className="sq-small" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
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
          <Did size={96} />
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
}: {
  mission: Mission;
  earned: number;
  best: number;
  starChecks: boolean[];
  onNext?: () => void;
  onRetry: () => void;
  onMap: () => void;
  replays: { label: string; onClick: () => void }[];
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
        <Roscoe size={92} />
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
      <div className="sq-talk small">
        <Did size={64} />
        <p className="sq-bubble">{mission.debrief}</p>
      </div>
      <div className="sq-learned">
        <b>
          🧠 You learned: {skill.emoji} {skill.title}
        </b>
        <p>{skill.text}</p>
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

export function SkillBook({ progress, onBack }: { progress: Progress; onBack: () => void }) {
  const learned = new Set<SkillId>(learnedSkills(progress));
  const all = Object.values(SKILLS);
  return (
    <div className="sq-screen sq-skills">
      <div className="sq-map-head">
        <button className="sq-small" onClick={onBack}>
          ← Back
        </button>
        <h2>📖 Roscoe’s Skill Book</h2>
        <span className="sq-cadet">
          {learned.size} of {all.length} learned
        </span>
      </div>
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
