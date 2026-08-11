/* ╔══════════════════════════════════════════════════════════╗
 *  anglesPreview.js
 *
 *  Draws Equal Angle (EA) and Unequal Angle (UA) steel
 *  section previews on the canvas. Both use the same
 *  L-shaped path — only the h : b ratio differs.
 *
 *  Dependencies:  steelSectionsPreview.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import {
  PALETTE, FONT,
  drawLine, extensionLine, drawHorizontalDim, drawVerticalDim,
  drawCentreLine, prepareCanvas, fillAndStrokeSection, drawTitleBlock
} from "./steelSectionsPreview.js";


/* ═══════════════════════════════════════════════════════════
 *  SECTION PATH
 * ═══════════════════════════════════════════════════════════ */

function angleSectionPath(ctx, left, right, top, bottom, sT, r1, r2) {
  ctx.beginPath();

  // Heel — outer bottom-left corner of the L
  ctx.moveTo(left, bottom);

  // Bottom edge →
  ctx.lineTo(right, bottom);

  // Right edge ↑, r2 toe at horizontal-leg tip
  ctx.lineTo(right, bottom - sT + r2);
  ctx.arcTo(right, bottom - sT, right - r2, bottom - sT, r2);

  // Inner face of horizontal leg ← towards root
  ctx.lineTo(left + sT + r1, bottom - sT);

  // r1 root radius at inner corner
  ctx.arcTo(left + sT, bottom - sT, left + sT, bottom - sT - r1, r1);

  // Inner face of vertical leg ↑, r2 toe at tip
  ctx.lineTo(left + sT, top + r2);
  ctx.arcTo(left + sT, top, left + sT - r2, top, r2);

  // Top edge of vertical leg ←
  ctx.lineTo(left, top);

  // Left edge ↓ back to heel
  ctx.closePath();
}


/* ═══════════════════════════════════════════════════════════
 *  MAIN DRAWING FUNCTION
 * ═══════════════════════════════════════════════════════════ */

export function drawSelectedAngleSteelSection(section, canvasId = "beamCanvas") {

  // Patch tw / tf so prepareCanvas doesn't reject the section
  const t       = section.t ?? section.tw ?? section.tf;
  const patched = { ...section, tw: t, tf: t };

  const prep = prepareCanvas(patched, canvasId);
  if (!prep) return;

  const { ctx, W, H, h, b } = prep;
  if (!h || !b || !t) return;

  /* ─── Scale & Margins ──────────────────────────────────── */

  const margin = { left: 120, right: 100, top: 90, bottom: 90 };
  const scale  = Math.min(
    (W - margin.left - margin.right)  / b,
    (H - margin.top  - margin.bottom) / h
  );

  const sB = b * scale, sH = h * scale, sT = t * scale;

  /* ─── Radii (scaled & clamped) ─────────────────────────── */

  const r1Raw = (section.r1 ?? t)       * scale;
  const r2Raw = (section.r2 ?? t * 0.5) * scale;

  const maxR1 = Math.min((sB - sT) * 0.55, (sH - sT) * 0.55, sT * 1.6);
  const r1    = Math.min(r1Raw, maxR1, 22);

  const maxR2 = Math.min(sT * 0.5, (sB - sT - r1) * 0.4, (sH - sT - r1) * 0.4);
  const r2    = Math.min(r2Raw, maxR2, 10);

  /* ─── Positioned Geometry ──────────────────────────────── */

  const cx = W / 2, cy = H / 2;
  const left   = cx - sB / 2, right  = cx + sB / 2;
  const top    = cy - sH / 2, bottom = cy + sH / 2;

  /* ─── Section Fill & Stroke ────────────────────────────── */

  fillAndStrokeSection(ctx, left, top, right, bottom, () =>
    angleSectionPath(ctx, left, right, top, bottom, sT, r1, r2)
  );

  /* ─── Dimension Lines ──────────────────────────────────── */

  ctx.strokeStyle = PALETTE.dimLine;
  ctx.fillStyle   = PALETTE.dimLine;
  ctx.lineWidth   = 1;

  // h — overall height (left side)
  const hDimX = left - 50;
  extensionLine(ctx, left, top,    hDimX - 4, top);
  extensionLine(ctx, left, bottom, hDimX - 4, bottom);
  drawVerticalDim(ctx, hDimX, top, bottom, `h = ${h} mm`);

  // b — overall width (below section)
  const bDimY = bottom + 40;
  extensionLine(ctx, left,  bottom, left,  bDimY + 4);
  extensionLine(ctx, right, bottom, right, bDimY + 4);
  drawHorizontalDim(ctx, left, right, bDimY, `b = ${b} mm`);

  // t — leg thickness (right side, across horizontal leg)
  const tDimX = right + 40;
  extensionLine(ctx, right, bottom,      tDimX + 4, bottom);
  extensionLine(ctx, right, bottom - sT, tDimX + 4, bottom - sT);
  drawVerticalDim(ctx, tDimX, bottom - sT, bottom, `t = ${t} mm`);

  /* ─── Radius Labels & Leaders ──────────────────────────── */

  ctx.font        = FONT.dim;
  ctx.fillStyle   = PALETTE.dimLine;
  ctx.strokeStyle = PALETTE.dimLine;
  ctx.lineWidth   = 0.8;

  // r1 — root radius (leader → inner corner fillet)
  ctx.textAlign    = "left";
  ctx.textBaseline = "bottom";
  const r1Lx = left + sT + r1 + 10;
  const r1Ly = bottom - sT - r1 - 6;
  ctx.fillText("r1", r1Lx, r1Ly);
  drawLine(ctx, r1Lx - 2, r1Ly + 2,
               left + sT + r1 * 0.35, bottom - sT - r1 * 0.35);

  // r2 — toe radius (leader → vertical-leg toe fillet)
  ctx.textAlign    = "left";
  ctx.textBaseline = "bottom";
  const r2Lx = left + sT + 8;
  const r2Ly = top - 8;
  ctx.fillText("r2", r2Lx, r2Ly);
  drawLine(ctx, r2Lx - 2, r2Ly + 4,
               left + sT - r2 * 0.4, top + r2 * 0.4);

  /* ─── Title Block ──────────────────────────────────────── */

  drawTitleBlock(ctx, section, h, b, t, t);
}