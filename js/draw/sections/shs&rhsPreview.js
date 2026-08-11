/* ╔══════════════════════════════════════════════════════════╗
 *  shs&rhsPreview.js
 *
 *  Draws Square Hollow Section (SHS) and Rectangular Hollow
 *  Section (RHS) previews on the canvas. Both use the same
 *  rectangular-tube path — only the h : b ratio differs.
 *
 *  Hot-finished corner radii (BS EN 10210) are approximated
 *  as outer ≈ 1.5t, inner ≈ 1.0t — not in the CSV but
 *  standard for the product range.
 *
 *  Dependencies:  steelSectionsPreview.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import {
  PALETTE, FONT,
  drawLine, extensionLine, drawHorizontalDim, drawVerticalDim,
  drawCentreLine, prepareCanvas, drawTitleBlock
} from "./steelSectionsPreview.js";


/* ═══════════════════════════════════════════════════════════
 *  SECTION PATH & RENDERING
 * ═══════════════════════════════════════════════════════════ */

/* ─── Hollow Section Path (outer CW + inner CCW) ─────────── */

function hollowSectionPath(ctx, left, right, top, bottom, sT, rO, rI) {
  ctx.beginPath();

  // Outer rectangle — clockwise
  ctx.moveTo(left + rO, top);
  ctx.lineTo(right - rO, top);
  ctx.arcTo(right, top,    right, top + rO, rO);
  ctx.lineTo(right, bottom - rO);
  ctx.arcTo(right, bottom, right - rO, bottom, rO);
  ctx.lineTo(left + rO, bottom);
  ctx.arcTo(left, bottom,  left, bottom - rO, rO);
  ctx.lineTo(left, top + rO);
  ctx.arcTo(left, top,     left + rO, top, rO);
  ctx.closePath();

  // Inner rectangle — counter-clockwise (even-odd cutout)
  const iL = left + sT, iR = right  - sT;
  const iT = top  + sT, iB = bottom - sT;

  ctx.moveTo(iL + rI, iT);
  ctx.arcTo(iL, iT, iL, iT + rI, rI);
  ctx.lineTo(iL, iB - rI);
  ctx.arcTo(iL, iB, iL + rI, iB, rI);
  ctx.lineTo(iR - rI, iB);
  ctx.arcTo(iR, iB, iR, iB - rI, rI);
  ctx.lineTo(iR, iT + rI);
  ctx.arcTo(iR, iT, iR - rI, iT, rI);
  ctx.closePath();
}

/* ─── Fill & Stroke with Even-Odd Rule ───────────────────── */

function fillAndStrokeHollow(ctx, left, top, right, bottom, drawPath) {
  const grad = ctx.createLinearGradient(left, top, right, bottom);
  grad.addColorStop(0,   "#d6e8f7");
  grad.addColorStop(0.5, "#e8f1fa");
  grad.addColorStop(1,   "#c8ddf0");

  // Pass 1 — filled area with drop shadow
  ctx.save();
  ctx.shadowColor   = "rgba(0,0,0,0.12)";
  ctx.shadowBlur    = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  drawPath();
  ctx.fillStyle = grad;
  ctx.fill("evenodd");
  ctx.restore();

  // Pass 2 — crisp outline
  drawPath();
  ctx.strokeStyle = PALETTE.steelEdge;
  ctx.lineWidth   = 2;
  ctx.stroke();
}


/* ═══════════════════════════════════════════════════════════
 *  MAIN DRAWING FUNCTION
 * ═══════════════════════════════════════════════════════════ */

export function drawSelectedHollowSteelSection(section, canvasId = "beamCanvas") {

  // Patch tw / tf so prepareCanvas doesn't reject the section
  const t       = section.t ?? section.tw ?? section.tf;
  const patched = { ...section, tw: t, tf: t };

  const prep = prepareCanvas(patched, canvasId);
  if (!prep) return;

  const { ctx, W, H, h, b } = prep;
  if (!h || !b || !t) return;

  /* ─── Scale & Margins ──────────────────────────────────── */

  const margin = { left: 120, right: 100, top: 70, bottom: 90 };
  const scale  = Math.min(
    (W - margin.left - margin.right)  / b,
    (H - margin.top  - margin.bottom) / h
  );

  const sB = b * scale, sH = h * scale, sT = t * scale;

  /* ─── Corner Radii (hot-finished approximation) ────────── */

  const rO = Math.min(sT * 1.5, sB * 0.25, sH * 0.25, 18);
  const rI = Math.min(sT * 1.0,
                       (sB - 2 * sT) * 0.25,
                       (sH - 2 * sT) * 0.25, 12);

  /* ─── Positioned Geometry ──────────────────────────────── */

  const cx = W / 2, cy = H / 2;
  const left   = cx - sB / 2, right  = cx + sB / 2;
  const top    = cy - sH / 2, bottom = cy + sH / 2;

  /* ─── Centre Lines (doubly symmetric) ──────────────────── */

  drawCentreLine(ctx, cx, top,  cx, bottom);
  drawCentreLine(ctx, left, cy, right, cy);

  /* ─── Section Fill & Stroke ────────────────────────────── */

  fillAndStrokeHollow(ctx, left, top, right, bottom, () =>
    hollowSectionPath(ctx, left, right, top, bottom, sT, rO, rI)
  );

  /* ─── Dimension Lines ──────────────────────────────────── */

  ctx.strokeStyle = PALETTE.dimLine;
  ctx.fillStyle   = PALETTE.dimLine;
  ctx.lineWidth   = 1;

  // h — overall depth (left side)
  const hDimX = left - 50;
  extensionLine(ctx, left, top,    hDimX - 4, top);
  extensionLine(ctx, left, bottom, hDimX - 4, bottom);
  drawVerticalDim(ctx, hDimX, top, bottom, `h = ${h} mm`);

  // b — overall width (below section)
  const bDimY = bottom + 40;
  extensionLine(ctx, left,  bottom, left,  bDimY + 4);
  extensionLine(ctx, right, bottom, right, bDimY + 4);
  drawHorizontalDim(ctx, left, right, bDimY, `b = ${b} mm`);

  // t — wall thickness (right side, across top wall)
  const tDimX = right + 40;
  extensionLine(ctx, right, top,       tDimX + 4, top);
  extensionLine(ctx, right, top + sT,  tDimX + 4, top + sT);
  drawVerticalDim(ctx, tDimX, top, top + sT, `t = ${t} mm`);

  /* ─── Title Block ──────────────────────────────────────── */

  drawTitleBlock(ctx, section, h, b, t, t);
}