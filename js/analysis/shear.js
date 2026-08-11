/* ╔══════════════════════════════════════════════════════════╗
 *  shear.js
 *
 *  Computes the shear force diagram (SFD) by sampling shear
 *  values along the beam. Handles reactions, point loads,
 *  and trapezoidal UDLs. Persists results to sessionStorage
 *  for use on the design page.
 *
 *  Dependencies:  state/store.js, analysis/reactions.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import {
  supports, udls, pointLoads, getBeamLength,
  saveShearToSession, loadShearFromSession
} from "../state/store.js";
import { solveReactions } from "./reactions.js";


/* ═══════════════════════════════════════════════════════════
 *  SHEAR ANALYSIS
 * ═══════════════════════════════════════════════════════════ */

let lastResult = null;

/* ─── Compute Shear Diagram ──────────────────────────────── */

export function computeShear(opts = {}) {
  const samples = opts.samples || 200;
  const result = solveReactions();

  if (!result.ok) {
    lastResult = { ok: false, message: result.message };
    return lastResult;
  }

  const L = getBeamLength();
  const dx = L / samples;

  const x = [];
  const V = [];

  let maxPos = { value: -Infinity, x: 0 };
  let maxNeg = { value: Infinity, x: 0 };
  let absMax = 0;

  for (let i = 0; i <= samples; i++) {
    const xi = i * dx;
    const Vi = shearAt(xi, result);

    x.push(xi);
    V.push(Vi);

    if (Vi > maxPos.value) {
      maxPos = { value: Vi, x: xi };
    }
    if (Vi < maxNeg.value) {
      maxNeg = { value: Vi, x: xi };
    }
    absMax = Math.max(absMax, Math.abs(Vi));
  }

  lastResult = {
    ok: true,
    x,
    V,
    meta: { maxPos, maxNeg, absMax }
  };

  saveShearToSession(lastResult);

  return lastResult;
}

/* ─── Results Accessors ──────────────────────────────────── */

export function getShearResults() {
  return lastResult;
}

export function restoreShearFromSession() {
  const stored = loadShearFromSession();
  if (stored) lastResult = stored;
  return lastResult;
}


/* ═══════════════════════════════════════════════════════════
 *  SHEAR FORCE CALCULATION
 * ═══════════════════════════════════════════════════════════ */

function shearAt(x, reactionResult) {
  let V = 0;

  // Reactions to the left (upward positive)
  reactionResult.reactions.forEach(r => {
    if (r.x < x && r.Rv !== undefined) {
      V += r.Rv;
    }
  });

  // Point loads to the left (downward negative)
  pointLoads.forEach(pl => {
    if (pl.location < x) {
      V -= pl.load;
    }
  });

  // UDL contribution
  udls.forEach(udl => {
    const a = udl.start;
    const b = udl.end;
    const w1 = udl.startLoad;
    const w2 = udl.endLoad;

    if (x <= a) return;

    const xEval = Math.min(x, b);
    const len = xEval - a;
    const wAtX = w1 + (w2 - w1) * len / (b - a);
    const avgLoad = (w1 + wAtX) / 2;

    V -= avgLoad * len;
  });

  return V;
}