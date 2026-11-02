// Draws the vehicle side-on from its segments, in Roscoe's colours.
// Local frame: metres, origin at the base centre of the lowest attached stage, nose toward -y.

import type { SidePayload, Vehicle } from '../physics/vehicle';

export interface RocketVisibility {
  stageIndex: number;
  boostersAttached: boolean;
  /** Names of payload parts already jettisoned. */
  jettisoned: Set<string>;
  /** 0–1 flame size, 0 for none. */
  flame: number;
}

const OUTLINE = '#1b2a44';

export function visibleHeightM(v: Vehicle, vis: RocketVisibility): number {
  return v.segments
    .filter((s) => (s.stageIndex === -1 ? !vis.jettisoned.has(s.name) : s.stageIndex >= vis.stageIndex))
    .reduce((h, s) => h + s.lengthM, 0);
}

function trapezoid(ctx: CanvasRenderingContext2D, y0: number, y1: number, w0: number, w1: number) {
  ctx.beginPath();
  ctx.moveTo(-w0 / 2, -y0);
  ctx.lineTo(w0 / 2, -y0);
  ctx.lineTo(w1 / 2, -y1);
  ctx.lineTo(-w1 / 2, -y1);
  ctx.closePath();
}

function flamePath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, len: number, flicker: number) {
  const l = len * (0.85 + 0.15 * flicker);
  const grad = ctx.createLinearGradient(0, y, 0, y + l);
  grad.addColorStop(0, '#fff6c8');
  grad.addColorStop(0.3, '#ffb02e');
  grad.addColorStop(1, 'rgba(214,58,58,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.7, y + l * 0.5, x, y + l);
  ctx.quadraticCurveTo(x + w * 0.7, y + l * 0.5, x + w / 2, y);
  ctx.closePath();
  ctx.fill();
}

/** The Shuttle orbiter seen side-on, belly against the tank, tail sticking out. Engines at its base. */
function drawOrbiter(ctx: CanvasRenderingContext2D, sp: SidePayload, x: number, flame: number, flicker: number) {
  const d = sp.diameterM;
  const L = sp.lengthM;
  const base = 2;
  ctx.save();
  ctx.translate(x, 0);
  if (flame > 0) for (const ex of [-d * 0.28, 0, d * 0.28]) flamePath(ctx, ex, base + d * 0.25, d * 0.3, d * 7 * flame, flicker);
  ctx.fillStyle = '#4a5568';
  for (const ex of [-d * 0.28, 0, d * 0.28]) {
    ctx.save();
    ctx.translate(ex, -base);
    trapezoid(ctx, -d * 0.3, 0, d * 0.32, d * 0.16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // Tail fin, sticking out away from the tank.
  ctx.fillStyle = sp.color;
  ctx.beginPath();
  ctx.moveTo(d / 2, -(base + 1));
  ctx.lineTo(d / 2 + d * 1.3, -(base + 0.5));
  ctx.lineTo(d / 2 + d * 1.3, -(base + d * 0.7));
  ctx.lineTo(d / 2, -(base + d * 2.4));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Fuselage and nose.
  const noseL = d * 1.4;
  ctx.beginPath();
  ctx.moveTo(-d / 2, -base);
  ctx.lineTo(d / 2, -base);
  ctx.lineTo(d / 2, -(base + L - noseL));
  ctx.quadraticCurveTo(d / 2, -(base + L), 0, -(base + L));
  ctx.quadraticCurveTo(-d / 2, -(base + L - noseL * 0.3), -d / 2, -(base + L - noseL));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Black heat tiles on the belly (the side against the tank) and the nose cap.
  ctx.fillStyle = '#2b2f36';
  ctx.beginPath();
  ctx.moveTo(-d / 2, -base);
  ctx.lineTo(-d * 0.25, -base);
  ctx.lineTo(-d * 0.25, -(base + L - noseL));
  ctx.quadraticCurveTo(-d * 0.3, -(base + L - noseL * 0.35), -d * 0.05, -(base + L - 0.6));
  ctx.quadraticCurveTo(-d / 2, -(base + L - noseL * 0.3), -d / 2, -(base + L - noseL));
  ctx.closePath();
  ctx.fill();
  // Cockpit windows.
  ctx.fillStyle = '#1d3d73';
  ctx.fillRect(d * 0.05, -(base + L - noseL * 0.75), d * 0.3, noseL * 0.25);
  ctx.restore();
}

/** Draw at the current transform. `lineM` is the outline width in metres. */
export function drawRocket(
  ctx: CanvasRenderingContext2D,
  v: Vehicle,
  vis: RocketVisibility,
  lineM: number,
  timeS = 0,
) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineM;
  ctx.strokeStyle = OUTLINE;
  const flicker = 0.5 + 0.5 * Math.sin(timeS * 37) * Math.cos(timeS * 23);

  const bottom = v.stages[vis.stageIndex];
  const coreDiameter = bottom?.diameterM ?? 4;

  const side = v.sidePayload;
  const sideX = side && bottom ? coreDiameter / 2 + side.diameterM / 2 : 0;
  const coreEngines = !side;

  // Flames under the bottom stage's engines.
  if (vis.flame > 0 && bottom && coreEngines) {
    const n = Math.min(5, bottom.engines.reduce((c, g) => c + g.count, 0)) || 1;
    const bell = Math.min(coreDiameter / n, coreDiameter * 0.45);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * bell * 1.05;
      flamePath(ctx, x, bell * 0.7, bell * 0.9, coreDiameter * 2.6 * vis.flame, flicker);
    }
  }

  // Engine bells.
  if (bottom && bottom.engines.length && coreEngines) {
    const n = Math.min(5, bottom.engines.reduce((c, g) => c + g.count, 0));
    const bell = Math.min(coreDiameter / n, coreDiameter * 0.45);
    ctx.fillStyle = '#4a5568';
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * bell * 1.05;
      ctx.save();
      ctx.translate(x, 0);
      trapezoid(ctx, -bell * 0.75, 0, bell * 0.95, bell * 0.45);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Strap-on boosters (behind the core), two per side for four.
  const b = bottom?.boosters;
  if (b && vis.boostersAttached) {
    const bd = b.booster.diameterM ?? 3.7;
    const bl = b.booster.lengthM ?? 50;
    const perSide = Math.ceil(b.count / 2);
    for (let side = -1; side <= 1; side += 2) {
      for (let k = perSide - 1; k >= 0; k--) {
        const x = side * (coreDiameter / 2 + bd / 2 + k * bd * 0.55 - k * bd * 0.1);
        const shade = k > 0 ? '#d5dbe4' : '#f4f6fa';
        ctx.save();
        ctx.translate(x, 0);
        if (vis.flame > 0) flamePath(ctx, 0, bd * 0.6, bd * 0.8, bd * 3.2 * vis.flame, flicker);
        ctx.fillStyle = '#4a5568';
        trapezoid(ctx, -bd * 0.6, 0, bd * 0.85, bd * 0.5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = shade;
        trapezoid(ctx, 0, bl - bd * 1.4, bd, bd);
        ctx.fill();
        ctx.stroke();
        // Nose cone.
        ctx.beginPath();
        ctx.moveTo(-bd / 2, -(bl - bd * 1.4));
        ctx.quadraticCurveTo(-bd / 2, -bl + bd * 0.2, 0, -bl);
        ctx.quadraticCurveTo(bd / 2, -bl + bd * 0.2, bd / 2, -(bl - bd * 1.4));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Fins on the bottom stage.
  for (const fin of v.fins.filter((f) => f.stageIndex === vis.stageIndex)) {
    ctx.fillStyle = '#9aa7b8';
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo((side * coreDiameter) / 2, -fin.rootM);
      ctx.lineTo(side * (coreDiameter / 2 + fin.spanM), -fin.rootM * 0.15);
      ctx.lineTo(side * (coreDiameter / 2 + fin.spanM), fin.rootM * 0.1);
      ctx.lineTo((side * coreDiameter) / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  if (side) drawOrbiter(ctx, side, sideX, bottom ? vis.flame : 0, flicker);

  // The stack itself.
  let y = 0;
  for (const s of v.segments) {
    if (s.stageIndex === -1 ? vis.jettisoned.has(s.name) : s.stageIndex < vis.stageIndex) continue;
    const y1 = y + s.lengthM;
    ctx.fillStyle = s.color;
    if (s.shape === 'tower') {
      // Escape tower: a thin rocket on a truss.
      ctx.beginPath();
      ctx.moveTo(-s.diameterBottomM * 0.9, -y);
      ctx.lineTo(0, -(y + s.lengthM * 0.35));
      ctx.lineTo(s.diameterBottomM * 0.9, -y);
      ctx.stroke();
      trapezoid(ctx, y + s.lengthM * 0.35, y1 - s.lengthM * 0.15, s.diameterBottomM, s.diameterTopM * 1.2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d63a3a';
      trapezoid(ctx, y1 - s.lengthM * 0.15, y1, s.diameterTopM * 1.2, 0.05);
      ctx.fill();
      ctx.stroke();
    } else if (s.shape === 'capsule') {
      trapezoid(ctx, y, y1, s.diameterBottomM, s.diameterTopM);
      ctx.fill();
      ctx.stroke();
      // The one big window.
      ctx.fillStyle = '#1d3d73';
      ctx.beginPath();
      ctx.arc(0, -(y + s.lengthM * 0.5), s.diameterBottomM * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      trapezoid(ctx, y, y1, s.diameterBottomM, s.diameterTopM);
      ctx.fill();
      ctx.stroke();
    }
    y = y1;
  }
  ctx.restore();
}
