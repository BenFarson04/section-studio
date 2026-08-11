/* ╔══════════════════════════════════════════════════════════╗
 *  udlsTable.js
 *
 *  Manages the UDL (uniformly distributed load) input table
 *  UI: adding, removing, selecting, and rebuilding rows,
 *  synced to the shared udls array in state/store.
 *
 *  Dependencies:  state/store.js, selectableRow.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { udls, getBeamLength } from "../state/store.js";
import { makeSelectableRow } from "./selectableRow.js";

/* ─── Initialisation ─────────────────────────────────────── */

export function initUDLsUI() {
  updateUDLDeleteButtonState();
}

/* ─── Table Rebuild ──────────────────────────────────────── */

export function rebuildUDLsTable() {
  const tbody = document.getElementById("udlTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  udls.forEach(udl => {
    const row = document.createElement("tr");
    row.classList.add("udl-data-row");
    row.innerHTML =
      `<td>${udl.start.toFixed(2)}</td>` +
      `<td>${udl.end.toFixed(2)}</td>` +
      `<td>${udl.startLoad.toFixed(2)}</td>` +
      `<td>${udl.endLoad.toFixed(2)}</td>`;
    makeSelectableRow(row, "#udlTbody tr.udl-data-row", updateUDLDeleteButtonState);
    tbody.appendChild(row);
  });

  appendNewUDLInputRow();
  updateUDLDeleteButtonState();
}

/* ─── Input Row Management ───────────────────────────────── */

function getUDLInputRow() {
  return document.querySelector("#udlTbody tr.udl-input-row");
}

function appendNewUDLInputRow() {
  const tbody = document.getElementById("udlTbody");
  if (!tbody) return;
  const row = document.createElement("tr");
  row.classList.add("udl-input-row");
  row.innerHTML = `
    <td><input type="number" step="0.01" placeholder="e.g. 0.00"></td>
    <td><input type="number" step="0.01" placeholder="e.g. 5.00"></td>
    <td><input type="number" step="0.01" placeholder="e.g. 10.0"></td>
    <td><input type="number" step="0.01" placeholder="e.g. 10.0"></td>
  `;
  tbody.appendChild(row);
}

/* ─── Add, Clear & Delete Actions ────────────────────────── */

export function addUDLFromTable() {
  const row = getUDLInputRow();
  if (!row) return;

  const start     = Number(row.cells[0].querySelector("input").value);
  const end       = Number(row.cells[1].querySelector("input").value);
  const startLoad = Number(row.cells[2].querySelector("input").value);
  const endLoad   = Number(row.cells[3].querySelector("input").value);

  if ([start, end, startLoad, endLoad].some(v => Number.isNaN(v))) return;
  if (end <= start) return;
  if (start < 0 || end > getBeamLength()) return;

  const newUDL = { start, end, startLoad, endLoad };
  udls.push(newUDL);

  lockUDLRowAsDisplay(row, newUDL);
  appendNewUDLInputRow();
}

function lockUDLRowAsDisplay(row, udl) {
  row.classList.remove("udl-input-row");
  row.classList.add("udl-data-row");
  row.cells[0].textContent = udl.start.toFixed(2);
  row.cells[1].textContent = udl.end.toFixed(2);
  row.cells[2].textContent = udl.startLoad.toFixed(2);
  row.cells[3].textContent = udl.endLoad.toFixed(2);
  makeSelectableRow(row, "#udlTbody tr.udl-data-row", updateUDLDeleteButtonState);
}

export function clearUDLs() {
  udls.length = 0;
  const tbody = document.getElementById("udlTbody");
  tbody.innerHTML = "";
  appendNewUDLInputRow();
  updateUDLDeleteButtonState();
}

export function deleteSelectedUDLs() {
  const tbody = document.getElementById("udlTbody");
  const rows = Array.from(tbody.querySelectorAll("tr.udl-data-row"));
  const selected = rows.filter(r => r.classList.contains("selected"));
  if (selected.length === 0) return;

  selected
    .map(row => rows.indexOf(row))
    .sort((a, b) => b - a)
    .forEach(index => {
      udls.splice(index, 1);
      rows[index].remove();
    });

  updateUDLDeleteButtonState();
}

/* ─── Delete Button State ────────────────────────────────── */

export function updateUDLDeleteButtonState() {
  const btn = document.getElementById("deleteUDLsBtn");
  if (btn) btn.disabled =
    document.querySelectorAll("#udlTbody tr.udl-data-row.selected").length === 0;
}