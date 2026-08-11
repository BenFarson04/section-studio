/* ╔══════════════════════════════════════════════════════════╗
 *  main.js
 *
 *  Page-aware application controller.
 * ╚══════════════════════════════════════════════════════════╝ */



/* ─── Imports ────────────────────────────────────────────── */

import { draw } from "./draw/index.js";

import {
  initSupportsUI,
  addSupportFromTable,
  clearSupports,
  deleteSelectedSupports,
  rebuildSupportsTable,
} from "./ui/supportsTable.js";

import {
  initUDLsUI,
  addUDLFromTable,
  clearUDLs,
  deleteSelectedUDLs,
  rebuildUDLsTable,
} from "./ui/udlsTable.js";

import {
  initPointLoadsUI,
  addPointLoadFromTable,
  clearPointLoads,
  deleteSelectedPointLoads,
  rebuildPointLoadsTable,
} from "./ui/pointLoadsTable.js";

import { solveReactions } from "./analysis/reactions.js";
import { updateResults } from "./ui/results.js";

import {
  computeShear,
  restoreShearFromSession,
} from "./analysis/shear.js";

import {
  computeBending,
  restoreBendingFromSession,
} from "./analysis/bending.js";

import {
  loadModelFromSession,
  saveModelToSession,
} from "./state/store.js";

import "./sectionDesignerLogic/steelSectionsSelection.js";
import "./sectionDesignerLogic/steelGradesSelection.js";
import "./sectionDesignerLogic/generateReport.js";
import "./sectionDesignerLogic/generateConcreteReport.js";

import { runUbUcDesignCheck }    from "./sectionDesignerLogic/ubUcSectionCalc.js";
import { runPfcDesignCheck }     from "./sectionDesignerLogic/pfcSectionCalc.js";
import { runEaUaDesignCheck }    from "./sectionDesignerLogic/eaUaSectionCalc.js";
import { runShsRhsDesignCheck }  from "./sectionDesignerLogic/shsRhsSectionCalc.js";
import { runChsDesignCheck }     from "./sectionDesignerLogic/chsSectionCalc.js";

import {
  runConcreteSectionCalc,
  renderConcreteSectionSummary,
} from "./sectionDesignerLogic/concreteSectionCalc.js";

import { computeDeflection } from "./sectionDesignerLogic/steelDeflection.js";

import { initialiseManualDesignerMaterialToggle } from "./state/manualDesignerMaterialToggle.js";

import { drawConcreteSection } from "./draw/sections/concreteSection.js";



/* ═══════════════════════════════════════════════════════════
 *  APPLICATION STATE
 * ═══════════════════════════════════════════════════════════ */

let isBeamInputPage = false;
let isManualDesignerPage = false;
let restoredModel = null;
let beamResizeBound = false;
let concreteResizeBound = false;
let showDiagrams = false;



/* ═══════════════════════════════════════════════════════════
 *  INITIALISATION
 * ═══════════════════════════════════════════════════════════ */

function initApp() {
  detectPage();

  restoredModel = loadModelFromSession();

  if (isBeamInputPage) {
    initBeamInputPage();
  }

  if (isManualDesignerPage) {
    initManualDesignerPage();
  }

  restoreResultsFromSession();
}


function detectPage() {
  isBeamInputPage      = !!document.getElementById("length");
  isManualDesignerPage = !!document.getElementById("designMaterial");
}



/* ─── Beam Input Page Setup ──────────────────────────────── */

function initBeamInputPage() {
  initSupportsUI();
  initUDLsUI();
  initPointLoadsUI();
  initComingSoonModal();

  if (restoredModel) {
    rebuildSupportsTable();
    rebuildUDLsTable();
    rebuildPointLoadsTable();
  }

  safeDrawBeam();

  if (!beamResizeBound) {
    window.addEventListener("resize", handleBeamResize);
    beamResizeBound = true;
  }
}


function handleBeamResize() {
  if (isBeamInputPage) {
    safeDrawBeam();
  }
}



/* ─── Manual Designer Page Setup ─────────────────────────── */

function initManualDesignerPage() {
  initialiseManualDesignerMaterialToggle();

  bindConcretePreviewInputs();

  renderConcreteIfActive();

  setupDeflectionObserver();

  if (!concreteResizeBound) {
    window.addEventListener("resize", renderConcreteIfActive);
    concreteResizeBound = true;
  }
}



/* ─── Concrete preview wiring ────────────────────────────── */

