// Engineer mode post-flight charts: synced time series, trajectory, run comparison, CSV export.

import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { FlightRecord, Sample } from '../physics/types';
import { sampleAt } from './playback';

export interface Run {
  id: number;
  label: string;
  color: string;
  record: FlightRecord;
}

/** Categorical slots, validated (CVD + contrast) against the blueprint surface #071d42. */
export const RUN_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

interface Metric {
  key: string;
  title: string;
  unit: string;
  get: (s: Sample) => number;
  digits: number;
  /** A red dashed line the value must stay under. */
  limit?: { value: (r: FlightRecord) => number; label: string };
}

const METRICS: Metric[] = [
  { key: 'alt', title: 'Altitude', unit: 'km', get: (s) => s.altitudeM / 1000, digits: 1 },
  { key: 'speed', title: 'Speed (inertial)', unit: 'm/s', get: (s) => s.speedMS, digits: 0 },
  { key: 'g', title: 'Acceleration', unit: 'g', get: (s) => s.gLoad, digits: 2 },
  {
    key: 'q',
    title: 'Dynamic pressure',
    unit: 'kPa',
    get: (s) => s.dynamicPressurePa / 1000,
    digits: 1,
    limit: { value: (r) => r.summary.structuralLimitPa / 1000, label: 'structural limit' },
  },
  { key: 'mass', title: 'Mass', unit: 't', get: (s) => s.massKg / 1000, digits: 0 },
  {
    key: 'tumble',
    title: 'Air twist vs steering',
    unit: '%',
    get: (s) => s.tumbleRatio * 100,
    digits: 0,
    limit: { value: () => 100, label: 'tumbles above' },
  },
];

const AXIS = { stroke: '#9fb3d1', grid: { stroke: 'rgba(255,255,255,0.07)', width: 1 }, ticks: { stroke: 'rgba(255,255,255,0.15)' } };

function alignedData(runs: Run[], metric: Metric): uPlot.AlignedData {
  const end = Math.max(...runs.map((r) => r.record.durationS));
  const step = Math.max(0.5, end / 1200);
  const xs: number[] = [];
  for (let t = 0; t <= end + 1e-9; t += step) xs.push(t);
  const ys = runs.map((r) =>
    xs.map((t) => (t <= r.record.durationS ? metric.get(sampleAt(r.record.samples, t)) : null)),
  );
  return [xs, ...ys] as uPlot.AlignedData;
}

