// 2D flight view. Reads playback time from a ref every frame and draws:
// sky, predicted orbit, Earth, clouds, launch site, flown path, the rocket, and effects.

import { useEffect, useRef } from 'react';
import { LAUNCH_SITES, MU_EARTH_M3S2, OMEGA_EARTH_RADS, R_EARTH_M } from '../physics/constants';
import type { FlightRecord, Sample } from '../physics/types';
import type { Vehicle } from '../physics/vehicle';
import { drawRocket, visibleHeightM } from './drawRocket';
import { sampleAt } from './playback';

interface Props {
  record: FlightRecord;
  vehicle: Vehicle;
  tRef: React.MutableRefObject<number>;
  launchSite: string;
  roscoe: boolean;
  /** False while sitting on the pad before launch: no flames yet. */
  armed: boolean;
}

interface Camera {
  cx: number;
  cy: number;
  /** Pixels per metre. */
  k: number;
  /** World angle that points straight up on screen. */
  upAngle: number;
}

const STARS = Array.from({ length: 140 }, (_, i) => ({
  x: (Math.sin(i * 12.9898) * 43758.5453) % 1,
  y: (Math.sin(i * 78.233) * 12543.1234) % 1,
  r: 0.5 + ((i * 7) % 3) * 0.45,
}));

const CLOUDS = [
  { downrangeM: -2600, altM: 1800, size: 520 },
  { downrangeM: 1500, altM: 3200, size: 700 },
  { downrangeM: 5200, altM: 2400, size: 600 },
  { downrangeM: -7000, altM: 4200, size: 800 },
];

