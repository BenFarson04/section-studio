/* ╔══════════════════════════════════════════════════════════╗
 *  ubUcSectionCalc.js
 *
 *  EN 1993-1-1 design checks for UB & UC (I-sections):
 *
 *    • Cross-section classification  (Table 5.2)
 *    • Shear resistance              (cl. 6.2.6)
 *    • Bending resistance            (cl. 6.2.5 / 6.2.8)
 *
 *  Assumptions:
 *    • Cross-section resistance only
 *    • No torsion / no LTB / no combined checks
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

export function runUbUcDesignCheck() {

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
  if (type !== "UB" && type !== "UC") {
    msg(container, "Utilisation checks available for UB and UC sections only.");
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
    Math.abs(shearRes.meta.maxPos.value   ?? 0),
    Math.abs(shearRes.meta.maxNeg.value   ?? 0),
  );

  const MEd = Math.max(
    Math.abs(bendingRes.meta.maxPos.value  ?? 0),
    Math.abs(bendingRes.meta.maxNeg.value  ?? 0),
  );

  /* ─── Material Properties ──────────────────────────────── */

  const fy      = grade.fy;
  const epsilon = EPSILON[grade.key] ?? Math.sqrt(235 / fy);

  /* ─── Section Geometry & Properties ────────────────────── */

  const { h, b, tw, tf, r, d } = sec;

  if (!h || !b || !tw || !tf || !r || !d) {
    msg(container, "Section geometry incomplete — cannot run checks.");
    return null;
  }

  const A   = sec.area_of_section  * 100;
  const Wpl = sec.plastic_modulus  * 1e3;
  const Wel = sec.elastic_modulus  * 1e3;

  if (!A || !Wpl || !Wel) {
    msg(container, "Section properties (A, Wpl, Wel) not found — cannot run checks.");
    return null;
  }

  /* ─── Local-Buckling Ratios ────────────────────────────── */

  // cw/tw = d / tw  |  cf/tf = (b − tw − 2r) / (2·tf)
  const cwTw = d / tw;
  const cfTf = (b - tw - 2 * r) / (2 * tf);

  /* ─── Classification ───────────────────────────────────── */

  const webClass     = classify(cwTw, [72, 83, 124], epsilon);
  const flangeClass  = classify(cfTf, [9,  10, 14],  epsilon);
  const sectionClass = Math.max(webClass, flangeClass);

  /* ─── Shear Resistance ─────────────────────────────────── */

  const eta = 1.0;
  const hw  = h - 2 * tf;

  // Av = A − 2·b·tf + (tw + 2·r)·tf  (cl. 6.2.6(3)(a))
  const AvCalc  = A - 2 * b * tf + (tw + 2 * r) * tf;
  const etaHwTw = eta * hw * tw;
  const Av      = Math.max(AvCalc, etaHwTw);

  const VplRd = (Av * (fy / Math.sqrt(3))) / GAMMA_M0 / 1000;

  const shearUtil = VplRd > 0 ? VEd / VplRd : Infinity;

  /* ─── Bending Resistance ───────────────────────────────── */

  let McRd          = null;
  let McRdLabel     = "";
  let bendingUtil   = null;
  let class4Warning = false;

  if (sectionClass === 4) {
    class4Warning = true;

  } else {
    let fyUsed = fy;

    // Reduced fy when high shear (cl. 6.2.8)
    if (shearUtil > 0.5) {
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
    grade, fy, epsilon, eta,
    cwTw, cfTf, webClass, flangeClass, sectionClass,
    hw, Av, VplRd, VEd, shearUtil,
    McRd, McRdLabel, MEd, bendingUtil,
    class4Warning,
  });

  return { shearUtil, bendingUtil, sectionClass, webClass, flangeClass };
}


/* ═══════════════════════════════════════════════════════════
 *  HELPER FUNCTIONS
 * ═══════════════════════════════════════════════════════════ */

/* ─── Generic Classification ─────────────────────────────── */

function classify(ratio, limits, eps) {
  if (ratio <= limits[0] * eps) return 1;
  if (ratio <= limits[1] * eps) return 2;
  if (ratio <= limits[2] * eps) return 3;
  return 4;
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
  let bendingNote = "";

  if (r.class4Warning) {
    bendingRow = `
      <tr>
        <td colspan="4" class="util-warning">
          ⚠ Can't calculate Class 4 sections yet
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
      bendingNote = `
        <p class="small muted">
          V<sub>Ed</sub> / V<sub>pl,Rd</sub> &gt; 0.5 —
          reduced f<sub>y</sub> used for bending (cl. 6.2.8)
        </p>`;
    }
  }

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
      ${bendingNote}
    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════
 *  INITIALISATION & OBSERVERS
 * ═══════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("utilisationContainer");
  if (!container) return;

  runUbUcDesignCheck();

  const secDisplay   = document.getElementById("selectedSectionDisplay");
  const gradeDisplay = document.getElementById("steelGradeDisplay");

  const obs = new MutationObserver(() => runUbUcDesignCheck());

  if (secDisplay)   obs.observe(secDisplay,   { childList: true, characterData: true, subtree: true });
  if (gradeDisplay) obs.observe(gradeDisplay, { childList: true, characterData: true, subtree: true });
});