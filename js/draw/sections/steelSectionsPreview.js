/* ╔══════════════════════════════════════════════════════════╗
 *  steelSectionsPreview.js
 *
 *  Shared constants, drawing primitives and canvas helpers
 *  used by every steel-section preview module (UB/UC, PFC,
 *  EA/UA, SHS/RHS, CHS).
 *
 *  Visual style is intentionally aligned with concreteSection.js
 *  so the manualDesigner canvas presents a consistent industry-
 *  standard look regardless of material.
 *
 *  Exports:  PALETTE, FONT, getSectionValue,
 *            drawLine, drawArrowhead, extensionLine,
 *            drawHorizontalDim, drawVerticalDim,
 *            drawGrid, drawCentreLine,
 *            prepareCanvas, fillAndStrokeSection,
 *            drawTitleBlock
 * ╚══════════════════════════════════════════════════════════╝ */


/* ═══════════════════════════════════════════════════════════
 *  CONSTANTS
 * ═══════════════════════════════════════════════════════════ */

/* ─── Colour Palette (matches concreteSection.js) ────────── */

export const PALETTE = {
  // Section (steel) — light grey base + steel hatch overlay
  steelBase:    "#f5f5f5",
  steelHatch:   "#111111",
  steelStroke:  "#333333",

  // Retained for legacy names used elsewhere
  bg:           "transparent",
  grid:         "transparent",
  gridMajor:    "transparent",
  steel:        "#e6e6e6",
  steelEdge:    "#333333",

  // Shared
  centreLine:   "#888888",
  dimLine:      "#333333",
  text:         "#222222",
  title:        "#1a202c",
  subtitle:     "#4a5568",
  error:        "#c53030",
};

/* ─── Font Definitions ───────────────────────────────────── */

export const FONT = {
  dim:   '12px system-ui, sans-serif',
  title: '600 13px system-ui, sans-serif',
  sub:   '12px system-ui, sans-serif',
  error: '12px system-ui, sans-serif',
};


/* ═══════════════════════════════════════════════════════════
 *  UTILITY FUNCTIONS
 * ═══════════════════════════════════════════════════════════ */

export function getSectionValue(section, possibleKeys) {
  for (const key of possibleKeys) {
    if (section[key] !== undefined && section[key] !== null && section[key] !== "") {
      const val = Number(section[key]);
      if (!Number.isNaN(val)) return val;
    }
  }
  return null;
}


/* ═══════════════════════════════════════════════════════════
 *  HATCH PATTERN (steel — 45° parallel lines)
 * ═══════════════════════════════════════════════════════════ */

/**
 * Same steel hatch as used inside reinforcement bars in
 * concreteSection.js — fine 45° diagonal lines. Cached.
 */
function makeSteelHatch() {
  const size = 20;
  const off  = document.createElement("canvas");
  off.width  = size;
  off.height = size;
  const p = off.getContext("2d");

  p.strokeStyle = PALETTE.steelHatch;
  p.lineWidth   = 0.4;

  p.beginPath();
  p.moveTo(0, size);
  p.lineTo(size, 0);
  // wrap-around helpers so the tile is seamless
  p.moveTo(-1, 1);
  p.lineTo(1, -1);
  p.moveTo(size - 1, size + 1);
  p.lineTo(size + 1, size - 1);
  p.stroke();

  return p.createPattern(off, "repeat");
}

let _steelPattern = null;
function getSteelPattern() {
  if (!_steelPattern) _steelPattern = makeSteelHatch();
  return _steelPattern;
}


/* ═══════════════════════════════════════════════════════════
 *  DRAWING PRIMITIVES
 * ═══════════════════════════════════════════════════════════ */

/* ─── Lines ──────────────────────────────────────────────── */

export function drawLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/* ─── Arrow triangles (concrete-style) ───────────────────── */

/**
 * Legacy-compatible arrowhead: takes a point and a direction
 * vector. Now draws a solid triangle in the same visual style
 * as the concrete drawer.
 */
export function drawArrowhead(ctx, x, y, dx, dy, size = 5) {
  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - size * Math.cos(angle - Math.PI / 6),
    y - size * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x - size * Math.cos(angle + Math.PI / 6),
    y - size * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* Simple 4-direction arrow used internally by dim helpers */
function arrow(ctx, x, y, dir) {
  const s = 5;
  ctx.beginPath();
  switch (dir) {
    case "left":  ctx.moveTo(x, y); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y + s); break;
    case "right": ctx.moveTo(x, y); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s, y + s); break;
    case "up":    ctx.moveTo(x, y); ctx.lineTo(x - s, y + s); ctx.lineTo(x + s, y + s); break;
    case "down":  ctx.moveTo(x, y); ctx.lineTo(x - s, y - s); ctx.lineTo(x + s, y - s); break;
  }
  ctx.closePath();
  ctx.fill();
}

/* ─── Extension line ─────────────────────────────────────── */

