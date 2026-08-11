/* ╔══════════════════════════════════════════════════════════╗
 *  concreteSection.js
 *
 *  Draws a Reinforced Concrete rectangular section preview
 *  on the manualDesigner canvas. Reads width, depth, cover,
 *  link Ø / spacing and top/bottom reinforcement layers via
 *  getConcreteSectionInput() from the material-toggle module.
 * ╚══════════════════════════════════════════════════════════╝ */

import { getConcreteSectionInput }
  from "../../state/manualDesignerMaterialToggle.js";


/* ─── Palette (self-contained) ───────────────────────────── */

const PALETTE = {
  concreteBase:     "#e6e6e6",   // light grey base
  concreteHatch:    "#7a7a7a",   // faint dot / aggregate marks
  concreteStroke:   "#333333",

  link:             "#111111",   // black links
  linkStroke:       "#111111",

  bar:              "#111111",   // bar outline + hatch lines
  barBackground:    "#ffffff",   // inside of bar (so hatch reads clean)

  centreLine:       "#888888",
  dimLine:          "#333333",
  text:             "#222222",
};


/* ─── Canvas prep (Hi-DPI) ───────────────────────────────── */

function prepareCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  const cssW = canvas.clientWidth  || canvas.width  || 800;
  const cssH = canvas.clientHeight || canvas.height || 500;

  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  return { ctx, W: cssW, H: cssH };
}


/* ─── Hatch patterns ─────────────────────────────────────── */

/**
 * AR-CONC style concrete hatch: light grey base + scattered dots
 * and small triangular aggregate marks. Rendered on an offscreen
 * canvas and returned as a repeating CanvasPattern.
 */
function makeConcreteHatch() {
  const size = 50;
  const off  = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const p = off.getContext("2d");

  // Base fill
  p.fillStyle = PALETTE.concreteBase;
  p.fillRect(0, 0, size, size);

  // Faint dots (stippling)
  p.fillStyle = PALETTE.concreteHatch;
  const dots = [
    [ 6,  9], [14, 22], [23,  6], [31, 17], [40, 28],
    [ 9, 34], [19, 41], [28, 38], [37,  8], [44, 42],
    [ 4, 25], [34, 32], [21, 29], [11, 16], [45, 15],
  ];
  dots.forEach(([x, y]) => {
    p.beginPath();
    p.arc(x, y, 0.9, 0, Math.PI * 2);
    p.fill();
  });

  // Small aggregate triangles (very faint)
  p.strokeStyle = PALETTE.concreteHatch;
  p.lineWidth = 0.5;
  const tris = [
    { x: 12, y: 12, s: 3.5, rot: 0.2 },
    { x: 34, y: 22, s: 3.0, rot: 1.1 },
    { x: 20, y: 34, s: 3.2, rot: 2.4 },
    { x: 42, y:  6, s: 2.6, rot: 0.8 },
    { x:  6, y: 42, s: 2.8, rot: 1.7 },
  ];
  tris.forEach(({ x, y, s, rot }) => {
    p.save();
    p.translate(x, y);
    p.rotate(rot);
    p.beginPath();
    p.moveTo(0, -s);
    p.lineTo( s * 1.2,  s * 1.2);
    p.lineTo(-s * 1.2,  s * 1.2);
    p.closePath();
    p.stroke();
    p.restore();
  });

  return p.createPattern(off, "repeat");
}

/**
 * Steel hatch: fine parallel diagonal lines at 45°.
 * Used inside reinforcement bar circles.
 */
function makeSteelHatch() {
  const size = 4;
  const off  = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const p = off.getContext("2d");

  p.strokeStyle = PALETTE.bar;
  p.lineWidth   = 0.8;

  // Diagonal from bottom-left to top-right, tile-safe
  p.beginPath();
  p.moveTo(0, size);
  p.lineTo(size, 0);
  // wrap-around helpers so the pattern is seamless
  p.moveTo(-1, 1);
  p.lineTo(1, -1);
  p.moveTo(size - 1, size + 1);
  p.lineTo(size + 1, size - 1);
  p.stroke();

  return p.createPattern(off, "repeat");
}

