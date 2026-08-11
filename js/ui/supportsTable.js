/* ╔══════════════════════════════════════════════════════════╗
 *  supportsTable.js
 *
 *  Manages the supports input table UI: adding, removing,
 *  selecting, and rebuilding rows, synced to the shared
 *  supports array in state/store.
 *
 *  Dependencies:  state/store.js, selectableRow.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { supports, getBeamLength } from "../state/store.js";
import { makeSelectableRow } from "./selectableRow.js";

/* ─── Initialisation ─────────────────────────────────────── */

export function initSupportsUI() {
  updateSupportDeleteButtonState();
}

/* ─── Table Rebuild ──────────────────────────────────────── */

export function rebuildSupportsTable() {
  const tbody = document.getElementById("supportsTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  supports.forEach(support => {
    const row = document.createElement("tr");
    row.classList.add("support-data-row");
    row.innerHTML =
      `<td>${support.location.toFixed(2)}</td>` +
      `<td>${support.type}</td>`;
    makeSelectableRow(row, "#supportsTbody tr.support-data-row", updateSupportDeleteButtonState);
    tbody.appendChild(row);
  });

  appendNewSupportInputRow();
  updateSupportDeleteButtonState();
}

/* ─── Input Row Management ───────────────────────────────── */

function getSupportInputRow() {
  return document.querySelector("#supportsTbody tr.support-input-row");
}

function appendNewSupportInputRow() {
  const tbody = document.getElementById("supportsTbody");
  if (!tbody) return;
  const row = document.createElement("tr");
  row.classList.add("support-input-row");
  row.innerHTML = `
    <td><input type="number" step="0.01" placeholder="e.g. 0.00"></td>
    <td>
      <select required>
        <option value="Fixed">Fixed</option>
        <option value="Pinned">Pinned</option>
        <option value="Roller">Roller</option>
      </select>
    </td>
  `;
  tbody.appendChild(row);
}

/* ─── Add, Clear & Delete Actions ────────────────────────── */

export function addSupportFromTable() {
  const row = getSupportInputRow();
  if (!row) return;

  const location = Number(row.cells[0].querySelector("input").value);
  const type = row.cells[1].querySelector("select").value;

  if (Number.isNaN(location)) return;
  if (location < 0 || location > getBeamLength()) return;

  const newSupport = { location, type };
  supports.push(newSupport);

  lockSupportRowAsDisplay(row, newSupport);
  appendNewSupportInputRow();
}

function lockSupportRowAsDisplay(row, support) {
  row.classList.remove("support-input-row");
  row.classList.add("support-data-row");
  row.cells[0].textContent = support.location.toFixed(2);
  row.cells[1].textContent = support.type;
  makeSelectableRow(row, "#supportsTbody tr.support-data-row", updateSupportDeleteButtonState);
}

export function clearSupports() {
  supports.length = 0;
  const tbody = document.getElementById("supportsTbody");
  tbody.innerHTML = "";
  appendNewSupportInputRow();
  updateSupportDeleteButtonState();
}

export function deleteSelectedSupports() {
  const tbody = document.getElementById("supportsTbody");
  const rows = Array.from(tbody.querySelectorAll("tr.support-data-row"));
  const selected = rows.filter(r => r.classList.contains("selected"));
  if (selected.length === 0) return;

  selected
    .map(row => rows.indexOf(row))
    .sort((a, b) => b - a)
    .forEach(index => {
      supports.splice(index, 1);
      rows[index].remove();
    });

  updateSupportDeleteButtonState();
}

/* ─── Delete Button State ────────────────────────────────── */

export function updateSupportDeleteButtonState() {
  const btn = document.getElementById("deleteSupportsBtn");
  if (btn) btn.disabled =
    document.querySelectorAll("#supportsTbody tr.support-data-row.selected").length === 0;
}