/* ╔══════════════════════════════════════════════════════════╗
 *  udls.js
 *
 *  Draws uniformly distributed load (UDL) indicators on the
 *  beam canvas — a connecting top line with evenly spaced
 *  arrows between the start and end positions.
 *
 *  Dependencies:  canvas/setup.js, canvas/math.js,
 *                 state/store.js, arrow.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { ctx } from "../canvas/setup.js";
import { udls, getBeamLength, getScale } from "../state/store.js";
import { beamStartX, beamY } from "../canvas/math.js";
import { drawArrow } from "./arrow.js";

/* ─── UDL Drawing ────────────────────────────────────────── */

export function drawUDLs() {
  const scale = getScale();
  const lengthMetres = getBeamLength();
  const lengthPx = lengthMetres * scale;

  const startX = beamStartX();
  const yBeam = beamY();

  udls.forEach(udl => {

    const x1 = startX + udl.start * scale;
    const x2 = startX + udl.end * scale;

    // Height scale for visualisation (not the horizontal scale)
    const k = 3;

    const yTop1 = yBeam - udl.startLoad * k;
    const yTop2 = yBeam - udl.endLoad * k;

    // Connecting top line
    ctx.beginPath();
    ctx.moveTo(x1, yTop1);
    ctx.lineTo(x2, yTop2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "blue";
    ctx.stroke();

    // Evenly spaced arrows
    const arrowSpacing = 10;
    const L = x2 - x1;
    for (let x = x1; x <= x2; x += arrowSpacing) {
      const t = L === 0 ? 0 : (x - x1) / L;
      const yTop = yTop1 + t * (yTop2 - yTop1);
      drawArrow(x, yTop, yBeam, "blue");
    }
  });
}