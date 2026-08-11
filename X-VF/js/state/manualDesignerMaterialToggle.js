/* ╔══════════════════════════════════════════════════════════╗
 *  manualDesignerMaterialToggle.js
 * ╚══════════════════════════════════════════════════════════╝ */


/* ═══════════════════════════════════════════════════════════
  PUBLIC INITIALISER
═══════════════════════════════════════════════════════════ */

export function initialiseManualDesignerMaterialToggle() {
  initialiseMaterialToggle();
  initialiseConcreteBarTables();
}


/* ═══════════════════════════════════════════════════════════
  MATERIAL PANEL TOGGLE
═══════════════════════════════════════════════════════════ */

function initialiseMaterialToggle() {
  const steelBtn = document.getElementById("steelDesignBtn");
  const concreteBtn = document.getElementById("concreteDesignBtn");
  const steelPanel = document.getElementById("steelInputsPanel");
  const concretePanel = document.getElementById("concreteInputsPanel");
  const materialInput = document.getElementById("designMaterial");

  const accordionMeta = document.getElementById("sectionAccordionMeta");
  const utilisationContainer = document.getElementById("utilisationContainer");

  if (!steelBtn || !concreteBtn || !steelPanel || !concretePanel) {
    return;
  }

  steelBtn.addEventListener("click", () => {
    setMaterialMode("steel");
  });

  concreteBtn.addEventListener("click", () => {
    setMaterialMode("concrete");
  });

  function setMaterialMode(mode) {
    const isSteel = mode === "steel";

    steelPanel.hidden = !isSteel;
    concretePanel.hidden = isSteel;

    steelBtn.classList.toggle("is-active", isSteel);
    concreteBtn.classList.toggle("is-active", !isSteel);

    steelBtn.setAttribute("aria-pressed", String(isSteel));
    concreteBtn.setAttribute("aria-pressed", String(!isSteel));

    if (materialInput) {
      materialInput.value = mode;
    }

    if (accordionMeta) {
      accordionMeta.textContent = isSteel
        ? "Steel catalogue"
        : "Concrete section";
    }

    if (utilisationContainer) {
      utilisationContainer.innerHTML = isSteel
        ? `
          <p class="muted small">
            Select a UB/UC section and run analysis to see utilisations.
          </p>
        `
        : `
          <p class="muted small">
            Enter concrete geometry and reinforcement, then run analysis to see concrete checks.
          </p>
        `;
    }
  }

  setMaterialMode("steel");
}


/* ═══════════════════════════════════════════════════════════
  CONCRETE BAR TABLES
═══════════════════════════════════════════════════════════ */

function initialiseConcreteBarTables() {
  initialiseBarTable({
    tbodyId: "topBarsTbody",
    addBtnId: "addTopBarLayerBtn",
    deleteBtnId: "deleteTopBarLayerBtn",
    clearBtnId: "clearTopBarLayersBtn",
    zone: "top"
  });

  initialiseBarTable({
    tbodyId: "bottomBarsTbody",
    addBtnId: "addBottomBarLayerBtn",
    deleteBtnId: "deleteBottomBarLayerBtn",
    clearBtnId: "clearBottomBarLayersBtn",
    zone: "bottom"
  });
}


function initialiseBarTable(config) {
  const tbody = document.getElementById(config.tbodyId);
  const addBtn = document.getElementById(config.addBtnId);
  const deleteBtn = document.getElementById(config.deleteBtnId);
  const clearBtn = document.getElementById(config.clearBtnId);

  if (!tbody || !addBtn || !deleteBtn || !clearBtn) {
    return;
  }

  addBtn.addEventListener("click", () => {
    clearSelectedRows(tbody);
    tbody.appendChild(createBarLayerRow(config.zone));
    renumberBarLayers(tbody);
    updateDeleteButtonState(tbody, deleteBtn);
  });

  deleteBtn.addEventListener("click", () => {
    const selectedRows = tbody.querySelectorAll("tr.is-selected");

    selectedRows.forEach((row) => row.remove());

    if (tbody.children.length === 0) {
      tbody.appendChild(createBarLayerRow(config.zone));
    }

    renumberBarLayers(tbody);
    updateDeleteButtonState(tbody, deleteBtn);
  });

  clearBtn.addEventListener("click", () => {
    tbody.innerHTML = "";
    tbody.appendChild(createBarLayerRow(config.zone));

    renumberBarLayers(tbody);
    updateDeleteButtonState(tbody, deleteBtn);
  });

  tbody.addEventListener("click", (event) => {
    if (event.target.closest("input, select, button")) {
      return;
    }

    const row = event.target.closest("tr");

    if (!row || !tbody.contains(row)) {
      return;
    }

    row.classList.toggle("is-selected");
    updateDeleteButtonState(tbody, deleteBtn);
  });

  renumberBarLayers(tbody);
  updateDeleteButtonState(tbody, deleteBtn);
}


function createBarLayerRow(zone) {
  const row = document.createElement("tr");

  row.className = "bar-layer-row";
  row.dataset.barZone = zone;

  row.innerHTML = `
    <td class="bar-layer-index"></td>
    <td>
      <input type="number" min="0" step="1" value="2" />
    </td>
    <td>
      <select>
        <option value="8">H8</option>
        <option value="10">H10</option>
        <option value="12">H12</option>
        <option value="16" selected>H16</option>
        <option value="20">H20</option>
        <option value="25">H25</option>
        <option value="32">H32</option>
        <option value="40">H40</option>
      </select>
    </td>
  `;

  return row;
}


function renumberBarLayers(tbody) {
  const rows = tbody.querySelectorAll("tr");

  rows.forEach((row, index) => {
    const layerCell = row.querySelector(".bar-layer-index");

    if (layerCell) {
      layerCell.textContent = index + 1;
    }
  });
}


function clearSelectedRows(tbody) {
  const rows = tbody.querySelectorAll("tr.is-selected");

  rows.forEach((row) => {
    row.classList.remove("is-selected");
  });
}


function updateDeleteButtonState(tbody, deleteBtn) {
  const selectedRows = tbody.querySelectorAll("tr.is-selected");
  deleteBtn.disabled = selectedRows.length === 0;
}


/* ═══════════════════════════════════════════════════════════
  PUBLIC CONCRETE INPUT HELPER
═══════════════════════════════════════════════════════════ */

export function getConcreteSectionInput() {
  return {
    grade: document.getElementById("concreteGradeSelect")?.value ?? "",
    width: Number(document.getElementById("concreteWidth")?.value ?? 0),
    depth: Number(document.getElementById("concreteDepth")?.value ?? 0),
    cover: Number(document.getElementById("concreteCover")?.value ?? 0),
    linkDiameter: Number(document.getElementById("linkDiameter")?.value ?? 0),
    linkSpacing: Number(document.getElementById("linkSpacing")?.value ?? 0),
    topBars: getBarLayerInputs("topBarsTbody"),
    bottomBars: getBarLayerInputs("bottomBarsTbody")
  };
}


function getBarLayerInputs(tbodyId) {
  const tbody = document.getElementById(tbodyId);

  if (!tbody) {
    return [];
  }

  return Array.from(tbody.querySelectorAll("tr")).map((row, index) => {
    const numberInput = row.querySelector("input");
    const diameterSelect = row.querySelector("select");

    return {
      layer: index + 1,
      numberOfBars: Number(numberInput?.value ?? 0),
      barDiameter: Number(diameterSelect?.value ?? 0)
    };
  });
}