/* ╔══════════════════════════════════════════════════════════╗
 *  concreteSectionCalc.js
 *
 *  Performs a simplified Eurocode 2 rectangular beam bending
 *  check for a reinforced concrete section.
 *
 *  Checks both:
 *    - Sagging bending: bottom bars in tension
 *    - Hogging bending: top bars in tension
 *
 *  The calculation uses the simplified rectangular stress block
 *  method:
 *
 *    K  = MEd / (b d² fck)
 *    K' = 0.168
 *    z  = d / 2 [1 + √(1 - 3.53K)]
 *    As = MEd / (0.87 fyk z)
 *
 *  If K > K', compression reinforcement is required. In that case:
 *
 *    z is calculated using K'
 *    As2 = additional compression reinforcement demand
 *    As  = As1 + As2
 *
 *  This file is intentionally written to match the structure and
 *  style of the existing manual designer files.
 * ╚══════════════════════════════════════════════════════════╝ */



/* ─── Imports ────────────────────────────────────────────── */

import { getConcreteSectionInput }
  from "../state/manualDesignerMaterialToggle.js";

import { loadBendingFromSession }
  from "../state/store.js";

import { calculateConcreteEffectiveDepths }
  from "./concreteEffectiveDepth.js";



/* ═══════════════════════════════════════════════════════════
  CONSTANTS
═══════════════════════════════════════════════════════════ */

const K_PRIME = 0.168;
const F_YK_DEFAULT = 500;

const GAMMA_S = 1.15;
const STEEL_DESIGN_FACTOR = 0.87;

const MAX_LEVER_ARM_FACTOR = 0.95;
const MAX_REINFORCEMENT_RATIO = 0.04;

const CONCRETE_TICK =
  '<span class="util-tick" title="Pass">✔</span>';

const CONCRETE_CROSS =
  '<span class="util-cross" title="Fail">✘</span>';



/* ═══════════════════════════════════════════════════════════
  PUBLIC SECTION CALC HELPERS
═══════════════════════════════════════════════════════════ */

export function runConcreteSectionCalc(options = {}) {
  const concreteInput = getConcreteSectionInput();
  const bendingResult = loadBendingFromSession();

  return calculateConcreteSection(
    concreteInput,
    bendingResult,
    options
  );
}



/**
 * Main concrete section calculation.
 *
 * @param {Object} concreteInput - Object from getConcreteSectionInput().
 * @param {Object} bendingResult - Object from loadBendingFromSession().
 * @param {Object} options - Optional overrides.
 * @param {number} options.fyk - Reinforcement characteristic yield strength in N/mm².
 * @param {number} options.kPrime - Limiting K value.
 * @returns {Object} Full section calculation result.
 */
export function calculateConcreteSection(
  concreteInput,
  bendingResult,
  options = {}
) {
  const section = normaliseConcreteInput(concreteInput);
  const material = getMaterialProperties(section.grade, options);

  if (!section.isValid) {
    return createEmptySectionCalcResult(
      section,
      material,
      "Invalid concrete section input."
    );
  }

  const effectiveDepths = calculateConcreteEffectiveDepths(section);

  const provided = {
    top: calculateProvidedSteelArea(section.topBars),
    bottom: calculateProvidedSteelArea(section.bottomBars)
  };

  const moments = getDesignMoments(bendingResult);

  const sagging = checkConcreteBending({
    label: "Sagging",
    momentType: "sagging",
    moment: moments.maxSaggingMoment,
    width: section.width,
    depth: section.depth,
    effectiveDepth: effectiveDepths.sagging.effectiveDepth,
    compressionSteelDepth: effectiveDepths.hogging.reinforcementCentroidFromTop,
    tensionSteelProvided: provided.bottom.totalArea,
    compressionSteelProvided: provided.top.totalArea,
    tensionLayers: provided.bottom.layers,
    compressionLayers: provided.top.layers,
    material,
    options
  });

  const hogging = checkConcreteBending({
    label: "Hogging",
    momentType: "hogging",
    moment: Math.abs(moments.maxHoggingMoment),
    width: section.width,
    depth: section.depth,
    effectiveDepth: effectiveDepths.hogging.effectiveDepth,
    compressionSteelDepth: effectiveDepths.sagging.reinforcementCentroidFromBottom,
    tensionSteelProvided: provided.top.totalArea,
    compressionSteelProvided: provided.bottom.totalArea,
    tensionLayers: provided.top.layers,
    compressionLayers: provided.bottom.layers,
    material,
    options
  });

  return {
    isValid: true,

    section: {
      width: section.width,
      depth: section.depth,
      cover: section.cover,
      linkDiameter: section.linkDiameter,
      grade: section.grade
    },

    material,

    moments,

    effectiveDepths,

    providedSteel: provided,

    checks: {
      sagging,
      hogging
    },

    governing: getGoverningCheck(sagging, hogging),

    notes: getSectionCalcNotes(sagging, hogging, moments)
  };
}



