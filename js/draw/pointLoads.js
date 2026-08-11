/* ╔══════════════════════════════════════════════════════════╗
 *  pointLoads.js
 *
 *  Draws point load arrows on the beam canvas at each
 *  location defined in the shared pointLoads array.
 *
 *  Dependencies:  state/store.js, canvas/math.js, arrow.js
 * ╚══════════════════════════════════════════════════════════╝ */

import { pointLoads } from "../state/store.js";
import { beamXFromMetres, beamY } from "../canvas/math.js";
import { drawArrow } from "./arrow.js";

export function drawPointLoads() {
  const y = beamY();

  pointLoads.forEach(pl => {
    const x = beamXFromMetres(pl.location);
    const arrowTopY = y - (pl.load * 5);
    drawArrow(x, arrowTopY, y, "red");
  });
}