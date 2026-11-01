// Roscoe mode builder: big pictures, arrows and +/- buttons. Every change re-flies instantly.

import { catalog } from '../data/catalog';
import { LEO_BUDGET_MS, TLI_BUDGET_MS, type StageDeltaV } from '../physics/deltaV';
import { addStage, liquidEngines, removeStage, setBoosters, setEngine, setEngineCount, setTank, stageEngine, stageFill, stageTank } from '../physics/edit';
import type { RocketSpec } from '../physics/types';
import type { Vehicle } from '../physics/vehicle';
import { RocketThumb } from './RocketThumb';

interface Props {
  spec: RocketSpec;
  setSpec: (s: RocketSpec) => void;
  vehicle: Vehicle;
  deltaV: StageDeltaV[];
  liftoffTWR: number;
  autoSizing: boolean;
  autoMessage: string | null;
  onAutoSize: () => void;
  onReset: () => void;
  onFly: () => void;
}

const ENGINES = liquidEngines(catalog);
const BOOSTERS = ['srb-sls-5seg', 'srb-shuttle'];
const BOOSTER_NAMES: Record<string, string> = { 'srb-sls-5seg': 'SLS boosters', 'srb-shuttle': 'Shuttle boosters' };
const shortName = (name: string) => name.replace(/^(SpaceX|Blue Origin|Rocketdyne) /, '');

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="rb-row">
      <span className="rb-label">{label}</span>
      <button className="rb-btn" onClick={onMinus} aria-label={`${label} less`}>
        −
      </button>
      <span className="rb-value">{value}</span>
      <button className="rb-btn" onClick={onPlus} aria-label={`${label} more`}>
        +
      </button>
    </div>
  );
}

function Chooser({ label, value, onPrev, onNext }: { label: string; value: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="rb-row">
      <span className="rb-label">{label}</span>
      <button className="rb-btn" onClick={onPrev} aria-label={`Previous ${label}`}>
        ◀
      </button>
      <span className="rb-value wide">{value}</span>
      <button className="rb-btn" onClick={onNext} aria-label={`Next ${label}`}>
        ▶
      </button>
    </div>
  );
}

export function RoscoeBuilder(p: Props) {
  const { spec, setSpec } = p;
  const totalDv = p.deltaV.reduce((a, d) => a + d.deltaVMS, 0);
  const moonDv = LEO_BUDGET_MS + TLI_BUDGET_MS;
  const meterMax = moonDv * 1.3;
  const canLift = p.liftoffTWR > 1;

  const cycle = <T,>(list: T[], current: T, dir: number) =>
    list[(list.indexOf(current) + dir + list.length) % list.length];

  // Show stages top-first, like the rocket stands.
  const order = spec.stages.map((_, i) => i).reverse();

  return (
    <div className="roscoe-builder">
      <div className="rb-preview">
        <RocketThumb vehicle={p.vehicle} height={420} />
      </div>

      <div className="rb-cards">
        <div className="rb-card payload">
          <div className="rb-title">👩‍🚀 {spec.payload.name}</div>
          <div className="rb-note">Crew capsule, service module and Moon lander</div>
        </div>

        {spec.stages.length < 4 && (
          <button className="rb-add" onClick={() => setSpec(addStage(spec, catalog))}>
            ➕ Add a stage on top
          </button>
        )}

        {order.map((i) => {
          const st = spec.stages[i];
          const eng = stageEngine(spec, catalog, i);
          const tank = stageTank(spec, catalog, i);
          const fill = stageFill(spec, catalog, i);
          return (
            <div key={i} className="rb-card">
              <div className="rb-title">
                <span className="stage-swatch" style={{ background: st.color }} />
                {st.name}
                {i > 0 && (
                  <button className="rb-remove" onClick={() => setSpec(removeStage(spec, i))} aria-label={`Remove ${st.name}`}>
                    🗑
                  </button>
                )}
              </div>
              {eng && (
                <>
                  <Chooser
                    label="Engine"
                    value={shortName(eng.part.name)}
                    onPrev={() => setSpec(setEngine(spec, catalog, i, cycle(ENGINES, ENGINES.find((e) => e.id === eng.part.id)!, -1).id))}
                    onNext={() => setSpec(setEngine(spec, catalog, i, cycle(ENGINES, ENGINES.find((e) => e.id === eng.part.id)!, 1).id))}
                  />
                  <Stepper
                    label="How many"
                    value={String(eng.ref.count ?? 1)}
                    onMinus={() => setSpec(setEngineCount(spec, catalog, i, (eng.ref.count ?? 1) - 1))}
                    onPlus={() => setSpec(setEngineCount(spec, catalog, i, (eng.ref.count ?? 1) + 1))}
                  />
                </>
              )}
              {tank && (
                <Stepper
                  label="Fuel tank"
                  value={`${Math.round(tank.part.lengthM ?? 0)} m${fill < 0.99 ? ` · ${Math.round(fill * 100)}% full` : ''}`}
                  onMinus={() => setSpec(setTank(spec, catalog, i, { lengthM: Math.max(3, (tank.part.lengthM ?? 10) * 0.8) }))}
                  onPlus={() => setSpec(setTank(spec, catalog, i, { lengthM: Math.min(90, (tank.part.lengthM ?? 10) * 1.25) }))}
                />
              )}
              {i === 0 && (
                <>
                  <Stepper
                    label="Boosters"
                    value={String(st.boosters?.count ?? 0)}
                    onMinus={() => setSpec(setBoosters(spec, st.boosters?.part ?? BOOSTERS[0], (st.boosters?.count ?? 0) - 2))}
                    onPlus={() => setSpec(setBoosters(spec, st.boosters?.part ?? BOOSTERS[0], Math.min(6, (st.boosters?.count ?? 0) + 2)))}
                  />
                  {st.boosters && (
                    <Chooser
                      label="Kind"
                      value={BOOSTER_NAMES[st.boosters.part] ?? st.boosters.part}
                      onPrev={() => setSpec(setBoosters(spec, cycle(BOOSTERS, st.boosters!.part, -1), st.boosters!.count))}
                      onNext={() => setSpec(setBoosters(spec, cycle(BOOSTERS, st.boosters!.part, 1), st.boosters!.count))}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}

        <div className="rb-meter" aria-label="Rocket power">
          <div className="rb-meter-head">
            <span>⚡ Power</span>
            <span className={canLift ? 'ok' : 'warn'}>{canLift ? '✓ Strong enough to lift off' : '✗ Too heavy to lift off'}</span>
          </div>
          <div className="rb-meter-bar">
            <span className="rb-meter-fill" style={{ width: `${Math.min(100, (totalDv / meterMax) * 100)}%` }} />
            <span className="rb-meter-mark" style={{ left: `${(LEO_BUDGET_MS / meterMax) * 100}%` }}>
              🌍 Space
            </span>
            <span className="rb-meter-mark" style={{ left: `${(moonDv / meterMax) * 100}%` }}>
              🌕 Moon
            </span>
          </div>
        </div>

        <div className="rb-actions">
          <button className="btn big" onClick={p.onAutoSize} disabled={p.autoSizing}>
            {p.autoSizing ? '⏳ Thinking…' : '✨ Make it reach the Moon'}
          </button>
          <button className="btn big" onClick={p.onReset}>
            ↺ Start over
          </button>
          <button className="btn big primary" onClick={p.onFly}>
            🚀 To the launch pad
          </button>
        </div>
        {p.autoMessage && <div className="rb-auto-msg">{p.autoMessage}</div>}
      </div>
    </div>
  );
}
