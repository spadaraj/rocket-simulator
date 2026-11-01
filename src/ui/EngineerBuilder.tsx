// Engineer mode builder: numeric editor for every stage, auto-size, and a searchable parts catalog.

import { useMemo, useState } from 'react';
import { catalog } from '../data/catalog';
import { G0_MS2 } from '../physics/constants';
import type { StageDeltaV } from '../physics/deltaV';
import {
  addStage,
  liquidEngines,
  removeStage,
  setBoosters,
  setEngine,
  setEngineCount,
  setFill,
  setTank,
  stageEngine,
  stageFill,
  stageTank,
} from '../physics/edit';
import type { Part, RocketSpec } from '../physics/types';
import type { Vehicle } from '../physics/vehicle';
import { RocketThumb } from './RocketThumb';

interface Props {
  spec: RocketSpec;
  setSpec: (s: RocketSpec) => void;
  vehicle: Vehicle;
  deltaV: StageDeltaV[];
  /** Sea-level thrust-to-weight at liftoff, boosters included. */
  liftoffTWR: number;
  autoSizing: boolean;
  autoMessage: string | null;
  onAutoSize: () => void;
  onReset: () => void;
}

const ENGINES = liquidEngines(catalog);
const fmt = (x: number, d = 0) => x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

function Num(props: { value: number; step: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      className="num"
      type="number"
      aria-label={props.label}
      value={Number(props.value.toFixed(2))}
      step={props.step}
      min={props.min}
      max={props.max}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v) && v >= props.min && v <= props.max) props.onChange(v);
      }}
    />
  );
}

function partSummary(p: Part): string {
  switch (p.type) {
    case 'liquidEngine':
      return `${p.propellant} · ${fmt(p.thrustSeaLevelN / 1000)} / ${fmt(p.thrustVacuumN / 1000)} kN · Isp ${p.ispSeaLevelS}/${p.ispVacuumS} s`;
    case 'solidBooster':
      return `${fmt(p.propellantKg / 1000)} t propellant · ${p.burnTimeS} s burn · Isp ${p.ispVacuumS} s`;
    case 'tank':
      return `${p.propellant} · ${fmt(p.propellantCapacityKg / 1000)} t · ${p.diameterM} × ${p.lengthM} m`;
    default:
      return `${fmt(p.massKg / 1000, 1)} t`;
  }
}

