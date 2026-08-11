/* ╔══════════════════════════════════════════════════════════╗
 *  index.js  (draw)
 *
 *  Main draw orchestrator for the beam canvas. Calls each
 *  drawing layer in order: grid → beam → supports → loads →
 *  diagrams → scale bar, all clipped to the plot region.
 *
 *  Dependencies:  canvas/setup.js, canvas/layout.js,
 *                 draw/*.js (all drawing modules)
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { resizeCanvas, ctx, drawGrid } from "../canvas/setup.js";
import { getLayout, clipToPlot } from "../canvas/layout.js";
import { drawBeam } from "./beam.js";
import { drawSupports } from "./supports.js";
import { drawUDLs } from "./udls.js";
import { drawPointLoads } from "./pointLoads.js";
import { drawScaleBar } from "./scaleBar.js";
import { drawShearDiagram } from "./sfd.js";
import { drawBendingDiagram } from "./bmd.js";

/* ─── Draw Orchestrator ──────────────────────────────────── */

export function draw({ showDiagrams = false } = {}) {
  resizeCanvas();

  const layout = getLayout();

  // Grid first (clears canvas)
  drawGrid(layout);

  // Clip everything to the plot region
  clipToPlot(ctx, layout.plot);

  // Always drawn — updates live as you add/remove supports & loads
  drawBeam();
  drawSupports();
  drawUDLs();
  drawPointLoads();

  // Only drawn after Calculate is clicked
  if (showDiagrams) {
    drawShearDiagram();
    drawBendingDiagram();
  }

  drawScaleBar();

  // Restore after clipping
  ctx.restore();
}