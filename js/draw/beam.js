/* ╔══════════════════════════════════════════════════════════╗
 *  beam.js
 *
 *  Draws the main beam line on the canvas between the
 *  start and end positions defined by the current layout.
 *
 *  Dependencies:  canvas/setup.js, canvas/layout.js
 * ╚══════════════════════════════════════════════════════════╝ */

import { ctx } from "../canvas/setup.js";
import { getLayout } from "../canvas/layout.js";

export function drawBeam() {
  const { beamStartX, beamY, lengthPx } = getLayout();

  ctx.beginPath();
  ctx.moveTo(beamStartX, beamY);
  ctx.lineTo(beamStartX + lengthPx, beamY);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "black";
  ctx.stroke();
}