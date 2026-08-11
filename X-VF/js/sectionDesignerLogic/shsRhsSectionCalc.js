/* ╔══════════════════════════════════════════════════════════╗
 *  shsRhsSectionCalc.js
 *
 *  EN 1993-1-1 design checks for SHS & RHS (square &
 *  rectangular hollow) sections:
 *
 *    • Cross-section classification  (Table 5.2)
 *    • Shear resistance              (cl. 6.2.6)
 *    • Bending resistance            (cl. 6.2.5 / 6.2.8)
 *
 *  Assumptions:
 *    • Major-axis bending only (y-y)
 *    • Cross-section resistance only
 *    • No LTB (not required for hollow sections)
 *    • No torsion / no combined checks
 *
 *  Classification limits (Table 5.2 — internal parts):
 *    Web  (in bending):       72ε,  83ε,  124ε
 *    Flange (in compression): 33ε,  38ε,   42ε
 *    c = h − 3t (web),  c = b − 3t (flange)
 *
 *  γM0 = 1.0 (UK National Annex)
 *
 *  Dependencies:  state/store.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { loadShearFromSession, loadBendingFromSession } from "../state/store.js";


/* ═══════════════════════════════════════════════════════════
 *  CONSTANTS
 * ═══════════════════════════════════════════════════════════ */

const GAMMA_M0 = 1.0;

// ε by grade key (= √(235 / fy,nominal))
const EPSILON = { S235: 1.00, S275: 0.92, S355: 0.81, S460: 0.71 };

const TICK  = '<span class="util-tick" title="Pass">✔</span>';
const CROSS = '<span class="util-cross" title="Fail">✘</span>';


/* ═══════════════════════════════════════════════════════════
 *  MAIN DESIGN CHECK
 * ═══════════════════════════════════════════════════════════ */

export function runShsRhsDesignCheck() {

  const container = document.getElementById("utilisationContainer");
  if (!container) return null;

  /* ─── Prerequisites ────────────────────────────────────── */

  const sec   = window.selectedSteelSection;
  const grade = window.selectedSteelGrade;
  const type  = document.getElementById("sectionTypeSelect")?.value;

  if (!sec || !grade) {
    msg(container, "Select a section and grade to see utilisations.");
    return null;
  }

  if (type !== "SHS" && type !== "RHS") {
    return null;
  }

  const shearRes   = loadShearFromSession();
  const bendingRes = loadBendingFromSession();

  if (!shearRes?.ok || !bendingRes?.ok) {
    msg(container, "Run the beam analysis first to see utilisations.");
    return null;
  }

  /* ─── Design Forces ────────────────────────────────────── */

  const VEd = Math.max(
    Math.abs(shearRes.meta?.maxPos?.value ?? 0),
    Math.abs(shearRes.meta?.maxNeg?.value ?? 0),
  );

  const MEd = Math.max(
    Math.abs(bendingRes.meta?.maxPos?.value ?? 0),
    Math.abs(bendingRes.meta?.maxNeg?.value ?? 0),
  );

  /* ─── Material Properties ──────────────────────────────── */

  const fy      = grade.fy;
  const epsilon = EPSILON[grade.key] ?? Math.sqrt(235 / fy);

  /* ─── Section Geometry & Properties ────────────────────── */

  const { h, b, t } = sec;

  if (!h || !b || !t) {
    msg(container, "Section geometry incomplete — cannot run checks.");
    return null;
  }

  const isSHS = (h === b);

  const A   = firstNumber(sec.areaCm2) * 100;
  const Wel = firstNumber(sec.elasticModulusYy) * 1e3;
  const Wpl = firstNumber(sec.plasticModulusYy) * 1e3;

  if (!A || !Wel || !Wpl) {
    msg(container, "Section properties (A, Wel, Wpl) not found — cannot run checks.");
    return null;
  }

  /* ─── Classification ───────────────────────────────────── */

  let cwTw, cfTf;

  if (isSHS) {
    cwTw = firstNumber(sec.ctRatio, (h - 3 * t) / t);
    cfTf = cwTw;
  } else {
    cwTw = firstNumber(sec.cwOverTw, (h - 3 * t) / t);
    cfTf = firstNumber(sec.cfOverTf, (b - 3 * t) / t);
  }

  // Web: internal in bending | Flange: internal in compression
  const webClass     = classifyInternal(cwTw, [72, 83, 124], epsilon);
  const flangeClass  = classifyInternal(cfTf, [33, 38, 42],  epsilon);
  const sectionClass = Math.max(webClass, flangeClass);

  /* ─── Shear Resistance ─────────────────────────────────── */

  // Av = A × h / (h + b)  (cl. 6.2.6(3)(f))
  const Av    = A * h / (h + b);
  const VplRd = (Av * (fy / Math.sqrt(3))) / GAMMA_M0 / 1000;

  const shearUtil = VplRd > 0 ? VEd / VplRd : Infinity;

  /* ─── Bending Resistance ───────────────────────────────── */

  let McRd          = null;
  let McRdLabel     = "";
  let bendingUtil   = null;
  let class4Warning = false;
  let fyUsed        = fy;

  if (sectionClass === 4) {
    class4Warning = true;

  } else {
    // Reduced fy when high shear (cl. 6.2.8)
    if (shearUtil > 0.5 && VplRd > 0) {
      const rho = Math.pow((2 * VEd / VplRd) - 1, 2);
      fyUsed = fy * (1 - rho);
    }

    if (sectionClass <= 2) {
      McRdLabel = "Mpl,Rd,y";
      McRd = (Wpl * fyUsed) / GAMMA_M0 / 1e6;
    } else {
      McRdLabel = "Mel,Rd,y";
      McRd = (Wel * fyUsed) / GAMMA_M0 / 1e6;
    }

    bendingUtil = McRd > 0 ? MEd / McRd : Infinity;
  }

  /* ─── Render Output ────────────────────────────────────── */

  render(container, {
    type, isSHS, fy, epsilon,
    h, b, t,
    cwTw, cfTf, webClass, flangeClass, sectionClass,
    Av, VplRd, VEd, shearUtil,
    McRd, McRdLabel, MEd, bendingUtil,
    class4Warning, fyUsed,
  });

  return { shearUtil, bendingUtil, sectionClass, webClass, flangeClass };
}


