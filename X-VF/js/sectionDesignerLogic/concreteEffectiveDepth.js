/* ╔══════════════════════════════════════════════════════════╗
 *  concreteEffectiveDepth.js
 *
 *  Calculates effective depths for a reinforced concrete
 *  rectangular section using the live concrete input values.
 *
 *  Sagging:
 *    Bottom reinforcement is assumed to be the tension steel.
 *    Effective depth is measured from the top compression face
 *    to the centroid of the bottom reinforcement group.
 *
 *  Hogging:
 *    Top reinforcement is assumed to be the tension steel.
 *    Effective depth is measured from the bottom compression face
 *    to the centroid of the top reinforcement group.
 *
 *  The reinforcement layer positioning intentionally mirrors
 *  concreteSection.js so the calculation and drawing remain
 *  consistent.
 * ╚══════════════════════════════════════════════════════════╝ */

import { getConcreteSectionInput }
  from "../state/manualDesignerMaterialToggle.js";

import { loadBendingFromSession }
  from "../state/store.js";


/* ═══════════════════════════════════════════════════════════
  CONSTANTS
═══════════════════════════════════════════════════════════ */

/**
 * Typical maximum aggregate size used where no explicit
 * aggregate input exists in the UI.
 *
 * Minimum clear spacing between reinforcement layers is taken as:
 *
 *   max(current bar diameter, previous bar diameter, aggregate + 5, 20)
 *
 * For 20 mm aggregate, this gives a 25 mm minimum clear gap.
 */
const DEFAULT_AGGREGATE_SIZE = 20;


/* ═══════════════════════════════════════════════════════════
  PUBLIC EFFECTIVE DEPTH HELPER
═══════════════════════════════════════════════════════════ */

export function getConcreteEffectiveDepths() {
  const cfg = getConcreteSectionInput();

  return calculateConcreteEffectiveDepths(cfg);
}


/**
 * Calculates both sagging and hogging effective depths.
 *
 * @param {Object} cfg - Concrete section input object from getConcreteSectionInput().
 * @param {Object} options - Optional settings.
 * @param {number} options.aggregateSize - Maximum aggregate size in mm.
 * @returns {Object} Effective depth summary.
 */
export function calculateConcreteEffectiveDepths(cfg, options = {}) {
  const depth = Number(cfg?.depth ?? 0);
  const cover = Number(cfg?.cover ?? 0);
  const linkDiameter = Number(cfg?.linkDiameter ?? 0);

  const aggregateSize = Number(
    options.aggregateSize ?? DEFAULT_AGGREGATE_SIZE
  );

  if (!(depth > 0)) {
    return createEmptyEffectiveDepthResult("Invalid or missing section depth.");
  }

  const common = {
    depth,
    cover,
    linkDiameter,
    aggregateSize
  };

  const bottomCentroid = calculateReinforcementCentroidFromNearestFace(
    cfg?.bottomBars ?? [],
    common
  );

  const topCentroid = calculateReinforcementCentroidFromNearestFace(
    cfg?.topBars ?? [],
    common
  );

  const dSagging = bottomCentroid.isValid
    ? depth - bottomCentroid.centroidFromNearestFace
    : null;

  const dHogging = topCentroid.isValid
    ? depth - topCentroid.centroidFromNearestFace
    : null;

  const bending = getStoredBendingMomentSummary();

  return {
    isValid: bottomCentroid.isValid || topCentroid.isValid,

    depth,
    cover,
    linkDiameter,
    aggregateSize,

    sagging: {
      description: "Top compression face to centroid of bottom tension steel.",
      tensionZone: "bottom",
      effectiveDepth: dSagging,
      reinforcementCentroidFromBottom: bottomCentroid.centroidFromNearestFace,
      layers: bottomCentroid.layers,
      steelArea: bottomCentroid.steelArea,
      isValid: bottomCentroid.isValid
    },

    hogging: {
      description: "Bottom compression face to centroid of top tension steel.",
      tensionZone: "top",
      effectiveDepth: dHogging,
      reinforcementCentroidFromTop: topCentroid.centroidFromNearestFace,
      layers: topCentroid.layers,
      steelArea: topCentroid.steelArea,
      isValid: topCentroid.isValid
    },

    bending,

    governing: getGoverningEffectiveDepth(dSagging, dHogging, bending)
  };
}