export function extensionLine(ctx, x1, y1, x2, y2) {
  ctx.save();
  ctx.strokeStyle = PALETTE.dimLine;
  ctx.lineWidth   = 0.8;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/* ─── Dimension annotations ──────────────────────────────── */

export function drawHorizontalDim(ctx, x1, x2, y, label) {
  ctx.save();
  ctx.strokeStyle = PALETTE.dimLine;
  ctx.fillStyle   = PALETTE.dimLine;
  ctx.lineWidth   = 1;

  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();

  arrow(ctx, x1, y, "left");
  arrow(ctx, x2, y, "right");

  ctx.font         = FONT.dim;
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, (x1 + x2) / 2, y + 6);
  ctx.restore();
}

export function drawVerticalDim(ctx, x, y1, y2, label) {
  ctx.save();
  ctx.strokeStyle = PALETTE.dimLine;
  ctx.fillStyle   = PALETTE.dimLine;
  ctx.lineWidth   = 1;

  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();

  arrow(ctx, x, y1, "up");
  arrow(ctx, x, y2, "down");

  ctx.save();
  ctx.translate(x - 6, (y1 + y2) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font         = FONT.dim;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 0);
  ctx.restore();

  ctx.restore();
}

/* ─── Background grid (retained for API but no-op default) ─ */

/**
 * Retained for backwards-compatibility with any module that
 * imports drawGrid. In the new concrete-aligned style the
 * canvas has no grid — call this only if you deliberately
 * want one.
 */
export function drawGrid(ctx, w, h, step = 20) {
  ctx.save();
  ctx.strokeStyle = "#ececec";
  ctx.lineWidth   = 0.3;
  for (let x = 0; x <= w; x += step) drawLine(ctx, x, 0, x, h);
  for (let y = 0; y <= h; y += step) drawLine(ctx, 0, y, w, y);
  ctx.restore();
}

/* ─── Centre-line dashes ─────────────────────────────────── */

export function drawCentreLine(ctx, x1, y1, x2, y2) {
  ctx.save();
  ctx.strokeStyle = PALETTE.centreLine;
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([6, 3, 1.5, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}


/* ═══════════════════════════════════════════════════════════
 *  CANVAS PREPARATION
 * ═══════════════════════════════════════════════════════════ */

/**
 * Sets up a Hi-DPI canvas and reads the four standard steel
 * dimensions (h, b, tw, tf). Returns null if inputs are
 * missing so section drawers can bail cleanly.
 */
export function prepareCanvas(section, canvasId = "beamCanvas") {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn(`Canvas "${canvasId}" not found.`);
    return null;
  }

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  const cssW = canvas.clientWidth  || canvas.width  || 800;
  const cssH = canvas.clientHeight || canvas.height || 500;

  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const W = cssW;
  const H = cssH;

  if (!section) {
    ctx.fillStyle    = PALETTE.subtitle;
    ctx.font         = FONT.sub;
    ctx.textBaseline = "top";
    ctx.fillText("No section selected", 20, 18);
    return null;
  }

  const h  = getSectionValue(section, ["depth_of_section_h",  "depth_of_section",   "h"]);
  const b  = getSectionValue(section, ["width_of_section_b",  "width_of_section",   "b"]);
  const tw = getSectionValue(section, ["thickness_web_tw",    "web_thickness_tw",   "tw"]);
  const tf = getSectionValue(section, ["thickness_flange_tf", "flange_thickness_tf","tf"]);

  if ([h, b, tw, tf].some(v => v === null)) {
    ctx.fillStyle    = PALETTE.error;
    ctx.font         = FONT.error;
    ctx.textBaseline = "top";
    ctx.fillText("Missing h, b, tw or tf — check section object.", 20, 18);
    console.log("Section keys:", Object.keys(section));
    return null;
  }

  return { ctx, W, H, h, b, tw, tf };
}


/* ═══════════════════════════════════════════════════════════
 *  SECTION RENDERING
 * ═══════════════════════════════════════════════════════════ */

/**
 * Concrete-aligned two-pass fill & stroke:
 *   1. Light grey base fill
 *   2. Steel hatch overlay (45° lines)
 *   3. Dark grey outline
 *
 * The drawPath callback is expected to trace the current
 * section shape (I, C, L, tube, circle, …).
 */
export function fillAndStrokeSection(ctx, left, top, right, bottom, drawPath) {
  // 1) base fill
  ctx.save();
  drawPath();
  ctx.fillStyle = PALETTE.steelBase;
  ctx.fill();
  ctx.restore();

  // 2) hatch overlay, clipped to the section
  ctx.save();
  drawPath();
  ctx.clip();
  ctx.fillStyle = getSteelPattern();
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.restore();

  // 3) outline
  ctx.save();
  drawPath();
  ctx.strokeStyle = PALETTE.steelStroke;
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.restore();
}

/* ─── Title Block ────────────────────────────────────────── */

export function drawTitleBlock(ctx, section, h, b, tw, tf) {
  const name = section.section || "Selected Section";

  ctx.save();
  ctx.fillStyle    = PALETTE.text;
  ctx.font         = FONT.title;
  ctx.textAlign    = "left";
  ctx.textBaseline = "top";

  const lines = [
    `Steel section: ${name}`,
    `h = ${h} mm    b = ${b} mm`,
    `tw = ${tw} mm    tf = ${tf} mm`,
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, 20, 18 + i * 16));
  ctx.restore();
}