/* ═══════════════════════════════════════════════════════════
  CONCRETE RESULT RENDERER
═══════════════════════════════════════════════════════════ */

export function renderConcreteSectionSummary(el, result) {
  if (!el) return;

  if (!result?.isValid) {
    el.innerHTML = `
      <div class="results-group">
        <h3>Design summary</h3>

        <p class="muted small">
          ${result?.governing?.message ?? "Concrete section check is not available."}
        </p>
      </div>
    `;

    return;
  }

  const saggingRow = renderConcreteBendingRow(result.checks?.sagging);
  const hoggingRow = renderConcreteBendingRow(result.checks?.hogging);

  const governing = result.governing;

  const governingText = governing?.isValid
    ? `
      <p class="small muted">
        Governing check: ${capitalise(governing.momentType)}
        · utilisation = ${formatNumber(governing.utilisation, 3)}
        · result: ${governing.pass ? "PASS" : "FAIL"}
      </p>
    `
    : "";

  const notes = Array.isArray(result.notes)
    ? result.notes
        .map((note) => `<p class="small muted">${note}</p>`)
        .join("")
    : "";

  el.innerHTML = `
    <div class="results-group">
      <h3>Design summary</h3>

      <div class="table-wrap">
        <table class="util-table">
          <thead>
            <tr>
              <th>Check</th>
              <th>Action</th>
              <th>Resistance</th>
              <th>Utilisation</th>
            </tr>
          </thead>

          <tbody>
            ${saggingRow}
            ${hoggingRow}
          </tbody>
        </table>
      </div>

      ${governingText}

      <p class="small muted">
        Use the concrete report button to generate the PDF calculation report.
      </p>

      ${notes}
    </div>
  `;
}


function renderConcreteBendingRow(check) {
  if (!check?.isValid) {
    return `
      <tr>
        <td>${check?.label ?? "Bending"}</td>

        <td colspan="3" class="util-warning">
          ⚠ ${check?.checks?.flexuralSteel?.message ?? "Check not available."}
        </td>
      </tr>
    `;
  }

  const demandCapacity = getConcreteDemandCapacity(check);
  const ok = check.pass;

  const moment = Math.abs(Number(check.moment?.inputMoment));
  const effectiveDepth = check.geometry?.effectiveDepth;
  const kValue = check.k?.value;
  const kLimit = check.k?.limit;

  const asRequired = check.steel?.tension?.requiredTotal;
  const asProvided = check.steel?.tension?.provided;

  const compressionRequired = !!check.k?.compressionRequired;

  const compressionText = compressionRequired
    ? `
      <br>
      <span class="muted small">
        Compression steel required
      </span>
    `
    : `
      <br>
      <span class="muted small">
        Compression steel not required
      </span>
    `;

  const compressionSubText = compressionRequired
    ? `
      <br>
      <span class="muted small">
        A'<sub>s,req</sub> = ${formatNumber(check.steel?.compression?.required, 0)} mm<sup>2</sup>
      </span>
      <br>
      <span class="muted small">
        A'<sub>s,prov</sub> = ${formatNumber(check.steel?.compression?.provided, 0)} mm<sup>2</sup>
      </span>
    `
    : "";

  return `
    <tr>
      <td>${check.label}</td>

      <td>
        M<sub>Ed</sub> = ${formatNumber(moment, 2)} kNm
        <br>
        <span class="muted small">
          d = ${formatNumber(effectiveDepth, 1)} mm
        </span>
        <br>
        <span class="muted small">
          K = ${formatNumber(kValue, 3)} / K' = ${formatNumber(kLimit, 3)}
        </span>
      </td>

      <td>
        A<sub>s,req</sub> = ${formatNumber(asRequired, 0)} mm<sup>2</sup>
        <br>
        A<sub>s,prov</sub> = ${formatNumber(asProvided, 0)} mm<sup>2</sup>
        ${compressionText}
        ${compressionSubText}
      </td>

      <td class="${ok ? "util-pass" : "util-fail"}">
        ${formatNumber(demandCapacity, 3)}&ensp;${ok ? CONCRETE_TICK : CONCRETE_CROSS}
      </td>
    </tr>
  `;
}


