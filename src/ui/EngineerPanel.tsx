// Engineer mode: numeric gauges, propellant, design check, quick tweaks, event log.

import { LEO_BUDGET_MS, TLI_BUDGET_MS, type StageDeltaV } from '../physics/deltaV';
import type { FlightRecord, MissionSpec, Sample } from '../physics/types';
import type { Vehicle } from '../physics/vehicle';

interface Props {
  record: FlightRecord;
  vehicle: Vehicle;
  sample: Sample;
  deltaV: StageDeltaV[];
  mission: MissionSpec;
  setMission: (patch: Partial<MissionSpec>) => void;
  onSeek: (t: number) => void;
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
  const { sample: s, record, vehicle } = p;
  const stage = vehicle.stages[s.stageIndex];
  const totalDv = p.deltaV.reduce((a, d) => a + d.deltaVMS, 0);
  const m = p.mission;

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
        <h4>Flight settings</h4>
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
