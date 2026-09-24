/*
 * Concrete shear check based on EN 1992-1-1 shear resistance expressions.
 *
 * This module is intentionally separate from the UI and is designed to be
 * reused by the concrete designer and report generator.
 */

const DEFAULT_COT_THETA = 2.0;
const DEFAULT_LINK_LEGS = 2;
const DEFAULT_LINK_GRADE = 500;
const GAMMA_C = 1.5;
const GAMMA_S = 1.15;
const ALPHA_CC = 0.85;

function toNumber(value, fallback = 0) {
  const num = Number(value ?? fallback);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getConcreteMaterialProperties(grade, options = {}) {
  const fck = toNumber(options.fck ?? parseFckFromGrade(grade), 30);
  const fyk = toNumber(options.fyk ?? DEFAULT_LINK_GRADE, DEFAULT_LINK_GRADE);

  return {
    grade: grade || "",
    fck,
    fyk,
    fcd: ALPHA_CC * fck / GAMMA_C,
    fywd: fyk / GAMMA_S,
    gammaC: GAMMA_C,
    gammaS: GAMMA_S,
  };
}

function parseFckFromGrade(grade) {
  if (!grade || typeof grade !== "string") {
    return null;
  }

  const match = grade.match(/C\s*(\d+)\s*\/\s*(\d+)/i);
  if (match) return Number(match[1]);

  const fallback = grade.match(/(\d+)/);
  return fallback ? Number(fallback[1]) : null;
}

function getEffectiveDepth(input) {
  if (Number.isFinite(Number(input?.effectiveDepth))) {
    return Number(input.effectiveDepth);
  }

  const depth = toNumber(input?.depth, 0);
  const cover = toNumber(input?.cover, 0);
  const linkDiameter = toNumber(input?.linkDiameter, 0);

  if (!(depth > 0)) return 0;

  const topBars = Array.isArray(input?.topBars) ? input.topBars : [];
  const bottomBars = Array.isArray(input?.bottomBars) ? input.bottomBars : [];

  const maxBarDiameter = [...topBars, ...bottomBars].reduce((max, layer) => {
    const dia = toNumber(layer?.barDiameter, 0);
    return Math.max(max, dia);
  }, 0);

  // Use the same centroid-based geometry convention as the existing RC
  // effective depth calculation: cover + link diameter + bar radius.
  const centroidDistanceFromNearestFace = cover + linkDiameter + maxBarDiameter / 2;

  return Math.max(depth - centroidDistanceFromNearestFace, 0);
}

function calculateLongitudinalSteelArea(input) {
  if (Number.isFinite(Number(input?.longitudinalSteelArea))) {
    return Math.max(toNumber(input.longitudinalSteelArea, 0), 0);
  }

  const total = [
    ...(Array.isArray(input?.topBars) ? input.topBars : []),
    ...(Array.isArray(input?.bottomBars) ? input.bottomBars : [])
  ].reduce((sum, layer) => {
    const bars = toNumber(layer?.numberOfBars, 0);
    const dia = toNumber(layer?.barDiameter, 0);
    if (!(bars > 0) || !(dia > 0)) return sum;
    return sum + bars * Math.PI * dia * dia / 4;
  }, 0);

  return total;
}

function calculateLinkArea(diameterMm, legs) {
  const dia = toNumber(diameterMm, 0);
  const nLegs = Math.max(toNumber(legs, DEFAULT_LINK_LEGS), 1);

  if (!(dia > 0)) return 0;

  return nLegs * Math.PI * dia * dia / 4;
}

function calculateConcreteShearResistance(input = {}, options = {}) {
  const section = {
    grade: input?.grade || "",
    width: toNumber(input?.width, 0),
    depth: toNumber(input?.depth, 0),
    cover: toNumber(input?.cover, 0),
    linkDiameter: toNumber(input?.linkDiameter, 0),
    linkSpacing: toNumber(input?.linkSpacing, 0),
    linkLegs: Math.max(toNumber(input?.linkLegs, DEFAULT_LINK_LEGS), 1),
    effectiveDepth: getEffectiveDepth(input),
    longitudinalSteelArea: calculateLongitudinalSteelArea(input),
    VEd: toNumber(input?.VEd, 0),
  };

  const material = getConcreteMaterialProperties(section.grade, options);
  const d = section.effectiveDepth;
  const bw = section.width;
  const fck = material.fck;
  const fywd = material.fywd;
  const cotTheta = clamp(toNumber(input?.cotTheta ?? options.cotTheta ?? DEFAULT_COT_THETA, DEFAULT_COT_THETA), 1, 2.5);

  const warnings = [];
  const assumptions = [
    "Concrete shear resistance is assessed using EN 1992-1-1 expressions with no axial compression contribution (σcp = 0).",
    "A default cotθ = 2.0 is used unless the UI or caller overrides it, within the EC2 recommended range 1.0 to 2.5.",
    "For the section-level check, the longitudinal reinforcement ratio uses the larger of top and bottom provided steel as a conservative approximation in the absence of a location-specific tension steel input."
  ];

  if (!(section.width > 0) || !(section.depth > 0) || !(d > 0)) {
    return {
      isValid: false,
      warnings: ["Invalid or missing section geometry for concrete shear check."],
      assumptions,
      pass: false,
      VEd: section.VEd,
      VEdN: 0,
      VRdC: 0,
      VRdS: 0,
      VRdMax: 0,
      governingResistance: 0,
      utilisation: Infinity,
      linkDiameter: section.linkDiameter,
      linkSpacing: section.linkSpacing,
      linkLegs: section.linkLegs,
      linkArea: 0,
      effectiveDepth: d,
      concreteStrength: fck,
      reinforcementDesignStrength: fywd,
      cotTheta,
      units: "kN",
    };
  }

  if (!(fck > 0)) {
    warnings.push("Concrete strength is invalid or missing.");
  }

  const rhoL = section.longitudinalSteelArea / (bw * d);
  const k = 1 + Math.sqrt(200 / d);
  const kClamped = Math.min(k, 2.0);
  const vMin = 0.035 * Math.pow(kClamped, 1.5) * Math.sqrt(fck);
  const fRdc = 0.18 / GAMMA_C;
  const vRdCPart = fRdc * kClamped * Math.pow(100 * rhoL * fck, 1 / 3);
  const vRdCN = Math.max(vRdCPart, vMin) * bw * d;

  const linkArea = calculateLinkArea(section.linkDiameter, section.linkLegs);
  const linkSpacing = section.linkSpacing;
  const hasLinks = section.linkDiameter > 0 && linkSpacing > 0 && linkArea > 0;
  const nu1 = Math.min(0.6, 0.6 * (1 - fck / 250));

  if (!hasLinks) {
    warnings.push("No valid shear links were supplied. The concrete resistance only check is reported.");
  }

  if (linkSpacing <= 0) {
    warnings.push("Link spacing is zero or missing.");
  }

  let z = 0;
  let aswPerSpacing = 0;
  let vRdSN = 0;
  let vRdMaxN = 0;
  let governingResistanceN = 0;

  if (hasLinks) {
    z = 0.9 * d;
    const s = linkSpacing;
    aswPerSpacing = linkArea / s;
    const tanTheta = 1 / cotTheta;
    const vRdSValueN = aswPerSpacing * z * fywd * cotTheta;
    vRdSN = vRdSValueN;

    const vRdMaxValueN = (bw * z * nu1 * material.fcd) / (cotTheta + tanTheta);
    vRdMaxN = vRdMaxValueN;

    // EC2: with provided shear reinforcement, the design resistance is usually the
    // lower of V_Rd,s and V_Rd,max. V_Rd,c remains a concrete-only resistance and is
    // not the governing design value once links are present.
    governingResistanceN = Math.min(vRdMaxN, vRdSN);
  } else {
    governingResistanceN = vRdCN;
  }

  const designShearN = Math.max(0, section.VEd * 1000);
  const utilisation = governingResistanceN > 0 ? designShearN / governingResistanceN : Infinity;
  const pass = designShearN <= governingResistanceN && (designShearN <= vRdCN || hasLinks) && (!hasLinks || designShearN <= vRdMaxN);
  const governingCheck = hasLinks
    ? "Shear links control, with strut capacity as the upper limit."
    : "Concrete shear resistance governs because no valid shear links are defined.";

  return {
    isValid: true,
    pass,
    warning: warnings.length ? warnings.join(" ") : "",
    warnings,
    assumptions,
    governingCheck,
    VEd: section.VEd,
    VEdN: designShearN,
    VRdC: vRdCN / 1000,
    VRdS: vRdSN / 1000,
    VRdMax: vRdMaxN / 1000,
    governingResistance: governingResistanceN / 1000,
    utilisation,
    shearResistanceType: hasLinks ? "shear reinforcement" : "concrete",
    linkDiameter: section.linkDiameter,
    linkSpacing: section.linkSpacing,
    linkLegs: section.linkLegs,
    linkArea,
    effectiveDepth: d,
    concreteStrength: fck,
    longitudinalSteelRatio: rhoL,
    reinforcementDesignStrength: fywd,
    cotTheta,
    geometry: {
      width: bw,
      depth: section.depth,
      cover: section.cover,
    },
    units: {
      dimensions: "mm",
      concreteStrength: "MPa",
      shearResistance: "N",
      shearResistanceDisplay: "kN",
      area: "mm²",
      force: "kN",
    },
    intermediate: {
      k: kClamped,
      rhoL,
      vMin,
      fRdc,
      crdC: fRdc,
      aswPerSpacing,
      z,
      nu1,
      theta: Math.atan(1 / cotTheta) * 180 / Math.PI,
      vRdC: vRdCN,
      vRdS: vRdSN,
      vRdMax: vRdMaxN,
      designShearN,
      governingResistanceN,
    }
  };
}

export { calculateConcreteShearResistance };
