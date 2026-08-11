/* ╔══════════════════════════════════════════════════════════╗
 *  pfcPreview.js
 *
 *  Draws Parallel Flange Channel (PFC) section previews on
 *  the canvas. C-shaped path with web on the left and
 *  flanges projecting right, with fillet radii at the
 *  web-flange junctions.
 *
 *  Dependencies:  steelSectionsPreview.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import {
  PALETTE, FONT,
  drawLine, extensionLine, drawHorizontalDim, drawVerticalDim,
  drawCentreLine, prepareCanvas, fillAndStrokeSection, drawTitleBlock
} from "./steelSectionsPreview.js";

/* ─── Channel Section Path ───────────────────────────────── */

function pfcSectionPath(ctx, left, right, top, bottom, sTw, sTf, r) {
  const webRight = left + sTw;
  const maxR = Math.min(sTf, right - webRight, (bottom - top - 2 * sTf) / 2);
  r = Math.min(r, maxR, 20);

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, top + sTf);
  ctx.lineTo(webRight + r, top + sTf);
  ctx.arcTo(webRight, top + sTf, webRight, top + sTf + r, r);
  ctx.lineTo(webRight, bottom - sTf - r);
  ctx.arcTo(webRight, bottom - sTf, webRight + r, bottom - sTf, r);
  ctx.lineTo(right, bottom - sTf);
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
}

/* ─── Main Drawing Function ──────────────────────────────── */

export function drawSelectedPFCSteelSection(section, canvasId = "beamCanvas") {
  const prep = prepareCanvas(section, canvasId);
  if (!prep) return;

  const { ctx, W, H, h, b, tw, tf } = prep;

  // Scale & margins
  const margin = { left: 120, right: 100, top: 90, bottom: 90 };
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
  const webRight = left + sTw;

  // Centre line (horizontal only — mono-symmetric)
  drawCentreLine(ctx, left, cy, right, cy);

  // Section fill & stroke
  fillAndStrokeSection(ctx, left, top, right, bottom, () =>
    pfcSectionPath(ctx, left, right, top, bottom, sTw, sTf, r)
  );

  // Dimension lines
  ctx.strokeStyle = PALETTE.dimLine;
  ctx.fillStyle   = PALETTE.dimLine;
  ctx.lineWidth   = 1;

  const hDimX = left - 50;
  extensionLine(ctx, left, top,    hDimX - 4, top);
  extensionLine(ctx, left, bottom, hDimX - 4, bottom);
  drawVerticalDim(ctx, hDimX, top, bottom, `h = ${h} mm`);

  const bDimY = top - 40;
  extensionLine(ctx, left,  top, left,  bDimY - 4);
  extensionLine(ctx, right, top, right, bDimY - 4);
  drawHorizontalDim(ctx, left, right, bDimY, `b = ${b} mm`);

  const twY = cy - sH * 0.22;
  extensionLine(ctx, left,     twY - 18, left,     twY + 18);
  extensionLine(ctx, webRight, twY - 18, webRight, twY + 18);
  drawHorizontalDim(ctx, left, webRight, twY - 2, `tw = ${tw} mm`);

  const tfDimX = right + 40;
  extensionLine(ctx, right, bottom - sTf, tfDimX + 4, bottom - sTf);
  extensionLine(ctx, right, bottom,       tfDimX + 4, bottom);
  drawVerticalDim(ctx, tfDimX, bottom - sTf, bottom, `tf = ${tf} mm`);

  // r — root radius label & leader
  ctx.font         = FONT.dim;
  ctx.fillStyle    = PALETTE.dimLine;
  ctx.textAlign    = "left";
  ctx.textBaseline = "bottom";
  const rLabelX = webRight + r + 6;
  const rLabelY = top + sTf + r + 4;
  ctx.fillText("r", rLabelX, rLabelY);

  ctx.strokeStyle = PALETTE.dimLine;
  ctx.lineWidth   = 0.8;
  drawLine(ctx, rLabelX - 2, rLabelY + 2, webRight + r * 0.4, top + sTf + r * 0.4);

  // Title block
  drawTitleBlock(ctx, section, h, b, tw, tf);
}