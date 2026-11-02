// Engineer mode: numeric gauges, propellant, design check, stability, recovery, Moon leg,
// re-entry, flight settings and the event log.

import { LEO_BUDGET_MS, TLI_BUDGET_MS, type StageDeltaV } from '../physics/deltaV';
import type { Scorecard } from '../physics/golden';
import type { MissionRecord } from '../physics/mission';
import { CREW_G_LIMIT, DEFAULT_ENTRY_ANGLE_DEG } from '../physics/reentry';
import type { Fault, FlightRecord, MissionSpec, Sample } from '../physics/types';
import type { Vehicle } from '../physics/vehicle';
import { ScorecardTable } from './Scorecard';

interface Props {
  record: FlightRecord;
  mission: MissionRecord;
  vehicle: Vehicle;
  sample: Sample;
  /** Playback time (the falling pieces run past the end of the ascent record). */
  t: number;
  deltaV: StageDeltaV[];
  missionSpec: MissionSpec;
  setMission: (patch: Partial<MissionSpec>) => void;
  onSeek: (t: number) => void;
  /** Comparison with a real flight of this rocket, if there is one. */
  scorecard?: Scorecard;
  modified: boolean;
}

function describeFault(f: Fault, vehicle: Vehicle): string {
  switch (f.kind) {
    case 'engineOut':
      return `${f.engines} engine${f.engines > 1 ? 's' : ''} out on ${vehicle.stages[f.stageIndex]?.name ?? 'a stage'}, ${f.afterIgnitionS} s after it lights`;
    case 'leak':
      return `Top-stage leak in orbit: ${Math.round(f.fraction * 100)}% of what's left`;
    case 'glitch':
      return `${f.system[0].toUpperCase()}${f.system.slice(1)} glitch during the systems check`;
  }
}

const fmt = (x: number, d = 0) =>
  Number.isFinite(x) ? x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '∞';

