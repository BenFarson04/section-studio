/* ╔══════════════════════════════════════════════════════════╗
 *  sectionCalcShared.js
 *
 *  Shared constants, classification helpers, DOM rendering,
 *  and observer setup used by all section design check
 *  modules (UB/UC, PFC, EA/UA, SHS/RHS, CHS). Centralises
 *  code that was previously duplicated across five files.
 *
 *  Dependencies:  state/store.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { loadShearFromSession, loadBendingFromSession } from "../state/store.js";



/* ═══════════════════════════════════════════════════════════
 *  DESIGN CONSTANTS
 * ═══════════════════════════════════════════════════════════ */

export const GAMMA_M0 = 1.0;

// ε by grade key (= √(235 / fy,nominal))
export const EPSILON = { S235: 1.00, S275: 0.92, S355: 0.81, S460: 0.71 };

const TICK  = '<span class="util-tick" title="Pass">✔</span>';
const CROSS = '<span class="util-cross" title="Fail">✘</span>';


/* ═══════════════════════════════════════════════════════════
 *  HELPER FUNCTIONS
 * ═══════════════════════════════════════════════════════════ */

/* ─── First Valid Positive Number ────────────────────────── */

export function firstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

/* ─── Generic Classification ─────────────────────────────── */

/**
 * Classifies a slenderness ratio against three limit tiers.
 * Works for all element types by passing the appropriate
 * limits array and epsilon value:
 *
 *   Web internal:     classify(cwTw, [72, 83, 124], ε)
 *   Flange outstand:  classify(cfTf, [9, 10, 14],  ε)
 *   Hollow flange:    classify(cfTf, [33, 38, 42], ε)
 *   CHS tubular:      classify(d/t,  [50, 70, 90], ε²)
 */
export function classify(ratio, limits, eps) {
  if (ratio <= limits[0] * eps) return 1;
  if (ratio <= limits[1] * eps) return 2;
  if (ratio <= limits[2] * eps) return 3;
  return 4;
}

/* ─── Message Output ─────────────────────────────────────── */

export function msg(el, text) {
  el.innerHTML = `<p class="muted small">${text}</p>`;
}


/* ═══════════════════════════════════════════════════════════
 *  DESIGN SUMMARY RENDERER
 * ═══════════════════════════════════════════════════════════ */

/**
 * Renders the standard shear/bending utilisation table.
 *
 * @param {HTMLElement} el           — container element
 * @param {Object}      r           — results object with:
 *   VEd, VplRd, shearUtil, MEd, McRd, McRdLabel,
 *   bendingUtil, class4Warning
 * @param {Object}      opts
 * @param {string}      opts.class4Label   — e.g. "PFC sections"
 * @param {string}      opts.notes         — additional HTML notes
 */
export function renderDesignSummary(el, r, opts = {}) {
  const { class4Label = "sections", notes = "" } = opts;

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
  let highShearNote = "";

  if (r.class4Warning) {
    bendingRow = `
      <tr>
        <td colspan="4" class="util-warning">
          ⚠ Can't calculate Class 4 ${class4Label} yet
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
      highShearNote = `
        <p class="small muted">
          V<sub>Ed</sub> / V<sub>pl,Rd</sub> &gt; 0.5.
          Reduced f<sub>y</sub> used for bending (cl. 6.2.8)
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
      ${highShearNote}
      ${notes}
    </div>
  `;

  // Append read-only max deflection (no limit applied)
  appendDeflectionInfo(el);
}


/* ─── Deflection Info (read-only, no limit) ──────────────── */

function appendDeflectionInfo(el) {
  let result;
  try {
    result = computeDeflection();
  } catch (err) {
    console.error("Deflection calc failed:", err);
    return;
  }

  if (!result?.ok) return;

  const dMax  = result.meta?.maxAbs?.value;
  const xMax  = result.meta?.maxAbs?.x;
  const ratio = result.meta?.spanOverDeflection;

  if (!Number.isFinite(dMax)) return;

  const ratioText = Number.isFinite(ratio) && ratio > 0
    ? `L/${Math.round(ratio)}`
    : "—";

  const fmt = (v, dp = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(dp) : "—");

  const block = document.createElement("div");
  block.className = "deflection-info";
  block.innerHTML = `
    <h3>Max deflection</h3>
    <div class="deflection-info__row">
      <span class="deflection-info__value">${Math.abs(dMax).toFixed(2)} mm</span>
      <span class="deflection-info__span">${ratioText}</span>
    </div>
    <p class="muted small">
      Peak at x = ${fmt(xMax)} m · elastic, self-weight excluded · no limit applied.
    </p>
  `;

  el.appendChild(block);
}



/* ═══════════════════════════════════════════════════════════
 *  OBSERVER SETUP
 * ═══════════════════════════════════════════════════════════ */

/**
 * Registers a DOMContentLoaded listener that runs the check
 * once and then re-runs on section/grade display changes.
 */
export function setupCalcObserver(runCheckFn) {
  document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("utilisationContainer");
    if (!container) return;

    runCheckFn();

    const secDisplay   = document.getElementById("selectedSectionDisplay");
    const gradeDisplay = document.getElementById("steelGradeDisplay");

    const obs = new MutationObserver(() => runCheckFn());

    if (secDisplay)   obs.observe(secDisplay,   { childList: true, characterData: true, subtree: true });
    if (gradeDisplay) obs.observe(gradeDisplay, { childList: true, characterData: true, subtree: true });
  });
}