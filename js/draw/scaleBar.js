/* ╔══════════════════════════════════════════════════════════╗
 *  scaleBar.js
 *
 *  Draws a 1 m reference scale bar at the bottom of the
 *  beam canvas, snapped to the nearest major gridline.
 *
 *  Dependencies:  canvas/setup.js, canvas/layout.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { ctx, canvas } from "../canvas/setup.js";
import { getLayout, snapToGrid } from "../canvas/layout.js";

/* ─── Scale Bar Drawing ──────────────────────────────────── */

export function drawScaleBar() {
  const { scale, majorStep, beamStartX, plot } = getLayout();

  const padding = 15;
  const barThickness = 1;
  const barLengthMeters = 1;
  const barLengthPx = barLengthMeters * scale;

  // Keep inside plot bounds, snap right end to a major gridline
  const y = Math.min(plot.y1 - padding, canvas.height - padding);

  const desiredRight = plot.x1 - padding;
  const snappedRight = snapToGrid(desiredRight, beamStartX, majorStep);
  const x = snappedRight - barLengthPx;

  // Bar
  ctx.beginPath();
  ctx.rect(x, y - barThickness, barLengthPx, barThickness);
  ctx.fillStyle = "black";
  ctx.fill();

  // End ticks
  ctx.beginPath();
  ctx.moveTo(x, y - barThickness - 3);
  ctx.lineTo(x, y);
  ctx.moveTo(x + barLengthPx, y - barThickness - 3);
  ctx.lineTo(x + barLengthPx, y);

  ctx.moveTo(x, y + barThickness + 3);
  ctx.lineTo(x, y);
  ctx.moveTo(x + barLengthPx, y + barThickness + 3);
  ctx.lineTo(x + barLengthPx, y);

  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Label
  ctx.font = "10px Segoe UI, sans-serif";
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${barLengthMeters} m`, x + barLengthPx / 2, y - barThickness - 8);
}