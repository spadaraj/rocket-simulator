// Cartoon dials for speed, height and fuel.

import type { Sample } from '../physics/types';

interface DialProps {
  label: string;
  emoji: string;
  value: string;
  unit: string;
  fraction: number;
  color: string;
}

function Dial({ label, emoji, value, unit, fraction, color }: DialProps) {
  const f = Math.max(0, Math.min(1, fraction));
  const angle = -120 + f * 240;
  const arc = (from: number, to: number) => {
    const p = (deg: number) => {
      const r = ((deg - 90) * Math.PI) / 180;
      return `${50 + 38 * Math.cos(r)} ${52 + 38 * Math.sin(r)}`;
    };
    return `M ${p(from)} A 38 38 0 ${to - from > 180 ? 1 : 0} 1 ${p(to)}`;
  };
  return (
    <div className="dial">
      <svg viewBox="0 0 100 92" aria-hidden="true">
        <path d={arc(-120, 120)} stroke="rgba(255,255,255,0.18)" strokeWidth="10" fill="none" strokeLinecap="round" />
        {f > 0.005 && (
          <path d={arc(-120, angle)} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />
        )}
        <g transform={`rotate(${angle} 50 52)`}>
          <line x1="50" y1="52" x2="50" y2="22" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx="50" cy="52" r="6" fill="#fff" />
        <text x="50" y="86" textAnchor="middle" fontSize="20">{emoji}</text>
      </svg>
      <div className="dial-value">
        {value}
        <span className="dial-unit"> {unit}</span>
      </div>
      <div className="dial-label">{label}</div>
    </div>
  );
}

export function RoscoeDials({ sample }: { sample: Sample }) {
  // Speed over the ground (the air turns with the Earth), so it reads 0 on the pad.
  const kmh = sample.airSpeedMS * 3.6;
  const fuel = sample.boostersAttached
    ? Math.max(sample.propellantFraction[sample.stageIndex], sample.propellantFraction[sample.propellantFraction.length - 1])
    : (sample.propellantFraction[sample.stageIndex] ?? 0);
  return (
    <div className="roscoe-dials">
      <Dial label="Speed" emoji="💨" value={Math.round(kmh).toLocaleString()} unit="km/h" fraction={kmh / 28000} color="#ffb02e" />
      <Dial
        label="Height"
        emoji="⛰️"
        value={Math.max(0, Math.round(sample.altitudeM / 1000)).toLocaleString()}
        unit="km"
        fraction={sample.altitudeM / 220000}
        color="#5cc8ff"
      />
      <Dial
        label="Fuel"
        emoji="⛽"
        value={`${Math.round(fuel * 100)}`}
        unit="%"
        fraction={fuel}
        color={fuel < 0.15 ? '#ff5a5a' : '#3ccf7a'}
      />
    </div>
  );
}
