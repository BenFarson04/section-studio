/* ╔══════════════════════════════════════════════════════════╗
 *  generateReport.js
 *
 *  Generates a PDF calculation report by writing EN 1993-1-1
 *  design-check results onto a blank PDF template.
 *
 *  Supports:  UB / UC   (I-sections)
 *             PFC       (parallel flange channels)
 *             EA / UA   (equal & unequal angles)
 *             SHS / RHS (square & rectangular hollow sections)
 *             CHS       (circular hollow sections)
 *
 *  Dependencies:  pdf-lib (via <script> tag), steelDeflection.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { loadShearFromSession, loadBendingFromSession } from "../state/store.js";
import { computeDeflection } from "./steelDeflection.js";

const { PDFDocument, rgb, StandardFonts } = PDFLib;


/* ═══════════════════════════════════════════════════════════
 *  CONSTANTS & CONFIGURATION
 * ═══════════════════════════════════════════════════════════ */

/* ─── Design Parameters ──────────────────────────────────── */

const GAMMA_M0    = 1.0;
const EPSILON_MAP = { S235: 1.00, S275: 0.92, S355: 0.81, S460: 0.71 };

/* ─── Colour Palette ─────────────────────────────────────── */

const COL = {
  black : rgb(0, 0, 0),
  grey  : rgb(0.40, 0.40, 0.40),
  blue  : rgb(0.15, 0.25, 0.55),
  green : rgb(0.10, 0.55, 0.10),
  red   : rgb(0.75, 0.10, 0.10),
};

/* ─── Page Layout ────────────────────────────────────────── */

const PG = {
  bodyTop: 675, bodyBot: 45, left: 55, right: 555,
  indent: 70, indent2: 85,
  hSize: 11, bSize: 8.5, sSize: 7.5,
  hLine: 16, bLine: 12, sLine: 10,
  secGap: 8, paraGap: 5, hGap: 4,
};

/* ─── Title Block Field Positions ────────────────────────── */

const TB = {
  jobTitle  : { x: 55,  y: 710, size: 16 },
  jobNo     : { x: 330, y: 800, size: 8 },
  sheetNo   : { x: 420, y: 800, size: 8 },
  rev       : { x: 535, y: 800, size: 8 },
  memberLoc : { x: 360, y: 745, size: 8 },
  drgRef    : { x: 340, y: 727, size: 8 },
  madeBy    : { x: 340, y: 710, size: 8 },
  date      : { x: 420, y: 710, size: 8 },
  chd       : { x: 520, y: 710, size: 8 },
};


/* ═══════════════════════════════════════════════════════════
 *  REPORT DETAILS MODAL
 * ═══════════════════════════════════════════════════════════ */

/* ─── Local Storage & Field Mapping ──────────────────────── */

const LS_KEY = "reportMeta";

const FIELD_MAP = {
  rf_jobTitle  : "jobTitle",
  rf_jobNo     : "jobNo",
  rf_rev       : "rev",
  rf_memberLoc : "memberLoc",
  rf_drgRef    : "drgRef",
  rf_madeBy    : "madeBy",
  rf_date      : "date",
  rf_chd       : "chd",
};

/* ─── Field Read / Write Helpers ─────────────────────────── */

function restoreModalFields() {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  for (const [inputId, metaKey] of Object.entries(FIELD_MAP)) {
    const el = document.getElementById(inputId);
    if (!el) continue;
    if (saved[metaKey]) el.value = saved[metaKey];
  }
  const dateEl = document.getElementById("rf_date");
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
}

function readModalFields() {
  const meta = {};
  for (const [inputId, metaKey] of Object.entries(FIELD_MAP)) {
    const el = document.getElementById(inputId);
    if (!el) continue;
    if (metaKey === "date" && el.value) {
      const [y, m, d] = el.value.split("-");
      meta[metaKey] = `${d}/${m}/${y}`;
    } else {
      meta[metaKey] = el.value.trim();
    }
  }
  return meta;
}

function saveModalFields(meta) { localStorage.setItem(LS_KEY, JSON.stringify(meta)); }

/* ─── Modal Dialog Controller ────────────────────────────── */

function promptReportDetails() {
  return new Promise((resolve, reject) => {
    const overlay = document.getElementById("reportModal");
    const form    = document.getElementById("reportForm");
    const cancel  = document.getElementById("reportCancel");

    restoreModalFields();
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("is-visible"));
    document.getElementById("rf_jobTitle")?.focus();

    function close() {
      overlay.classList.remove("is-visible");
      setTimeout(() => { overlay.hidden = true; }, 200);
      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
    }
    function onSubmit(e) { e.preventDefault(); const meta = readModalFields(); saveModalFields(meta); close(); resolve(meta); }
    function onCancel()  { close(); reject(new Error("cancelled")); }
    function onKey(e)    { if (e.key === "Escape") onCancel(); }

    form.addEventListener("submit", onSubmit);
    cancel.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKey);
  });
}


/* ═══════════════════════════════════════════════════════════
 *  PDF CURSOR CLASS
 * ═══════════════════════════════════════════════════════════ */

