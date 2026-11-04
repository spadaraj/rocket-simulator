// Roscoe mode builder: big pictures, arrows and +/- buttons. Every change re-flies instantly.

import { catalog } from '../data/catalog';
import { LEO_BUDGET_MS, TLI_BUDGET_MS, type StageDeltaV } from '../physics/deltaV';
import {
  addStage,
  baseEngine,
  finScale,
  liquidEngines,
  removeStage,
  setBoosterRecovery,
  setBoosters,
  setEngine,
  setEngineCount,
  setFins,
  PAYLOAD_SLOTS,
  payloadSlot,
  setHeatShield,
  setMission,
  setName,
  setPayloadSlot,
  setRecovery,
  setStructure,
  setTank,
  stageEngine,
  stageFill,
  stageTank,
  tuneEngine,
} from '../physics/edit';
import { createContext, useContext } from 'react';
import type { ControlId } from '../physics/controls';
import { engineWarnings, worstLevel } from '../physics/design';
import { goesToMoon } from '../physics/raise';
import { DESTINATIONS } from '../physics/planets';
import { applyTrip, ARRIVALS, arrivalsFor, launchDayLabel, launchDays, TRIPS, tripKey, wrappedOffset } from '../physics/trips';
import { WindowMap } from './SolarMap';
import { DEFAULT_ENTRY_ANGLE_DEG } from '../physics/reentry';
import type { RocketSpec } from '../physics/types';
import { resolveCatalog, type Vehicle } from '../physics/vehicle';
import { NameField } from './NameField';
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
  onSave: () => void;
  /** True when this rocket is already saved and unchanged. */
  saved: boolean;
  /** Mission Mode: only these controls show (all of them when absent). */
  controls?: Set<ControlId>;
  /** Controls new in this mission, which glow. */
  fresh?: Set<ControlId>;
}

const Gate = createContext<{ controls?: Set<ControlId>; fresh?: Set<ControlId> }>({});

/** Whether a control is shown, and whether it is new, in Mission Mode. */
function useGate(id?: ControlId) {
  const g = useContext(Gate);
  if (!id) return { show: true, cls: '' };
  return { show: !g.controls || g.controls.has(id), cls: g.fresh?.has(id) ? ' fresh' : '' };
}

