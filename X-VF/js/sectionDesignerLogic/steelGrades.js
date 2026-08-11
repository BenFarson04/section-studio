/* ╔══════════════════════════════════════════════════════════╗
 *  steelGrades.js
 *
 *  Steel grade data per BS EN 10025-2:2019 Table 7 (open
 *  sections) and BS EN 10210-1 (hot-finished hollow sections).
 *
 *  Yield strength fy is thickness-dependent.
 *  fu values are for 3 < t ≤ 100 mm (the practical range
 *  for standard rolled sections).
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Thickness Breakpoints ──────────────────────────────── */

// Upper bound of each band (mm)
const THICKNESS_LIMITS = [16, 40, 63, 80, 100, 150];

/* ─── Grade Definitions ──────────────────────────────────── */

export const STEEL_GRADES = {
  S235: {
    label: "S235",
    fy: [235, 225, 215, 215, 215, 195],
    fu: 360,
    standard: "BS EN 10025-2",
  },
  S275: {
    label: "S275",
    fy: [275, 265, 255, 245, 235, 225],
    fu: 430,
    standard: "BS EN 10025-2",
  },
  S355: {
    label: "S355",
    fy: [355, 345, 335, 325, 315, 295],
    fu: 510,
    standard: "BS EN 10025-2",
  },
  S460: {
    label: "S460",
    fy: [460, 440, 430, 410, 400, 380],
    fu: 550,
    standard: "BS EN 10025-2 / BS EN 10210-1",
  },
};

/* ─── Common Material Constants (EN 1993-1-1 §3.2.6) ────── */

export const STEEL_CONSTANTS = {
  E:     210000,     // MPa   — Young's modulus
  G:     81000,      // MPa   — Shear modulus
  nu:    0.30,       //       — Poisson's ratio
  rho:   7850,       // kg/m³ — Density
  alpha: 12e-6,      // /°K   — Thermal expansion coefficient
};

/* ─── Design Strength Lookup ─────────────────────────────── */

/**
 * Returns the design yield strength fy and ultimate strength fu
 * for a given grade key and maximum element thickness (mm).
 *
 * @param {string} gradeKey  – e.g. "S275", "S355"
 * @param {number} thickness – element thickness in mm (e.g. tf or t)
 * @returns {{ fy: number, fu: number, band: string }}
 */
export function getDesignStrength(gradeKey, thickness = 16) {
  const grade = STEEL_GRADES[gradeKey];
  if (!grade) {
    console.warn(`Unknown steel grade "${gradeKey}"`);
    return { fy: NaN, fu: NaN, band: "unknown" };
  }

  let idx = THICKNESS_LIMITS.findIndex(limit => thickness <= limit);
  if (idx === -1) idx = THICKNESS_LIMITS.length - 1;

  const lo = idx === 0 ? 0 : THICKNESS_LIMITS[idx - 1];
  const hi = THICKNESS_LIMITS[idx];
  const band = `${lo < 1 ? "t ≤" : `${lo} < t ≤`} ${hi} mm`;

  return {
    fy:   grade.fy[idx],
    fu:   grade.fu,
    band,
  };
}

/* ─── Grade Keys Helper ──────────────────────────────────── */

export function gradeKeys() {
  return Object.keys(STEEL_GRADES);
}