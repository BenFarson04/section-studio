/* ╔══════════════════════════════════════════════════════════╗
 *  ub&ucPreview.js
 *
 *  Draws Universal Beam (UB) and Universal Column (UC)
 *  I-section previews on the canvas. Symmetric I-shaped path
 *  with fillet radii at the web-flange junctions.
 *
 *  Dependencies:  steelSectionsPreview.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import {
  PALETTE,
  extensionLine, drawHorizontalDim, drawVerticalDim,
  drawCentreLine, prepareCanvas, fillAndStrokeSection, drawTitleBlock
} from "./steelSectionsPreview.js";

/* ─── I-Section Path ─────────────────────────────────────── */

function iSectionPath(ctx, left, right, top, bottom, webL, webR, tf, r) {
  const maxR = Math.min(tf, webL - left, right - webR, (bottom - top - 2 * tf) / 2);
  r = Math.min(r, maxR, 20);

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, top + tf);
  ctx.lineTo(webR + r, top + tf);
  ctx.arcTo(webR, top + tf, webR, top + tf + r, r);
  ctx.lineTo(webR, bottom - tf - r);
  ctx.arcTo(webR, bottom - tf, webR + r, bottom - tf, r);
  ctx.lineTo(right, bottom - tf);
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left, bottom - tf);
  ctx.lineTo(webL - r, bottom - tf);
  ctx.arcTo(webL, bottom - tf, webL, bottom - tf - r, r);
  ctx.lineTo(webL, top + tf + r);
  ctx.arcTo(webL, top + tf, webL - r, top + tf, r);
  ctx.lineTo(left, top + tf);
  ctx.closePath();
}

/* ─── Main Drawing Function ──────────────────────────────── */

export function drawSelectedISteelSection(section, canvasId = "beamCanvas") {
  const prep = prepareCanvas(section, canvasId);
  if (!prep) return;

  const { ctx, W, H, h, b, tw, tf } = prep;

  // Scale & margins
  const margin = { left: 120, right: 100, top: 70, bottom: 90 };
  const scale  = Math.min(
    (W - margin.left - margin.right)  / b,
    (H - margin.top  - margin.bottom) / h
  );

  const sB = b * scale, sH = h * scale;
  const sTw = tw * scale, sTf = tf * scale;
  const r = Math.min(sTf * 0.6, sTw * 0.4, 14);

  const cx = W / 2, cy = H / 2;
  const left = cx - sB / 2, right  = cx + sB / 2;
  const top  = cy - sH / 2, bottom = cy + sH / 2;
  const webL = cx - sTw / 2, webR  = cx + sTw / 2;

  // Centre lines (doubly symmetric)
  drawCentreLine(ctx, cx, top, cx, bottom);
  drawCentreLine(ctx, left, cy, right, cy);

  // Section fill & stroke
  fillAndStrokeSection(ctx, left, top, right, bottom, () =>
    iSectionPath(ctx, left, right, top, bottom, webL, webR, sTf, r)
  );

  // Dimension lines
  ctx.strokeStyle = PALETTE.dimLine;
  ctx.fillStyle   = PALETTE.dimLine;
  ctx.lineWidth   = 1;

  const hDimX = left - 50;
  extensionLine(ctx, left, top,    hDimX - 4, top);
  extensionLine(ctx, left, bottom, hDimX - 4, bottom);
  drawVerticalDim(ctx, hDimX, top, bottom, `h = ${h} mm`);

  const bDimY = bottom + 40;
  extensionLine(ctx, left,  bottom, left,  bDimY + 4);
  extensionLine(ctx, right, bottom, right, bDimY + 4);
  drawHorizontalDim(ctx, left, right, bDimY, `b = ${b} mm`);

  const tfDimX = right + 40;
  extensionLine(ctx, right, top,       tfDimX + 4, top);
  extensionLine(ctx, right, top + sTf, tfDimX + 4, top + sTf);
  drawVerticalDim(ctx, tfDimX, top, top + sTf, `tf = ${tf} mm`);

  const twY = cy + sH * 0.22;
  extensionLine(ctx, webL, twY - 18, webL, twY + 18);
  extensionLine(ctx, webR, twY - 18, webR, twY + 18);
  drawHorizontalDim(ctx, webL, webR, twY - 2, `tw = ${tw} mm`);

  // Title block
  drawTitleBlock(ctx, section, h, b, tw, tf);
}