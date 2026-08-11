/* ╔══════════════════════════════════════════════════════════╗
 *  chsPreview.js
 *
 *  Draws Circular Hollow Section (CHS) previews on the
 *  canvas. Two concentric circles — outer diameter d, inner
 *  d − 2t — with even-odd fill to render the void.
 *
 *  Dependencies:  steelSectionsPreview.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import {
  PALETTE, FONT,
  drawLine, drawArrowhead, extensionLine,
  drawCentreLine, prepareCanvas, drawGrid
} from "./steelSectionsPreview.js";


/* ═══════════════════════════════════════════════════════════
 *  SECTION PATH & RENDERING
 * ═══════════════════════════════════════════════════════════ */

/* ─── CHS Path (outer CW + inner CCW) ───────────────────── */

function chsSectionPath(ctx, cx, cy, rOuter, rInner) {
  ctx.beginPath();

  // Outer circle — clockwise
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2, false);

  // Inner circle — counter-clockwise (even-odd cutout)
  ctx.moveTo(cx + rInner, cy);
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);

  ctx.closePath();
}

/* ─── Fill & Stroke with Even-Odd Rule ───────────────────── */

function fillAndStrokeCHS(ctx, cx, cy, rOuter, drawPath) {
  const grad = ctx.createRadialGradient(
    cx - rOuter * 0.25, cy - rOuter * 0.25, rOuter * 0.1,
    cx, cy, rOuter
  );
  grad.addColorStop(0,   "#e8f1fa");
  grad.addColorStop(0.5, "#d6e8f7");
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
 *  DIMENSION HELPERS
 * ═══════════════════════════════════════════════════════════ */

/* ─── Horizontal Dimension ───────────────────────────────── */

function drawHorizontalDim(ctx, x1, x2, y, label) {
  drawLine(ctx, x1, y, x2, y);
  drawArrowhead(ctx, x1, y, -1, 0);
  drawArrowhead(ctx, x2, y, 1, 0);
  ctx.font         = FONT.dim;
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, (x1 + x2) / 2, y - 5);
}

/* ─── Vertical Dimension ─────────────────────────────────── */

function drawVerticalDim(ctx, x, y1, y2, label) {
  drawLine(ctx, x, y1, x, y2);
  drawArrowhead(ctx, x, y1, 0, -1);
  drawArrowhead(ctx, x, y2, 0,  1);
  ctx.save();
  ctx.translate(x - 10, (y1 + y2) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font         = FONT.dim;
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}


/* ═══════════════════════════════════════════════════════════
 *  MAIN DRAWING FUNCTION
 * ═══════════════════════════════════════════════════════════ */

export function drawSelectedCHSSteelSection(section, canvasId = "beamCanvas") {
  const d = section.d ?? section.h;
  const t = section.t ?? section.tw;
  if (!d || !t) return;

  // Patch for prepareCanvas (it expects h, b, tw, tf)
  const patched = { ...section, h: d, b: d, tw: t, tf: t };

  const prep = prepareCanvas(patched, canvasId);
  if (!prep) return;

  const { ctx, W, H } = prep;

  /* ─── Scale & Layout ───────────────────────────────────── */

  const margin = { left: 120, right: 100, top: 70, bottom: 90 };
  const maxDim = Math.min(
    W - margin.left - margin.right,
    H - margin.top  - margin.bottom
  );
  const scale = maxDim / d;

  const sD = d * scale;
  const sT = t * scale;
  const rOuter = sD / 2;
  const rInner = rOuter - sT;

  const cx = W / 2;
  const cy = H / 2;

  /* ─── Centre Lines ─────────────────────────────────────── */

  drawCentreLine(ctx, cx, cy - rOuter, cx, cy + rOuter);
  drawCentreLine(ctx, cx - rOuter, cy, cx + rOuter, cy);

  /* ─── Section Fill & Stroke ────────────────────────────── */

  fillAndStrokeCHS(ctx, cx, cy, rOuter, () =>
    chsSectionPath(ctx, cx, cy, rOuter, rInner)
  );

  /* ─── Dimension Lines ──────────────────────────────────── */

  ctx.strokeStyle = PALETTE.dimLine;
  ctx.fillStyle   = PALETTE.dimLine;
  ctx.lineWidth   = 1;

  // d — overall diameter (left side, vertical)
  const dDimX = cx - rOuter - 50;
  extensionLine(ctx, cx - rOuter, cy - rOuter, dDimX - 4, cy - rOuter);
  extensionLine(ctx, cx - rOuter, cy + rOuter, dDimX - 4, cy + rOuter);
  drawVerticalDim(ctx, dDimX, cy - rOuter, cy + rOuter, `d = ${d} mm`);

  // t — wall thickness (right side, radial leader)
  const tAngle  = -Math.PI / 4;
  const outerX  = cx + rOuter * Math.cos(tAngle);
  const outerY  = cy + rOuter * Math.sin(tAngle);
  const innerX  = cx + rInner * Math.cos(tAngle);
  const innerY  = cy + rInner * Math.sin(tAngle);

  const labelX = outerX + 40;
  const labelY = outerY - 30;

  ctx.beginPath();
  ctx.moveTo((outerX + innerX) / 2, (outerY + innerY) / 2);
  ctx.lineTo(labelX, labelY);
  ctx.stroke();

  const dx = outerX - innerX;
  const dy = outerY - innerY;
  drawLine(ctx, innerX, innerY, outerX, outerY);
  drawArrowhead(ctx, outerX, outerY,  dx,  dy);
  drawArrowhead(ctx, innerX, innerY, -dx, -dy);

  ctx.font         = FONT.dim;
  ctx.textAlign    = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(`t = ${t} mm`, labelX + 4, labelY - 2);

  /* ─── Title Block ──────────────────────────────────────── */

  const name = section.section || "Selected Section";
  ctx.fillStyle    = PALETTE.title;
  ctx.font         = FONT.title;
  ctx.textAlign    = "left";
  ctx.textBaseline = "top";
  ctx.fillText(name, 20, 16);

  ctx.fillStyle = PALETTE.subtitle;
  ctx.font      = FONT.sub;
  ctx.fillText(`d = ${d},  t = ${t}  (mm)`, 20, 36);
}