// Cached patterns (rebuilt on first call after any reload)
let _concretePattern = null;
let _steelPattern    = null;

function getConcretePattern() {
  if (!_concretePattern) _concretePattern = makeConcreteHatch();
  return _concretePattern;
}
function getSteelPattern() {
  if (!_steelPattern) _steelPattern = makeSteelHatch();
  return _steelPattern;
}


/* ─── Low-level drawing helpers ──────────────────────────── */

function drawCentreLine(ctx, x1, y1, x2, y2) {
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

function extensionLine(ctx, x1, y1, x2, y2) {
  ctx.save();
  ctx.strokeStyle = PALETTE.dimLine;
  ctx.lineWidth   = 0.8;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

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

function drawHorizontalDim(ctx, x1, x2, y, label) {
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
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, (x1 + x2) / 2, y + 6);
  ctx.restore();
}

function drawVerticalDim(ctx, x, y1, y2, label) {
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
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.translate(x - 6, (y1 + y2) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 0);
  ctx.restore();
  ctx.restore();
}


/* ─── Section-specific helpers ───────────────────────────── */

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y,       x + w, y + rr,     rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h,   x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h,       x, y + h - rr,     rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y,           x + rr, y,         rr);
  ctx.closePath();
}

/**
 * Hollow reinforcement bar filled with a steel hatch.
 * Falls back to solid black for very small bars where the hatch
 * would just look like a noisy dot.
 */
function drawBar(ctx, cx, cy, r) {
  ctx.save();

  if (r < 3) {
    // too small for a legible hatch — draw solid
    ctx.fillStyle = PALETTE.bar;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // 1) white background so hatch reads cleanly over concrete
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.barBackground;
  ctx.fill();

  // 2) steel hatch, clipped to the circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = getSteelPattern();
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // 3) outline
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = PALETTE.bar;
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.restore();
}


/* ─── Reinforcement layout ───────────────────────────────── */

function drawBarRow(ctx, n, sBarDia, xLeftInner, xRightInner, y) {
  if (n <= 0) return;
  const r = sBarDia / 2;
  const xL = xLeftInner  + r;
  const xR = xRightInner - r;

  if (n === 1) {
    drawBar(ctx, (xL + xR) / 2, y, r);
    return;
  }
  const step = (xR - xL) / (n - 1);
  for (let k = 0; k < n; k++) drawBar(ctx, xL + k * step, y, r);
}

function drawReinforcementStack(ctx, layers, zone, geom) {
  if (!layers?.length) return;

  const {
    left, right, top, bottom,
    sCover, sLinkDia, scale,
  } = geom;

  const clearIn = sCover + sLinkDia;
  const dir     = zone === "top" ? +1 : -1;
  let   yCentre = zone === "top" ? top + clearIn : bottom - clearIn;

  let prevBarDia = 0;

  layers.forEach((layer, i) => {
    const n   = Number(layer.numberOfBars) || 0;
    const dia = Number(layer.barDiameter)  || 0;
    if (n <= 0 || dia <= 0) return;

    const sBarDia = Math.max(dia * scale, 2);

    if (i === 0) {
      yCentre += dir * sBarDia / 2;
    } else {
      const clearSpMm = Math.max(Math.max(dia, prevBarDia), 25);
      yCentre += dir * (prevBarDia * scale / 2 + clearSpMm * scale + sBarDia / 2);
    }

    drawBarRow(
      ctx, n, sBarDia,
      left  + clearIn,
      right - clearIn,
      yCentre
    );

    prevBarDia = dia;
  });
}


/* ─── Title block ────────────────────────────────────────── */

function drawTitleBlock(ctx, cfg) {
  const { grade, width, depth, cover, linkDiameter, linkSpacing, topBars, bottomBars } = cfg;

  const summary = (layers) => {
    const valid = layers.filter(l => l.numberOfBars > 0 && l.barDiameter > 0);
    return valid.length
      ? valid.map(l => `${l.numberOfBars}H${l.barDiameter}`).join(" + ")
      : "—";
  };

  ctx.save();
  ctx.fillStyle = PALETTE.text;
  ctx.font      = "600 13px system-ui, sans-serif";
  ctx.textBaseline = "top";

  const lines = [
    `RC Section  ${width} × ${depth} mm   (${grade})`,
    `Cover: ${cover} mm    Links: H${linkDiameter} @ ${linkSpacing} mm`,
    `Top:    ${summary(topBars)}`,
    `Bottom: ${summary(bottomBars)}`,
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, 20, 18 + i * 16));
  ctx.restore();
}


