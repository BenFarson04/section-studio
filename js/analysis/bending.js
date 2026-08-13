/* ╔══════════════════════════════════════════════════════════╗
 *  bending.js
 *
 *  Computes the bending moment diagram (BMD) by sampling
 *  moment values along the beam. Handles both simply
 *  supported and cantilever configurations. Persists results
 *  to sessionStorage for use on the design page.
 *
 *  Dependencies:  state/store.js, analysis/reactions.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import {
  supports, udls, pointLoads, getBeamLength,
  saveBendingToSession, loadBendingFromSession
} from "../state/store.js";
import { solveReactions } from "./reactions.js";


/* ═══════════════════════════════════════════════════════════
 *  BENDING ANALYSIS
 * ═══════════════════════════════════════════════════════════ */

let lastResult = null;

/* ─── Compute Bending Diagram ────────────────────────────── */

export function computeBending(opts = {}) {
  const samples = opts.samples || 200;
  const result = solveReactions();

  if (!result.ok) {
    lastResult = { ok: false, message: result.message };
    return lastResult;
  }

  const L = getBeamLength();
  const dx = L / samples;

  const x = [];
  const M = [];

  let maxPos = { value: -Infinity, x: 0 };
  let maxNeg = { value: Infinity, x: 0 };
  let absMax = 0;

  for (let i = 0; i <= samples; i++) {
    const xi = i * dx;
    const Mi = momentAt(xi, result);

    x.push(xi);
    M.push(Mi);

    if (Mi > maxPos.value) {
      maxPos = { value: Mi, x: xi };
    }
    if (Mi < maxNeg.value) {
      maxNeg = { value: Mi, x: xi };
    }
    absMax = Math.max(absMax, Math.abs(Mi));
  }

  lastResult = {
    ok: true,
    x,
    M,
    meta: { maxPos, maxNeg, absMax }
  };

  saveBendingToSession(lastResult);

  return lastResult;
}

/* ─── Results Accessors ──────────────────────────────────── */

export function getBendingResults() {
  return lastResult;
}

export function restoreBendingFromSession() {
  const stored = loadBendingFromSession();
  if (stored) lastResult = stored;
  return lastResult;
}


/* ═══════════════════════════════════════════════════════════
 *  MOMENT CALCULATION
 * ═══════════════════════════════════════════════════════════ */

function momentAt(x, reactionResult) {
  let M = 0;

  const isCantilever = reactionResult.type === "cantilever";

  if (isCantilever) {
    /*
     * Cantilever:
     * Sum the moments from loads to the right of the cut.
     *
     *  With the current sign convention used elsewhere:
     *   - downward loads are negative
     *   - hogging moments should therefore remain negative
     *
     * Do not flip the sign here, otherwise a true hogging
     * cantilever moment appears as positive sagging.
     */
    pointLoads.forEach(pl => {
      if (pl.location > x) {
        M += pl.load * (pl.location - x);
      }
    });

    udls.forEach(udl => {
      const a = udl.start;
      const b = udl.end;
      const w1 = udl.startLoad;
      const w2 = udl.endLoad;

      if (x >= b) return;

      const xStart = Math.max(x, a);
      const len = b - xStart;

      if (len <= 0) return;

      const wStart = w1 + (w2 - w1) * (xStart - a) / (b - a);
      const wEnd = w2;

      const rectLoad = wStart * len;
      const triLoad = 0.5 * (wEnd - wStart) * len;

      const rectCentroid = xStart + len / 2;
      const triCentroid = xStart + (2 * len / 3);

      M += rectLoad * (rectCentroid - x);
      M += triLoad * (triCentroid - x);
    });

  } else {
    // Sum moments from reactions and loads to the left of x
    reactionResult.reactions.forEach(r => {
      if (r.x < x && r.Rv !== undefined) {
        M += r.Rv * (x - r.x);
      }
    });

    pointLoads.forEach(pl => {
      if (pl.location < x) {
        M -= pl.load * (x - pl.location);
      }
    });

    udls.forEach(udl => {
      const a = udl.start;
      const b = udl.end;
      const w1 = udl.startLoad;
      const w2 = udl.endLoad;

      if (x <= a) return;

      const xEval = Math.min(x, b);
      const len = xEval - a;

      const rectLoad = w1 * len;
      const triLoad = 0.5 * (w2 - w1) * len / (b - a) * len;

      const rectCentroid = a + len / 2;
      const triCentroid = a + (2 * len / 3);

      M -= rectLoad * (x - rectCentroid);
      M -= triLoad * (x - triCentroid);
    });
  }

  return M;
}
