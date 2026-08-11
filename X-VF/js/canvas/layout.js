/* ╔══════════════════════════════════════════════════════════╗
 *  layout.js
 *
 *  Computes the canvas layout geometry: beam position, scale,
 *  grid steps, diagram axis positions, and plot clip region.
 *  Also exports grid-snapping and clipping helpers.
 *
 *  Dependencies:  canvas/setup.js, state/store.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { canvas } from "./setup.js";
import { getBeamLength, getScale } from "../state/store.js";

/* ─── Layout Calculation ─────────────────────────────────── */

export function getLayout() {
  const scale = getScale();
  const Lm = getBeamLength();
  const lengthPx = Lm * scale;

  const majorStep = 1 * scale;
  const minorStep = 0.2 * scale;

  const beamStartX = (canvas.clientWidth - lengthPx) / 2;

  const height = canvas.clientHeight;
  const beamY      = height * 0.25;
  const sfdAxisY   = height * 0.50;
  const bmdAxisY   = height * 0.75;

  const pad = 8;
  const top = pad;
  const bottom = canvas.clientHeight - pad;

  const extra = 20 * majorStep;
  const rawX0 = beamStartX - extra;
  const rawX1 = beamStartX + lengthPx + extra;

  const plot = {
    x0: Math.max(0, rawX0),
    x1: Math.min(canvas.clientWidth, rawX1),
    y0: top,
    y1: bottom,
  };

  return {
    scale, Lm, lengthPx, majorStep, minorStep,
    beamStartX, beamY, plot, sfdAxisY, bmdAxisY,
  };
}

/* ─── Grid Snapping Helpers ──────────────────────────────── */

function mod(a, n) { return ((a % n) + n) % n; }

export function snapToGrid(value, origin, step) {
  return origin + Math.round((value - origin) / step) * step;
}

export function snapDownToGrid(value, origin, step) {
  return origin + Math.floor((value - origin) / step) * step;
}

/* ─── Plot Clipping ──────────────────────────────────────── */

export function clipToPlot(ctx, plot) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x0, plot.y0, plot.x1 - plot.x0, plot.y1 - plot.y0);
  ctx.clip();
}