function renderConcreteIfActive() {
  if (!isManualDesignerPage) return;

  const material = document.getElementById("designMaterial")?.value;

  if (material !== "concrete") return;

  try {
    drawConcreteSection();
  } catch (err) {
    console.error("Concrete draw failed:", err);
  }
}


function bindConcretePreviewInputs() {
  [
    "concreteGradeSelect",
    "concreteWidth",
    "concreteDepth",
    "concreteCover",
    "linkDiameter",
    "linkSpacing",
  ].forEach((id) => {
    const el = document.getElementById(id);

    if (!el) return;

    el.addEventListener("input",  handleConcreteInputChanged);
    el.addEventListener("change", handleConcreteInputChanged);
  });

  ["topBarsTbody", "bottomBarsTbody"].forEach((id) => {
    const tbody = document.getElementById(id);

    if (!tbody) return;

    tbody.addEventListener("input",  handleConcreteInputChanged);
    tbody.addEventListener("change", handleConcreteInputChanged);
  });

  [
    "addTopBarLayerBtn",    "deleteTopBarLayerBtn",    "clearTopBarLayersBtn",
    "addBottomBarLayerBtn", "deleteBottomBarLayerBtn", "clearBottomBarLayersBtn",
  ].forEach((id) => {
    const btn = document.getElementById(id);

    if (!btn) return;

    btn.addEventListener("click", () => {
      setTimeout(handleConcreteInputChanged, 0);
    });
  });

  document.getElementById("concreteDesignBtn")
    ?.addEventListener("click", () => {
      setTimeout(() => {
        renderConcreteIfActive();
        resetConcreteUtilisationMessage();
      }, 0);
    });

  document.getElementById("steelDesignBtn")
    ?.addEventListener("click", () => {
      setTimeout(resetSteelUtilisationMessage, 0);
    });
}


function handleConcreteInputChanged() {
  renderConcreteIfActive();

  const material = document.getElementById("designMaterial")?.value;

  if (material === "concrete") {
    resetConcreteUtilisationMessage();
  }
}


function resetConcreteUtilisationMessage() {
  const material = document.getElementById("designMaterial")?.value;
  const utilContainer = document.getElementById("utilisationContainer");

  if (material !== "concrete" || !utilContainer) return;

  utilContainer.innerHTML = `
    <p class="muted small">
      Enter concrete geometry and reinforcement, then run analysis to see concrete checks.
    </p>
  `;
}


function resetSteelUtilisationMessage() {
  const material = document.getElementById("designMaterial")?.value;
  const utilContainer = document.getElementById("utilisationContainer");

  if (material !== "steel" || !utilContainer) return;

  utilContainer.innerHTML = `
    <p class="muted small">
      Select a UB/UC section and run analysis to see utilisations.
    </p>
  `;
}



/* ═══════════════════════════════════════════════════════════
 *  MODEL CHANGE HANDLER
 * ═══════════════════════════════════════════════════════════ */

function onModelChanged() {
  showDiagrams = false;

  saveModelToSession();
  loadModelFromSession();
  safeDrawBeam();
}



/* ═══════════════════════════════════════════════════════════
 *  CALCULATION ENTRY POINT
 * ═══════════════════════════════════════════════════════════ */

function calculate() {
  if (isBeamInputPage) {
    calculateBeamPage();
    return;
  }

  if (isManualDesignerPage) {
    calculateManualDesignerPage();
    return;
  }

  console.warn("calculate() called on an unsupported page.");
}



/* ─── Beam Analysis (index.html) ─────────────────────────── */

function calculateBeamPage() {
  const output = document.getElementById("stabilityResult");

  if (!output) return;

  const result = solveReactions();

  if (!result?.ok) {
    output.textContent = result?.message || "Beam is not statically determinate.";
    output.style.color = "red";

    showDiagrams = false;

    safeDrawBeam();
    updateResultsIfPresent();
    saveReactionsToSession();
    saveModelToSession();

    return;
  }

  const stability = result.stability;

  if (stability?.warning) {
    output.textContent = stability.warning;
    output.style.color = "orange";
  } else if (stability?.message) {
    output.textContent = stability.message;
    output.style.color = "green";
  } else {
    output.textContent = "Calculation successful.";
    output.style.color = "green";
  }

  computeShear({ samples: 400 });
  computeBending({ samples: 400 });

  showDiagrams = true;

  safeDrawBeam();
  updateResultsIfPresent();

  saveReactionsToSession();
  saveModelToSession();

  restoreResultsFromSession();
}