export function EngineerBuilder(p: Props) {
  const { spec, setSpec, vehicle } = p;
  const [query, setQuery] = useState('');
  const parts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(catalog).filter((x) => !q || `${x.name} ${x.type} ${x.id}`.toLowerCase().includes(q));
  }, [query]);

  // Delta-v rows per stage (the booster phase folds into stage 0).
  const dvFor = (i: number) => {
    const name = spec.stages[i].name;
    return p.deltaV.filter((d) => d.name === name || d.name === `${name} + boosters`).reduce((a, d) => a + d.deltaVMS, 0);
  };
  const ignitionTWR = (i: number) => {
    if (i === 0) return p.liftoffTWR;
    const row = p.deltaV.find((d) => d.name === spec.stages[i].name || d.name === `${spec.stages[i].name} + boosters`);
    const st = vehicle.stages[i];
    const thrust = st.engines.reduce((a, g) => a + g.count * g.engine.thrustVacuumN, 0);
    return row ? thrust / (row.ignitionMassKg * G0_MS2) : 0;
  };

  const b = spec.stages[0]?.boosters;

  return (
    <div className="engineer-builder">
      <div className="eb-main">
        <div className="eb-toolbar">
          <button className="btn small" onClick={p.onAutoSize} disabled={p.autoSizing}>
            {p.autoSizing ? 'Sizing…' : 'Auto-size for the Moon'}
          </button>
          <button className="btn small" onClick={() => setSpec(addStage(spec, catalog))} disabled={spec.stages.length >= 4}>
            Add stage
          </button>
          <button className="btn small" onClick={p.onReset}>
            Reset to preset
          </button>
          {p.autoMessage && <span className="muted eb-msg">{p.autoMessage}</span>}
        </div>

        <table className="eb-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Engine</th>
              <th>Count</th>
              <th>Tank Ø m</th>
              <th>Length m</th>
              <th>Fill %</th>
              <th>Propellant t</th>
              <th>Dry t</th>
              <th>Δv m/s</th>
              <th title="Stage 1: at liftoff, sea level, boosters included. Upper stages: vacuum, at ignition.">T/W</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {spec.stages.map((st, i) => {
              const eng = stageEngine(spec, catalog, i);
              const tank = stageTank(spec, catalog, i);
              const model = vehicle.stages[i];
              return (
                <tr key={i}>
                  <td>
                    <span className="stage-swatch small" style={{ background: st.color }} /> {st.name}
                  </td>
                  <td>
                    {eng && (
                      <select value={eng.part.id} onChange={(e) => setSpec(setEngine(spec, catalog, i, e.target.value))}>
                        {ENGINES.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{eng && <Num label="Engine count" value={eng.ref.count ?? 1} step={1} min={0} max={40} onChange={(v) => setSpec(setEngineCount(spec, catalog, i, v))} />}</td>
                  <td>{tank && <Num label="Tank diameter" value={tank.part.diameterM ?? 0} step={0.5} min={1} max={20} onChange={(v) => setSpec(setTank(spec, catalog, i, { diameterM: v }))} />}</td>
                  <td>{tank && <Num label="Tank length" value={tank.part.lengthM ?? 0} step={1} min={1} max={120} onChange={(v) => setSpec(setTank(spec, catalog, i, { lengthM: v }))} />}</td>
                  <td>{tank && <Num label="Fill" value={Math.round(stageFill(spec, catalog, i) * 100)} step={1} min={1} max={100} onChange={(v) => setSpec(setFill(spec, catalog, i, v / 100))} />}</td>
                  <td className="mono">
                    {fmt(model.propellantKg / 1000)}
                    {tank?.part.confidence === 'estimate' && <span className="badge" title={tank.part.source}>est.</span>}
                  </td>
                  <td className="mono">{fmt(model.dryMassKg / 1000, 1)}</td>
                  <td className="mono">{fmt(dvFor(i))}</td>
                  <td className={`mono ${ignitionTWR(i) < (i === 0 ? 1 : 0.4) ? 'warn' : ''}`}>{fmt(ignitionTWR(i), 2)}</td>
                  <td>
                    {i > 0 && (
                      <button className="btn small ghost" onClick={() => setSpec(removeStage(spec, i))} aria-label={`Remove ${st.name}`}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td>Boosters</td>
              <td>
                <select value={b?.part ?? 'srb-sls-5seg'} onChange={(e) => setSpec(setBoosters(spec, e.target.value, b?.count || 2))}>
                  {Object.values(catalog)
                    .filter((x) => x.type === 'solidBooster')
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </td>
              <td>
                <Num label="Booster count" value={b?.count ?? 0} step={1} min={0} max={8} onChange={(v) => setSpec(setBoosters(spec, b?.part ?? 'srb-sls-5seg', v))} />
              </td>
              <td colSpan={8} className="muted">
                Strap-ons on the first stage; separate at burnout.
              </td>
            </tr>
          </tbody>
        </table>

        <h4 className="eb-h">Parts catalog</h4>
        <input className="eb-search" placeholder="Search parts (e.g. raptor, booster, tank)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="eb-catalog">
          {parts.map((x) => (
            <div key={x.id} className="eb-part" title={x.source}>
              <div>
                <b>{x.name}</b> <span className="muted">{x.type}</span>
                <span className={`badge ${x.confidence}`}>{x.confidence === 'published' ? 'published' : 'estimate'}</span>
              </div>
              <div className="muted mono small">{partSummary(x)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="eb-preview">
        <RocketThumb vehicle={vehicle} height={360} />
      </div>
    </div>
  );
}
