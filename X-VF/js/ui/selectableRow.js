/* ╔══════════════════════════════════════════════════════════╗
 *  selectableRow.js
 *
 *  Makes a table row click-selectable with multi-select
 *  support via Ctrl+click. Fires a callback on change.
 * ╚══════════════════════════════════════════════════════════╝ */

export function makeSelectableRow(row, scopeSelector, onChange) {
  row.addEventListener("click", e => {
    const scopeRows = document.querySelectorAll(`${scopeSelector}.selected`);
    if (!e.ctrlKey) scopeRows.forEach(r => r.classList.remove("selected"));
    row.classList.toggle("selected");
    onChange();
  });
}