/* ─── Section Design (manualDesigner.html) ───────────────── */

function calculateManualDesignerPage() {
  const output     = document.getElementById("stabilityResult");
  const shearRes   = restoreShearFromSession();
  const bendingRes = restoreBendingFromSession();

  if (!shearRes?.ok || !bendingRes?.ok) {
    if (output) {
      output.textContent = "Run beam analysis first on the beam page.";
      output.style.color = "orange";
    }

    return;
  }

  if (output) {
    output.textContent = "Using saved beam analysis.";
    output.style.color = "green";
  }

  const designMaterial =
    document.getElementById("designMaterial")?.value ?? "steel";

  if (designMaterial === "concrete") {
    calculateConcreteDesignerPage();
    return;
  }

  calculateSteelDesignerPage();
}



/* ─── Concrete Section Design ────────────────────────────── */

function calculateConcreteDesignerPage() {
  const output = document.getElementById("stabilityResult");
  const utilContainer = document.getElementById("utilisationContainer");

  try {
    const result = runConcreteSectionCalc();

    renderConcreteSectionSummary(
      utilContainer,
      result
    );

    if (output) {
      output.textContent = result?.isValid
        ? "Concrete section check complete."
        : "Concrete section check could not be completed.";

      output.style.color = result?.isValid
        ? "green"
        : "orange";
    }

    renderConcreteIfActive();
  } catch (err) {
    console.error("Concrete design check failed:", err);

    if (output) {
      output.textContent = "Concrete design check failed.";
      output.style.color = "red";
    }

    if (utilContainer) {
      utilContainer.innerHTML = `
        <p class="muted small">
          Concrete design check failed. See console for details.
        </p>
      `;
    }
  }
}



/* ─── Steel Section Design ───────────────────────────────── */

function calculateSteelDesignerPage() {
  const sectionType = document.getElementById("sectionTypeSelect")?.value;

  let ran = true;

  if (sectionType === "UB" || sectionType === "UC") {
    runUbUcDesignCheck();
  } else if (sectionType === "PFC") {
    runPfcDesignCheck();
  } else if (sectionType === "EA" || sectionType === "UA") {
    runEaUaDesignCheck();
  } else if (sectionType === "SHS" || sectionType === "RHS") {
    runShsRhsDesignCheck();
  } else if (sectionType === "CHS") {
    runChsDesignCheck();
  } else {
    ran = false;

    const utilContainer = document.getElementById("utilisationContainer");

    if (utilContainer) {
      utilContainer.innerHTML = `
        <p class="muted small">
          No utilisation checks available for this section type.
        </p>
      `;
    }
  }

  if (ran) {
    setTimeout(appendDeflectionInfo, 0);
  }
}



/* ─── Deflection Info (read-only, appended after steel checks) ── */

function appendDeflectionInfo() {
  const utilContainer = document.getElementById("utilisationContainer");

  if (!utilContainer) return;

  const material = document.getElementById("designMaterial")?.value ?? "steel";

  if (material !== "steel") return;

  if (utilContainer.querySelector(".deflection-info")) return;

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

  const block = document.createElement("div");

  block.className = "deflection-info";

  block.innerHTML = `
    <h3>Max deflection</h3>
    <div class="deflection-info__row">
      <span class="deflection-info__value">${Math.abs(dMax).toFixed(2)} mm</span>
      <span class="deflection-info__span">${ratioText}</span>
    </div>
    <p class="muted small">
      Peak at x = ${formatNumber(xMax, 2)} m · elastic, self-weight excluded · no limit applied.
    </p>
  `;

  utilContainer.appendChild(block);
}



/* ─── Deflection Observer (runs after steel calc renders) ─── */