/* ─── Main Drawing Function ──────────────────────────────── */

export function drawConcreteSection(canvasId = "beamCanvas") {
  const prep = prepareCanvas(canvasId);
  if (!prep) return;

  const cfg = getConcreteSectionInput();
  const { width: b, depth: h, cover, linkDiameter, topBars, bottomBars } = cfg;

  if (!(b > 0) || !(h > 0)) return;

  const { ctx, W, H } = prep;

  /* — Scale & margins — */
  const margin = { left: 120, right: 100, top: 70, bottom: 90 };
  const scale  = Math.min(
    (W - margin.left - margin.right) / b,
    (H - margin.top  - margin.bottom) / h
  );

  const sB       = b       * scale;
  const sH       = h       * scale;
  const sCover   = cover   * scale;
  const sLinkDia = Math.max(linkDiameter * scale, 1);

  const cx     = W / 2,       cy     = H / 2;
  const left   = cx - sB / 2, right  = cx + sB / 2;
  const top    = cy - sH / 2, bottom = cy + sH / 2;

  /* — Centre lines — */
  drawCentreLine(ctx, cx, top, cx, bottom);
  drawCentreLine(ctx, left, cy, right, cy);

  /* — Concrete: light grey base + AR-CONC hatch — */
  ctx.save();
  // base fill
  ctx.fillStyle = PALETTE.concreteBase;
  ctx.fillRect(left, top, sB, sH);
  // hatch overlay
  ctx.fillStyle = getConcretePattern();
  ctx.fillRect(left, top, sB, sH);
  // outline
  ctx.strokeStyle = PALETTE.concreteStroke;
  ctx.lineWidth   = 2;
  ctx.strokeRect(left, top, sB, sH);
  ctx.restore();

  /* — Link (stirrup) — black — */
  const linkLeft   = left   + sCover;
  const linkRight  = right  - sCover;
  const linkTop    = top    + sCover;
  const linkBottom = bottom - sCover;
  const linkR      = Math.max(sLinkDia * 1.5, 6);

  if (linkRight > linkLeft && linkBottom > linkTop) {
    ctx.save();
    ctx.strokeStyle = PALETTE.link;
    ctx.lineWidth   = Math.max(sLinkDia, 1.4);
    roundedRectPath(
      ctx,
      linkLeft, linkTop,
      linkRight - linkLeft,
      linkBottom - linkTop,
      linkR
    );
    ctx.stroke();
    ctx.restore();
  }

  /* — Reinforcement — */
  const geom = { left, right, top, bottom, sCover, sLinkDia, scale };
  drawReinforcementStack(ctx, topBars,    "top",    geom);
  drawReinforcementStack(ctx, bottomBars, "bottom", geom);

  /* — Dimensions — */
  const hDimX = left - 50;
  extensionLine(ctx, left, top,    hDimX - 4, top);
  extensionLine(ctx, left, bottom, hDimX - 4, bottom);
  drawVerticalDim(ctx, hDimX, top, bottom, `h = ${h} mm`);

  const bDimY = bottom + 40;
  extensionLine(ctx, left,  bottom, left,  bDimY + 4);
  extensionLine(ctx, right, bottom, right, bDimY + 4);
  drawHorizontalDim(ctx, left, right, bDimY, `b = ${b} mm`);

  const cDimX = right + 40;
  extensionLine(ctx, right, top,          cDimX + 4, top);
  extensionLine(ctx, right, top + sCover, cDimX + 4, top + sCover);
  drawVerticalDim(ctx, cDimX, top, top + sCover, `c = ${cover} mm`);

  /* — Title — */
  drawTitleBlock(ctx, cfg);
}