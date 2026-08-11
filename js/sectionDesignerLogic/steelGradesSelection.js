/* ╔══════════════════════════════════════════════════════════╗
 *  steelGradesSelection.js
 *
 *  Populates the steel-grade dropdown and exposes the current
 *  grade + design strengths on window.selectedSteelGrade.
 *
 *  Imported as a side-effect module from main.js — no separate
 *  <script> tag needed in the HTML.
 *
 *  Dependencies:  steelGrades.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { STEEL_GRADES, STEEL_CONSTANTS, getDesignStrength } from "./steelGrades.js";

/* ─── Initialisation ─────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  const gradeSelect  = document.getElementById("steelGradeSelect");
  const gradeDisplay = document.getElementById("steelGradeDisplay");
  if (!gradeSelect) return;

  /* ─── Populate Dropdown ──────────────────────────────────── */

  Object.entries(STEEL_GRADES).forEach(([key, grade]) => {
    const opt = document.createElement("option");
    opt.value       = key;
    opt.textContent = `${grade.label}  (fy = ${grade.fy[0]} MPa)`;
    gradeSelect.appendChild(opt);
  });

  gradeSelect.value = "S355";
  updateGrade();

  gradeSelect.addEventListener("change", updateGrade);

  /* ─── Grade Update Handler ───────────────────────────────── */

  function updateGrade() {
    const key   = gradeSelect.value;
    const grade = STEEL_GRADES[key];
    if (!grade) return;

    // Read thickness from the currently selected section, if any
    const sec = window.selectedSteelSection;
    const t   = sec?.tf ?? sec?.t ?? 16;

    const { fy, fu, band } = getDesignStrength(key, t);

    window.selectedSteelGrade = {
      key,
      label: grade.label,
      fy, fu, band,
      ...STEEL_CONSTANTS,
    };

    if (gradeDisplay) {
      gradeDisplay.textContent = `${grade.label}:  fy = ${fy} MPa,  fu = ${fu} MPa  (${band})`;
    }

    console.log(`✅ Steel grade set: ${grade.label}, fy=${fy}, fu=${fu}  [${band}]`);
  }

  /* ─── Section Change Observer ────────────────────────────── */

  // Re-evaluate fy when the selected section changes
  const observer = new MutationObserver(() => {
    if (window.selectedSteelSection) updateGrade();
  });

  const display = document.getElementById("selectedSectionDisplay");
  if (display) observer.observe(display, { childList: true, characterData: true, subtree: true });
});