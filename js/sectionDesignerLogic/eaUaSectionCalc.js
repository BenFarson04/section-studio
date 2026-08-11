/* ╔══════════════════════════════════════════════════════════╗
 *  eaUaSectionCalc.js
 *
 *  EN 1993-1-1 design checks for EA & UA (equal & unequal)
 *  angle sections:
 *
 *    • Cross-section classification  (Table 5.2)
 *    • Shear resistance              (cl. 6.2.6)
 *    • Bending resistance            (cl. 6.2.5 / 6.2.8)
 *
 *  Assumptions:
 *    • Bending about geometric y-y axis (long leg vertical)
 *    • Cross-section resistance only
 *    • No torsion / no LTB / no biaxial bending
 *    • Elastic bending resistance only — plastic modulus is
 *      not tabulated in the Blue Book for angle sections
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

export function runEaUaDesignCheck() {

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

  if (type !== "EA" && type !== "UA") {
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

  const { h, b, t, r1 } = sec;

  if (!h || !b || !t || !r1) {
    msg(container, "Section geometry incomplete — cannot run checks.");
    return null;
  }

  const A   = firstNumber(sec.areaCm2) * 100;
  const Wel = firstNumber(sec.elasticModulusYy) * 1e3;

  if (!A || !Wel) {
    msg(container, "Section properties (A, Wel) not found — cannot run checks.");
    return null;
  }

  /* ─── Classification ───────────────────────────────────── */

  // Both legs are outstands: c = leg_length − t − r1
  const cLong   = (h - t - r1);
  const cShort  = (b - t - r1);

  const ctLong  = cLong  / t;
  const ctShort = cShort / t;

  // Outstand limits: 9ε, 10ε, 14ε
  const longLegClass  = classifyOutstand(ctLong,  epsilon);
  const shortLegClass = classifyOutstand(ctShort, epsilon);
  const sectionClass  = Math.max(longLegClass, shortLegClass);

  /* ─── Shear Resistance ─────────────────────────────────── */

  // Av = h × t (long leg carries vertical shear)
  const Av    = h * t;
  const VplRd = (Av * (fy / Math.sqrt(3))) / GAMMA_M0 / 1000;

  const shearUtil = VplRd > 0 ? VEd / VplRd : Infinity;

  /* ─── Bending Resistance ───────────────────────────────── */

  // Only Wel available for angles — elastic resistance only
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

    McRdLabel = "Mel,Rd,y";
    McRd = (Wel * fyUsed) / GAMMA_M0 / 1e6;

    bendingUtil = McRd > 0 ? MEd / McRd : Infinity;
  }

  /* ─── Render Output ────────────────────────────────────── */

  render(container, {
    type, fy, epsilon,
    h, b, t, r1,
    cLong, cShort, ctLong, ctShort,
    longLegClass, shortLegClass, sectionClass,
    Av, VplRd, VEd, shearUtil,
    McRd, McRdLabel, MEd, bendingUtil,
    class4Warning, fyUsed,
  });

  return { shearUtil, bendingUtil, sectionClass, longLegClass, shortLegClass };
}


/* ═══════════════════════════════════════════════════════════
 *  HELPER FUNCTIONS
 * ═══════════════════════════════════════════════════════════ */

/* ─── Outstand Classification ────────────────────────────── */

function classifyOutstand(ctRatio, eps) {
  if (ctRatio <= 9  * eps) return 1;
  if (ctRatio <= 10 * eps) return 2;
  if (ctRatio <= 14 * eps) return 3;
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
          ⚠ Can't calculate Class 4 angle sections yet
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
      Note: Elastic bending resistance only (W<sub>pl</sub> not tabulated for angles).
      This check covers cross-section bending/shear only. Torsion, LTB and biaxial effects not included.
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

  runEaUaDesignCheck();

  const secDisplay   = document.getElementById("selectedSectionDisplay");
  const gradeDisplay = document.getElementById("steelGradeDisplay");

  const obs = new MutationObserver(() => runEaUaDesignCheck());

  if (secDisplay) {
    obs.observe(secDisplay, { childList: true, characterData: true, subtree: true });
  }
  if (gradeDisplay) {
    obs.observe(gradeDisplay, { childList: true, characterData: true, subtree: true });
  }
});