function getConcreteDemandCapacity(check) {
  const required = Number(check?.steel?.tension?.requiredTotal);
  const provided = Number(check?.steel?.tension?.provided);

  if (!(required > 0) || !(provided > 0)) {
    return null;
  }

  return required / provided;
}



/* ═══════════════════════════════════════════════════════════
  BENDING CHECK
═══════════════════════════════════════════════════════════ */

function checkConcreteBending(input) {
  const {
    label,
    momentType,
    moment,
    width,
    depth,
    effectiveDepth,
    compressionSteelDepth,
    tensionSteelProvided,
    compressionSteelProvided,
    tensionLayers,
    compressionLayers,
    material,
    options
  } = input;

  const fck = material.fck;
  const fyk = material.fyk;
  const kPrime = Number(options.kPrime ?? K_PRIME);

  if (!(moment > 0)) {
    return createEmptyBendingCheck({
      label,
      momentType,
      message: "No design moment found for this bending direction."
    });
  }

  if (
    !(width > 0) ||
    !(depth > 0) ||
    !(effectiveDepth > 0) ||
    !(fck > 0) ||
    !(fyk > 0)
  ) {
    return createEmptyBendingCheck({
      label,
      momentType,
      moment,
      message: "Insufficient section or material data for bending check."
    });
  }

  const mEd = momentToNmm(moment);
  const b = width;
  const d = effectiveDepth;

  const k = mEd / (b * Math.pow(d, 2) * fck);
  const kForLeverArm = Math.min(k, kPrime);

  const zRaw = calculateLeverArm(d, kForLeverArm);

  if (!(zRaw > 0)) {
    return createEmptyBendingCheck({
      label,
      momentType,
      moment,
      message: "Lever arm could not be calculated for this bending check."
    });
  }

  const zMax = MAX_LEVER_ARM_FACTOR * d;
  const z = Math.min(zRaw, zMax);

  const singlyReinforced = k <= kPrime;
  const compressionRequired = !singlyReinforced;

  const asMin = calculateMinimumTensionSteelArea({
    width: b,
    effectiveDepth: d,
    fctm: material.fctm,
    fyk
  });

  const asMax = calculateMaximumSteelArea({
    width: b,
    depth
  });

  let asRequiredFlexure = 0;
  let asRequiredTotal = 0;
  let asCompressionRequired = 0;

  if (singlyReinforced) {
    asRequiredFlexure = mEd / (STEEL_DESIGN_FACTOR * fyk * z);
    asRequiredTotal = Math.max(asRequiredFlexure, asMin);
  } else {
    const mLim = kPrime * fck * b * Math.pow(d, 2);
    const as1 = mLim / (STEEL_DESIGN_FACTOR * fyk * z);

    const dPrime = compressionSteelDepth;
    const leverArmToCompressionSteel = d - dPrime;

    if (!(dPrime > 0) || !(leverArmToCompressionSteel > 0)) {
      return createEmptyBendingCheck({
        label,
        momentType,
        moment,
        message: "Compression reinforcement is required, but compression steel depth is invalid."
      });
    }

    const additionalMoment = mEd - mLim;

    asCompressionRequired =
      additionalMoment / (STEEL_DESIGN_FACTOR * fyk * leverArmToCompressionSteel);

    asRequiredFlexure = as1 + asCompressionRequired;
    asRequiredTotal = Math.max(asRequiredFlexure, asMin);
  }

  const tensionUtilisation = asRequiredTotal > 0
    ? tensionSteelProvided / asRequiredTotal
    : null;

  const compressionUtilisation = asCompressionRequired > 0
    ? compressionSteelProvided / asCompressionRequired
    : null;

  const tensionPass = tensionSteelProvided >= asRequiredTotal;

  const compressionPass = !compressionRequired ||
    compressionSteelProvided >= asCompressionRequired;

  const minSteelPass = tensionSteelProvided >= asMin;
  const maxSteelPass = tensionSteelProvided <= asMax;

  const leverArmPass = isLeverArmValid(z, d);

  const pass = tensionPass &&
    compressionPass &&
    minSteelPass &&
    maxSteelPass &&
    leverArmPass;

  return {
    isValid: true,
    pass,

    label,
    momentType,

    moment: {
      inputMoment: moment,
      designMomentNmm: mEd
    },

    geometry: {
      width: b,
      depth,
      effectiveDepth: d,
      compressionSteelDepth,
      leverArm: z,
      leverArmRaw: zRaw,
      leverArmLimit: zMax,
      leverArmRatio: z / d
    },

    material: {
      fck,
      fyk,
      fctm: material.fctm
    },

    k: {
      value: k,
      limit: kPrime,
      valueUsedForLeverArm: kForLeverArm,
      singlyReinforced,
      compressionRequired
    },

    steel: {
      tension: {
        provided: tensionSteelProvided,
        requiredFlexure: asRequiredFlexure,
        requiredMinimum: asMin,
        requiredTotal: asRequiredTotal,
        utilisation: tensionUtilisation,
        pass: tensionPass,
        layers: tensionLayers
      },

      compression: {
        provided: compressionSteelProvided,
        required: asCompressionRequired,
        utilisation: compressionUtilisation,
        pass: compressionPass,
        layers: compressionLayers
      },

      maximum: {
        limit: asMax,
        pass: maxSteelPass
      }
    },

    checks: {
      flexuralSteel: {
        pass: tensionPass,
        message: tensionPass
          ? "Provided tension steel is greater than or equal to required tension steel."
          : "Provided tension steel is less than required tension steel."
      },

      compressionSteel: {
        pass: compressionPass,
        required: compressionRequired,
        message: compressionRequired
          ? compressionPass
            ? "Compression reinforcement is required and the provided compression steel is adequate."
            : "Compression reinforcement is required and the provided compression steel is not adequate."
          : "Compression reinforcement is not required because K is less than or equal to K'."
      },

      minimumSteel: {
        pass: minSteelPass,
        message: minSteelPass
          ? "Provided tension steel satisfies the minimum tension reinforcement check."
          : "Provided tension steel is below the minimum tension reinforcement check."
      },

      maximumSteel: {
        pass: maxSteelPass,
        message: maxSteelPass
          ? "Provided tension steel is below the maximum reinforcement limit."
          : "Provided tension steel exceeds the maximum reinforcement limit."
      },

      leverArm: {
        pass: leverArmPass,
        message: leverArmPass
          ? "Lever arm is valid and does not exceed 0.95d."
          : "Lever arm is invalid."
      }
    }
  };
}