/** Vertical event markers for the primary run, plus an optional horizontal limit. */
function markersPlugin(record: FlightRecord, limit?: number, limitLabel = ''): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const ctx = u.ctx;
        const { top, height, left, width } = u.bbox;
        ctx.save();
        ctx.lineWidth = 1 * devicePixelRatio;
        for (const e of record.events) {
          if (!['maxQ', 'boosterSeparation', 'staging', 'failure', 'engineCutoff', 'engineOut'].includes(e.type)) continue;
          const x = u.valToPos(e.tS, 'x', true);
          if (x < left || x > left + width) continue;
          ctx.strokeStyle = e.type === 'failure' ? '#ff6b6b' : 'rgba(232,238,247,0.35)';
          ctx.setLineDash(e.type === 'failure' ? [] : [4 * devicePixelRatio, 4 * devicePixelRatio]);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + height);
          ctx.stroke();
        }
        if (limit !== undefined) {
          const y = u.valToPos(limit, 'y', true);
          if (y >= top && y <= top + height) {
            ctx.strokeStyle = '#ff6b6b';
            ctx.setLineDash([6 * devicePixelRatio, 4 * devicePixelRatio]);
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(left + width, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#ff9b9b';
            ctx.font = `${11 * devicePixelRatio}px system-ui, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(limitLabel, left + width - 6 * devicePixelRatio, y - 4 * devicePixelRatio);
          }
        }
        ctx.restore();
      },
    },
  };
}

function TimeChart({ runs, metric }: { runs: Run[]; metric: Metric }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const limit = metric.limit?.value(runs[0].record);
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: 170,
      cursor: { sync: { key: 'flight' }, points: { size: 8 } },
      scales: { x: { time: false }, y: limit !== undefined ? { range: (_u, min, max) => [Math.min(0, min), Math.max(max, limit * 1.1)] } : {} },
      axes: [
        { ...AXIS, label: 'T+ (s)', labelSize: 18, size: 36 },
        { ...AXIS, size: 54, values: (_u, vals) => vals.map((v) => v.toLocaleString()) },
      ],
      legend: { show: true },
      series: [
        { label: 'T+', value: (_u, v) => (v == null ? '—' : `${v.toFixed(0)} s`) },
        ...runs.map((r) => ({
          label: r.label,
          stroke: r.color,
          width: 2,
          value: (_u: uPlot, v: number | null) => (v == null ? '—' : `${v.toFixed(metric.digits)} ${metric.unit}`),
        })),
      ],
      plugins: [markersPlugin(runs[0].record, limit, metric.limit?.label)],
    };
    const u = new uPlot(opts, alignedData(runs, metric), el);
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height: 170 }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
    };
  }, [runs, metric]);
  return (
    <figure className="chart">
      <figcaption>
        {metric.title} <span className="muted">({metric.unit})</span>
      </figcaption>
      <div ref={ref} />
    </figure>
  );
}

function Trajectory({ runs }: { runs: Run[] }) {
  const W = 600;
  const H = 220;
  const pad = { l: 48, r: 12, t: 10, b: 30 };
  const maxX = Math.max(10, ...runs.flatMap((r) => r.record.samples.map((s) => s.downrangeM / 1000)));
  const maxY = Math.max(10, ...runs.flatMap((r) => r.record.samples.map((s) => s.altitudeM / 1000)));
  const sx = (x: number) => pad.l + (x / maxX) * (W - pad.l - pad.r);
  const sy = (y: number) => H - pad.b - (Math.max(0, y) / maxY) * (H - pad.t - pad.b);
  const ticks = (max: number) => {
    const raw = max / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
    return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  };
  return (
    <figure className="chart">
      <figcaption>
        Trajectory <span className="muted">(altitude vs downrange, km)</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="traj" role="img" aria-label="Trajectory plot">
        {ticks(maxY).map((v) => (
          <g key={`y${v}`}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} stroke="rgba(255,255,255,0.07)" />
            <text x={pad.l - 6} y={sy(v) + 4} textAnchor="end" className="tick">
              {v.toLocaleString()}
            </text>
          </g>
        ))}
        {ticks(maxX).map((v) => (
          <text key={`x${v}`} x={sx(v)} y={H - 10} textAnchor="middle" className="tick">
            {v.toLocaleString()}
          </text>
        ))}
        {runs.map((r) => {
          const step = Math.max(1, Math.floor(r.record.samples.length / 400));
          const pts = r.record.samples
            .filter((_, i) => i % step === 0)
            .map((s) => `${sx(s.downrangeM / 1000).toFixed(1)},${sy(s.altitudeM / 1000).toFixed(1)}`)
            .join(' ');
          return <polyline key={r.id} points={pts} fill="none" stroke={r.color} strokeWidth={2} strokeLinejoin="round" />;
        })}
      </svg>
    </figure>
  );
}

function outcomeText(r: FlightRecord) {
  const o = r.outcome;
  return o.success
    ? `Orbit ${(o.orbit!.perigeeAltM / 1000).toFixed(0)} × ${(o.orbit!.apogeeAltM / 1000).toFixed(0)} km`
    : `${o.failure!.type} at T+${o.failure!.tS.toFixed(0)} s`;
}

export function downloadCsv(record: FlightRecord) {
  const cols: [string, (s: Sample) => number | string][] = [
    ['t_s', (s) => s.tS.toFixed(2)],
    ['altitude_m', (s) => s.altitudeM.toFixed(1)],
    ['downrange_m', (s) => s.downrangeM.toFixed(1)],
    ['speed_inertial_ms', (s) => s.speedMS.toFixed(2)],
    ['air_speed_ms', (s) => s.airSpeedMS.toFixed(2)],
    ['mach', (s) => s.mach.toFixed(3)],
    ['dynamic_pressure_pa', (s) => s.dynamicPressurePa.toFixed(1)],
    ['g_load', (s) => s.gLoad.toFixed(3)],
    ['mass_kg', (s) => s.massKg.toFixed(1)],
    ['thrust_n', (s) => s.thrustN.toFixed(0)],
    ['throttle', (s) => s.throttle.toFixed(2)],
    ['stage', (s) => s.stageIndex],
    ['perigee_alt_m', (s) => (Number.isFinite(s.perigeeAltM) ? s.perigeeAltM.toFixed(0) : '')],
    ['apogee_alt_m', (s) => (Number.isFinite(s.apogeeAltM) ? s.apogeeAltM.toFixed(0) : '')],
    ['angle_of_attack_deg', (s) => s.aoaDeg.toFixed(2)],
    ['tumble_ratio', (s) => s.tumbleRatio.toFixed(4)],
  ];
  const lines = [cols.map((c) => c[0]).join(','), ...record.samples.map((s) => cols.map((c) => c[1](s)).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${record.rocketName.replace(/\W+/g, '-').toLowerCase()}-flight.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

interface Props {
  current: Run;
  saved: Run[];
  onSave: () => void;
  onRemove: (id: number) => void;
}

export function Charts({ current, saved, onSave, onRemove }: Props) {
  const runs = useMemo(() => [current, ...saved], [current, saved]);
  return (
    <div className="charts">
      <div className="charts-bar">
        <div className="run-legend" aria-label="Runs">
          {runs.map((r, i) => (
            <span key={r.id} className="run-chip">
              <span className="run-swatch" style={{ background: r.color }} />
              {i === 0 ? 'This flight' : r.label}
              <span className="muted"> · {outcomeText(r.record)}</span>
              {i > 0 && (
                <button className="run-x" onClick={() => onRemove(r.id)} aria-label={`Remove ${r.label}`}>
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
        <button className="btn small" onClick={onSave} disabled={saved.length >= RUN_COLORS.length - 1}>
          Save run to compare
        </button>
        <button className="btn small" onClick={() => downloadCsv(current.record)}>
          Download CSV
        </button>
      </div>

      <div className="chart-grid">
        {METRICS.map((m) => (
          <TimeChart key={m.key} runs={runs} metric={m} />
        ))}
        <Trajectory runs={runs} />
      </div>

      <table className="run-table">
        <caption>Run summary</caption>
        <thead>
          <tr>
            <th>Run</th>
            <th>Outcome</th>
            <th>Liftoff T/W</th>
            <th>Max-Q</th>
            <th>Max g</th>
            <th>Δv left</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <tr key={r.id}>
              <td>
                <span className="run-swatch" style={{ background: r.color }} /> {i === 0 ? 'This flight' : r.label}
              </td>
              <td>{outcomeText(r.record)}</td>
              <td className="mono">{r.record.summary.liftoffTWR.toFixed(2)}</td>
              <td className="mono">
                {(r.record.summary.maxQPa / 1000).toFixed(1)} kPa @ T+{r.record.summary.maxQTimeS.toFixed(0)} s
              </td>
              <td className="mono">{r.record.summary.maxGLoad.toFixed(2)}</td>
              <td className="mono">{r.record.outcome.success ? `${r.record.outcome.remainingDeltaVMS.toFixed(0)} m/s` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
