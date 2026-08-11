/* ╔══════════════════════════════════════════════════════════╗
 *  sfd.js
 *
 *  Draws the Shear Force Diagram (SFD) on the beam canvas,
 *  including hatched fill, zero axis, and labelled extreme
 *  value markers.
 *
 *  Dependencies:  canvas/setup.js, canvas/math.js,
 *                 canvas/layout.js, analysis/shear.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { ctx } from "../canvas/setup.js";
import { beamXFromMetres } from "../canvas/math.js";
import { getShearResults } from "../analysis/shear.js";
import { getLayout } from "../canvas/layout.js";

/* ─── Hatch Pattern Cache ────────────────────────────────── */

let sfdHatchPattern = null;

function getSFDHatchPattern(ctx) {
  if (sfdHatchPattern) return sfdHatchPattern;

  const p = document.createElement("canvas");
  p.width = 8;
  p.height = 8;

  const pctx = p.getContext("2d");
  pctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
  pctx.lineWidth = 1;

  pctx.beginPath();
  pctx.moveTo(0, 8);
  pctx.lineTo(8, 0);
  pctx.stroke();

  sfdHatchPattern = ctx.createPattern(p, "repeat");
  return sfdHatchPattern;
}

/* ─── Shear Force Diagram ────────────────────────────────── */

export function drawShearDiagram() {
  const res = getShearResults();
  if (!res || !res.ok) return;

  const { x, V, meta } = res;

  const { sfdAxisY } = getLayout();
  const baseY = sfdAxisY;
  const height = 90;
  const padding = 8;

  const absMax = meta && meta.absMax ? meta.absMax : 1;
  const usable = Math.max(10, height - 2 * padding);
  const scale = absMax < 1e-9 ? 1 : usable / (2 * absMax);

  ctx.save();
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 2;

  // Zero axis
  ctx.beginPath();
  ctx.moveTo(beamXFromMetres(x[0]), baseY);
  ctx.lineTo(beamXFromMetres(x[x.length - 1]), baseY);
  ctx.stroke();

  // Filled area
  ctx.beginPath();
  ctx.moveTo(beamXFromMetres(x[0]), baseY);
  ctx.lineTo(beamXFromMetres(x[0]), baseY - V[0] * scale);

  for (let i = 1; i < x.length; i++) {
    ctx.lineTo(beamXFromMetres(x[i]), baseY - V[i] * scale);
  }

  ctx.lineTo(beamXFromMetres(x[x.length - 1]), baseY);
  ctx.closePath();

  ctx.fillStyle = getSFDHatchPattern(ctx);
  ctx.fill();
  ctx.stroke();

  // Diagram label
  ctx.fillStyle = "#ef4444";
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.fillText("SFD", beamXFromMetres(0) + 6, baseY - height / 2);

  ctx.restore();

  // Extreme value markers & labels
  if (meta) {
    const xPos = beamXFromMetres(meta.maxPos.x);
    const yPos = baseY - meta.maxPos.value * scale;

    const xNeg = beamXFromMetres(meta.maxNeg.x);
    const yNeg = baseY - meta.maxNeg.value * scale;

    ctx.fillStyle = "#ef4444";

    ctx.beginPath();
    ctx.arc(xPos, yPos, 4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(xNeg, yNeg, 4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${meta.maxPos.value.toFixed(1)} kN`, xPos, yPos - 10);
    ctx.fillText(`${meta.maxNeg.value.toFixed(1)} kN`, xNeg, yNeg - 10);
  }
}