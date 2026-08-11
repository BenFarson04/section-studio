/* ╔══════════════════════════════════════════════════════════╗
 *  arrow.js
 *
 *  Draws styled directional arrows on the beam canvas.
 *
 *  Supports:
 *    - Standard directional arrows
 *    - Load arrows which flip direction automatically
 *      depending on whether the load value is positive or negative
 *
 *  Canvas convention:
 *    - Larger y value is lower on the screen
 *    - Positive load values draw downward arrows
 *    - Negative load values draw upward arrows
 *
 *  Dependencies:  canvas/setup.js
 * ╚══════════════════════════════════════════════════════════╝ */


/* ─── Imports ────────────────────────────────────────────── */

import { ctx } from "../canvas/setup.js";


/* ═══════════════════════════════════════════════════════════
 *  PUBLIC ARROW DRAWING HELPERS
 * ═══════════════════════════════════════════════════════════ */

/**
 * Draws a basic arrow between two y-coordinates.
 *
 * This keeps the old behaviour for existing point-load / UDL code.
 * If yBottom is greater than yTop, the arrow points down.
 * If yBottom is less than yTop, the arrow points up.
 */
export function drawArrow(x, yTop, yBottom, colour = "black") {
  const isDownward = yBottom >= yTop;

  drawDirectionalArrow({
    x,
    yTop,
    yBottom,
    isDownward,
    colour
  });
}


/**
 * Draws a load arrow and automatically flips direction based on sign.
 *
 * Positive load  → downward arrow
 * Negative load  → upward arrow
 * Zero / invalid → downward arrow by default
 *
 * @param {number} x - Arrow x-coordinate.
 * @param {number} yTop - Upper y-coordinate of arrow zone.
 * @param {number} yBottom - Lower y-coordinate of arrow zone.
 * @param {number} loadValue - Point load or UDL value.
 * @param {string} colour - Arrow colour.
 */
export function drawLoadArrow(
  x,
  yTop,
  yBottom,
  loadValue,
  colour = "black"
) {
  const numericLoad = Number(loadValue);
  const isDownward = !(numericLoad < 0);

  drawDirectionalArrow({
    x,
    yTop,
    yBottom,
    isDownward,
    colour
  });
}


/**
 * Optional convenience helper.
 *
 * Use this if your existing calling code already decides whether
 * the load is a UDL or point load, but you want one consistent
 * sign check before drawing arrows.
 */
export function isNegativeLoad(loadValue) {
  return Number(loadValue) < 0;
}


/* ═══════════════════════════════════════════════════════════
 *  INTERNAL ARROW RENDERER
 * ═══════════════════════════════════════════════════════════ */

function drawDirectionalArrow({
  x,
  yTop,
  yBottom,
  isDownward = true,
  colour = "black"
}) {
  ctx.save();

  const top = Math.min(yTop, yBottom);
  const bottom = Math.max(yTop, yBottom);

  const headSize = 8;
  const headOffset = 10;

  const tailY = isDownward ? top : bottom;
  const tipY = isDownward ? bottom : top;
  const headBaseY = isDownward
    ? tipY - headOffset
    : tipY + headOffset;

  const shaftEndY = headBaseY;

  const {
    baseColor,
    accentColor,
    glowColor
  } = getArrowColours(colour);

  // Shaft with gradient taper
  const gradient = ctx.createLinearGradient(x, tailY, x, tipY);
  gradient.addColorStop(0, accentColor);
  gradient.addColorStop(0.7, baseColor);

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(x, tailY);
  ctx.lineTo(x, shaftEndY);
  ctx.stroke();

  // Shadow layer
  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.moveTo(x, tipY + (isDownward ? 1 : -1));
  ctx.lineTo(x - headSize - 1, headBaseY + (isDownward ? 1 : -1));
  ctx.lineTo(x + headSize + 1, headBaseY + (isDownward ? 1 : -1));
  ctx.closePath();
  ctx.fill();

  // Main arrowhead
  const headGradient = ctx.createLinearGradient(
    x - headSize,
    headBaseY,
    x + headSize,
    headBaseY
  );

  headGradient.addColorStop(0, baseColor);
  headGradient.addColorStop(0.5, accentColor);
  headGradient.addColorStop(1, baseColor);

  ctx.fillStyle = headGradient;
  ctx.beginPath();
  ctx.moveTo(x, tipY);
  ctx.lineTo(x - headSize, headBaseY);
  ctx.lineTo(x + headSize, headBaseY);
  ctx.closePath();
  ctx.fill();

  // Highlight edge
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - headSize, headBaseY);
  ctx.lineTo(x, tipY);
  ctx.stroke();

  ctx.restore();
}


/* ═══════════════════════════════════════════════════════════
 *  COLOUR HELPERS
 * ═══════════════════════════════════════════════════════════ */

function getArrowColours(colour = "black") {
  const colourText = String(colour);

  if (colourText === "red" || colourText.includes("239")) {
    return {
      baseColor: "#dc2626",
      accentColor: "#ef4444",
      glowColor: "rgba(239, 68, 68, 0.3)"
    };
  }

  if (colourText === "blue" || colourText.includes("37")) {
    return {
      baseColor: "#1d4ed8",
      accentColor: "#3b82f6",
      glowColor: "rgba(59, 130, 246, 0.3)"
    };
  }

  return {
    baseColor: "#1e293b",
    accentColor: "#475569",
    glowColor: "rgba(71, 85, 105, 0.3)"
  };
}
