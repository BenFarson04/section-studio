/* ╔══════════════════════════════════════════════════════════╗
 *  pointLoadsTable.js
 *
 *  Manages the point loads input table UI: adding, removing,
 *  selecting, and rebuilding rows, synced to the shared
 *  pointLoads array in state/store.
 *
 *  Dependencies:  state/store.js, selectableRow.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { pointLoads, getBeamLength } from "../state/store.js";
import { makeSelectableRow } from "./selectableRow.js";

/* ─── Initialisation ─────────────────────────────────────── */

export function initPointLoadsUI() {
  updatePointLoadDeleteButtonState();
}

/* ─── Table Rebuild ──────────────────────────────────────── */

export function rebuildPointLoadsTable() {
  const tbody = document.getElementById("pointLoadTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  pointLoads.forEach(pl => {
    const row = document.createElement("tr");
    row.classList.add("point-load-data-row");
    row.innerHTML =
      `<td>${pl.location.toFixed(2)}</td>` +
      `<td>${pl.load.toFixed(2)}</td>`;
    makeSelectableRow(row, "#pointLoadTbody tr.point-load-data-row", updatePointLoadDeleteButtonState);
    tbody.appendChild(row);
  });

  appendNewPointLoadInputRow();
  updatePointLoadDeleteButtonState();
}

/* ─── Input Row Management ───────────────────────────────── */

function getPointLoadInputRow() {
  return document.querySelector("#pointLoadTbody tr.point-load-input-row");
}

function appendNewPointLoadInputRow() {
  const tbody = document.getElementById("pointLoadTbody");
  if (!tbody) return;
  const row = document.createElement("tr");
  row.classList.add("point-load-input-row");
  row.innerHTML = `
    <td><input type="number" step="0.01" placeholder="e.g. 0.00"></td>
    <td><input type="number" step="0.01" placeholder="e.g. 10.0"></td>
  `;
  tbody.appendChild(row);
}

/* ─── Add, Clear & Delete Actions ────────────────────────── */

export function addPointLoadFromTable() {
  const row = getPointLoadInputRow();
  if (!row) return;

  const location = Number(row.cells[0].querySelector("input").value);
  const load     = Number(row.cells[1].querySelector("input").value);

  if ([location, load].some(v => Number.isNaN(v))) return;
  if (location < 0 || location > getBeamLength()) return;

  const newPointLoad = { location, load };
  pointLoads.push(newPointLoad);

  lockPointLoadRowAsDisplay(row, newPointLoad);
  appendNewPointLoadInputRow();
}

function lockPointLoadRowAsDisplay(row, pointLoad) {
  row.classList.remove("point-load-input-row");
  row.classList.add("point-load-data-row");
  row.cells[0].textContent = pointLoad.location.toFixed(2);
  row.cells[1].textContent = pointLoad.load.toFixed(2);
  makeSelectableRow(row, "#pointLoadTbody tr.point-load-data-row", updatePointLoadDeleteButtonState);
}

export function clearPointLoads() {
  pointLoads.length = 0;
  const tbody = document.getElementById("pointLoadTbody");
  tbody.innerHTML = "";
  appendNewPointLoadInputRow();
  updatePointLoadDeleteButtonState();
}

export function deleteSelectedPointLoads() {
  const tbody = document.getElementById("pointLoadTbody");
  const rows = Array.from(tbody.querySelectorAll("tr.point-load-data-row"));
  const selected = rows.filter(r => r.classList.contains("selected"));
  if (selected.length === 0) return;

  selected
    .map(row => rows.indexOf(row))
    .sort((a, b) => b - a)
    .forEach(index => {
      pointLoads.splice(index, 1);
      rows[index].remove();
    });

  updatePointLoadDeleteButtonState();
}

/* ─── Delete Button State ────────────────────────────────── */

export function updatePointLoadDeleteButtonState() {
  const btn = document.getElementById("deletePointLoadsBtn");
  if (btn) btn.disabled =
    document.querySelectorAll("#pointLoadTbody tr.point-load-data-row.selected").length === 0;
}