/* ═══════════════════════════════════════════════════════════
  REINFORCEMENT CENTROID CALCULATION
═══════════════════════════════════════════════════════════ */

/**
 * Calculates the centroid of a reinforcement stack measured from
 * the nearest concrete face.
 *
 * For bottom bars:
 *   nearest face = bottom face.
 *
 * For top bars:
 *   nearest face = top face.
 *
 * This intentionally mirrors the layer spacing logic used in
 * concreteSection.js:
 *
 *   first layer centre = cover + link diameter + bar diameter / 2
 *
 *   subsequent layer clear spacing =
 *     max(current bar dia, previous bar dia, aggregate + 5, 20)
 */
function calculateReinforcementCentroidFromNearestFace(layers, section) {
  const validLayers = sanitiseBarLayers(layers);

  if (!validLayers.length) {
    return {
      isValid: false,
      centroidFromNearestFace: null,
      steelArea: 0,
      layers: []
    };
  }

  const {
    cover,
    linkDiameter,
    aggregateSize
  } = section;

  let yCentre = Number(cover) + Number(linkDiameter);
  let previousBarDiameter = 0;

  let totalArea = 0;
  let firstMomentOfArea = 0;

  const calculatedLayers = [];

  validLayers.forEach((layer, index) => {
    const numberOfBars = Number(layer.numberOfBars);
    const barDiameter = Number(layer.barDiameter);

    if (index === 0) {
      yCentre += barDiameter / 2;
    } else {
      const clearSpacing = getMinimumClearLayerSpacing(
        barDiameter,
        previousBarDiameter,
        aggregateSize
      );

      yCentre += previousBarDiameter / 2;
      yCentre += clearSpacing;
      yCentre += barDiameter / 2;
    }

    const singleBarArea = getBarArea(barDiameter);
    const layerArea = numberOfBars * singleBarArea;

    totalArea += layerArea;
    firstMomentOfArea += layerArea * yCentre;

    calculatedLayers.push({
      layer: layer.layer,
      numberOfBars,
      barDiameter,
      singleBarArea,
      layerArea,
      centreFromNearestFace: yCentre
    });

    previousBarDiameter = barDiameter;
  });

  return {
    isValid: totalArea > 0,
    centroidFromNearestFace: totalArea > 0
      ? firstMomentOfArea / totalArea
      : null,
    steelArea: totalArea,
    layers: calculatedLayers
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


function getBarArea(barDiameter) {
  return Math.PI * Math.pow(barDiameter, 2) / 4;
}


function getMinimumClearLayerSpacing(
  currentBarDiameter,
  previousBarDiameter,
  aggregateSize
) {
  return Math.max(
    Number(currentBarDiameter) || 0,
    Number(previousBarDiameter) || 0,
    Number(aggregateSize) + 5 || 0,
    20
  );
}


/* ═══════════════════════════════════════════════════════════
  STORED BENDING MOMENT SUMMARY
═══════════════════════════════════════════════════════════ */

/**
 * Attempts to read maximum sagging and hogging moments from the
 * stored bending result.
 *
 * This is deliberately tolerant because the exact result shape may
 * vary between calculation modules.
 */
export function getStoredBendingMomentSummary() {
  const bending = loadBendingFromSession();

  if (!bending) {
    return {
      hasResult: false,
      maxSaggingMoment: null,
      maxHoggingMoment: null,
      governingMomentType: null,
      governingMoment: null
    };
  }

  const direct = getDirectBendingValues(bending);

  if (direct.hasResult) {
    return direct;
  }

  const momentValues = collectMomentValues(bending);

  if (!momentValues.length) {
    return {
      hasResult: false,
      maxSaggingMoment: null,
      maxHoggingMoment: null,
      governingMomentType: null,
      governingMoment: null
    };
  }

  const maxSaggingMoment = Math.max(
    0,
    ...momentValues.filter((value) => value > 0)
  );

  const maxHoggingMoment = Math.min(
    0,
    ...momentValues.filter((value) => value < 0)
  );

  const saggingAbs = Math.abs(maxSaggingMoment);
  const hoggingAbs = Math.abs(maxHoggingMoment);

  const governingMomentType = saggingAbs >= hoggingAbs
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


/**
 * Handles common explicit result shapes, for example:
 *
 *   {
 *     maxSaggingMoment: 120,
 *     maxHoggingMoment: -80
 *   }
 */
function getDirectBendingValues(bending) {
  const maxSaggingMoment = firstFiniteNumber([
    bending.maxSaggingMoment,
    bending.maximumSaggingMoment,
    bending.maxSagging,
    bending.saggingMax
  ]);

  const maxHoggingMoment = firstFiniteNumber([
    bending.maxHoggingMoment,
    bending.maximumHoggingMoment,
    bending.maxHogging,
    bending.hoggingMax
  ]);

  if (maxSaggingMoment == null && maxHoggingMoment == null) {
    return {
      hasResult: false,
      maxSaggingMoment: null,
      maxHoggingMoment: null,
      governingMomentType: null,
      governingMoment: null
    };
  }

  const sagging = maxSaggingMoment ?? 0;
  const hogging = maxHoggingMoment ?? 0;

  const governingMomentType = Math.abs(sagging) >= Math.abs(hogging)
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


/**
 * Recursively collects likely bending moment values from the stored
 * bending result.
 *
 * This looks for common property names only, so it avoids accidentally
 * treating x-position, length, or index values as moments.
 */
function collectMomentValues(value) {
  const values = [];

  walkBendingObject(value, values);

  return values;
}


function walkBendingObject(value, values) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkBendingObject(item, values));
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
      walkBendingObject(child, values);
    }
  });
}


