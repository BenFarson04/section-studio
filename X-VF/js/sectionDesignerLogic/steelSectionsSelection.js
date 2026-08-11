/* ╔══════════════════════════════════════════════════════════╗
 *  steelSectionsSelection.js
 *
 *  Builds the section-type and section-size dropdowns on the
 *  manual designer page. Loads all Blue Book CSVs in parallel,
 *  populates a custom grouped dropdown, and wires selection
 *  to the canvas preview and window.selectedSteelSection.
 *
 *  Imported as a side-effect module from main.js.
 *
 *  Dependencies:  steelSectionsReader.js
 *                 draw/steelSections/*.js (preview renderers)
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { loadSections, loadHollowSections, loadCircularSections }
                                             from "./steelSectionsReader.js";
import { drawSelectedISteelSection }         from "../draw/sections/ub&ucPreview.js";
import { drawSelectedPFCSteelSection }       from "../draw/sections/pfcPreview.js";
import { drawSelectedAngleSteelSection }     from "../draw/sections/anglesPreview.js";
import { drawSelectedHollowSteelSection }    from "../draw/sections/shs&rhsPreview.js";
import { drawSelectedCHSSteelSection }       from "../draw/sections/chsPreview.js";


/* ═══════════════════════════════════════════════════════════
 *  CONFIGURATION
 * ═══════════════════════════════════════════════════════════ */

/* ─── Type → Drawing Function Map ────────────────────────── */

const DRAWERS = {
  UB:  drawSelectedISteelSection,
  UC:  drawSelectedISteelSection,
  PFC: drawSelectedPFCSteelSection,
  EA:  drawSelectedAngleSteelSection,
  UA:  drawSelectedAngleSteelSection,
  SHS: drawSelectedHollowSteelSection,
  RHS: drawSelectedHollowSteelSection,
  CHS: drawSelectedCHSSteelSection,
};


/* ═══════════════════════════════════════════════════════════
 *  INITIALISATION
 * ═══════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  const sectionTypeSelect      = document.getElementById("sectionTypeSelect");
  const sectionContainer       = document.getElementById("sectionContainer");
  const selectedSectionDisplay = document.getElementById("selectedSectionDisplay");

  /* ─── Section Type Registry ────────────────────────────── */

  const sectionTypes = {
    UB:  { path: "../../../references/bluebook/ubSections/ubSections.csv",   data: [], loader: loadSections },
    UC:  { path: "../../../references/bluebook/ucSections/ucSections.csv",   data: [], loader: loadSections },
    PFC: { path: "../../../references/bluebook/pfcSections/pfcSections.csv", data: [], loader: loadSections },
    EA:  { path: "../../../references/bluebook/angleSections/eaSections/eaSections.csv",   data: [], loader: loadSections },
    UA:  { path: "../../../references/bluebook/angleSections/uaSections/uaSections.csv",   data: [], loader: loadSections },
    SHS: { path: "../../../references/bluebook/shsSections/shsSections.csv", data: [], loader: loadHollowSections },
    RHS: { path: "../../../references/bluebook/rhsSections/rhsSections.csv", data: [], loader: loadHollowSections },
    CHS: { path: "../../../references/bluebook/chsSections/chsSections.csv", data: [], loader: loadCircularSections },
  };

  /* ─── Parallel CSV Loading ─────────────────────────────── */

  async function initSections() {
    const entries = Object.entries(sectionTypes)
      .filter(([, cfg]) => cfg.path);

    const results = await Promise.allSettled(
      entries.map(([, cfg]) => cfg.loader(cfg.path))
    );

    results.forEach((result, i) => {
      const [key] = entries[i];
      if (result.status === "fulfilled") {
        sectionTypes[key].data = result.value;
        console.log(`✅ ${key} sections loaded: ${result.value.length}`);
      } else {
        console.error(`❌ Failed to load ${key}:`, result.reason);
      }
    });

    const current = sectionTypeSelect.value;
    if (sectionTypes[current]?.data.length) {
      showSections(current);
    }
  }

  initSections();

  /* ─── Type Dropdown Listener ───────────────────────────── */

  sectionTypeSelect.addEventListener("change", () => {
    const type = sectionTypeSelect.value;
    if (sectionTypes[type]?.data.length) {
      showSections(type);
    } else {
      clearSelection();
    }
  });

  /* ─── Section Dropdown Builder ─────────────────────────── */

  function showSections(type) {
    const sections = sectionTypes[type].data;
    if (!sections.length) { clearSelection(); return; }

    let lastPrefix = null;
    let useAlt     = false;

    const wrapper = document.createElement("div");
    wrapper.className = "custom-dropdown";

    const header = document.createElement("div");
    header.className = "dropdown-header";
    header.textContent = "Select section ▼";

    const list = document.createElement("div");
    list.className = "dropdown-list hidden";

    header.addEventListener("click", () => list.classList.toggle("hidden"));

    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) list.classList.add("hidden");
    });

    sections.forEach(sec => {
      const item = document.createElement("div");
      item.className = "dropdown-item";
      item.textContent = sec.section;

      // CHS groups by diameter (first number), others by "h x b"
      const match  = sec.section.match(/^([\d.]+(?:\s*x\s*\d+)?)/);
      const prefix = match ? match[1] : null;
      if (prefix !== lastPrefix) { useAlt = !useAlt; lastPrefix = prefix; }
      item.classList.add(useAlt ? "group-blue" : "group-white");

      item.addEventListener("click", () => {
        list.querySelectorAll(".dropdown-item").forEach(el =>
          el.classList.remove("selected")
        );

        item.classList.add("selected");
        header.textContent = sec.section + " ▼";
        list.classList.add("hidden");

        window.selectedSteelSection = sec;

        if (selectedSectionDisplay) {
          selectedSectionDisplay.textContent = `Selected: ${sec.section}`;
        }

        const drawFn = DRAWERS[type];
        if (drawFn) {
          drawFn(sec, "beamCanvas");
        } else {
          console.warn(`⚠️ No drawing function registered for type "${type}"`);
        }

        console.log(`✅ Selected ${type} section:`, sec);
      });

      list.appendChild(item);
    });

    wrapper.appendChild(header);
    wrapper.appendChild(list);
    sectionContainer.innerHTML = "";
    sectionContainer.appendChild(wrapper);
  }

  /* ─── Clear Selection ──────────────────────────────────── */

  function clearSelection() {
    sectionContainer.innerHTML =
      '<span class="muted small">No sections available</span>';
    if (selectedSectionDisplay) {
      selectedSectionDisplay.textContent = "No section selected";
    }
    window.selectedSteelSection = null;
  }
});