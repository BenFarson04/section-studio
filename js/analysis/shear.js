/* ╔══════════════════════════════════════════════════════════╗
 *  shear.js
 *
 *  Computes the shear force diagram (SFD) by evaluating the
 *  internal shear force at a series of cuts along the beam.
 *
 *  Sign convention:
 *    - reactions are positive upward,
 *    - downward external loads are negative,
 *    - positive shear acts upward on the left face.
 *
 *  Dependencies:  state/store.js, analysis/reactions.js
 * ╚══════════════════════════════════════════════════════════╝ */

import {
  supports,
  udls,
  pointLoads,
  getBeamLength,
  saveShearToSession,
  loadShearFromSession,
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

export function computeShear(opts = {}) {
  const samples = Math.max(200, Number(opts.samples) || 200);
  const result = solveReactions();

  if (!result.ok) {
    lastResult = { ok: false, message: result.message };
    sessionStorage.removeItem("analysisShear");
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
    meta: { maxPos, maxNeg, absMax },
  };

  saveShearToSession(lastResult);
  return lastResult;
}

export function getShearResults() {
  return lastResult;
}

export function restoreShearFromSession() {
  const stored = loadShearFromSession();
  if (stored) lastResult = stored;
  return lastResult;
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