const ENGINES = liquidEngines(catalog);
const BOOSTERS = ['srb-sls-5seg', 'srb-shuttle', 'falcon-side-booster'];
const BOOSTER_NAMES: Record<string, string> = { 'srb-sls-5seg': 'SLS boosters', 'srb-shuttle': 'Shuttle boosters', 'falcon-side-booster': 'Falcon boosters' };
/** Parts that only show once their mission has taught them (the current part always shows). */
const PART_CONTROL: Record<string, ControlId> = {
  'planet-probe': 'launchDay',
  'mars-orbiter': 'launchDay',
  'messenger-probe': 'launchDay',
  'armored-probe': 'launchDay',
  'rover-chute': 'rover',
  'rover-skycrane': 'rover',
  'spaceq-mars-lander': 'marsLander',
  'venus-lander': 'marsLander',
  'spaceq-venus-lander': 'marsLander',
  'ion-probe': 'ion',
  'sample-probe': 'ion',
};
/** Short names for payload modules. */
const MODULE_NAMES: Record<string, string> = {
  'apollo-lm': '🌕 Apollo lander',
  'spaceq-cargo-lander': '🌕 Space Q cargo lander',
  'rover-chute': '🔴 Rover with parachute',
  'rover-skycrane': '🔴 Rover with sky crane',
  'spaceq-mars-lander': '🔴 Space Q Mars lander',
  'venus-lander': '🟡 Venus lander',
  'spaceq-venus-lander': '🟡 Extra-cool Venus lander',
  'planet-probe': 'Little planet probe',
  'mars-orbiter': 'Mars orbiter',
  'messenger-probe': 'Sun-side probe',
  'armored-probe': 'Armored probe',
  'ion-probe': '⚡ Ion probe',
  'sample-probe': '⚡ Sample-return probe',
  'spaceq-braking-stage': 'Space Q braking stage',
  'moon-base': 'Moon base',
  'satellite-small': 'Little satellite',
  'satellite-heavy': 'Big satellite',
  'starship-cargo': '100 t of cargo',
  'apollo-sm': 'Apollo',
  'a139-service-module': 'A1-39',
  'orion-esm': 'Orion',
  'apollo-cm': 'Apollo',
  'a139-command-module': 'A1-39',
  'orion-cm': 'Orion',
  'dragon-cargo': 'Dragon',
  'fairing-5m': 'Fairing',
  'apollo-les': 'Apollo',
  'a139-escape-tower': 'A1-39',
  'orion-las': 'Orion',
};
const PUSH_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const SAVING_STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5];
const nearest = (list: number[], x: number) => list.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
const step = (list: number[], x: number, dir: number) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(nearest(list, x)) + dir))];
const shortName = (name: string) => name.replace(/^(SpaceX|Blue Origin|Rocketdyne) /, '');
const FIN_SIZES = [
  { scale: 0, label: 'No fins' },
  { scale: 0.6, label: 'Small' },
  { scale: 1, label: 'Normal' },
  { scale: 1.6, label: 'Big' },
];
const SHIELDS = [
  { scale: 1, label: 'Normal' },
  { scale: 1.5, label: 'Thick' },
  { scale: 2, label: 'Extra thick' },
];
const STRENGTHS = [
  { scale: 1, label: 'Normal' },
  { scale: 1.25, label: 'Strong' },
  { scale: 1.5, label: 'Extra strong' },
];
const HEIGHTS_KM = [200, 300, 400, 500, 600];
/** Coming home: how far from the usual angle (degrees; negative is steeper). */
const ANGLES = [
  { offset: 0.5, label: '🛝 Gentle' },
  { offset: 0, label: '👍 Normal' },
  { offset: -1, label: '⛷️ Steep' },
];
/** First guess at landing fuel when Roscoe switches landing on; auto-size refines it. */
const FIRST_RESERVE_SHARE = 0.2;
const RESERVE_STEP_SHARE = 0.05;

