/* ╔══════════════════════════════════════════════════════════╗
 *  math.js
 *
 *  Convenience accessors for converting beam-space values
 *  (metres) to canvas-space pixel coordinates via the
 *  current layout.
 *
 *  Dependencies:  canvas/layout.js
 * ╚══════════════════════════════════════════════════════════╝ */

import { getLayout } from "./layout.js";

export function beamXFromMetres(xMetres) {
  const { beamStartX, scale } = getLayout();
  return beamStartX + xMetres * scale;
}

export function beamStartX() {
  return getLayout().beamStartX;
}

export function beamY() {
  return getLayout().beamY;
}