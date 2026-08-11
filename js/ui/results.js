/* ╔══════════════════════════════════════════════════════════╗
 *  results.js
 *
 *  Populates the results tables on the beam analysis page:
 *  support reactions and shear/bending diagram extremes.
 *
 *  Dependencies:  analysis/reactions.js
 *                 analysis/shear.js
 *                 analysis/bending.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { solveReactions } from "../analysis/reactions.js";
import { getShearResults } from "../analysis/shear.js";
import { getBendingResults } from "../analysis/bending.js";

/* ─── DOM Helper ─────────────────────────────────────────── */

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ─── Results Update ─────────────────────────────────────── */

export function updateResults() {

  // Support reactions table
  const tbody = document.getElementById("reactionsTbody");
  if (!tbody) return;

  const result = solveReactions();
  tbody.innerHTML = "";

  if (!result.ok) {
    const row = document.createElement("tr");
    row.innerHTML =
      '<td colspan="4" style="text-align:center; color:#ef4444;">' +
      result.message +
      "</td>";
    tbody.appendChild(row);
  } else {
    for (let i = 0; i < result.reactions.length; i++) {
      const r = result.reactions[i];
      const row = document.createElement("tr");
      row.innerHTML =
        "<td>" + (i + 1) + "</td>" +
        "<td>" + r.x.toFixed(2) + "</td>" +
        "<td>" + (r.Rv !== undefined ? r.Rv.toFixed(2) : "-") + "</td>" +
        "<td>" + (r.M !== undefined ? r.M.toFixed(2) : "-") + "</td>";
      tbody.appendChild(row);
    }
  }

  // Diagram extremes table
  setText("VmaxPos", "-");  setText("VmaxPosX", "-");
  setText("VmaxNeg", "-");  setText("VmaxNegX", "-");
  setText("MmaxPos", "-");  setText("MmaxPosX", "-");
  setText("MmaxNeg", "-");  setText("MmaxNegX", "-");

  const shear = getShearResults ? getShearResults() : null;
  if (shear && shear.ok && shear.meta) {
    setText("VmaxPos", shear.meta.maxPos.value.toFixed(2));
    setText("VmaxPosX", shear.meta.maxPos.x.toFixed(2));
    setText("VmaxNeg", shear.meta.maxNeg.value.toFixed(2));
    setText("VmaxNegX", shear.meta.maxNeg.x.toFixed(2));
  }

  const bend = getBendingResults ? getBendingResults() : null;
  if (bend && bend.ok && bend.meta) {
    setText("MmaxPos", bend.meta.maxPos.value.toFixed(2));
    setText("MmaxPosX", bend.meta.maxPos.x.toFixed(2));
    setText("MmaxNeg", bend.meta.maxNeg.value.toFixed(2));
    setText("MmaxNegX", bend.meta.maxNeg.x.toFixed(2));
  }
}