function calculateLeverArm(d, k) {
  const radicand = 1 - 3.53 * k;

  if (radicand < 0) {
    return null;
  }

  return (d / 2) * (1 + Math.sqrt(radicand));
}


function isLeverArmValid(z, d) {
  return z > 0 && z <= MAX_LEVER_ARM_FACTOR * d;
}



/* ═══════════════════════════════════════════════════════════
  STEEL AREA CHECKS
═══════════════════════════════════════════════════════════ */

function calculateProvidedSteelArea(layers) {
  const validLayers = sanitiseBarLayers(layers);

  let totalArea = 0;

  const calculatedLayers = validLayers.map((layer) => {
    const singleBarArea = calculateBarArea(layer.barDiameter);
    const layerArea = layer.numberOfBars * singleBarArea;

    totalArea += layerArea;

    return {
      layer: layer.layer,
      numberOfBars: layer.numberOfBars,
      barDiameter: layer.barDiameter,
      singleBarArea,
      layerArea
    };
  });

  return {
    totalArea,
    layers: calculatedLayers
  };
}


function calculateBarArea(diameter) {
  return Math.PI * Math.pow(Number(diameter), 2) / 4;
}


function calculateMinimumTensionSteelArea(input) {
  const {
    width,
    effectiveDepth,
    fctm,
    fyk
  } = input;

  if (!(width > 0) || !(effectiveDepth > 0) || !(fctm > 0) || !(fyk > 0)) {
    return 0;
  }

  const asMinByConcreteTension = 0.26 * (fctm / fyk) * width * effectiveDepth;
  const asMinAbsolute = 0.0013 * width * effectiveDepth;

  return Math.max(asMinByConcreteTension, asMinAbsolute);
}