/* ═══════════════════════════════════════════════════════════
 *  HELPER FUNCTIONS
 * ═══════════════════════════════════════════════════════════ */

/* ─── Internal Element Classification ────────────────────── */

function classifyInternal(ratio, limits, eps) {
  if (ratio <= limits[0] * eps) return 1;
  if (ratio <= limits[1] * eps) return 2;
  if (ratio <= limits[2] * eps) return 3;
  return 4;
}

/* ─── First Valid Positive Number ────────────────────────── */

function firstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

/* ─── Message Output ─────────────────────────────────────── */

function msg(el, text) {
  el.innerHTML = `<p class="muted small">${text}</p>`;
}


/* ═══════════════════════════════════════════════════════════
 *  DOM RENDERING
 * ═══════════════════════════════════════════════════════════ */

function render(el, r) {

  // Shear row
  const sOk = r.shearUtil <= 1.0;
  const shearRow = `
    <tr>
      <td>Shear</td>
      <td>V<sub>Ed</sub> = ${r.VEd.toFixed(2)} kN</td>
      <td>V<sub>pl,Rd</sub> = ${r.VplRd.toFixed(2)} kN</td>
      <td class="${sOk ? "util-pass" : "util-fail"}">
        ${r.shearUtil.toFixed(3)}&ensp;${sOk ? TICK : CROSS}
      </td>
    </tr>`;

  // Bending row
  let bendingRow = "";
  let notes = "";

  if (r.class4Warning) {
    bendingRow = `
      <tr>
        <td colspan="4" class="util-warning">
          ⚠ Can't calculate Class 4 ${r.type} sections yet
        </td>
      </tr>`;
  } else {
    const bOk = r.bendingUtil <= 1.0;
    bendingRow = `
      <tr>
        <td>Bending</td>
        <td>M<sub>Ed</sub> = ${r.MEd.toFixed(2)} kNm</td>
        <td>${r.McRdLabel} = ${r.McRd.toFixed(2)} kNm</td>
        <td class="${bOk ? "util-pass" : "util-fail"}">
          ${r.bendingUtil.toFixed(3)}&ensp;${bOk ? TICK : CROSS}
        </td>
      </tr>`;

    if (r.shearUtil > 0.5) {
      notes += `
        <p class="small muted">
          V<sub>Ed</sub> / V<sub>pl,Rd</sub> &gt; 0.5 —
          reduced f<sub>y</sub> used for bending (cl. 6.2.8)
        </p>`;
    }
  }

  notes += `
    <p class="small muted">
      Note: This check covers cross-section bending/shear only.
      No LTB check required for hollow sections.
    </p>`;

  el.innerHTML = `
    <div class="results-group">
      <h3>Design summary</h3>

      <div class="table-wrap">
        <table class="util-table">
          <thead>
            <tr>
              <th>Check</th>
              <th>Action</th>
              <th>Resistance</th>
              <th>Utilisation</th>
            </tr>
          </thead>
          <tbody>
            ${shearRow}
            ${bendingRow}
          </tbody>
        </table>
      </div>

      ${notes}
    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════
 *  INITIALISATION & OBSERVERS
 * ═══════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("utilisationContainer");
  if (!container) return;

  runShsRhsDesignCheck();

  const secDisplay   = document.getElementById("selectedSectionDisplay");
  const gradeDisplay = document.getElementById("steelGradeDisplay");

  const obs = new MutationObserver(() => runShsRhsDesignCheck());

  if (secDisplay) {
    obs.observe(secDisplay, { childList: true, characterData: true, subtree: true });
  }
  if (gradeDisplay) {
    obs.observe(gradeDisplay, { childList: true, characterData: true, subtree: true });
  }
});