function setupDeflectionObserver() {
  const secDisplay   = document.getElementById("selectedSectionDisplay");
  const gradeDisplay = document.getElementById("steelGradeDisplay");

  const trigger = () => setTimeout(appendDeflectionInfo, 0);

  const obs = new MutationObserver(trigger);

  if (secDisplay) {
    obs.observe(secDisplay, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (gradeDisplay) {
    obs.observe(gradeDisplay, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  trigger();
}



/* ═══════════════════════════════════════════════════════════
 *  HELPERS
 * ═══════════════════════════════════════════════════════════ */

function updateLength() {
  if (!isBeamInputPage) return;

  onModelChanged();
}


function safeDrawBeam() {
  if (!isBeamInputPage) return;

  const canvas = document.getElementById("beamCanvas");

  if (!canvas) return;

  try {
    draw({ showDiagrams });
  } catch (err) {
    console.error("Beam draw failed:", err);
  }
}


function updateResultsIfPresent() {
  const reactionsTbody = document.getElementById("reactionsTbody");
  const extremesTable  = document.getElementById("extremesTable");

  if (!reactionsTbody && !extremesTable) return;

  try {
    updateResults();
  } catch (err) {
    console.error("Results update failed:", err);
  }
}


function formatNumber(value, dp = 2) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toFixed(dp);
}

function initComingSoonModal() {
  const explorerBtn = document.getElementById("explorerDesignBtn");
  const modal       = document.getElementById("comingSoonModal");
  const closeBtn    = document.getElementById("comingSoonCloseBtn");

  if (!explorerBtn || !modal || !closeBtn) return;

  const openModal = () => {
    modal.hidden = false;

    requestAnimationFrame(() => {
      modal.classList.add("is-visible");
    });

    closeBtn.focus();
  };

  const closeModal = () => {
    modal.classList.remove("is-visible");

    setTimeout(() => {
      modal.hidden = true;
    }, 220);
  };

  explorerBtn.addEventListener("click", openModal);

  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeModal();
    }
  });
}



/* ─── Session Persistence ────────────────────────────────── */

function saveReactionsToSession() {
  const tbody = document.getElementById("reactionsTbody");

  if (!tbody) return;

  sessionStorage.setItem("reactionsTbodyHTML", tbody.innerHTML);
}


function restoreResultsFromSession() {
  const shear   = restoreShearFromSession();
  const bending = restoreBendingFromSession();

  if (shear?.ok && shear.meta) {
    setCell("VmaxPos",  shear.meta.maxPos?.value);
    setCell("VmaxPosX", shear.meta.maxPos?.x);
    setCell("VmaxNeg",  shear.meta.maxNeg?.value);
    setCell("VmaxNegX", shear.meta.maxNeg?.x);
  }

  if (bending?.ok && bending.meta) {
    setCell("MmaxPos",  bending.meta.maxPos?.value);
    setCell("MmaxPosX", bending.meta.maxPos?.x);
    setCell("MmaxNeg",  bending.meta.maxNeg?.value);
    setCell("MmaxNegX", bending.meta.maxNeg?.x);
  }

  const reactionsHTML  = sessionStorage.getItem("reactionsTbodyHTML");
  const reactionsTbody = document.getElementById("reactionsTbody");

  if (reactionsTbody && reactionsHTML) {
    reactionsTbody.innerHTML = reactionsHTML;
  }

  const hasData = !!(shear?.ok || bending?.ok);
  const output  = document.getElementById("stabilityResult");

  if (hasData && output) {
    output.textContent = isBeamInputPage
      ? "Results from analysis"
      : "Saved beam analysis found";

    output.style.color = "green";
  }
}


function setCell(id, value) {
  const el = document.getElementById(id);

  if (!el) return;

  if (value === undefined || value === null || !Number.isFinite(value)) {
    el.textContent = "-";
    return;
  }

  el.textContent = Math.abs(value) < 0.005
    ? "0.00"
    : Number(value).toFixed(2);
}



/* ═══════════════════════════════════════════════════════════
 *  GLOBAL BINDINGS
 * ═══════════════════════════════════════════════════════════ */

window.calculate    = calculate;
window.updateLength = updateLength;

window.addSupportFromTable = () => {
  addSupportFromTable();
  onModelChanged();
};

window.clearSupports = () => {
  clearSupports();
  onModelChanged();
};

window.deleteSelectedSupports = () => {
  deleteSelectedSupports();
  onModelChanged();
};

window.addUDLFromTable = () => {
  addUDLFromTable();
  onModelChanged();
};

window.clearUDLs = () => {
  clearUDLs();
  onModelChanged();
};

window.deleteSelectedUDLs = () => {
  deleteSelectedUDLs();
  onModelChanged();
};

window.addPointLoadFromTable = () => {
  addPointLoadFromTable();
  onModelChanged();
};

window.clearPointLoads = () => {
  clearPointLoads();
  onModelChanged();
};

window.deleteSelectedPointLoads = () => {
  deleteSelectedPointLoads();
  onModelChanged();
};

window.saveReactionsToSession = saveReactionsToSession;



/* ═══════════════════════════════════════════════════════════
 *  STARTUP
 * ═══════════════════════════════════════════════════════════ */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp, { once: true });
} else {
  initApp();
}

