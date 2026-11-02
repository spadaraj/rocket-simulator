// Engineer mode: design your own engine, starting from the one on a stage.
// Every number is allowed; the warnings say which ones no real engine could match.

import { useEffect, useState } from 'react';
import { catalog } from '../data/catalog';
import { engineWarnings, ISP_LIMITS, worstLevel } from '../physics/design';
import { fitCustomEngine, stageEngine } from '../physics/edit';
import type { LiquidEngine, RocketSpec } from '../physics/types';

const PROPELLANTS: LiquidEngine['propellant'][] = ['CH4/LOX', 'RP-1/LOX', 'LH2/LOX'];
const LEVEL_ICON = { info: 'ℹ️', warn: '⚠️', impossible: '🚫' };

interface Field {
  key: keyof LiquidEngine;
  label: string;
  unit: string;
  /** Shown value = stored value × scale. */
  scale: number;
  step: number;
}

const FIELDS: Field[] = [
  { key: 'thrustSeaLevelN', label: 'Thrust, sea level', unit: 'kN', scale: 1e-3, step: 10 },
  { key: 'thrustVacuumN', label: 'Thrust, vacuum', unit: 'kN', scale: 1e-3, step: 10 },
  { key: 'ispSeaLevelS', label: 'Isp, sea level', unit: 's', scale: 1, step: 1 },
  { key: 'ispVacuumS', label: 'Isp, vacuum', unit: 's', scale: 1, step: 1 },
  { key: 'massKg', label: 'Mass', unit: 'kg', scale: 1, step: 10 },
  { key: 'diameterM', label: 'Nozzle diameter', unit: 'm', scale: 1, step: 0.1 },
  { key: 'throttleMin', label: 'Lowest throttle', unit: '%', scale: 100, step: 5 },
  { key: 'gimbalDeg', label: 'Gimbal', unit: '°', scale: 1, step: 0.5 },
];

export function EngineDesigner({ spec, setSpec }: { spec: RocketSpec; setSpec: (s: RocketSpec) => void }) {
  const stages = spec.stages.map((s, i) => ({ i, name: s.name, eng: stageEngine(spec, catalog, i)?.part })).filter((x) => x.eng);
  const [stageIndex, setStageIndex] = useState(stages[0]?.i ?? 0);
  const current = stageEngine(spec, catalog, stageIndex)?.part;
  const [draft, setDraft] = useState<LiquidEngine | undefined>(current);

  // Start again from the stage's engine whenever the stage (or its engine) changes.
  useEffect(() => setDraft(current), [stageIndex, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft || !current) return null;
  const warnings = engineWarnings(draft);
  const worst = worstLevel(warnings);
  const isCustom = draft.id.startsWith('custom-engine-');
  const lim = ISP_LIMITS[draft.propellant];

  const set = (patch: Partial<LiquidEngine>) => setDraft({ ...draft, ...patch });
  const apply = () =>
    setSpec(
      fitCustomEngine(spec, catalog, stageIndex, {
        ...draft,
        name: isCustom ? draft.name : `My ${draft.name.replace(/^(SpaceX|Blue Origin|Rocketdyne|Aerojet) /, '')}`,
        basedOn: draft.basedOn ?? current.id,
        source: 'Your own design.',
        confidence: 'estimate',
      }),
    );

  return (
    <div className="engine-designer">
      <div className="ed-head">
        <label>
          Stage{' '}
          <select value={stageIndex} onChange={(e) => setStageIndex(Number(e.target.value))}>
            {stages.map((s) => (
              <option key={s.i} value={s.i}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Starting from <b>{current.name}</b>
        </label>
        <label>
          Propellant{' '}
          <select value={draft.propellant} onChange={(e) => set({ propellant: e.target.value as LiquidEngine['propellant'] })}>
            {PROPELLANTS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={!!draft.vacuumOnly} onChange={(e) => set({ vacuumOnly: e.target.checked })} /> Vacuum nozzle
        </label>
      </div>
      <div className="ed-grid">
        {FIELDS.map((f) => {
          const raw = (draft[f.key] as number | undefined) ?? (f.key === 'gimbalDeg' ? 5 : 0);
          return (
            <label key={f.key} className="ed-field">
              <span>{f.label}</span>
              <span className="nowrap">
                <input
                  className="num"
                  type="number"
                  step={f.step}
                  min={0}
                  value={Number((raw * f.scale).toFixed(2))}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0) set({ [f.key]: v / f.scale } as Partial<LiquidEngine>);
                  }}
                />{' '}
                <span className="muted">{f.unit}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="muted small">
        Best {draft.propellant} engine flown: {lim.bestEngine}, {lim.best} s vacuum Isp. Chemistry limit about {lim.limit} s.
      </p>
      {warnings.length ? (
        <ul className="ed-warnings">
          {warnings.map((w, i) => (
            <li key={i} className={w.level}>
              {LEVEL_ICON[w.level]} {w.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ok">✓ Every number is within what real engines do.</p>
      )}
      <div className="ed-actions">
        <button className={`btn small ${worst === 'impossible' ? 'warn' : 'primary'}`} onClick={apply}>
          {isCustom ? 'Update engine' : `Use on ${spec.stages[stageIndex].name}`}
          {worst === 'impossible' ? ' (science fiction)' : ''}
        </button>
        <button className="btn small ghost" onClick={() => setDraft(current)}>
          Undo changes
        </button>
      </div>
    </div>
  );
}