class Cursor {
  constructor(pdfDoc, fonts, extraPages, titleBlockMeta) {
    this.doc = pdfDoc; this.fonts = fonts; this.extraPages = extraPages;
    this.meta = titleBlockMeta; this.page = null; this.y = PG.bodyTop; this.pageNum = 0;
  }
  setPage(page) { this.page = page; this.y = PG.bodyTop; this.pageNum++; }
  ensure(pts = PG.bLine) {
    if (this.y - pts < PG.bodyBot) {
      const tpl = this.extraPages.shift();
      if (tpl) { this.doc.addPage(tpl); this.page = tpl; }
      else { this.page = this.doc.addPage([595.28, 841.89]); }
      this.pageNum++; this.y = PG.bodyTop;
      fillTitleBlock(this.page, this.fonts.regular, { ...this.meta, sheetNo: String(this.pageNum) });
    }
  }
  skip(pts) { this.y -= pts; }
}


/* ═══════════════════════════════════════════════════════════
 *  PDF DRAWING UTILITIES
 * ═══════════════════════════════════════════════════════════ */

/* ─── Section Headings & Plain Text ──────────────────────── */

function heading(c, text) {
  const hToLine = 6, lineToBody = 10;
  c.ensure(hToLine + lineToBody + PG.bLine);
  c.page.drawText(text, { x: PG.left, y: c.y, size: PG.hSize, font: c.fonts.bold, color: COL.blue });
  c.y -= hToLine;
  c.page.drawLine({ start: { x: PG.left, y: c.y }, end: { x: PG.right, y: c.y }, thickness: 0.5, color: COL.blue });
  c.y -= lineToBody;
}

function ln(c, text, opts = {}) {
  const { x = PG.left, size = PG.bSize, font = c.fonts.regular, color = COL.black, lh = PG.bLine } = opts;
  c.ensure(lh); c.page.drawText(text, { x, y: c.y, size, font, color }); c.y -= lh;
}

/* ─── Title Block Renderer ───────────────────────────────── */

function fillTitleBlock(page, font, meta) {
  for (const [key, pos] of Object.entries(TB)) {
    const val = meta[key] ?? "";
    if (!val) continue;
    page.drawText(String(val), { x: pos.x, y: pos.y, size: pos.size, font, color: COL.black });
  }
}

/* ─── Section Classification Helpers ─────────────────────── */

function classify(ratio, limits, eps) {
  if (ratio <= limits[0] * eps) return 1;
  if (ratio <= limits[1] * eps) return 2;
  if (ratio <= limits[2] * eps) return 3;
  return 4;
}

function classifyCHS(dtRatio, eps2) {
  if (dtRatio <= 50 * eps2) return 1;
  if (dtRatio <= 70 * eps2) return 2;
  if (dtRatio <= 90 * eps2) return 3;
  return 4;
}

/* ─── Rich-Text Tokeniser & Renderer ─────────────────────── */

const SUB_SCALE = 0.65, SUP_SCALE = 0.65, SUB_DROP = -2.5, SUP_RISE = 4;

function parseRich(str) {
  const tokens = []; const re = /\{(sub|sup|sym):([^}]*)\}/g; let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) tokens.push({ type: "text", val: str.slice(last, m.index) });
    tokens.push({ type: m[1], val: m[2] }); last = re.lastIndex;
  }
  if (last < str.length) tokens.push({ type: "text", val: str.slice(last) });
  return tokens;
}

function drawRichTokens(c, tokens, startX, size, baseFont, color) {
  let x = startX;
  for (const tok of tokens) {
    switch (tok.type) {
      case "text": { c.page.drawText(tok.val, { x, y: c.y, size, font: baseFont, color }); x += baseFont.widthOfTextAtSize(tok.val, size); break; }
      case "sub":  { const s = size * SUB_SCALE; c.page.drawText(tok.val, { x, y: c.y + SUB_DROP, size: s, font: baseFont, color }); x += baseFont.widthOfTextAtSize(tok.val, s); break; }
      case "sup":  { const s = size * SUP_SCALE; c.page.drawText(tok.val, { x, y: c.y + SUP_RISE, size: s, font: baseFont, color }); x += baseFont.widthOfTextAtSize(tok.val, s); break; }
      case "sym":  { c.page.drawText(tok.val, { x, y: c.y, size, font: c.fonts.symbol, color }); x += c.fonts.symbol.widthOfTextAtSize(tok.val, size); break; }
    }
  }
  return x;
}

function richLn(c, richStr, opts = {}) {
  const { x: startX = PG.left, size = PG.bSize, font = c.fonts.regular, color = COL.black, lh = PG.bLine } = opts;
  c.ensure(lh); drawRichTokens(c, parseRich(richStr), startX, size, font, color); c.y -= lh;
}

/* ─── Pass / Fail Output & General Helpers ───────────────── */

function richPassLine(c, richStr, pass) {
  const tag = pass ? "  PASS" : "  FAIL"; const color = pass ? COL.green : COL.red;
  c.ensure(PG.bLine);
  const endX = drawRichTokens(c, parseRich(richStr), PG.indent, PG.bSize, c.fonts.regular, COL.black);
  c.page.drawText(tag, { x: endX, y: c.y, size: PG.bSize, font: c.fonts.bold, color }); c.y -= PG.bLine;
}

function firstNumber(...vals) {
  for (const v of vals) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; }
  return NaN;
}


