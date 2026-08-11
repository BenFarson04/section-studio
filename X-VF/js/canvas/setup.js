/* ╔══════════════════════════════════════════════════════════╗
 *  setup.js
 *
 *  Canvas initialisation, hi-DPI resizing, and background
 *  grid rendering. Exports the shared canvas element and
 *  2D context used by all drawing modules.
 *
 *  Dependencies:  state/store.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { getScale } from "../state/store.js";

/* ─── Canvas & Context ───────────────────────────────────── */

export const canvas = document.getElementById("beamCanvas");
export const ctx = canvas.getContext("2d");

/* ─── Hi-DPI Resize ──────────────────────────────────────── */

export function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;

  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  // Drawing code uses CSS pixels so existing maths stays intuitive
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ─── Background Grid ────────────────────────────────────── */

export function drawGrid(layout) {
  const { plot, majorStep, minorStep, beamStartX, beamY } = layout;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw only within plot bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x0, plot.y0, plot.x1 - plot.x0, plot.y1 - plot.y0);
  ctx.clip();

  // Anchor grid to beam origin
  const originX = beamStartX;
  const originY = beamY;

  const xMinor0 = snapDownToGrid(plot.x0, originX, minorStep);
  const xMajor0 = snapDownToGrid(plot.x0, originX, majorStep);
  const yMinor0 = snapDownToGrid(plot.y0, originY, minorStep);
  const yMajor0 = snapDownToGrid(plot.y0, originY, majorStep);

  // Minor grid
  ctx.strokeStyle = "#eeeeee";
  ctx.lineWidth = 0.5;

  for (let x = xMinor0; x <= plot.x1; x += minorStep) {
    ctx.beginPath();
    ctx.moveTo(x, plot.y0);
    ctx.lineTo(x, plot.y1);
    ctx.stroke();
  }

  for (let y = yMinor0; y <= plot.y1; y += minorStep) {
    ctx.beginPath();
    ctx.moveTo(plot.x0, y);
    ctx.lineTo(plot.x1, y);
    ctx.stroke();
  }

  // Major grid
  ctx.strokeStyle = "#b5b5b5";
  ctx.lineWidth = 1;

  for (let x = xMajor0; x <= plot.x1; x += majorStep) {
    ctx.beginPath();
    ctx.moveTo(x, plot.y0);
    ctx.lineTo(x, plot.y1);
    ctx.stroke();
  }

  for (let y = yMajor0; y <= plot.y1; y += majorStep) {
    ctx.beginPath();
    ctx.moveTo(plot.x0, y);
    ctx.lineTo(plot.x1, y);
    ctx.stroke();
  }

  ctx.restore();
}

/* ─── Grid Snap Helper ───────────────────────────────────── */

function snapDownToGrid(value, origin, step) {
  return origin + Math.floor((value - origin) / step) * step;
}