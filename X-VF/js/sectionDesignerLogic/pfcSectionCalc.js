/* ╔══════════════════════════════════════════════════════════╗
 *  pfcSectionCalc.js
 *
 *  EN 1993-1-1 design checks for PFC (parallel flange
 *  channel) sections:
 *
 *    • Cross-section classification  (Table 5.2)
 *    • Shear resistance              (cl. 6.2.6)
 *    • Bending resistance            (cl. 6.2.5 / 6.2.8)
 *
 *  Assumptions:
 *    • Major-axis bending only (y-y)
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

export function runPfcDesignCheck() {

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

  if (type !== "PFC") {
    return null;
  }

  const shearRes   = loadShearFromSession();
  const bendingRes = loadBendingFromSession();

  if (!shearRes?.ok || !bendingRes?.ok) {
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

  /* ─── Section Geometry ─────────────────────────────────── */

  const { h, b, tw, tf, r, d } = sec;

  if (!h || !b || !tw || !tf || !r || !d) {
    msg(container, "Section geometry incomplete, cannot run checks.");
    return null;
  }

  /* ─── Section Properties ───────────────────────────────── */

  // Prefer explicit aliases from the CSV reader; fallbacks included
  const A = firstNumber(
    sec.areaCm2,
    sec.area_of_section,
    sec.a
  ) * 100;

  const Wel = firstNumber(
    sec.elasticModulusYy,
    sec.elastic_modulus_yy,
    sec.elastic_modulus_y_y,
    sec.elastic_modulus
  ) * 1e3;

  const Wpl = firstNumber(
    sec.plasticModulusYy,
    sec.plastic_modulus_yy,
    sec.plastic_modulus_y_y,
    sec.plastic_modulus
  ) * 1e3;

  if (!A || !Wel || !Wpl) {
    msg(container, "Section properties (A, Wel,y, Wpl,y) not found, cannot run checks.");
    return null;
  }

  /* ─── Local-Buckling Ratios ────────────────────────────── */

  // PFC CSV provides cw/tw and cf/tf explicitly; geometry fallback otherwise
  const cwTw = firstNumber(sec.cwOverTw, d / tw);
  const cfTf = firstNumber(sec.cfOverTf, (b - tw - r) / tf);

  /* ─── Classification ───────────────────────────────────── */

  // Web: internal element in bending | Flange: outstand element
  const webClass     = classify(cwTw, [72, 83, 124], epsilon);
  const flangeClass  = classify(cfTf, [9, 10, 14], epsilon);
  const sectionClass = Math.max(webClass, flangeClass);

  /* ─── Shear Resistance ─────────────────────────────────── */

  // Conservative web-area Av for major-axis shear
  const hw = d || (h - 2 * tf);
  const Av = hw * tw;

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
    fy, epsilon,
    cwTw, cfTf, webClass, flangeClass, sectionClass,
    hw, Av, VplRd, VEd, shearUtil,
    McRd, McRdLabel, MEd, bendingUtil,
    class4Warning,
    fyUsed,
    e0: sec.e0,
  });

  return { shearUtil, bendingUtil, sectionClass, webClass, flangeClass };
}


/* ═══════════════════════════════════════════════════════════
 *  HELPER FUNCTIONS
 * ═══════════════════════════════════════════════════════════ */

/* ─── First Valid Positive Number ────────────────────────── */

function firstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

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
  let notes = "";

  if (r.class4Warning) {
    bendingRow = `
      <tr>
        <td colspan="4" class="util-warning">
          ⚠ Can't calculate Class 4 PFC sections yet
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

  if (Number.isFinite(r.e0) && r.e0 > 0) {
    notes += `
      <p class="small muted">
        Note: PFC has e<sub>0</sub> = ${r.e0.toFixed(2)} cm from web centre to shear centre.
        This check is cross-section bending/shear only and does not include torsion.
      </p>`;
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

  runPfcDesignCheck();

  const secDisplay   = document.getElementById("selectedSectionDisplay");
  const gradeDisplay = document.getElementById("steelGradeDisplay");

  const obs = new MutationObserver(() => runPfcDesignCheck());

  if (secDisplay) {
    obs.observe(secDisplay, { childList: true, characterData: true, subtree: true });
  }
  if (gradeDisplay) {
    obs.observe(gradeDisplay, { childList: true, characterData: true, subtree: true });
  }
});