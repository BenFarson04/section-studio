/* ╔══════════════════════════════════════════════════════════╗
 *  chsSectionCalc.js
 *
 *  EN 1993-1-1 design checks for CHS (circular hollow)
 *  sections:
 *
 *    • Cross-section classification  (Table 5.2, Sheet 3)
 *    • Shear resistance              (cl. 6.2.6)
 *    • Bending resistance            (cl. 6.2.5 / 6.2.8)
 *
 *  Assumptions:
 *    • Cross-section resistance only
 *    • No LTB (not required for hollow sections)
 *    • No torsion / no combined checks
 *
 *  Classification limits (tubular sections):
 *    Class 1:  d/t ≤ 50 ε²
 *    Class 2:  d/t ≤ 70 ε²
 *    Class 3:  d/t ≤ 90 ε²
 *    Class 4:  d/t >  90 ε²
 *
 *  Shear area (cl. 6.2.6(3)(g)):  Av = 2A / π
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

export function runChsDesignCheck() {

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

  if (type !== "CHS") {
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
  const eps2    = epsilon * epsilon;

  /* ─── Section Geometry & Properties ────────────────────── */

  const { d, t } = sec;

  if (!d || !t) {
    msg(container, "Section geometry incomplete — cannot run checks.");
    return null;
  }

  const dtRatio = firstNumber(sec.dtRatio, d / t);

  const A   = firstNumber(sec.areaCm2) * 100;
  const Wel = firstNumber(sec.elasticModulus) * 1e3;
  const Wpl = firstNumber(sec.plasticModulus) * 1e3;

  if (!A || !Wel || !Wpl) {
    msg(container, "Section properties (A, Wel, Wpl) not found — cannot run checks.");
    return null;
  }

  /* ─── Classification ───────────────────────────────────── */

  const sectionClass = classifyCHS(dtRatio, eps2);

  /* ─── Shear Resistance ─────────────────────────────────── */

  const Av    = 2 * A / Math.PI;
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
      McRdLabel = "Mpl,Rd";
      McRd = (Wpl * fyUsed) / GAMMA_M0 / 1e6;
    } else {
      McRdLabel = "Mel,Rd";
      McRd = (Wel * fyUsed) / GAMMA_M0 / 1e6;
    }

    bendingUtil = McRd > 0 ? MEd / McRd : Infinity;
  }

  /* ─── Render Output ────────────────────────────────────── */

  render(container, {
    fy, epsilon, eps2,
    d, t, dtRatio,
    sectionClass,
    Av, VplRd, VEd, shearUtil,
    McRd, McRdLabel, MEd, bendingUtil,
    class4Warning, fyUsed,
  });

  return { shearUtil, bendingUtil, sectionClass };
}


/* ═══════════════════════════════════════════════════════════
 *  HELPER FUNCTIONS
 * ═══════════════════════════════════════════════════════════ */

/* ─── CHS Classification ─────────────────────────────────── */

function classifyCHS(dtRatio, eps2) {
  if (dtRatio <= 50 * eps2) return 1;
  if (dtRatio <= 70 * eps2) return 2;
  if (dtRatio <= 90 * eps2) return 3;
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
          ⚠ Can't calculate Class 4 CHS sections yet
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
          V<sub>Ed</sub> / V<sub>pl,Rd</sub> &gt; 0.5.
          Reduced f<sub>y</sub> used for bending (cl. 6.2.8)
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

  runChsDesignCheck();

  const secDisplay   = document.getElementById("selectedSectionDisplay");
  const gradeDisplay = document.getElementById("steelGradeDisplay");

  const obs = new MutationObserver(() => runChsDesignCheck());

  if (secDisplay) {
    obs.observe(secDisplay, { childList: true, characterData: true, subtree: true });
  }
  if (gradeDisplay) {
    obs.observe(gradeDisplay, { childList: true, characterData: true, subtree: true });
  }
});