function calculateMaximumSteelArea(input) {
  const {
    width,
    depth
  } = input;

  if (!(width > 0) || !(depth > 0)) {
    return Infinity;
  }

  return MAX_REINFORCEMENT_RATIO * width * depth;
}



/* ═══════════════════════════════════════════════════════════
  MATERIAL PROPERTIES
═══════════════════════════════════════════════════════════ */

function getMaterialProperties(grade, options = {}) {
  const fck = Number(options.fck ?? parseFckFromGrade(grade) ?? 30);
  const fyk = Number(options.fyk ?? F_YK_DEFAULT);
  const fctm = Number(options.fctm ?? getFctmFromFck(fck));

  return {
    grade,
    fck,
    fyk,
    fctm,
    gammaS: GAMMA_S,
    steelDesignStress: STEEL_DESIGN_FACTOR * fyk
  };
}


function parseFckFromGrade(grade) {
  if (!grade || typeof grade !== "string") {
    return null;
  }

  const match = grade.match(/C\s*(\d+)\s*\/\s*(\d+)/i);

  if (match) {
    return Number(match[1]);
  }

  const fallback = grade.match(/(\d+)/);

  return fallback ? Number(fallback[1]) : null;
}


/**
 * Mean axial tensile strength fctm.
 *
 * For normal strength concrete up to C50/60:
 *
 *   fctm = 0.30 fck^(2/3)
 *
 * This is enough for the simple beam check used here.
 */
function getFctmFromFck(fck) {
  if (!(fck > 0)) {
    return 0;
  }

  if (fck <= 50) {
    return 0.30 * Math.pow(fck, 2 / 3);
  }

  return 2.12 * Math.log(1 + ((fck + 8) / 10));
}



/* ═══════════════════════════════════════════════════════════
  BENDING MOMENTS
═══════════════════════════════════════════════════════════ */

function getDesignMoments(bendingResult) {
  if (!bendingResult) {
    return {
      hasResult: false,
      maxSaggingMoment: 0,
      maxHoggingMoment: 0,
      governingMomentType: null,
      governingMoment: 0
    };
  }

  const direct = getDirectMomentValues(bendingResult);

  if (direct.hasResult) {
    return direct;
  }

  const values = collectMomentValues(bendingResult);

  if (!values.length) {
    return {
      hasResult: false,
      maxSaggingMoment: 0,
      maxHoggingMoment: 0,
      governingMomentType: null,
      governingMoment: 0
    };
  }

  const positiveValues = values.filter((value) => value > 0);
  const negativeValues = values.filter((value) => value < 0);

  const maxSaggingMoment = positiveValues.length
    ? Math.max(...positiveValues)
    : 0;

  const maxHoggingMoment = negativeValues.length
    ? Math.min(...negativeValues)
    : 0;

  const governingMomentType =
    Math.abs(maxSaggingMoment) >= Math.abs(maxHoggingMoment)
      ? "sagging"
      : "hogging";

  const governingMoment = governingMomentType === "sagging"
    ? maxSaggingMoment
    : maxHoggingMoment;

  return {
    hasResult: true,
    maxSaggingMoment,
    maxHoggingMoment,
    governingMomentType,
    governingMoment
  };
}


