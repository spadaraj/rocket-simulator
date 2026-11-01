import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlightRecord, Sample } from '../physics/types';

/** Interpolated sample at playback time t (binary search + linear blend). */
export function sampleAt(samples: Sample[], t: number): Sample {
  if (t <= samples[0].tS) return samples[0];
  const last = samples[samples.length - 1];
  if (t >= last.tS) return last;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].tS <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const f = (t - a.tS) / (b.tS - a.tS || 1);
  const mix = (x: number, y: number) => x + (y - x) * f;
  // Attitude: blend and renormalise.
  const ux = mix(a.ux, b.ux);
  const uy = mix(a.uy, b.uy);
  const un = Math.hypot(ux, uy) || 1;
  return {
    ...a,
    tS: t,
    xM: mix(a.xM, b.xM),
    yM: mix(a.yM, b.yM),
    vxMS: mix(a.vxMS, b.vxMS),
    vyMS: mix(a.vyMS, b.vyMS),
    ux: ux / un,
    uy: uy / un,
    altitudeM: mix(a.altitudeM, b.altitudeM),
    downrangeM: mix(a.downrangeM, b.downrangeM),
    speedMS: mix(a.speedMS, b.speedMS),
    airSpeedMS: mix(a.airSpeedMS, b.airSpeedMS),
    mach: mix(a.mach, b.mach),
    dynamicPressurePa: mix(a.dynamicPressurePa, b.dynamicPressurePa),
    gLoad: mix(a.gLoad, b.gLoad),
    massKg: mix(a.massKg, b.massKg),
    thrustN: a.stageIndex === b.stageIndex ? mix(a.thrustN, b.thrustN) : a.thrustN,
    propellantFraction: a.propellantFraction.map((p, i) => mix(p, b.propellantFraction[i])),
  };
}

export interface Playback {
  tRef: React.MutableRefObject<number>;
  /** Playback time, refreshed ~10×/s for gauges (the canvas reads tRef every frame). */
  t: number;
  playing: boolean;
  speed: number;
  setSpeed: (s: number) => void;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
}

export function usePlayback(record: FlightRecord, initialSpeed: number): Playback {
  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(initialSpeed);
  const speedRef = useRef(initialSpeed);
  const duration = record.durationS;

  // A new flight record resets playback.
  useEffect(() => {
    tRef.current = 0;
    setT(0);
    setPlaying(false);
  }, [record]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      tRef.current = Math.min(duration, tRef.current + dt * speedRef.current);
      if (tRef.current >= duration) {
        setT(duration);
        setPlaying(false);
        return;
      }
      if (now - lastUi > 100) {
        setT(tRef.current);
        lastUi = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  const setSpeed = useCallback((s: number) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);
  const play = useCallback(() => {
    if (tRef.current >= duration) {
      tRef.current = 0;
      setT(0);
    }
    setPlaying(true);
  }, [duration]);
  const pause = useCallback(() => setPlaying(false), []);
  const seek = useCallback((nt: number) => {
    tRef.current = Math.max(0, Math.min(duration, nt));
    setT(tRef.current);
  }, [duration]);

  return { tRef, t, playing, speed, setSpeed, play, pause, seek };
}
