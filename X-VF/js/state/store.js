/* ╔══════════════════════════════════════════════════════════╗
 *  store.js
 *
 *  Single source of truth for application data. Holds the
 *  live model arrays (supports, UDLs, point loads), beam
 *  length accessors, and sessionStorage persistence for
 *  passing analysis results and model state between pages.
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Shared Model Arrays ────────────────────────────────── */

export const supports   = [];
export const udls       = [];
export const pointLoads = [];

/* ─── Beam Length ─────────────────────────────────────────── */

export const lengthInput = document.getElementById("length");

let _cachedLength = 5; // fallback for pages without #length

export function getBeamLength() {
  if (lengthInput) return Number(lengthInput.value);
  return _cachedLength;
}

export function getScale() {
  const length = getBeamLength();

  if (length <= 10) return 40;
  if (length <= 15) return 30;
  if (length <= 20) return 20;
  if (length <= 40) return 10;
  return 5;
}

/* ─── Session Key Constants ──────────────────────────────── */

const SK = {
  shear:   "analysisShear",
  bending: "analysisBending",
  model:   "beamModel",
};

/* ─── Analysis Results Persistence ───────────────────────── */

export function saveShearToSession(result) {
  if (result) sessionStorage.setItem(SK.shear, JSON.stringify(result));
}
export function loadShearFromSession() {
  const raw = sessionStorage.getItem(SK.shear);
  return raw ? JSON.parse(raw) : null;
}

export function saveBendingToSession(result) {
  if (result) sessionStorage.setItem(SK.bending, JSON.stringify(result));
}
export function loadBendingFromSession() {
  const raw = sessionStorage.getItem(SK.bending);
  return raw ? JSON.parse(raw) : null;
}

/* ─── Model Persistence ──────────────────────────────────── */

export function saveModelToSession() {
  const data = {
    length:     getBeamLength(),
    supports:   [...supports],
    udls:       [...udls],
    pointLoads: [...pointLoads],
  };
  sessionStorage.setItem(SK.model, JSON.stringify(data));
}

/**
 * Restore model arrays + length from sessionStorage.
 * Returns the parsed data object, or null if nothing was stored.
 */
export function loadModelFromSession() {
  const raw = sessionStorage.getItem(SK.model);
  if (!raw) return null;

  const data = JSON.parse(raw);

  // Length
  if (data.length != null) {
    _cachedLength = data.length;
    if (lengthInput) lengthInput.value = data.length;
  }

  // Restore arrays in-place (keeps live references used everywhere)
  supports.length = 0;
  if (data.supports) data.supports.forEach(s => supports.push(s));

  udls.length = 0;
  if (data.udls) data.udls.forEach(u => udls.push(u));

  pointLoads.length = 0;
  if (data.pointLoads) data.pointLoads.forEach(p => pointLoads.push(p));

  return data;
}