function getDirectMomentValues(bendingResult) {
  const maxSaggingMoment = firstFiniteNumber([
    bendingResult.maxSaggingMoment,
    bendingResult.maximumSaggingMoment,
    bendingResult.maxSagging,
    bendingResult.saggingMax
  ]);

  const maxHoggingMoment = firstFiniteNumber([
    bendingResult.maxHoggingMoment,
    bendingResult.maximumHoggingMoment,
    bendingResult.maxHogging,
    bendingResult.hoggingMax
  ]);

  if (maxSaggingMoment == null && maxHoggingMoment == null) {
    return {
      hasResult: false,
      maxSaggingMoment: 0,
      maxHoggingMoment: 0,
      governingMomentType: null,
      governingMoment: 0
    };
  }

  const sagging = maxSaggingMoment ?? 0;
  const hogging = maxHoggingMoment ?? 0;

  const governingMomentType =
    Math.abs(sagging) >= Math.abs(hogging)
      ? "sagging"
      : "hogging";

  const governingMoment = governingMomentType === "sagging"
    ? sagging
    : hogging;

  return {
    hasResult: true,
    maxSaggingMoment: sagging,
    maxHoggingMoment: hogging,
    governingMomentType,
    governingMoment
  };
}


function firstFiniteNumber(values) {
  const value = values.find((item) => Number.isFinite(Number(item)));

  return value == null ? null : Number(value);
}


function collectMomentValues(value) {
  const values = [];

  walkMomentObject(value, values);

  return values;
}


function walkMomentObject(value, values) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkMomentObject(item, values));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const momentKeys = [
    "moment",
    "bendingMoment",
    "M",
    "m",
    "value",
    "y"
  ];

  momentKeys.forEach((key) => {
    if (Number.isFinite(Number(value[key]))) {
      values.push(Number(value[key]));
    }
  });

  Object.entries(value).forEach(([key, child]) => {
    if (momentKeys.includes(key)) {
      return;
    }

    if (Array.isArray(child) || typeof child === "object") {
      walkMomentObject(child, values);
    }
  });
}


function momentToNmm(moment) {
  return Math.abs(Number(moment)) * 1e6;
}



/* ═══════════════════════════════════════════════════════════
  INPUT NORMALISATION
═══════════════════════════════════════════════════════════ */

function normaliseConcreteInput(input) {
  const width = Number(input?.width ?? 0);
  const depth = Number(input?.depth ?? 0);
  const cover = Number(input?.cover ?? 0);
  const linkDiameter = Number(input?.linkDiameter ?? 0);

  return {
    isValid: width > 0 && depth > 0,
    grade: input?.grade ?? "",
    width,
    depth,
    cover,
    linkDiameter,
    linkSpacing: Number(input?.linkSpacing ?? 0),
    topBars: sanitiseBarLayers(input?.topBars ?? []),
    bottomBars: sanitiseBarLayers(input?.bottomBars ?? [])
  };
}


function sanitiseBarLayers(layers) {
  if (!Array.isArray(layers)) {
    return [];
  }

  return layers
    .map((layer, index) => ({
      layer: Number(layer.layer ?? index + 1),
      numberOfBars: Number(layer.numberOfBars ?? 0),
      barDiameter: Number(layer.barDiameter ?? 0)
    }))
    .filter((layer) => {
      return layer.numberOfBars > 0 && layer.barDiameter > 0;
    });
}



/* ═══════════════════════════════════════════════════════════
  GOVERNING CHECK
═══════════════════════════════════════════════════════════ */

function getGoverningCheck(sagging, hogging) {
  if (!sagging?.isValid && !hogging?.isValid) {
    return {
      isValid: false,
      momentType: null,
      utilisation: null,
      pass: false,
      message: "No valid sagging or hogging bending check was completed."
    };
  }

  const saggingUtilisation = getCheckUtilisation(sagging);
  const hoggingUtilisation = getCheckUtilisation(hogging);

  if (saggingUtilisation >= hoggingUtilisation) {
    return {
      isValid: sagging.isValid,
      momentType: "sagging",
      utilisation: saggingUtilisation,
      pass: sagging.pass,
      message: "Sagging check governs based on tension steel utilisation."
    };
  }

  return {
    isValid: hogging.isValid,
    momentType: "hogging",
    utilisation: hoggingUtilisation,
    pass: hogging.pass,
    message: "Hogging check governs based on tension steel utilisation."
  };
}