function Toggle({ label, on, onChange, hint, id, mark = true }: { label: string; on: boolean; onChange: (on: boolean) => void; hint?: string; id?: ControlId; mark?: boolean }) {
  const g = useGate(id);
  if (!g.show) return null;
  return (
    <div className={`rb-row${g.cls}`} data-coach={mark ? id : undefined}>
      <span className="rb-label">{label}</span>
      <button className={`rb-toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on}>
        {on ? 'Yes' : 'No'}
      </button>
      {hint && <span className="rb-hint">{hint}</span>}
    </div>
  );
}

function Stepper({ label, value, onMinus, onPlus, id, mark = true }: { label: string; value: string; onMinus: () => void; onPlus: () => void; id?: ControlId; mark?: boolean }) {
  const g = useGate(id);
  if (!g.show) return null;
  return (
    <div className={`rb-row${g.cls}`} data-coach={mark ? id : undefined}>
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

/** Invent a better (or impossible) engine: more push, better fuel saving. */
function Tinker({ spec, setSpec, i }: { spec: RocketSpec; setSpec: (s: RocketSpec) => void; i: number }) {
  const eng = stageEngine(spec, catalog, i)!.part;
  const base = baseEngine(spec, catalog, eng);
  const push = eng.thrustVacuumN / base.thrustVacuumN;
  const saving = eng.ispVacuumS / base.ispVacuumS;
  const tune = (p: number, s: number) => setSpec(tuneEngine(spec, catalog, i, p, s));
  const warnings = engineWarnings(eng).filter((w) => w.level !== 'info');
  const worst = worstLevel(warnings);
  if (!useGate('tinker').show) return null;
  return (
    <>
      <Stepper
        id="tinker"
        label="🧪 💪 Push"
        value={`${nearest(PUSH_STEPS, push)}×`}
        onMinus={() => tune(step(PUSH_STEPS, push, -1), saving)}
        onPlus={() => tune(step(PUSH_STEPS, push, 1), saving)}
      />
      <Stepper
        id="tinker"
        label="🧪 ⛽ Fuel saving"
        value={`${nearest(SAVING_STEPS, saving)}×`}
        onMinus={() => tune(push, step(SAVING_STEPS, saving, -1))}
        onPlus={() => tune(push, step(SAVING_STEPS, saving, 1))}
      />
      {worst && (
        <div className={`rb-warn ${worst}`}>
          {worst === 'impossible' ? '🚫 ' : '⚠️ '}
          {warnings[0].roscoe}
        </div>
      )}
    </>
  );
}

function Chooser({ label, value, onPrev, onNext, id, mark = true }: { label: string; value: string; onPrev: () => void; onNext: () => void; id?: ControlId; mark?: boolean }) {
  const g = useGate(id);
  if (!g.show) return null;
  return (
    <div className={`rb-row${g.cls}`} data-coach={mark ? id : undefined}>
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

const nearestFin = (scale: number) => FIN_SIZES.reduce((a, b) => (Math.abs(b.scale - scale) < Math.abs(a.scale - scale) ? b : a));

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
  const can = (id: ControlId) => !p.controls || p.controls.has(id);
  const fresh = (id: ControlId) => (p.fresh?.has(id) ? ' fresh' : '');
  const showPayloadCard = (['scratch', 'whereTo', 'targetHeight', 'payload', 'lander', 'heatShield', 'comeHome', 'launchDay', 'arrive', 'kickStage'] as ControlId[]).some(can);
  const trips = TRIPS.filter((t) => !t.planet || can('launchDay') || tripKey(spec.mission) === t.key);
  const trip = trips.find((t) => t.key === tripKey(spec.mission)) ?? trips[0];
  const planetTrip = spec.mission.target === 'planet';
  const arrivals = arrivalsFor(spec.mission);
  const arrival = spec.mission.arrival ?? arrivals[0];
  const days = launchDays(spec.mission);
  const offset = wrappedOffset(spec.mission);
  const dayIndex = days.reduce((a, d, k) => (Math.abs(d - offset) < Math.abs(days[a] - offset) ? k : a), 0);
  const needsWindow = planetTrip && DESTINATIONS[spec.mission.destination ?? 'mars'].stops.length > 0;
  const baseAngle = DEFAULT_ENTRY_ANGLE_DEG[goesToMoon(spec.mission.target) ? 'moon' : 'orbit'];
  const angle = spec.mission.reentryAngleDeg ?? baseAngle;
  const angleChoice = ANGLES.reduce((a, b) => (Math.abs(baseAngle + b.offset - angle) < Math.abs(baseAngle + a.offset - angle) ? b : a));
  const setAngle = (dir: number) => {
    const next = ANGLES[Math.max(0, Math.min(ANGLES.length - 1, ANGLES.indexOf(angleChoice) + dir))];
    setSpec(setMission(spec, { reentryAngleDeg: next.offset === 0 ? undefined : Math.round((baseAngle + next.offset) * 10) / 10 }));
  };
  const heightKm = Math.round(spec.mission.targetOrbitAltitudeM / 1000);
  const strength = STRENGTHS.reduce((a, b) => (Math.abs(b.scale - (spec.structureScale ?? 1)) < Math.abs(a.scale - (spec.structureScale ?? 1)) ? b : a));
  const goalWord = goesToMoon(spec.mission.target)
    ? 'the Moon'
    : spec.mission.target === 'highOrbit'
      ? 'high orbit'
      : planetTrip
        ? DESTINATIONS[spec.mission.destination ?? 'mars'].name
        : 'space';

  return (
    <Gate.Provider value={{ controls: p.controls, fresh: p.fresh }}>
    <div className="roscoe-builder">
      <div className="rb-preview">
        <RocketThumb vehicle={p.vehicle} height={420} />
      </div>

      <div className="rb-cards">
        {showPayloadCard && (
        <div className="rb-card payload">
          {can('scratch') && (
            <div className={`rb-row${fresh('scratch')}`} data-coach="scratch">
              <span className="rb-label">✏️ Name</span>
              <NameField className="rb-name" value={spec.name} onChange={(n) => setSpec(setName(spec, n))} />
            </div>
          )}
          <Chooser
            id="whereTo"
            label="Where to?"
            value={trip.roscoe}
            onPrev={() => setSpec(applyTrip(spec, cycle(trips, trip, -1).key))}
            onNext={() => setSpec(applyTrip(spec, cycle(trips, trip, 1).key))}
          />
          {planetTrip && arrivals.length > 1 && (
            <Chooser
              id="arrive"
              label="What to do there"
              value={ARRIVALS[arrival].roscoe}
              onPrev={() => setSpec(setMission(spec, { arrival: cycle(arrivals, arrival, -1) }))}
              onNext={() => setSpec(setMission(spec, { arrival: cycle(arrivals, arrival, 1) }))}
            />
          )}
          {needsWindow && (
            <>
              <Chooser
                id="launchDay"
                label="📅 Launch day"
                value={launchDayLabel(days[dayIndex])}
                onPrev={() => setSpec(setMission(spec, { launchOffsetDays: days[Math.max(0, dayIndex - 1)] }))}
                onNext={() => setSpec(setMission(spec, { launchOffsetDays: days[Math.min(days.length - 1, dayIndex + 1)] }))}
              />
              {can('launchDay') && <WindowMap mission={spec.mission} />}
            </>
          )}
          <Chooser
            id="targetHeight"
            label="📏 How high"
            value={`${heightKm} km`}
            onPrev={() => setSpec(setMission(spec, { targetOrbitAltitudeM: 1000 * (HEIGHTS_KM[Math.max(0, HEIGHTS_KM.findIndex((h) => h >= heightKm) - 1)] ?? 200) }))}
            onNext={() => setSpec(setMission(spec, { targetOrbitAltitudeM: 1000 * (HEIGHTS_KM.find((h) => h > heightKm) ?? HEIGHTS_KM[HEIGHTS_KM.length - 1]) }))}
          />
          {can('payload') && <div className="rb-title small">On top</div>}
          {PAYLOAD_SLOTS.map((slot) => {
            const current = payloadSlot(spec, slot.slot) ?? null;
            const options: (string | null)[] = [null, ...slot.parts.filter((id) => id === current || !PART_CONTROL[id] || can(PART_CONTROL[id]))];
            return (
              <Chooser
                key={slot.slot}
                id={slot.slot === 'lander' ? 'lander' : slot.slot === 'kick' ? 'kickStage' : 'payload'}
                label={slot.roscoe}
                value={current ? MODULE_NAMES[current] ?? resolveCatalog(spec, catalog)[current]?.name ?? current : 'None'}
                onPrev={() => setSpec(setPayloadSlot(spec, slot.slot, cycle(options, current, -1)))}
                onNext={() => setSpec(setPayloadSlot(spec, slot.slot, cycle(options, current, 1)))}
              />
            );
          })}
          <Chooser
            id="heatShield"
            label="Heat shield"
            value={(SHIELDS.find((x) => Math.abs(x.scale - (spec.payload.heatShieldScale ?? 1)) < 0.01) ?? SHIELDS[0]).label}
            onPrev={() => setSpec(setHeatShield(spec, cycle(SHIELDS, SHIELDS.find((x) => Math.abs(x.scale - (spec.payload.heatShieldScale ?? 1)) < 0.01) ?? SHIELDS[0], -1).scale))}
            onNext={() => setSpec(setHeatShield(spec, cycle(SHIELDS, SHIELDS.find((x) => Math.abs(x.scale - (spec.payload.heatShieldScale ?? 1)) < 0.01) ?? SHIELDS[0], 1).scale))}
          />
          <Chooser id="comeHome" label="🏠 Coming home" value={angleChoice.label} onPrev={() => setAngle(-1)} onNext={() => setAngle(1)} />
        </div>
        )}

        {spec.stages.length < 4 && can('addStage') && (
          <button className={`rb-add${fresh('addStage')}`} data-coach="addStage" onClick={() => setSpec(addStage(spec, catalog))}>
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
                {i > 0 && can('addStage') && (
                  <button className="rb-remove" onClick={() => setSpec(removeStage(spec, i))} aria-label={`Remove ${st.name}`}>
                    🗑
                  </button>
                )}
              </div>
              {eng && (
                <>
                  <Chooser
                    id="engineType"
                    mark={i === 0}
                    label="Engine"
                    value={shortName(eng.part.name)}
                    onPrev={() => setSpec(setEngine(spec, catalog, i, cycle(ENGINES, ENGINES.find((e) => e.id === baseEngine(spec, catalog, eng.part).id) ?? ENGINES[0], -1).id))}
                    onNext={() => setSpec(setEngine(spec, catalog, i, cycle(ENGINES, ENGINES.find((e) => e.id === baseEngine(spec, catalog, eng.part).id) ?? ENGINES[0], 1).id))}
                  />
                  <Stepper
                    id="engines"
                    mark={i === 0}
                    label="How many"
                    value={String(eng.ref.count ?? 1)}
                    onMinus={() => setSpec(setEngineCount(spec, catalog, i, (eng.ref.count ?? 1) - 1))}
                    onPlus={() => setSpec(setEngineCount(spec, catalog, i, (eng.ref.count ?? 1) + 1))}
                  />
                  <Tinker spec={spec} setSpec={setSpec} i={i} />
                </>
              )}
              {tank && (
                <Stepper
                  id="tank"
                  mark={i === spec.stages.length - 1}
                  label="Fuel tank"
                  value={`${Math.round(tank.part.lengthM ?? 0)} m${fill < 0.99 ? ` · ${Math.round(fill * 100)}% full` : ''}`}
                  onMinus={() => setSpec(setTank(spec, catalog, i, { lengthM: Math.max(3, (tank.part.lengthM ?? 10) * 0.8) }))}
                  onPlus={() => setSpec(setTank(spec, catalog, i, { lengthM: Math.min(90, (tank.part.lengthM ?? 10) * 1.25) }))}
                />
              )}
              {i === 0 && (
                <Chooser
                  id="fins"
                  label="Fins"
                  value={(FIN_SIZES.find((x) => Math.abs(x.scale - finScale(spec, catalog, 0)) < 0.05) ?? { label: `${finScale(spec, catalog, 0).toFixed(1)}×` }).label}
                  onPrev={() => setSpec(setFins(spec, catalog, 0, cycle(FIN_SIZES, nearestFin(finScale(spec, catalog, 0)), -1).scale))}
                  onNext={() => setSpec(setFins(spec, catalog, 0, cycle(FIN_SIZES, nearestFin(finScale(spec, catalog, 0)), 1).scale))}
                />
              )}
              {i < spec.stages.length - 1 && (
                <Toggle
                  id="landIt"
                  label="🦿 Land it"
                  on={st.recovery === 'propulsive'}
                  hint={st.recovery === 'propulsive' ? `Saves ${Math.round((st.landingReserveKg ?? 0) / 1000)} t of fuel` : undefined}
                  onChange={(on) =>
                    setSpec(on ? setRecovery(spec, i, 'propulsive', p.vehicle.stages[i].propellantKg * FIRST_RESERVE_SHARE) : setRecovery(spec, i, 'none'))
                  }
                />
              )}
              {st.recovery === 'propulsive' && (
                <Stepper
                  id="landingFuel"
                  label="⛽ Landing fuel"
                  value={`${Math.round((st.landingReserveKg ?? 0) / 1000)} t`}
                  onMinus={() => setSpec(setRecovery(spec, i, 'propulsive', Math.max(0, (st.landingReserveKg ?? 0) - p.vehicle.stages[i].propellantKg * RESERVE_STEP_SHARE)))}
                  onPlus={() =>
                    setSpec(setRecovery(spec, i, 'propulsive', Math.min(p.vehicle.stages[i].propellantKg * 0.6, (st.landingReserveKg ?? 0) + p.vehicle.stages[i].propellantKg * RESERVE_STEP_SHARE)))
                  }
                />
              )}
              {i === 0 && (
                <>
                  <Toggle
                    id="easeOff"
                    label="🐢 Ease off in thick air"
                    on={!!spec.mission.maxQThrottle}
                    onChange={(on) => setSpec(setMission(spec, { maxQThrottle: on ? { aboveQPa: 25000, throttle: 0.6 } : undefined }))}
                  />
                  <Chooser
                    id="stronger"
                    label="💪 Body"
                    value={strength.label}
                    onPrev={() => setSpec(setStructure(spec, STRENGTHS[Math.max(0, STRENGTHS.indexOf(strength) - 1)].scale))}
                    onNext={() => setSpec(setStructure(spec, STRENGTHS[Math.min(STRENGTHS.length - 1, STRENGTHS.indexOf(strength) + 1)].scale))}
                  />
                </>
              )}
              {i === 0 && (
                <>
                  <Stepper
                    id="boosters"
                    label="Boosters"
                    value={String(st.boosters?.count ?? 0)}
                    onMinus={() => setSpec(setBoosters(spec, st.boosters?.part ?? BOOSTERS[0], (st.boosters?.count ?? 0) - 2))}
                    onPlus={() => setSpec(setBoosters(spec, st.boosters?.part ?? BOOSTERS[0], Math.min(6, (st.boosters?.count ?? 0) + 2)))}
                  />
                  {st.boosters && (
                    <>
                      <Chooser
                        id="boosters"
                        label="Kind"
                        value={BOOSTER_NAMES[st.boosters.part] ?? st.boosters.part}
                        onPrev={() => setSpec(setBoosters(spec, cycle(BOOSTERS, st.boosters!.part, -1), st.boosters!.count))}
                        onNext={() => setSpec(setBoosters(spec, cycle(BOOSTERS, st.boosters!.part, 1), st.boosters!.count))}
                      />
                      <Toggle
                        id="boosterChutes"
                        label="🪂 Parachutes"
                        on={st.boosters.recovery === 'parachute'}
                        onChange={(on) => setSpec(setBoosterRecovery(spec, on ? 'parachute' : 'none'))}
                      />
                    </>
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
          {can('autoSize') && (
            <button className={`btn big${fresh('autoSize')}`} data-coach="autoSize" onClick={p.onAutoSize} disabled={p.autoSizing}>
              {p.autoSizing ? '⏳ Thinking…' : `✨ Make it reach ${goalWord}`}
            </button>
          )}
          <button className="btn big" onClick={p.onReset}>
            ↺ Start over
          </button>
          {can('scratch') && (
            <button className="btn big" onClick={p.onSave} disabled={p.saved}>
              {p.saved ? '✓ Saved' : '💾 Save my rocket'}
            </button>
          )}
          <button className="btn big primary" onClick={p.onFly}>
            🚀 To the launch pad
          </button>
        </div>
        {p.autoMessage && <div className="rb-auto-msg">{p.autoMessage}</div>}
      </div>
    </div>
    </Gate.Provider>
  );
}