/* ═══════════════════════════════════════════════════════════
 *  REPORT GENERATION
 * ═══════════════════════════════════════════════════════════ */

export async function generateReport() {

  try {

  /* ─── Validation & Prerequisites ───────────────────────── */

  const sec   = window.selectedSteelSection;
  const grade = window.selectedSteelGrade;
  const type  = document.getElementById("sectionTypeSelect")?.value;

  if (!sec || !grade)
    return alert("Select a section and grade before generating a report.");

  const SUPPORTED = ["UB", "UC", "PFC", "EA", "UA", "SHS", "RHS", "CHS"];
  if (!SUPPORTED.includes(type))
    return alert(`Report generation is available for ${SUPPORTED.join(", ")} sections only.`);

  const shearRes   = loadShearFromSession();
  const bendingRes = loadBendingFromSession();
  if (!shearRes?.ok || !bendingRes?.ok)
    return alert("Run the beam analysis first.");

  /* ·· Section type flags ···································· */

  const isPFC    = (type === "PFC");
  const isAngle  = (type === "EA" || type === "UA");
  const isHollow = (type === "SHS" || type === "RHS");
  const isSHS    = (type === "SHS");
  const isCHS    = (type === "CHS");

  /* ─── Modal Prompt ─────────────────────────────────────── */

  const titleBlockMeta = await promptReportDetails();

  /* ─── Design Force Extraction ──────────────────────────── */

  const VEd = Math.max(Math.abs(shearRes.meta.maxPos.value ?? 0), Math.abs(shearRes.meta.maxNeg.value ?? 0));
  const MEd = Math.max(Math.abs(bendingRes.meta.maxPos.value ?? 0), Math.abs(bendingRes.meta.maxNeg.value ?? 0));

  const fy      = grade.fy;
  const epsilon = EPSILON_MAP[grade.key] ?? Math.sqrt(235 / fy);
  const { h, b, tw, tf, r, d } = sec;

  /* ─── Section Property Lookup ──────────────────────────── */

  let A, Wpl, Wel;

  if (isCHS) {
    A   = firstNumber(sec.areaCm2) * 100;
    Wel = firstNumber(sec.elasticModulus) * 1e3;
    Wpl = firstNumber(sec.plasticModulus) * 1e3;
  } else if (isAngle) {
    A   = firstNumber(sec.areaCm2) * 100;
    Wel = firstNumber(sec.elasticModulusYy) * 1e3;
    Wpl = Wel;
  } else if (isHollow) {
    A   = firstNumber(sec.areaCm2) * 100;
    Wel = firstNumber(sec.elasticModulusYy) * 1e3;
    Wpl = firstNumber(sec.plasticModulusYy) * 1e3;
  } else if (isPFC) {
    A   = firstNumber(sec.areaCm2, sec.area_of_section, sec.a) * 100;
    Wel = firstNumber(sec.elasticModulusYy, sec.elastic_modulus_yy, sec.elastic_modulus_y_y, sec.elastic_modulus) * 1e3;
    Wpl = firstNumber(sec.plasticModulusYy, sec.plastic_modulus_yy, sec.plastic_modulus_y_y, sec.plastic_modulus) * 1e3;
  } else {
    A   = sec.area_of_section * 100;
    Wpl = sec.plastic_modulus  * 1e3;
    Wel = sec.elastic_modulus  * 1e3;
  }

  if (!A || !Wpl || !Wel)
    return alert("Section properties (A, Wpl, Wel) not found — cannot generate report.");

  /* ─── Local-Buckling Ratios ────────────────────────────── */

  let cwTw, cfTf, ctLong, ctShort, dtRatio, eps2;

  if (isCHS) {
    eps2    = epsilon * epsilon;
    dtRatio = firstNumber(sec.dtRatio, sec.d / sec.t);
    cwTw    = dtRatio;
    cfTf    = dtRatio;
  } else if (isAngle) {
    ctLong  = (h - sec.t - sec.r1) / sec.t;
    ctShort = (b - sec.t - sec.r1) / sec.t;
    cwTw = ctLong;
    cfTf = ctShort;
  } else if (isHollow) {
    if (isSHS) {
      cwTw = firstNumber(sec.ctRatio, (h - 3 * sec.t) / sec.t);
      cfTf = cwTw;
    } else {
      cwTw = firstNumber(sec.cwOverTw, (h - 3 * sec.t) / sec.t);
      cfTf = firstNumber(sec.cfOverTf, (b - 3 * sec.t) / sec.t);
    }
  } else if (isPFC) {
    cwTw = firstNumber(sec.cwOverTw, d / tw);
    cfTf = firstNumber(sec.cfOverTf, (b - tw - r) / tf);
  } else {
    cwTw = d / tw;
    cfTf = (b - tw - 2 * r) / (2 * tf);
  }

  /* ─── Cross-Section Classification ─────────────────────── */

  let webLimits, flangeLimits;

  if (isAngle) {
    webLimits    = [9, 10, 14];
    flangeLimits = [9, 10, 14];
  } else if (isHollow) {
    webLimits    = [72, 83, 124];
    flangeLimits = [33, 38, 42];
  } else {
    webLimits    = [72, 83, 124];
    flangeLimits = [9, 10, 14];
  }

  let webClass, flangeClass, sectionClass;

  if (isCHS) {
    sectionClass = classifyCHS(dtRatio, eps2);
    webClass     = sectionClass;
    flangeClass  = sectionClass;
  } else {
    webClass     = classify(cwTw, webLimits,    epsilon);
    flangeClass  = classify(cfTf, flangeLimits, epsilon);
    sectionClass = Math.max(webClass, flangeClass);
  }

  /* ─── Shear Area Calculation ───────────────────────────── */

  const eta = 1.0;
  let hw, Av, AvCalc, etaHwTw;

  if (isCHS) {
    hw = sec.d; Av = 2 * A / Math.PI; AvCalc = Av; etaHwTw = Av;
  } else if (isAngle) {
    hw = sec.h; Av = sec.h * sec.t; AvCalc = Av; etaHwTw = Av;
  } else if (isHollow) {
    hw = h; Av = A * h / (h + b); AvCalc = Av; etaHwTw = Av;
  } else if (isPFC) {
    hw = d || (h - 2 * tf); Av = hw * tw; AvCalc = Av; etaHwTw = eta * hw * tw;
  } else {
    hw = h - 2 * tf; AvCalc = A - 2 * b * tf + (tw + 2 * r) * tf;
    etaHwTw = eta * hw * tw; Av = Math.max(AvCalc, etaHwTw);
  }

  const VplRd     = (Av * (fy / Math.sqrt(3))) / GAMMA_M0 / 1000;
  const shearUtil = VplRd > 0 ? VEd / VplRd : Infinity;

  /* ─── Bending Resistance Calculation ───────────────────── */

  let McRd = null, McRdLabel = "", bendingUtil = null, class4 = false;
  let fyUsed = fy, rho = 0;

  if (sectionClass === 4) {
    class4 = true;
  } else {
    if (shearUtil > 0.5) {
      rho = Math.pow(2 * VEd / VplRd - 1, 2);
      fyUsed = fy * (1 - rho);
    }

    if (isAngle) {
      McRdLabel = "Mel,Rd,y";
      McRd = (Wel * fyUsed) / GAMMA_M0 / 1e6;
    } else if (sectionClass <= 2) {
      McRdLabel = (isPFC || isHollow) ? "Mpl,Rd,y" : "Mpl,Rd";
      McRd = (Wpl * fyUsed) / GAMMA_M0 / 1e6;
    } else {
      McRdLabel = (isPFC || isHollow) ? "Mel,Rd,y" : "Mel,Rd";
      McRd = (Wel * fyUsed) / GAMMA_M0 / 1e6;
    }
    bendingUtil = McRd > 0 ? MEd / McRd : Infinity;
  }

  const sectionName = sec.section ?? sec.name ?? sec.designation ?? sec.section_name ?? `${type} section`;


  /* ─── PDF Template & Font Embedding ────────────────────── */

  const templateBytes = await fetch("../../../references/pdfTemplate.pdf").then(r => r.arrayBuffer());
  const pdfDoc  = await PDFDocument.load(templateBytes);
  const templateDoc = await PDFDocument.load(templateBytes);
  const extraPages  = await pdfDoc.copyPages(templateDoc, Array(10).fill(0));

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono    = await pdfDoc.embedFont(StandardFonts.Courier);
  const symbol  = await pdfDoc.embedFont(StandardFonts.Symbol);

  const page = pdfDoc.getPages()[0];
  const c    = new Cursor(pdfDoc, { regular, bold, mono, symbol }, extraPages, titleBlockMeta);
  c.setPage(page);
  fillTitleBlock(page, regular, { ...titleBlockMeta, sheetNo: "1" });


  /* ─── Report Body Content ──────────────────────────────── */

  /* ·· Section & Material ···································· */

  heading(c, "1.  Section & Material");

  ln(c, `Section:      ${type}  ${sectionName}`, { x: PG.indent });
  richLn(c, `Grade:        ${grade.key}        f{sub:y} = ${fy} MPa`, { x: PG.indent });
  richLn(c, `{sym:ε}:              {sym:√}(235 / ${fy}) = ${epsilon.toFixed(2)}`, { x: PG.indent });
  richLn(c, `{sym:γ}{sub:M0}:           ${GAMMA_M0}   (UK National Annex)`, { x: PG.indent });
  c.skip(PG.paraGap);

  ln(c, "Section dimensions:", { x: PG.indent, font: bold });

  if (isAngle) {
    richLn(c, `h = ${h} mm    b = ${b} mm    t = ${sec.t} mm`, { x: PG.indent2 });
    richLn(c, `r{sub:1} = ${sec.r1} mm   r{sub:2} = ${sec.r2} mm`, { x: PG.indent2 });
  } else if (isCHS) {
    richLn(c, `d = ${sec.d} mm    t = ${sec.t} mm`, { x: PG.indent2 });
  } else if (isHollow) {
    richLn(c, `h = ${h} mm    b = ${b} mm    t = ${sec.t} mm`, { x: PG.indent2 });
  } else {
    richLn(c, `h = ${h} mm    b = ${b} mm    t{sub:w} = ${tw} mm`, { x: PG.indent2 });
    richLn(c, `t{sub:f} = ${tf} mm   r = ${r} mm     d = ${d} mm`, { x: PG.indent2 });
  }
  c.skip(PG.paraGap);

  ln(c, "Section properties:", { x: PG.indent, font: bold });

  if (isAngle) {
    richLn(c, `A = ${(A / 100).toFixed(1)} cm{sup:2}    W{sub:el,y} = ${(Wel / 1e3).toFixed(0)} cm{sup:3}  (elastic only)`, { x: PG.indent2 });
  } else {
    richLn(c, `A = ${(A / 100).toFixed(1)} cm{sup:2}    W{sub:pl,y} = ${(Wpl / 1e3).toFixed(0)} cm{sup:3}    W{sub:el,y} = ${(Wel / 1e3).toFixed(0)} cm{sup:3}`, { x: PG.indent2 });
    if (isPFC && Number.isFinite(sec.e0) && sec.e0 > 0) {
      richLn(c, `e{sub:0} = ${sec.e0.toFixed(2)} cm  (shear centre offset from web)`, { x: PG.indent2 });
    }
  }

  c.skip(PG.secGap);

  /* ·· Classification ········································ */

  heading(c, "2.  Cross-section Classification  (Table 5.2)");

  if (isCHS) {
    const chsLim = [50, 70, 90][Math.min(sectionClass, 3) - 1] ?? 90;

    ln(c, "Tubular section (d/t check):", { x: PG.indent, font: bold });
    richLn(c, `d/t = ${sec.d} / ${sec.t} = ${dtRatio.toFixed(1)}`, { x: PG.indent2 });
    richLn(c, `{sym:ε}{sup:2} = ${epsilon.toFixed(2)}{sup:2} = ${eps2.toFixed(4)}`, { x: PG.indent2 });
    richLn(c, `Class ${Math.min(sectionClass, 3)} limit: ${chsLim} x ${eps2.toFixed(4)} = ${(chsLim * eps2).toFixed(1)}`, { x: PG.indent2 });
    richLn(c, `${dtRatio.toFixed(1)} ${sectionClass <= 3 ? "<=" : ">"} ${(chsLim * eps2).toFixed(1)}     therefore,   Section is Class ${sectionClass}`, { x: PG.indent2, color: sectionClass <= 3 ? COL.green : COL.red });
    c.skip(PG.paraGap);

  } else if (isAngle) {
    const isEA   = (type === "EA");
    const legLim = [9, 10, 14][Math.min(webClass, 3) - 1] ?? 14;

    ln(c, "Long leg (outstand):", { x: PG.indent, font: bold });
    richLn(c, `c/t = (h - t - r{sub:1}) / t = (${h} - ${sec.t} - ${sec.r1}) / ${sec.t} = ${ctLong.toFixed(2)}`, { x: PG.indent2 });
    richLn(c, `Class ${Math.min(webClass, 3)} limit: ${legLim} x ${epsilon.toFixed(2)} = ${(legLim * epsilon).toFixed(2)}`, { x: PG.indent2 });
    richLn(c, `${ctLong.toFixed(2)} ${webClass <= 3 ? "<=" : ">"} ${(legLim * epsilon).toFixed(2)}     therefore,   Long leg is Class ${webClass}`, { x: PG.indent2, color: webClass <= 3 ? COL.green : COL.red });
    c.skip(PG.paraGap);

    if (!isEA) {
      const shortLim = [9, 10, 14][Math.min(flangeClass, 3) - 1] ?? 14;
      ln(c, "Short leg (outstand):", { x: PG.indent, font: bold });
      richLn(c, `c/t = (b - t - r{sub:1}) / t = (${b} - ${sec.t} - ${sec.r1}) / ${sec.t} = ${ctShort.toFixed(2)}`, { x: PG.indent2 });
      richLn(c, `Class ${Math.min(flangeClass, 3)} limit: ${shortLim} x ${epsilon.toFixed(2)} = ${(shortLim * epsilon).toFixed(2)}`, { x: PG.indent2 });
      richLn(c, `${ctShort.toFixed(2)} ${flangeClass <= 3 ? "<=" : ">"} ${(shortLim * epsilon).toFixed(2)}     therefore,   Short leg is Class ${flangeClass}`, { x: PG.indent2, color: flangeClass <= 3 ? COL.green : COL.red });
      c.skip(PG.paraGap);
    }

  } else if (isHollow) {
    const webLim = [72, 83, 124][Math.min(webClass, 3) - 1] ?? 124;
    const flLim  = [33, 38, 42][Math.min(flangeClass, 3) - 1] ?? 42;

    ln(c, "Web (internal part in bending):", { x: PG.indent, font: bold });
    richLn(c, `c/t = (h - 3t) / t = (${h} - ${(3 * sec.t).toFixed(1)}) / ${sec.t} = ${cwTw.toFixed(1)}`, { x: PG.indent2 });
    richLn(c, `Class ${Math.min(webClass, 3)} limit: ${webLim} x ${epsilon.toFixed(2)} = ${(webLim * epsilon).toFixed(1)}`, { x: PG.indent2 });
    richLn(c, `${cwTw.toFixed(1)} ${webClass <= 3 ? "<=" : ">"} ${(webLim * epsilon).toFixed(1)}     therefore,   Web is Class ${webClass}`, { x: PG.indent2, color: webClass <= 3 ? COL.green : COL.red });
    c.skip(PG.paraGap);

    ln(c, "Flange (internal part in compression):", { x: PG.indent, font: bold });
    richLn(c, `c/t = (b - 3t) / t = (${b} - ${(3 * sec.t).toFixed(1)}) / ${sec.t} = ${cfTf.toFixed(1)}`, { x: PG.indent2 });
    richLn(c, `Class ${Math.min(flangeClass, 3)} limit: ${flLim} x ${epsilon.toFixed(2)} = ${(flLim * epsilon).toFixed(1)}`, { x: PG.indent2 });
    richLn(c, `${cfTf.toFixed(1)} ${flangeClass <= 3 ? "<=" : ">"} ${(flLim * epsilon).toFixed(1)}     therefore,   Flange is Class ${flangeClass}`, { x: PG.indent2, color: flangeClass <= 3 ? COL.green : COL.red });
    c.skip(PG.paraGap);

  } else {
    const webLim = [72, 83, 124][Math.min(webClass, 3) - 1] ?? 124;
    const flLim  = [9,  10, 14][Math.min(flangeClass, 3) - 1] ?? 14;

    ln(c, "Web (internal part in bending):", { x: PG.indent, font: bold });
    richLn(c, `c{sub:w}/t{sub:w} = d / t{sub:w} = ${d} / ${tw} = ${cwTw.toFixed(1)}`, { x: PG.indent2 });
    richLn(c, `Class ${Math.min(webClass, 3)} limit: ${webLim} x ${epsilon.toFixed(2)} = ${(webLim * epsilon).toFixed(1)}`, { x: PG.indent2 });
    richLn(c, `${cwTw.toFixed(1)} ${webClass <= 3 ? "<=" : ">"} ${(webLim * epsilon).toFixed(1)}     therefore,   Web is Class ${webClass}`, { x: PG.indent2, color: webClass <= 3 ? COL.green : COL.red });
    c.skip(PG.paraGap);

    ln(c, "Flange (outstand in compression):", { x: PG.indent, font: bold });
    if (isPFC) {
      richLn(c, `c{sub:f}/t{sub:f} = (b - t{sub:w} - r) / t{sub:f} = (${b} - ${tw} - ${r}) / ${tf} = ${cfTf.toFixed(2)}`, { x: PG.indent2 });
    } else {
      richLn(c, `c{sub:f}/t{sub:f} = (b - t{sub:w} - 2r) / (2.t{sub:f}) = (${b} - ${tw} - ${(2 * r).toFixed(1)}) / (${(2 * tf).toFixed(1)}) = ${cfTf.toFixed(2)}`, { x: PG.indent2 });
    }
    richLn(c, `Class ${Math.min(flangeClass, 3)} limit: ${flLim} x ${epsilon.toFixed(2)} = ${(flLim * epsilon).toFixed(2)}`, { x: PG.indent2 });
    richLn(c, `${cfTf.toFixed(2)} ${flangeClass <= 3 ? "<=" : ">"} ${(flLim * epsilon).toFixed(2)}     therefore,   Flange is Class ${flangeClass}`, { x: PG.indent2, color: flangeClass <= 3 ? COL.green : COL.red });
    c.skip(PG.paraGap);
  }

  ln(c, `Overall section:  Class ${sectionClass}`, { x: PG.indent, font: bold });
  c.skip(PG.secGap);

  /* ·· Design Forces ········································· */

  heading(c, "3.  Design Forces  (from analysis)");
  richLn(c, `V{sub:Ed} = ${VEd.toFixed(2)} kN    (max shear from envelope)`, { x: PG.indent });
  richLn(c, `M{sub:Ed} = ${MEd.toFixed(2)} kNm   (max moment from envelope)`, { x: PG.indent });
  c.skip(PG.secGap);

  /* ·· Shear Resistance ······································ */

  heading(c, "4.  Shear Resistance  (cl. 6.2.6)");

  if (isCHS) {
    richLn(c, "Shear area, A{sub:v}  (cl. 6.2.6(3)(g)):", { x: PG.indent, font: bold });
    richLn(c, `A{sub:v} = 2A / {sym:π} = 2 x ${A.toFixed(0)} / {sym:π} = ${Av.toFixed(1)} mm{sup:2}`, { x: PG.indent2 });
    c.skip(PG.paraGap);

  } else if (isAngle) {
    richLn(c, "Shear area, A{sub:v}  (long leg carries vertical shear):", { x: PG.indent, font: bold });
    richLn(c, `A{sub:v} = h . t = ${h} x ${sec.t} = ${Av.toFixed(1)} mm{sup:2}`, { x: PG.indent2 });
    c.skip(PG.paraGap);

  } else if (isHollow) {
    richLn(c, "Shear area, A{sub:v}  (cl. 6.2.6(3)(f)):", { x: PG.indent, font: bold });
    richLn(c, `A{sub:v} = A . h / (h + b) = ${A.toFixed(0)} x ${h} / (${h} + ${b}) = ${Av.toFixed(1)} mm{sup:2}`, { x: PG.indent2 });
    c.skip(PG.paraGap);

  } else if (isPFC) {
    richLn(c, `h{sub:w} = d = ${hw.toFixed(1)} mm`, { x: PG.indent });
    c.skip(PG.paraGap);
    richLn(c, "Shear area, A{sub:v}  (conservative for channel):", { x: PG.indent, font: bold });
    richLn(c, `A{sub:v} = h{sub:w} . t{sub:w} = ${hw.toFixed(1)} x ${tw} = ${Av.toFixed(1)} mm{sup:2}`, { x: PG.indent2 });
    c.skip(PG.paraGap);

  } else {
    richLn(c, `h{sub:w} = h - 2.t{sub:f} = ${h} - ${(2 * tf).toFixed(1)} = ${hw.toFixed(1)} mm`, { x: PG.indent });
    richLn(c, `{sym:η} = ${eta}  (conservative)`, { x: PG.indent });
    c.skip(PG.paraGap);
    richLn(c, "Shear area, A{sub:v}:", { x: PG.indent, font: bold });
    richLn(c, `A{sub:v} = A - 2.b.t{sub:f} + (t{sub:w} + 2r).t{sub:f}`, { x: PG.indent2 });
    ln(c, `   = ${A.toFixed(0)} - 2(${b})(${tf}) + (${tw} + ${(2 * r).toFixed(1)})(${tf})`, { x: PG.indent2 });
    ln(c, `   = ${A.toFixed(0)} - ${(2 * b * tf).toFixed(1)} + ${((tw + 2 * r) * tf).toFixed(1)}`, { x: PG.indent2 });
    richLn(c, `   = ${AvCalc.toFixed(1)} mm{sup:2}`, { x: PG.indent2 });
    c.skip(PG.paraGap);
    const avOk = Av >= etaHwTw;
    richLn(c, `Check: A{sub:v} >= {sym:η}.h{sub:w}.t{sub:w} = ${eta} x ${hw.toFixed(1)} x ${tw} = ${etaHwTw.toFixed(1)} mm{sup:2}   ${avOk ? "OK" : "governs"}`, { x: PG.indent });
    richLn(c, `A{sub:v} (used) = ${Av.toFixed(1)} mm{sup:2}`, { x: PG.indent });
    c.skip(PG.paraGap);
  }

  ln(c, "Plastic shear resistance:", { x: PG.indent, font: bold });
  richLn(c, `V{sub:pl,Rd} = A{sub:v} . (f{sub:y} / {sym:√}(3)) / {sym:γ}{sub:M0}`, { x: PG.indent2 });
  ln(c, `       = ${Av.toFixed(1)} x (${fy} / 1.732) / ${GAMMA_M0}`, { x: PG.indent2 });
  ln(c, `       = ${VplRd.toFixed(2)} kN`, { x: PG.indent2 });
  c.skip(PG.paraGap);

  richPassLine(c, `V{sub:Ed} / V{sub:pl,Rd} = ${VEd.toFixed(2)} / ${VplRd.toFixed(2)} = ${shearUtil.toFixed(3)}  <= 1.0`, shearUtil <= 1.0);
  c.skip(PG.secGap);

  /* ·· Bending Resistance ···································· */

  heading(c, "5.  Bending Resistance  (cl. 6.2.5)");

  if (class4) {
    ln(c, `Section is Class 4 -- effective properties required.`, { x: PG.indent, color: COL.red });
    ln(c, `Class 4 bending check not yet implemented.`, { x: PG.indent, color: COL.red });

  } else {
    if (shearUtil > 0.5) {
      richLn(c, `V{sub:Ed}/V{sub:pl,Rd} = ${shearUtil.toFixed(3)} > 0.5     therefore, reduced f{sub:y} (cl. 6.2.8)`, { x: PG.indent, color: COL.red });
      richLn(c, `rho = (2.V{sub:Ed}/V{sub:pl,Rd} - 1){sup:2} = ${rho.toFixed(4)}`, { x: PG.indent });
      richLn(c, `f{sub:y,red} = f{sub:y}.(1 - rho) = ${fy} x ${(1 - rho).toFixed(4)} = ${fyUsed.toFixed(1)} MPa`, { x: PG.indent });
    } else {
      richLn(c, `V{sub:Ed}/V{sub:pl,Rd} = ${shearUtil.toFixed(3)} <= 0.5     therefore, no reduction for high shear`, { x: PG.indent });
    }
    c.skip(PG.paraGap);

    let McRdRich, modRich, modVal, classLabel;

    if (isAngle) {
      McRdRich = "M{sub:el,Rd,y}"; modRich = "W{sub:el,y}"; modVal = Wel;
      classLabel = "Elastic moment resistance (Wpl not tabulated for angles)";
    } else if (sectionClass <= 2) {
      McRdRich = (isPFC || isHollow) ? "M{sub:pl,Rd,y}" : "M{sub:pl,Rd}";
      modRich = "W{sub:pl,y}"; modVal = Wpl;
      classLabel = "Plastic moment resistance";
    } else {
      McRdRich = (isPFC || isHollow) ? "M{sub:el,Rd,y}" : "M{sub:el,Rd}";
      modRich = "W{sub:el,y}"; modVal = Wel;
      classLabel = "Elastic moment resistance";
    }

    richLn(c, `Section is Class ${sectionClass}     therefore, ${classLabel}`, { x: PG.indent, font: bold });
    c.skip(PG.paraGap);
    richLn(c, `${McRdRich} = ${modRich} . f{sub:y} / {sym:γ}{sub:M0}`, { x: PG.indent2 });
    richLn(c, `= ${modVal.toFixed(0)} \u00D7 ${fyUsed.toFixed(1)} / ${GAMMA_M0} / 1\u00D710{sup:6}`, { x: PG.indent2 + 10 });
    ln(c, `= ${McRd.toFixed(2)} kNm`, { x: PG.indent2 + 10 });
    c.skip(PG.paraGap);

    richPassLine(c, `M{sub:Ed} / ${McRdRich} = ${MEd.toFixed(2)} / ${McRd.toFixed(2)} = ${bendingUtil.toFixed(3)}  <= 1.0`, bendingUtil <= 1.0);
  }

  /* ·· End Notes ·············································· */

  if (isPFC) {
    c.skip(PG.secGap);
    if (Number.isFinite(sec.e0) && sec.e0 > 0) {
      richLn(c, `Note: PFC shear centre offset e{sub:0} = ${sec.e0.toFixed(2)} cm from web.`, { x: PG.indent, color: COL.grey });
    }
    ln(c, "This check covers cross-section bending/shear only — torsion and LTB not included.", { x: PG.indent, color: COL.grey });
  }

  if (isAngle) {
    c.skip(PG.secGap);
    ln(c, "Note: Elastic bending resistance only (Wpl not tabulated for angles).", { x: PG.indent, color: COL.grey });
    ln(c, "This check covers cross-section bending/shear only — torsion, LTB and biaxial effects not included.", { x: PG.indent, color: COL.grey });
  }

  if (isHollow || isCHS) {
    c.skip(PG.secGap);
    ln(c, "This check covers cross-section bending/shear only. No LTB check required for hollow sections.", { x: PG.indent, color: COL.grey });
  }

  /* ·· Deflection ············································ */

  c.skip(PG.secGap);
  heading(c, "6.  Deflection  (serviceability)");

  const defl = computeDeflection();

  if (!defl?.ok) {
    ln(c, `Deflection not available: ${defl?.message ?? "unknown reason"}.`, {
      x: PG.indent, color: COL.grey
    });
  } else {
    const dMax  = Math.abs(defl.meta?.maxAbs?.value ?? NaN);
    const xMax  = defl.meta?.maxAbs?.x;
    const ratio = defl.meta?.spanOverDeflection;
    const Icm4  = defl.EI / 210000 / 1e4;   // back out I in cm⁴ from EI

    richLn(c, "Calculated by double integration of the bending moment (M/EI):", { x: PG.indent, font: bold });
    richLn(c, `EI.v'' = M(x)  ->  v(x) integrated numerically over the span`, { x: PG.indent2 });
    c.skip(PG.paraGap);

    richLn(c, "Section stiffness:", { x: PG.indent, font: bold });
    richLn(c, `E = 210000 MPa    I{sub:y} = ${Icm4.toFixed(0)} cm{sup:4}`, { x: PG.indent2 });
    richLn(c, `EI = ${(defl.EI / 1e9).toFixed(1)} x 10{sup:9} N.mm{sup:2}`, { x: PG.indent2 });
    c.skip(PG.paraGap);

    richLn(c, "Maximum deflection:", { x: PG.indent, font: bold });
    richLn(c, `{sym:δ}{sub:max} = ${dMax.toFixed(2)} mm`, { x: PG.indent2 });
    if (Number.isFinite(xMax)) {
      richLn(c, `at x = ${xMax.toFixed(2)} m along the span`, { x: PG.indent2 });
    }
    if (Number.isFinite(ratio) && ratio > 0) {
      richLn(c, `Span / deflection ratio = L / ${Math.round(ratio)}`, { x: PG.indent2, font: bold });
    }
    c.skip(PG.paraGap);

    ln(c, "Note: No serviceability limit has been applied. Compare against the", { x: PG.indent, color: COL.grey });
    ln(c, "relevant project deflection limit (e.g. L/360, L/250) as required.", { x: PG.indent, color: COL.grey });
    c.skip(PG.paraGap);

    ln(c, "Important: The loads used are taken directly from the beam analysis with", { x: PG.indent, color: COL.red });
    ln(c, "NO distinction between ULS and SLS load combinations. The same factored", { x: PG.indent, color: COL.red });
    ln(c, "loads drive both the strength checks and this deflection calculation, so", { x: PG.indent, color: COL.red });
    ln(c, "the deflection shown is indicative only and is likely conservative for SLS.", { x: PG.indent, color: COL.red });
  }


  /* ─── PDF Save & Download ──────────────────────────────── */

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url  = URL.createObjectURL(blob);

  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${sectionName} ${type} - Section Check.pdf`;
  a.click();
  URL.revokeObjectURL(url);

  } catch (err) {
    if (err.message === "cancelled") return;
    console.error("Report generation failed:", err);
    alert("Report generation failed:\n" + err.message);
  }
}


/* ═══════════════════════════════════════════════════════════
 *  INITIALISATION
 * ═══════════════════════════════════════════════════════════ */

const _btn = document.getElementById("generateReportBtn");

if (_btn) {
  _btn.addEventListener("click", () => {
    const material =
      document.getElementById("designMaterial")?.value ?? "steel";

    if (material !== "steel") {
      return;
    }

    generateReport();
  });
}