function Gauge({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="gauge">
      <div className="gauge-label">{label}</div>
      <div className="gauge-value">
        {value}
        <span className="gauge-unit">{unit}</span>
      </div>
    </div>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span>
        {props.label}
        <b>
          {props.value}
          {props.unit}
        </b>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function EngineerPanel(p: Props) {
  const { sample: s, record, vehicle, mission } = p;
  const stage = vehicle.stages[s.stageIndex];
  const totalDv = p.deltaV.reduce((a, d) => a + d.deltaVMS, 0);
  const m = p.missionSpec;
  const toMoon = m.target !== 'orbit';
  const entryAngle = m.reentryAngleDeg ?? DEFAULT_ENTRY_ANGLE_DEG[toMoon ? 'moon' : 'orbit'];
  const re = mission.reentry;

  return (
    <div className="engineer-panel">
      <section>
        <h4>
          Telemetry <span className="muted">T+{fmt(s.tS, 1)} s · {stage?.name ?? '—'}</span>
        </h4>
        <div className="gauges">
          <Gauge label="Altitude" value={fmt(s.altitudeM / 1000, 1)} unit="km" />
          <Gauge label="Downrange" value={fmt(s.downrangeM / 1000, 1)} unit="km" />
          <Gauge label="Speed (inertial)" value={fmt(s.speedMS)} unit="m/s" />
          <Gauge label="Air speed" value={fmt(s.airSpeedMS)} unit="m/s" />
          <Gauge label="Mach" value={fmt(s.mach, 2)} unit="" />
          <Gauge label="Dyn. pressure" value={fmt(s.dynamicPressurePa / 1000, 1)} unit="kPa" />
          <Gauge label="g-load" value={fmt(s.gLoad, 2)} unit="g" />
          <Gauge label="Mass" value={fmt(s.massKg / 1000, 0)} unit="t" />
          <Gauge label="Thrust" value={fmt(s.thrustN / 1e6, 2)} unit="MN" />
          <Gauge label="Throttle" value={fmt(s.throttle * 100)} unit="%" />
          <Gauge label="Perigee" value={s.altitudeM > 20000 ? fmt(s.perigeeAltM / 1000) : '—'} unit="km" />
          <Gauge label="Apogee" value={s.altitudeM > 1000 ? fmt(s.apogeeAltM / 1000) : '—'} unit="km" />
        </div>
      </section>

      <section>
        <h4>Propellant</h4>
        {vehicle.stages.map((st, i) => (
          <div key={st.name} className={`prop-row ${i === s.stageIndex ? 'active' : ''}`}>
            <span className="prop-name">{st.name}</span>
            <span className="prop-bar">
              <span style={{ width: `${Math.max(0, s.propellantFraction[i]) * 100}%`, background: st.color }} />
            </span>
            <span className="prop-pct">{fmt(Math.max(0, s.propellantFraction[i]) * 100)}%</span>
          </div>
        ))}
        {s.propellantFraction[s.propellantFraction.length - 1] >= 0 && (
          <div className="prop-row">
            <span className="prop-name">Boosters</span>
            <span className="prop-bar">
              <span style={{ width: `${s.propellantFraction[s.propellantFraction.length - 1] * 100}%`, background: '#f4f6fa' }} />
            </span>
            <span className="prop-pct">{fmt(s.propellantFraction[s.propellantFraction.length - 1] * 100)}%</span>
          </div>
        )}
      </section>

      <section>
        <h4>Design check</h4>
        <table className="dv-table">
          <tbody>
            <tr>
              <td>Liftoff mass</td>
              <td>{fmt(record.summary.liftoffMassKg / 1000)} t</td>
            </tr>
            <tr>
              <td>Liftoff thrust-to-weight</td>
              <td className={record.summary.liftoffTWR < 1.2 ? 'warn' : ''}>{fmt(record.summary.liftoffTWR, 2)}</td>
            </tr>
            {p.deltaV.map((d) => (
              <tr key={d.name}>
                <td>Δv · {d.name}</td>
                <td>{fmt(d.deltaVMS)} m/s</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total vacuum Δv</td>
              <td>{fmt(totalDv)} m/s</td>
            </tr>
            <tr>
              <td className="muted">Needed: orbit ≈ {fmt(LEO_BUDGET_MS)}, + Moon ≈ {fmt(TLI_BUDGET_MS)}</td>
              <td className={totalDv < LEO_BUDGET_MS ? 'warn' : totalDv < LEO_BUDGET_MS + TLI_BUDGET_MS ? 'caution' : 'ok'}>
                {totalDv >= LEO_BUDGET_MS + TLI_BUDGET_MS ? 'Moon-capable' : totalDv >= LEO_BUDGET_MS ? 'Orbit only' : 'Short'}
              </td>
            </tr>
            <tr>
              <td>Max-Q</td>
              <td>
                {fmt(record.summary.maxQPa / 1000, 1)} kPa @ T+{fmt(record.summary.maxQTimeS)} s (limit{' '}
                {fmt(record.summary.structuralLimitPa / 1000)})
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4>Stability</h4>
        <table className="dv-table">
          <tbody>
            <tr>
              <td>Static margin at liftoff</td>
              <td className={record.summary.staticMarginCalibers < 0 ? 'caution' : 'ok'}>
                {fmt(record.summary.staticMarginCalibers, 2)} cal {record.summary.staticMarginCalibers < 0 ? '(steered)' : '(stable)'}
              </td>
            </tr>
            <tr>
              <td>Angle of attack now (with 25 m/s gust)</td>
              <td>{fmt(s.aoaDeg, 1)}°</td>
            </tr>
            <tr>
              <td>Air twist / steering now</td>
              <td className={s.tumbleRatio > 1 ? 'warn' : s.tumbleRatio > 0.5 ? 'caution' : ''}>{fmt(s.tumbleRatio * 100)}%</td>
            </tr>
            <tr>
              <td>Worst air twist / steering</td>
              <td className={record.summary.maxTumbleRatio > 1 ? 'warn' : record.summary.maxTumbleRatio > 0.5 ? 'caution' : 'ok'}>
                {fmt(record.summary.maxTumbleRatio * 100)}%
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {mission.recoveries.length > 0 && (
        <section>
          <h4>Recovery</h4>
          <table className="dv-table">
            <tbody>
              {mission.recoveries.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.name} <span className="muted">({r.method === 'none' ? 'expended' : r.method})</span>
                    <div className="muted small">
                      {p.t < r.endTS ? `${r.samples[0].tS <= p.t ? 'falling' : 'attached'}` : r.reason}
                      {r.method === 'propulsive' && ` · reserve ${fmt(r.reserveKg / 1000)} t, entry burn ${fmt(r.entryBurnDeltaVMS)} m/s, ${fmt(r.propellantLeftKg / 1000, 1)} t left`}
                    </div>
                  </td>
                  <td className={r.failed ? 'warn' : r.outcome === 'lost' ? 'muted' : 'ok'}>{r.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {mission.moon && (
        <section>
          <h4>Moon leg (delta-v ledger)</h4>
          <table className="dv-table">
            <tbody>
              {mission.moon.legs.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.name}
                    <div className="muted small">{l.by}</div>
                  </td>
                  <td className={l.ok ? 'ok' : 'warn'}>
                    {fmt(l.availableMS)} / {fmt(l.neededMS)} m/s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {re && (
        <section>
          <h4>Re-entry</h4>
          <table className="dv-table">
            <tbody>
              <tr>
                <td>Entry</td>
                <td>
                  {fmt(re.entrySpeedMS)} m/s at {fmt(re.entryAngleDeg, 1)}°
                </td>
              </tr>
              <tr>
                <td>Peak heating</td>
                <td className={re.peakHeatFluxWm2 > re.maxHeatFluxWm2 ? 'warn' : ''}>
                  {fmt(re.peakHeatFluxWm2 / 1e6, 2)} / {fmt(re.maxHeatFluxWm2 / 1e6, 2)} MW/m²
                </td>
              </tr>
              <tr>
                <td>Total heat</td>
                <td className={re.heatLoadJm2 > re.maxHeatLoadJm2 ? 'warn' : ''}>
                  {fmt(re.heatLoadJm2 / 1e6)} / {fmt(re.maxHeatLoadJm2 / 1e6)} MJ/m²
                </td>
              </tr>
              <tr>
                <td>Peak g</td>
                <td className={re.peakGLoad > CREW_G_LIMIT ? 'warn' : ''}>
                  {fmt(re.peakGLoad, 1)} g (crew limit {CREW_G_LIMIT})
                </td>
              </tr>
              <tr>
                <td>Result</td>
                <td className={re.outcome === 'splashdown' ? 'ok' : 'warn'}>
                  {re.outcome === 'splashdown' ? `Splashdown ${fmt(re.splashSpeedMS, 1)} m/s` : re.outcome}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {record.faults.length > 0 && (
        <section>
          <h4>Chaos Mode</h4>
          <details>
            <summary className="muted">This flight's fault (spoiler)</summary>
            <ul className="fault-list">
              {record.faults.map((f, i) => (
                <li key={i}>{describeFault(f, vehicle)}</li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {p.scorecard && (
        <section>
          <h4>Real flight check</h4>
          <ScorecardTable card={p.scorecard} modified={p.modified} />
        </section>
      )}

      <section>
        <h4>Flight settings</h4>
        <label className="slider">
          <span>Mission</span>
          <select value={m.target} onChange={(e) => p.setMission({ target: e.target.value as MissionSpec['target'] })}>
            <option value="orbit">Earth orbit</option>
            <option value="moon">Moon landing</option>
            <option value="moonFlyby">Moon flyby (free return)</option>
          </select>
        </label>
        <Slider
          label="Pitch kick time"
          value={m.pitchKick.timeS}
          min={4}
          max={30}
          step={1}
          unit=" s"
          onChange={(v) => p.setMission({ pitchKick: { ...m.pitchKick, timeS: v } })}
        />
        <Slider
          label="Pitch kick angle"
          value={m.pitchKick.angleDeg}
          min={0.25}
          max={5}
          step={0.25}
          unit="°"
          onChange={(v) => p.setMission({ pitchKick: { ...m.pitchKick, angleDeg: v } })}
        />
        <Slider
          label="Target orbit"
          value={m.targetOrbitAltitudeM / 1000}
          min={150}
          max={400}
          step={10}
          unit=" km"
          onChange={(v) => p.setMission({ targetOrbitAltitudeM: v * 1000 })}
        />
        <Slider
          label="Max-Q throttle"
          value={Math.round((m.maxQThrottle?.throttle ?? 1) * 100)}
          min={40}
          max={100}
          step={5}
          unit="%"
          onChange={(v) => p.setMission({ maxQThrottle: v < 100 ? { aboveQPa: 20000, throttle: v / 100 } : undefined })}
        />
        <Slider
          label="Re-entry angle"
          value={entryAngle}
          min={toMoon ? -10 : -5}
          max={toMoon ? -4 : -0.5}
          step={0.1}
          unit="°"
          onChange={(v) => p.setMission({ reentryAngleDeg: Math.round(v * 10) / 10 })}
        />
      </section>

      <section>
        <h4>Event log</h4>
        <ol className="event-log">
          {record.events.map((e, i) => (
            <li key={i} className={e.tS <= s.tS ? 'past' : ''}>
              <button onClick={() => p.onSeek(e.tS)}>
                <span className="mono">T+{fmt(e.tS, 1)}</span> {e.label}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
