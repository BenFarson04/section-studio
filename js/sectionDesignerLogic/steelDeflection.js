/* ╔══════════════════════════════════════════════════════════╗
 *  deflection.js
 *
 *  Computes the deflection diagram for a statically determinate
 *  steel beam by double-integrating M(x) (from bending.js) using
 *  EI. Handles simply supported and cantilever configurations.
 *
 *  Units handled internally in N and mm; output v(x) in mm.
 *
 *  Dependencies:  state/store.js, analysis/bending.js
 * ╚══════════════════════════════════════════════════════════╝ */


import { getBeamLength, loadBendingFromSession } from "../state/store.js";
import { solveReactions } from "../analysis/reactions.js";

/* Local copy to avoid a circular import with sectionCalcShared.js */
function firstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

const E_STEEL = 210000; // N/mm²  (Young's modulus for steel)

/**
 * Second moment of area (I, major axis) in mm⁴ from the selected
 * Blue Book section. CSV values are in cm⁴, so ×1e4.
 */

function getIyy_mm4(sec) {
  const Icm4 = firstNumber(
    sec?.secondMomentYy,   // ← UB/UC/PFC, EA/UA, SHS/RHS (major axis)
    sec?.secondMoment,     // ← CHS
    // fallbacks, just in case:
    sec?.second_moment_of_area,
    sec?.second_moment_of_area_yy,
    sec?.Iyy
  );
  return Number.isFinite(Icm4) ? Icm4 * 1e4 : NaN;
}


export function computeDeflection(opts = {}) {
  const bending = loadBendingFromSession();
  const sec     = window.selectedSteelSection;

  if (!bending?.ok) return { ok: false, message: "Run beam analysis first." };
  if (!sec)         return { ok: false, message: "Select a steel section." };

  const I = getIyy_mm4(sec);
  if (!Number.isFinite(I)) return { ok: false, message: "Section I (Iyy) not found." };

  const EI = E_STEEL * I;                 // N·mm²
  const reactions = solveReactions();
  const isCantilever = reactions.type === "cantilever";

  // Convert to consistent units: x → mm, M → N·mm
  const x = bending.x.map(v => v * 1000);
  const M = bending.M.map(v => v * 1e6);
  const n = x.length;

  // Particular solution: slope0 = 0, defl0 = 0 at x[0], integrate curvature
  const theta_p = new Array(n).fill(0);
  const v_p     = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const h = x[i] - x[i - 1];
    // trapezoidal integration of M/EI for slope
    theta_p[i] = theta_p[i - 1] + 0.5 * (M[i] + M[i - 1]) / EI * h;
    // integrate slope for deflection
    v_p[i] = v_p[i - 1] + 0.5 * (theta_p[i] + theta_p[i - 1]) * h;
  }

  // Solve constants from boundary conditions
  let C1 = 0, C2 = 0;

  if (isCantilever) {
    // fixed end: θ = 0 and v = 0 there
    const fixed = reactions.reactions.find(r => r.Rm !== undefined) ?? reactions.reactions[0];
    const xf = fixed.x * 1000;
    const iF = nearestIndex(x, xf);
    C1 = -theta_p[iF];
    C2 = -(v_p[iF] + C1 * xf);
  } else {
    // two simple supports: v = 0 at each
    const sup = reactions.reactions.filter(r => r.Rv !== undefined);
    const xa = sup[0].x * 1000, xb = sup[sup.length - 1].x * 1000;
    const ia = nearestIndex(x, xa), ib = nearestIndex(x, xb);
    C1 = -(v_p[ib] - v_p[ia]) / (xb - xa);
    C2 = -(v_p[ia] + C1 * xa);
  }

  // Final deflection v(x) in mm
  const v = v_p.map((vp, i) => vp + C1 * x[i] + C2);

  // Extremes
  let maxAbs = { value: 0, x: 0 };
  v.forEach((vi, i) => {
    if (Math.abs(vi) > Math.abs(maxAbs.value)) maxAbs = { value: vi, x: x[i] / 1000 };
  });

  const L = getBeamLength();
  return {
    ok: true,
    x: bending.x,          // metres (matches bending)
    v,                     // mm
    EI,
    meta: {
      maxAbs,                                   // {value: mm, x: m}
      spanOverDeflection: L * 1000 / Math.abs(maxAbs.value || Infinity)
    }
  };
}

function nearestIndex(arr, target) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - target);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}