function getCheckUtilisation(check) {
  if (!check?.isValid) {
    return 0;
  }

  const utilisation = check.steel?.tension?.utilisation;

  if (!(utilisation > 0)) {
    return 0;
  }

  return 1 / utilisation;
}



/* ═══════════════════════════════════════════════════════════
  NOTES
═══════════════════════════════════════════════════════════ */

function getSectionCalcNotes(sagging, hogging, moments) {
  const notes = [];

  if (!moments.hasResult) {
    notes.push(
      "No stored bending result was found. Sagging and hogging checks could not use analysis moments."
    );
  }

  if (sagging?.k?.compressionRequired) {
    notes.push(
      "Sagging K exceeds K', so compression reinforcement is required in the top of the section."
    );
  }

  if (hogging?.k?.compressionRequired) {
    notes.push(
      "Hogging K exceeds K', so compression reinforcement is required in the bottom of the section."
    );
  }

  notes.push(
    "This is a simplified rectangular-section ULS bending check only."
  );

  notes.push(
    "Further checks normally required for a full RC beam design include shear, anchorage, curtailment, crack control, deflection, durability cover, spacing, fire resistance where relevant, and support detailing."
  );

  return notes;
}



/* ═══════════════════════════════════════════════════════════
  EMPTY RESULTS
═══════════════════════════════════════════════════════════ */

function createEmptySectionCalcResult(section, material, message) {
  return {
    isValid: false,

    section,
    material,

    moments: {
      hasResult: false,
      maxSaggingMoment: 0,
      maxHoggingMoment: 0,
      governingMomentType: null,
      governingMoment: 0
    },

    effectiveDepths: null,

    providedSteel: {
      top: {
        totalArea: 0,
        layers: []
      },
      bottom: {
        totalArea: 0,
        layers: []
      }
    },

    checks: {
      sagging: createEmptyBendingCheck({
        label: "Sagging",
        momentType: "sagging",
        message
      }),
      hogging: createEmptyBendingCheck({
        label: "Hogging",
        momentType: "hogging",
        message
      })
    },

    governing: {
      isValid: false,
      momentType: null,
      utilisation: null,
      pass: false,
      message
    },

    notes: [message]
  };
}


function createEmptyBendingCheck(input) {
  const {
    label,
    momentType,
    moment = 0,
    message
  } = input;

  return {
    isValid: false,
    pass: false,

    label,
    momentType,

    moment: {
      inputMoment: moment,
      designMomentNmm: momentToNmm(moment)
    },

    geometry: {
      width: null,
      depth: null,
      effectiveDepth: null,
      compressionSteelDepth: null,
      leverArm: null,
      leverArmRaw: null,
      leverArmLimit: null,
      leverArmRatio: null
    },

    material: {
      fck: null,
      fyk: null,
      fctm: null
    },

    k: {
      value: null,
      limit: K_PRIME,
      valueUsedForLeverArm: null,
      singlyReinforced: null,
      compressionRequired: null
    },

    steel: {
      tension: {
        provided: 0,
        requiredFlexure: 0,
        requiredMinimum: 0,
        requiredTotal: 0,
        utilisation: null,
        pass: false,
        layers: []
      },

      compression: {
        provided: 0,
        required: 0,
        utilisation: null,
        pass: false,
        layers: []
      },

      maximum: {
        limit: null,
        pass: false
      }
    },

    checks: {
      flexuralSteel: {
        pass: false,
        message
      },

      compressionSteel: {
        pass: false,
        required: false,
        message
      },

      minimumSteel: {
        pass: false,
        message
      },

      maximumSteel: {
        pass: false,
        message
      },

      leverArm: {
        pass: false,
        message
      }
    }
  };
}



/* ═══════════════════════════════════════════════════════════
  GENERAL FORMAT HELPERS
═══════════════════════════════════════════════════════════ */

function formatNumber(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toFixed(decimals);
}


function capitalise(value) {
  if (!value || typeof value !== "string") {
    return "—";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}