/* ═══════════════════════════════════════════════════════════
  GOVERNING EFFECTIVE DEPTH
═══════════════════════════════════════════════════════════ */

function getGoverningEffectiveDepth(dSagging, dHogging, bending) {
  if (!bending?.hasResult) {
    return {
      hasResult: false,
      momentType: null,
      moment: null,
      effectiveDepth: null,
      note: "No stored bending result found."
    };
  }

  if (bending.governingMomentType === "sagging") {
    return {
      hasResult: dSagging != null,
      momentType: "sagging",
      moment: bending.governingMoment,
      effectiveDepth: dSagging,
      note: "Sagging moment uses bottom reinforcement as tension steel."
    };
  }

  if (bending.governingMomentType === "hogging") {
    return {
      hasResult: dHogging != null,
      momentType: "hogging",
      moment: bending.governingMoment,
      effectiveDepth: dHogging,
      note: "Hogging moment uses top reinforcement as tension steel."
    };
  }

  return {
    hasResult: false,
    momentType: null,
    moment: null,
    effectiveDepth: null,
    note: "Unable to determine governing moment type."
  };
}


/* ═══════════════════════════════════════════════════════════
  EMPTY RESULT
═══════════════════════════════════════════════════════════ */

function createEmptyEffectiveDepthResult(message) {
  return {
    isValid: false,

    depth: null,
    cover: null,
    linkDiameter: null,
    aggregateSize: DEFAULT_AGGREGATE_SIZE,

    sagging: {
      description: "Top compression face to centroid of bottom tension steel.",
      tensionZone: "bottom",
      effectiveDepth: null,
      reinforcementCentroidFromBottom: null,
      layers: [],
      steelArea: 0,
      isValid: false
    },

    hogging: {
      description: "Bottom compression face to centroid of top tension steel.",
      tensionZone: "top",
      effectiveDepth: null,
      reinforcementCentroidFromTop: null,
      layers: [],
      steelArea: 0,
      isValid: false
    },

    bending: {
      hasResult: false,
      maxSaggingMoment: null,
      maxHoggingMoment: null,
      governingMomentType: null,
      governingMoment: null
    },

    governing: {
      hasResult: false,
      momentType: null,
      moment: null,
      effectiveDepth: null,
      note: message
    }
  };
}