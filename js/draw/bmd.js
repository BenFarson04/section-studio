/* ╔══════════════════════════════════════════════════════════╗
 *  bmd.js
 *
 *  Draws the Bending Moment Diagram (BMD) on the beam
 *  canvas, including hatched fill, zero axis, and labelled
 *  extreme value markers.
 *
 *  Dependencies:  canvas/setup.js, canvas/math.js,
 *                 canvas/layout.js, analysis/bending.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { ctx } from "../canvas/setup.js";
import { beamXFromMetres } from "../canvas/math.js";
import { getBendingResults } from "../analysis/bending.js";
import { getLayout } from "../canvas/layout.js";

/* ─── Hatch Pattern Cache ────────────────────────────────── */

let bmdHatchPattern = null;

function getBMDHatchPattern(ctx) {
  if (bmdHatchPattern) return bmdHatchPattern;

  const p = document.createElement("canvas");
  p.width = 8;
  p.height = 8;

  const pctx = p.getContext("2d");
  pctx.strokeStyle = "rgba(37, 99, 235, 0.30)";
  pctx.lineWidth = 1;

  pctx.beginPath();
  pctx.moveTo(0, 8);
  pctx.lineTo(8, 0);
  pctx.stroke();

  bmdHatchPattern = ctx.createPattern(p, "repeat");
  return bmdHatchPattern;
}

/* ─── Bending Moment Diagram ─────────────────────────────── */

export function drawBendingDiagram() {
  const res = getBendingResults();
  if (!res || !res.ok) return;

  const { x, M, meta } = res;

  const { bmdAxisY } = getLayout();
  const axisY = bmdAxisY;
  const height = 90;
  const padding = 8;

  const absMax = meta && meta.absMax ? meta.absMax : 1;
  const usable = Math.max(10, height - 2 * padding);
  const scale = absMax < 1e-9 ? 1 : usable / absMax;

  let Mdraw = M;

  const yFromM = (Mi) => axisY + Mi * scale;

  ctx.save();
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2;

  // Zero axis
  ctx.beginPath();
  ctx.moveTo(beamXFromMetres(x[0]), axisY);
  ctx.lineTo(beamXFromMetres(x[x.length - 1]), axisY);
  ctx.stroke();

  // Filled area
  const x0 = beamXFromMetres(x[0]);
  const xN = beamXFromMetres(x[x.length - 1]);

  ctx.beginPath();
  ctx.moveTo(x0, axisY);
  ctx.lineTo(x0, yFromM(Mdraw[0]));

  for (let i = 1; i < x.length; i++) {
    ctx.lineTo(beamXFromMetres(x[i]), yFromM(Mdraw[i]));
  }

  ctx.lineTo(xN, axisY);
  ctx.closePath();

  ctx.fillStyle = getBMDHatchPattern(ctx);
  ctx.fill();
  ctx.stroke();

  // Diagram label
  ctx.fillStyle = "#2563eb";
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.fillText("BMD", beamXFromMetres(0) + 6, axisY + height / 2);

  ctx.restore();

  // Extreme value markers & labels
  if (meta) {
    const xPos = beamXFromMetres(meta.maxPos.x);
    const yPos = yFromM(meta.maxPos.value);

    const xNeg = beamXFromMetres(meta.maxNeg.x);
    const yNeg = yFromM(meta.maxNeg.value);

    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(xPos, yPos, 4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(xNeg, yNeg, 4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillText(`${meta.maxPos.value.toFixed(1)} kNm`, xPos, yPos - 10);
    ctx.fillText(`${meta.maxNeg.value.toFixed(1)} kNm`, xNeg, yNeg - 10);
  }
}