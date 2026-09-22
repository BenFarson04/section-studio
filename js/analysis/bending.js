/* ╔══════════════════════════════════════════════════════════╗
 *  bending.js
 *
 *  Computes the bending moment diagram (BMD) by evaluating
 *  the internal moment at cuts along the beam.
 *
 *  Sign convention:
 *    - downward loads are negative,
 *    - upward reactions are positive,
 *    - positive moment is sagging (concave up).
 *
 *  Dependencies:  state/store.js, analysis/reactions.js
 * ╚══════════════════════════════════════════════════════════╝ */

import {
  supports,
  udls,
  pointLoads,
  getBeamLength,
  saveBendingToSession,
  loadBendingFromSession,
} from "../state/store.js";
import { solveReactions } from "./reactions.js";

let lastResult = null;

function udlForceToLeft(udl, x) {
  const a = Number(udl.start);
  const b = Number(udl.end);
  const q1 = Number(udl.startLoad ?? 0);
  const q2 = Number(udl.endLoad ?? 0);

  if (x <= a) return 0;

  const c = Math.min(x, b);
  const L = c - a;
  if (L <= 0) return 0;

  const qAtC = q1 + (q2 - q1) * (L / (b - a || 1));
  return 0.5 * (q1 + qAtC) * L;
}

function udlMomentToLeft(udl, x) {
  const a = Number(udl.start);
  const b = Number(udl.end);
  const q1 = Number(udl.startLoad ?? 0);
  const q2 = Number(udl.endLoad ?? 0);

  if (x <= a) return 0;

  const c = Math.min(x, b);
  const L = c - a;
  if (L <= 0) return 0;

  const qAtC = q1 + (q2 - q1) * (L / (b - a || 1));
  const totalLoad = 0.5 * (q1 + qAtC) * L;

  if (Math.abs(totalLoad) < 1e-12) return 0;

  const centroidFromStart = L * (q1 + 2 * qAtC) / (3 * (q1 + qAtC || 1));
  const centroidX = a + centroidFromStart;
  return totalLoad * (x - centroidX);
}

function shearAt(x, reactionResult) {
  let V = 0;

  reactionResult.reactions.forEach((r) => {
    if (r.x <= x && r.Rv !== undefined) {
      V += r.Rv;
    }
  });

  pointLoads.forEach((pl) => {
    if (pl.location <= x) {
      V -= pl.load;
    }
  });

  udls.forEach((udl) => {
    if (x > udl.start) {
      V -= udlForceToLeft(udl, x);
    }
  });

  return V;
}

function momentAt(x, reactionResult) {
  if (!reactionResult || !reactionResult.ok) return NaN;

  let M = 0;

  reactionResult.reactions.forEach((r) => {
    if (r.x <= x && r.Rv !== undefined) {
      M += r.Rv * (x - r.x);
    }
    if (r.M !== undefined && r.x <= x) {
      M += r.M;
    }
  });

  pointLoads.forEach((pl) => {
    if (pl.location <= x) {
      M -= pl.load * (x - pl.location);
    }
  });

  udls.forEach((udl) => {
    if (x >= udl.start) {
      M -= udlMomentToLeft(udl, x);
    }
  });

  return M;
}

export function computeBending(opts = {}) {
  const samples = Math.max(200, Number(opts.samples) || 200);
  const result = solveReactions();

  if (!result.ok) {
    lastResult = { ok: false, message: result.message };
    sessionStorage.removeItem("analysisBending");
    return lastResult;
  }

  const L = getBeamLength();
  const dx = L / samples;

  const x = [];
  const M = [];

  let maxPos = { value: -Infinity, x: 0 };
  let maxNeg = { value: Infinity, x: 0 };
  let absMax = 0;

  for (let i = 0; i <= samples; i += 1) {
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
    meta: { maxPos, maxNeg, absMax },
  };

  saveBendingToSession(lastResult);
  return lastResult;
}

export function getBendingResults() {
  return lastResult;
}

export function restoreBendingFromSession() {
  const stored = loadBendingFromSession();
  if (stored) lastResult = stored;
  return lastResult;
}

export { momentAt };

