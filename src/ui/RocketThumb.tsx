import { useEffect, useRef } from 'react';
import type { Vehicle } from '../physics/vehicle';
import { drawRocket } from './drawRocket';

/** Static side view of the full stack, for the rocket picker. */
export function RocketThumb({ vehicle, height = 64 }: { vehicle: Vehicle; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.round(height * 0.5);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    const b = vehicle.stages[0]?.boosters;
    const widthM = vehicle.maxDiameterM + (b ? 4 * (b.booster.diameterM ?? 3.7) : 0) + 8;
    const k = Math.min((c.height * 0.94) / vehicle.heightM, c.width / widthM);
    ctx.translate(c.width / 2, c.height * 0.97);
    ctx.scale(k, k);
    drawRocket(ctx, vehicle, { stageIndex: 0, boostersAttached: true, jettisoned: new Set(), flame: 0 }, 1 / (k / dpr));
  }, [vehicle, height, width]);
  return <canvas ref={ref} style={{ width, height }} aria-hidden="true" />;
}