function mixColor(a: [number, number, number], b: [number, number, number], f: number) {
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, f))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function FlightCanvas({ record, vehicle, tRef, launchSite, roscoe, armed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera | null>(null);

  useEffect(() => {
    camRef.current = null;
  }, [record]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const site = LAUNCH_SITES[launchSite] ?? LAUNCH_SITES.KSC;
    const omega = OMEGA_EARTH_RADS * Math.cos((site.latitudeDeg * Math.PI) / 180);
    const failure = record.outcome.failure;
    const jettisonEvents = record.events.filter((e) => e.type === 'jettison');
    const jettisonNames = vehicle.jettisonables.map((j) => j.name);
    const stagingTimes = record.events.filter((e) => e.type === 'staging' || e.type === 'boosterSeparation').map((e) => e.tS);
    const liftoffThrust = record.summary.liftoffThrustN || 1;
    // Draw in the Earth-fixed frame so the pad stays put and the trail is the ground track.
    // (The simulation itself runs in the inertial frame.)
    const fixedSamples: Sample[] = record.samples.map((p) => {
      const a = omega * p.tS;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      return { ...p, xM: p.xM * ca - p.yM * sa, yM: p.xM * sa + p.yM * ca, ux: p.ux * ca - p.uy * sa, uy: p.ux * sa + p.uy * ca };
    });

    let raf = 0;
    let lastFrame = performance.now();
    let lastDrawnT = -1;
    let effectStart: number | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      lastDrawnT = -1;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const siteAngle = Math.PI / 2;

    const targetCamera = (s: Sample, W: number, H: number): Camera => {
      const sx = 0;
      const sy = R_EARTH_M;
      // Frame the launch site, the rocket, and the path flown so far.
      let minX = Math.min(sx, s.xM);
      let maxX = Math.max(sx, s.xM);
      let minY = Math.min(sy, s.yM);
      let maxY = Math.max(sy, s.yM);
      const samples = fixedSamples;
      const step = Math.max(1, Math.floor(samples.length / 200));
      for (let i = 0; i < samples.length && samples[i].tS <= s.tS; i += step) {
        const p = samples[i];
        minX = Math.min(minX, p.xM);
        maxX = Math.max(maxX, p.xM);
        minY = Math.min(minY, p.yM);
        maxY = Math.max(maxY, p.yM);
      }
      const mx = (minX + maxX) / 2;
      const my = (minY + maxY) / 2;
      const upAngle = Math.atan2(my, mx);
      const span = Math.max(Math.hypot(maxX - minX, maxY - minY), vehicle.heightM * (roscoe ? 2.2 : 2.8));
      const k = Math.min(W, H) / (span * 1.5);
      // Lift the view so the ground sits in the lower part of the screen.
      const lift = (0.12 * H) / k;
      return { cx: mx + Math.cos(upAngle) * lift, cy: my + Math.sin(upAngle) * lift, k, upAngle };
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dtReal = Math.min(0.5, (now - lastFrame) / 1000);
      lastFrame = now;
      const t = tRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const s = sampleAt(record.samples, t); // inertial: orbit prediction
      const sf = sampleAt(fixedSamples, t); // Earth-fixed: position and attitude on screen
      const failed = failure && t >= failure.tS && failure.type !== 'noLiftoff';
      if (failed && effectStart === null) effectStart = now;
      if (!failed) effectStart = null;

      // Camera: ease toward the target (log-space zoom).
      const target = targetCamera(sf, W, H);
      const cam = camRef.current;
      let settled = false;
      if (!cam) {
        camRef.current = target;
      } else {
        const f = 1 - Math.exp(-dtReal * 4);
        const nk = Math.exp(Math.log(cam.k) + (Math.log(target.k) - Math.log(cam.k)) * f);
        let da = target.upAngle - cam.upAngle;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        camRef.current = {
          cx: cam.cx + (target.cx - cam.cx) * f,
          cy: cam.cy + (target.cy - cam.cy) * f,
          k: nk,
          upAngle: cam.upAngle + da * f,
        };
        settled =
          Math.abs(Math.log(nk / target.k)) < 1e-3 && Math.hypot(target.cx - cam.cx, target.cy - cam.cy) * nk < 0.3;
      }
      const effectsRunning = effectStart !== null && now - effectStart < 2500;
      const thrusting = armed && s.thrustN > 0 && t < record.durationS;
      if (t === lastDrawnT && settled && !effectsRunning && !thrusting) return;
      lastDrawnT = t;

      const c = camRef.current!;
      const rot = Math.PI / 2 - c.upAngle;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const toScreen = (x: number, y: number): [number, number] => {
        const dx = x - c.cx;
        const dy = y - c.cy;
        return [W / 2 + (dx * cr - dy * sr) * c.k, H / 2 - (dx * sr + dy * cr) * c.k];
      };
      const dpr = W / canvas.getBoundingClientRect().width || 1;

      // ---- sky ----
      const spaceF = Math.min(1, s.altitudeM / 70000);
      const skyTop = roscoe ? mixColor([92, 170, 240], [8, 14, 40], spaceF) : mixColor([70, 140, 210], [5, 10, 30], spaceF);
      const skyBottom = roscoe ? mixColor([170, 220, 255], [20, 36, 80], spaceF) : mixColor([150, 200, 240], [12, 24, 60], spaceF);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, skyTop);
      g.addColorStop(1, skyBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (spaceF > 0.4) {
        ctx.fillStyle = `rgba(255,255,255,${(spaceF - 0.4) * 1.4})`;
        for (const st of STARS) {
          ctx.beginPath();
          ctx.arc(Math.abs(st.x) * W, Math.abs(st.y) * H, st.r * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const viewSpanM = Math.hypot(W, H) / c.k;

      // ---- predicted path (conic from the current state) ----
      if (s.altitudeM > 30000 && t > 0) {
        const r = Math.hypot(s.xM, s.yM);
        const v2 = s.vxMS * s.vxMS + s.vyMS * s.vyMS;
        const rv = s.xM * s.vxMS + s.yM * s.vyMS;
        const ex = ((v2 - MU_EARTH_M3S2 / r) * s.xM - rv * s.vxMS) / MU_EARTH_M3S2;
        const ey = ((v2 - MU_EARTH_M3S2 / r) * s.yM - rv * s.vyMS) / MU_EARTH_M3S2;
        const e = Math.hypot(ex, ey);
        const h = s.xM * s.vyMS - s.yM * s.vxMS;
        const p = (h * h) / MU_EARTH_M3S2;
        if (e < 0.95) {
          const w = Math.atan2(ey, ex);
          ctx.strokeStyle = record.outcome.success ? 'rgba(120,255,170,0.75)' : 'rgba(255,255,255,0.55)';
          ctx.setLineDash([8 * dpr, 8 * dpr]);
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();
          const spin = omega * t;
          for (let i = 0; i <= 360; i++) {
            const th = (i / 360) * Math.PI * 2;
            const rr = p / (1 + e * Math.cos(th - w));
            const [px, py] = toScreen(rr * Math.cos(th + spin), rr * Math.sin(th + spin));
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ---- Earth ----
      const half = Math.min(Math.PI, (1.5 * viewSpanM) / R_EARTH_M + 0.002);
      const inner = Math.max(0, R_EARTH_M - 3 * viewSpanM);
      ctx.beginPath();
      const N = 180;
      for (let i = 0; i <= N; i++) {
        const a = c.upAngle - half + (2 * half * i) / N;
        const [px, py] = toScreen(R_EARTH_M * Math.cos(a), R_EARTH_M * Math.sin(a));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      for (let i = N; i >= 0; i--) {
        const a = c.upAngle - half + (2 * half * i) / N;
        const [px, py] = toScreen(inner * Math.cos(a), inner * Math.sin(a));
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = roscoe ? '#3f9b5a' : '#2c6e4a';
      ctx.fill();
      if (viewSpanM > 300000) {
        // Atmosphere glow when zoomed out.
        ctx.strokeStyle = 'rgba(120,190,255,0.35)';
        ctx.lineWidth = Math.max(2, 60000 * c.k);
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const a = c.upAngle - half + (2 * half * i) / N;
          const [px, py] = toScreen((R_EARTH_M + 30000) * Math.cos(a), (R_EARTH_M + 30000) * Math.sin(a));
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // ---- clouds (they turn with the Earth) ----
      if (viewSpanM < 60000) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (const cl of CLOUDS) {
          const a = siteAngle - cl.downrangeM / R_EARTH_M;
          const rr = R_EARTH_M + cl.altM;
          const [px, py] = toScreen(rr * Math.cos(a), rr * Math.sin(a));
          const sz = Math.max(cl.size * c.k, 6 * dpr);
          for (const [ox, oy, rf] of [[-0.6, 0.1, 0.5], [0, -0.15, 0.7], [0.6, 0.1, 0.5], [0.25, 0.15, 0.55]]) {
            ctx.beginPath();
            ctx.arc(px + ox * sz, py + oy * sz, rf * sz, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ---- launch site ----
      {
        const [px, py] = toScreen(R_EARTH_M * Math.cos(siteAngle), R_EARTH_M * Math.sin(siteAngle));
        const towerH = Math.max(vehicle.heightM * 1.1 * c.k, 10 * dpr);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-(siteAngle - c.upAngle));
        ctx.fillStyle = '#d0d6df';
        ctx.fillRect(-towerH * 0.9, -towerH * 0.04, towerH * 1.8, towerH * 0.04);
        // Launch tower: a red lattice beside the rocket.
        const tw = towerH * 0.1;
        const tx = -towerH * 0.5;
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = Math.max(1, towerH * 0.012);
        ctx.strokeRect(tx, -towerH, tw, towerH);
        ctx.beginPath();
        for (let yy = 0; yy < towerH; yy += tw) {
          ctx.moveTo(tx, -yy);
          ctx.lineTo(tx + tw, -yy - tw);
          ctx.moveTo(tx + tw, -yy);
          ctx.lineTo(tx, -yy - tw);
        }
        ctx.stroke();
        if (!roscoe && viewSpanM > 2000) {
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.font = `${11 * dpr}px system-ui, sans-serif`;
          ctx.fillText('KSC', 6 * dpr, -6 * dpr);
        }
        ctx.restore();
      }

      // ---- flown path ----
      ctx.strokeStyle = roscoe ? 'rgba(255,240,180,0.95)' : 'rgba(255,214,120,0.9)';
      ctx.lineWidth = (roscoe ? 3 : 2) * dpr;
      ctx.beginPath();
      const samples = fixedSamples;
      const step = Math.max(1, Math.floor(samples.length / 800));
      let started = false;
      for (let i = 0; i < samples.length && samples[i].tS <= t; i += step) {
        const [px, py] = toScreen(samples[i].xM, samples[i].yM);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      const [rx, ry] = toScreen(sf.xM, sf.yM);
      if (started) ctx.lineTo(rx, ry);
      ctx.stroke();

      // ---- staging puffs ----
      for (const ts of stagingTimes) {
        const age = t - ts;
        if (age < 0 || age > 12) continue;
        const ps = sampleAt(samples, ts);
        const [px, py] = toScreen(ps.xM, ps.yM);
        ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - age / 12)})`;
        ctx.beginPath();
        ctx.arc(px, py, (8 + age * 3) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- rocket ----
      const blownUp = failed && (failure!.type === 'breakup' || failure!.type === 'crash');
      if (!blownUp || (effectStart !== null && now - effectStart < 250)) {
        const jettisoned = new Set<string>();
        jettisonEvents.forEach((e, i) => {
          if (t >= e.tS) jettisoned.add(jettisonNames[i] ?? '');
        });
        const vis = {
          stageIndex: s.stageIndex,
          boostersAttached: s.boostersAttached,
          jettisoned,
          flame: thrusting ? Math.min(1.3, 0.35 + s.thrustN / liftoffThrust) : 0,
        };
        const hM = visibleHeightM(vehicle, vis) || vehicle.heightM;
        const minPx = (roscoe ? 64 : 44) * dpr;
        const scale = Math.max(c.k, minPx / hM); // px per metre for the sprite
        // Nose direction on screen.
        const ax = sf.ux * cr - sf.uy * sr;
        const ay = sf.ux * sr + sf.uy * cr;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(Math.atan2(ax, ay));
        ctx.scale(scale, scale);
        // Position is the base when sitting on the pad, the middle in flight.
        const lift = Math.min(1, s.altitudeM / (hM * 3)) * (hM / 2);
        ctx.translate(0, lift);
        drawRocket(ctx, vehicle, vis, 1.2 / (scale / dpr) , now / 1000);
        ctx.restore();
      }

      // ---- explosion ----
      if (blownUp && effectStart !== null) {
        const age = (now - effectStart) / 1000;
        const R = Math.min(1, age / 0.6) * 40 * dpr;
        const fade = Math.max(0, 1 - age / 2.5);
        const puffs: [number, number, number, string][] = [
          [0, 0, 1, `rgba(255,176,46,${fade})`],
          [-0.6, -0.3, 0.7, `rgba(214,58,58,${fade})`],
          [0.6, -0.2, 0.75, `rgba(255,214,120,${fade})`],
          [0.1, 0.5, 0.65, `rgba(160,160,170,${fade})`],
          [-0.3, 0.6, 0.55, `rgba(120,120,130,${fade})`],
        ];
        for (const [ox, oy, rf, col] of puffs) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(rx + ox * R, ry + oy * R, rf * R, 0, Math.PI * 2);
          ctx.fill();
        }
        if (roscoe && fade > 0) {
          ctx.fillStyle = `rgba(255,255,255,${fade})`;
          ctx.font = `bold ${26 * dpr}px "Trebuchet MS", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(failure!.type === 'crash' ? 'BONK!' : 'BANG!', rx, ry - R - 10 * dpr);
          ctx.textAlign = 'start';
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [record, vehicle, tRef, launchSite, roscoe, armed]);

  return <canvas ref={canvasRef} className="flight-canvas" aria-label="Rocket flight view" />;
}
