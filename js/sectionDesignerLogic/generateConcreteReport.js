/* ╔══════════════════════════════════════════════════════════╗
 *  generateConcreteReport.js
 *
 *  Generates a PDF calculation report by writing EN 1992-1-1
 *  reinforced concrete rectangular beam bending-check results
 *  onto a blank PDF template.
 *
 *  Supports:
 *    - Rectangular concrete beam sections
 *    - Sagging bending check, bottom reinforcement in tension
 *    - Hogging bending check, top reinforcement in tension
 *    - Singly reinforced and compression reinforcement cases
 *
 *  Dependencies:
 *    - pdf-lib via <script> tag
 *    - concreteSectionCalc.js
 * ╚══════════════════════════════════════════════════════════╝ */


/* ─── Imports ────────────────────────────────────────────── */

import { loadShearFromSession, loadBendingFromSession } from "../state/store.js";

import { getConcreteSectionInput }
  from "../state/manualDesignerMaterialToggle.js";

import { runConcreteSectionCalc }
  from "./concreteSectionCalc.js";


const { PDFDocument, rgb, StandardFonts } = PDFLib;


/* ═══════════════════════════════════════════════════════════
 *  CONSTANTS & CONFIGURATION
 * ═══════════════════════════════════════════════════════════ */

/* ─── Design Parameters ──────────────────────────────────── */

const GAMMA_C = 1.50;
const GAMMA_S = 1.15;
const ALPHA_CC = 0.85;
const K_PRIME = 0.168;
const MAX_LEVER_ARM_FACTOR = 0.95;


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
  bodyTop: 675,
  bodyBot: 45,
  left: 55,
  right: 555,

  indent: 70,
  indent2: 85,
  indent3: 100,

  hSize: 11,
  bSize: 8.5,
  sSize: 7.5,

  hLine: 16,
  bLine: 12,
  sLine: 10,

  secGap: 8,
  paraGap: 5,
  hGap: 4,
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

const LS_KEY = "concreteReportMeta";

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

  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().slice(0, 10);
  }
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


function saveModalFields(meta) {
  localStorage.setItem(LS_KEY, JSON.stringify(meta));
}


/* ─── Modal Dialog Controller ────────────────────────────── */

function promptReportDetails() {
  return new Promise((resolve, reject) => {
    const overlay = document.getElementById("reportModal");
    const form    = document.getElementById("reportForm");
    const cancel  = document.getElementById("reportCancel");

    if (!overlay || !form || !cancel) {
      reject(new Error("Report modal elements not found."));
      return;
    }

    restoreModalFields();

    overlay.hidden = false;

    requestAnimationFrame(() => {
      overlay.classList.add("is-visible");
    });

    document.getElementById("rf_jobTitle")?.focus();

    function close() {
      overlay.classList.remove("is-visible");

      setTimeout(() => {
        overlay.hidden = true;
      }, 200);

      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
    }

    function onSubmit(e) {
      e.preventDefault();

      const meta = readModalFields();

      saveModalFields(meta);
      close();
      resolve(meta);
    }

    function onCancel() {
      close();
      reject(new Error("cancelled"));
    }

    function onKey(e) {
      if (e.key === "Escape") {
        onCancel();
      }
    }

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
    this.doc = pdfDoc;
    this.fonts = fonts;
    this.extraPages = extraPages;
    this.meta = titleBlockMeta;

    this.page = null;
    this.y = PG.bodyTop;
    this.pageNum = 0;
  }

  setPage(page) {
    this.page = page;
    this.y = PG.bodyTop;
    this.pageNum++;
  }

  ensure(pts = PG.bLine) {
    if (this.y - pts < PG.bodyBot) {
      const tpl = this.extraPages.shift();

      if (tpl) {
        this.doc.addPage(tpl);
        this.page = tpl;
      } else {
        this.page = this.doc.addPage([595.28, 841.89]);
      }

      this.pageNum++;
      this.y = PG.bodyTop;

      fillTitleBlock(
        this.page,
        this.fonts.regular,
        {
          ...this.meta,
          sheetNo: String(this.pageNum)
        }
      );
    }
  }

  skip(pts) {
    this.y -= pts;
  }
}


/* ═══════════════════════════════════════════════════════════
 *  PDF DRAWING UTILITIES
 * ═══════════════════════════════════════════════════════════ */

/* ─── Section Headings & Plain Text ──────────────────────── */

function heading(c, text) {
  const hToLine = 6;
  const lineToBody = 10;

  c.ensure(hToLine + lineToBody + PG.bLine);

  c.page.drawText(text, {
    x: PG.left,
    y: c.y,
    size: PG.hSize,
    font: c.fonts.bold,
    color: COL.blue
  });

  c.y -= hToLine;

  c.page.drawLine({
    start: { x: PG.left,  y: c.y },
    end:   { x: PG.right, y: c.y },
    thickness: 0.5,
    color: COL.blue
  });

  c.y -= lineToBody;
}


function ln(c, text, opts = {}) {
  const {
    x = PG.left,
    size = PG.bSize,
    font = c.fonts.regular,
    color = COL.black,
    lh = PG.bLine
  } = opts;

  c.ensure(lh);

  c.page.drawText(String(text), {
    x,
    y: c.y,
    size,
    font,
    color
  });

  c.y -= lh;
}


/* ─── Title Block Renderer ───────────────────────────────── */

function fillTitleBlock(page, font, meta) {
  for (const [key, pos] of Object.entries(TB)) {
    const val = meta[key] ?? "";

    if (!val) continue;

    page.drawText(String(val), {
      x: pos.x,
      y: pos.y,
      size: pos.size,
      font,
      color: COL.black
    });
  }
}


/* ─── Rich-Text Tokeniser & Renderer ─────────────────────── */

const SUB_SCALE = 0.65;
const SUP_SCALE = 0.65;
const SUB_DROP = -2.5;
const SUP_RISE = 4;


function parseRich(str) {
  const tokens = [];
  const re = /\{(sub|sup|sym):([^}]*)\}/g;

  let last = 0;
  let m;

  while ((m = re.exec(str)) !== null) {
    if (m.index > last) {
      tokens.push({
        type: "text",
        val: str.slice(last, m.index)
      });
    }

    tokens.push({
      type: m[1],
      val: m[2]
    });

    last = re.lastIndex;
  }

  if (last < str.length) {
    tokens.push({
      type: "text",
      val: str.slice(last)
    });
  }

  return tokens;
}


function drawRichTokens(c, tokens, startX, size, baseFont, color) {
  let x = startX;

  for (const tok of tokens) {
    switch (tok.type) {
      case "text": {
        c.page.drawText(tok.val, {
          x,
          y: c.y,
          size,
          font: baseFont,
          color
        });

        x += baseFont.widthOfTextAtSize(tok.val, size);
        break;
      }

      case "sub": {
        const s = size * SUB_SCALE;

        c.page.drawText(tok.val, {
          x,
          y: c.y + SUB_DROP,
          size: s,
          font: baseFont,
          color
        });

        x += baseFont.widthOfTextAtSize(tok.val, s);
        break;
      }

      case "sup": {
        const s = size * SUP_SCALE;

        c.page.drawText(tok.val, {
          x,
          y: c.y + SUP_RISE,
          size: s,
          font: baseFont,
          color
        });

        x += baseFont.widthOfTextAtSize(tok.val, s);
        break;
      }

      case "sym": {
        c.page.drawText(tok.val, {
          x,
          y: c.y,
          size,
          font: c.fonts.symbol,
          color
        });

        x += c.fonts.symbol.widthOfTextAtSize(tok.val, size);
        break;
      }
    }
  }

  return x;
}


function richLn(c, richStr, opts = {}) {
  const {
    x: startX = PG.left,
    size = PG.bSize,
    font = c.fonts.regular,
    color = COL.black,
    lh = PG.bLine
  } = opts;

  c.ensure(lh);

  drawRichTokens(
    c,
    parseRich(richStr),
    startX,
    size,
    font,
    color
  );

  c.y -= lh;
}


/* ─── Pass / Fail Output & General Helpers ───────────────── */

function richPassLine(c, richStr, pass) {
  const tag = pass ? "  PASS" : "  FAIL";
  const color = pass ? COL.green : COL.red;

  c.ensure(PG.bLine);

  const endX = drawRichTokens(
    c,
    parseRich(richStr),
    PG.indent,
    PG.bSize,
    c.fonts.regular,
    COL.black
  );

  c.page.drawText(tag, {
    x: endX,
    y: c.y,
    size: PG.bSize,
    font: c.fonts.bold,
    color
  });

  c.y -= PG.bLine;
}


function passText(pass) {
  return pass ? "PASS" : "FAIL";
}


function passColour(pass) {
  return pass ? COL.green : COL.red;
}


function valueOrDash(value, dp = 2) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toFixed(dp);
}


function areaOrDash(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toFixed(0);
}


function ratioOrDash(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toFixed(3);
}


function momentOrDash(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toFixed(2);
}


function summariseLayers(layers) {
  const valid = Array.isArray(layers)
    ? layers.filter((layer) => layer.numberOfBars > 0 && layer.barDiameter > 0)
    : [];

  if (!valid.length) {
    return "—";
  }

  return valid
    .map((layer) => `${layer.numberOfBars}H${layer.barDiameter}`)
    .join(" + ");
}


/* ═══════════════════════════════════════════════════════════
 *  CONCRETE REPORT BODY HELPERS
 * ═══════════════════════════════════════════════════════════ */

function drawReinforcementSummary(c, title, steel) {
  ln(c, title, {
    x: PG.indent,
    font: c.fonts.bold
  });

  if (!steel?.layers?.length) {
    ln(c, "No reinforcement layers provided.", {
      x: PG.indent2,
      color: COL.red
    });

    return;
  }

  steel.layers.forEach((layer) => {
    richLn(
      c,
      `Layer ${layer.layer}: ${layer.numberOfBars}H${layer.barDiameter}    A{sub:s} = ${areaOrDash(layer.layerArea)} mm{sup:2}`,
      { x: PG.indent2 }
    );
  });

  richLn(
    c,
    `Total A{sub:s,prov} = ${areaOrDash(steel.totalArea)} mm{sup:2}`,
    { x: PG.indent2, font: c.fonts.bold }
  );
}


function drawBendingCheck(c, check) {
  const title = check.momentType === "sagging"
    ? "Sagging bending check — bottom steel in tension"
    : "Hogging bending check — top steel in tension";

  heading(c, title);

  if (!check?.isValid) {
    ln(c, check?.checks?.flexuralSteel?.message || "Check could not be completed.", {
      x: PG.indent,
      color: COL.red
    });

    c.skip(PG.secGap);
    return;
  }

  const MEd = Math.abs(check.moment.inputMoment);
  const MEdNmm = check.moment.designMomentNmm;

  const b = check.geometry.width;
  const h = check.geometry.depth;
  const d = check.geometry.effectiveDepth;
  const dPrime = check.geometry.compressionSteelDepth;
  const z = check.geometry.leverArm;
  const zRaw = check.geometry.leverArmRaw;
  const zLimit = check.geometry.leverArmLimit;

  const fck = check.material.fck;
  const fyk = check.material.fyk;

  const k = check.k.value;
  const kLimit = check.k.limit;
  const kUsed = check.k.valueUsedForLeverArm;

  richLn(c, `M{sub:Ed} = ${momentOrDash(MEd)} kNm`, { x: PG.indent });
  richLn(c, `b = ${valueOrDash(b, 0)} mm    h = ${valueOrDash(h, 0)} mm    d = ${valueOrDash(d, 1)} mm`, { x: PG.indent });
  richLn(c, `f{sub:ck} = ${valueOrDash(fck, 0)} MPa    f{sub:yk} = ${valueOrDash(fyk, 0)} MPa`, { x: PG.indent });
  c.skip(PG.paraGap);

  ln(c, "K factor:", {
    x: PG.indent,
    font: c.fonts.bold
  });

  richLn(
    c,
    `K = M{sub:Ed} / (b.d{sup:2}.f{sub:ck})`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `K = ${MEdNmm.toExponential(3)} / (${valueOrDash(b, 0)} x ${valueOrDash(d, 1)}{sup:2} x ${valueOrDash(fck, 0)}) = ${ratioOrDash(k)}`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `K' = ${kLimit.toFixed(3)}`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `${ratioOrDash(k)} ${k <= kLimit ? "<=" : ">"} ${kLimit.toFixed(3)}    therefore, ${check.k.compressionRequired ? "compression reinforcement required" : "singly reinforced section adequate"}`,
    {
      x: PG.indent2,
      color: check.k.compressionRequired ? COL.red : COL.green
    }
  );

  c.skip(PG.paraGap);

  ln(c, "Lever arm:", {
    x: PG.indent,
    font: c.fonts.bold
  });

  richLn(
    c,
    `z = d / 2 [1 + {sym:√}(1 - 3.53K)]`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `K used = min(K, K') = ${ratioOrDash(kUsed)}`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `z{sub:raw} = ${valueOrDash(d, 1)} / 2 [1 + {sym:√}(1 - 3.53 x ${ratioOrDash(kUsed)})] = ${valueOrDash(zRaw, 1)} mm`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `z{sub:max} = 0.95d = 0.95 x ${valueOrDash(d, 1)} = ${valueOrDash(zLimit, 1)} mm`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `z used = ${valueOrDash(z, 1)} mm`,
    { x: PG.indent2, font: c.fonts.bold }
  );

  c.skip(PG.paraGap);

  ln(c, "Tension reinforcement:", {
    x: PG.indent,
    font: c.fonts.bold
  });

  richLn(
    c,
    `A{sub:s,req,flexure} = M{sub:Ed} / (0.87.f{sub:yk}.z)`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `A{sub:s,req,flexure} = ${MEdNmm.toExponential(3)} / (0.87 x ${valueOrDash(fyk, 0)} x ${valueOrDash(z, 1)}) = ${areaOrDash(check.steel.tension.requiredFlexure)} mm{sup:2}`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `A{sub:s,min} = ${areaOrDash(check.steel.tension.requiredMinimum)} mm{sup:2}`,
    { x: PG.indent2 }
  );

  richLn(
    c,
    `A{sub:s,req} = max(A{sub:s,req,flexure}, A{sub:s,min}) = ${areaOrDash(check.steel.tension.requiredTotal)} mm{sup:2}`,
    { x: PG.indent2, font: c.fonts.bold }
  );

  richLn(
    c,
    `A{sub:s,prov} = ${areaOrDash(check.steel.tension.provided)} mm{sup:2}`,
    { x: PG.indent2, font: c.fonts.bold }
  );

  richPassLine(
    c,
    `A{sub:s,prov} / A{sub:s,req} = ${areaOrDash(check.steel.tension.provided)} / ${areaOrDash(check.steel.tension.requiredTotal)} = ${ratioOrDash(check.steel.tension.utilisation)}  >= 1.0`,
    check.checks.flexuralSteel.pass
  );

  c.skip(PG.paraGap);

  if (check.k.compressionRequired) {
    ln(c, "Compression reinforcement:", {
      x: PG.indent,
      font: c.fonts.bold
    });

    richLn(
      c,
      `d' = ${valueOrDash(dPrime, 1)} mm`,
      { x: PG.indent2 }
    );

    richLn(
      c,
      `A'{sub:s,req} = ${areaOrDash(check.steel.compression.required)} mm{sup:2}`,
      { x: PG.indent2 }
    );

    richLn(
      c,
      `A'{sub:s,prov} = ${areaOrDash(check.steel.compression.provided)} mm{sup:2}`,
      { x: PG.indent2 }
    );

    richPassLine(
      c,
      `A'{sub:s,prov} / A'{sub:s,req} = ${areaOrDash(check.steel.compression.provided)} / ${areaOrDash(check.steel.compression.required)} = ${ratioOrDash(check.steel.compression.utilisation)}  >= 1.0`,
      check.checks.compressionSteel.pass
    );

    c.skip(PG.paraGap);
  } else {
    ln(c, "Compression reinforcement is not required for this bending direction.", {
      x: PG.indent,
      color: COL.grey
    });

    c.skip(PG.paraGap);
  }

  ln(c, "Additional reinforcement limits:", {
    x: PG.indent,
    font: c.fonts.bold
  });

  richPassLine(
    c,
    `Minimum reinforcement check: A{sub:s,prov} >= A{sub:s,min}`,
    check.checks.minimumSteel.pass
  );

  richPassLine(
    c,
    `Maximum reinforcement check: A{sub:s,prov} <= ${areaOrDash(check.steel.maximum.limit)} mm{sup:2}`,
    check.checks.maximumSteel.pass
  );

  richPassLine(
    c,
    `Lever arm check: z <= 0.95d`,
    check.checks.leverArm.pass
  );

  c.skip(PG.paraGap);

  ln(c, `Overall ${check.label.toLowerCase()} check: ${passText(check.pass)}`, {
    x: PG.indent,
    font: c.fonts.bold,
    color: passColour(check.pass)
  });

  c.skip(PG.secGap);
}


/* ═══════════════════════════════════════════════════════════
 *  REPORT GENERATION
 * ═══════════════════════════════════════════════════════════ */

export async function generateConcreteReport() {
  try {

    /* ─── Validation & Prerequisites ───────────────────────── */

    const concreteInput = getConcreteSectionInput();
    const shearRes = loadShearFromSession();
    const bendingRes = loadBendingFromSession();

    if (!concreteInput || !(concreteInput.width > 0) || !(concreteInput.depth > 0)) {
      return alert("Enter a valid concrete section before generating a report.");
    }

    if (!bendingRes?.ok) {
      return alert("Run the beam analysis first so bending moments are available.");
    }

    /* ─── Run Concrete Section Calculation ────────────────── */

    const result = runConcreteSectionCalc();

    if (!result?.isValid) {
      return alert("Concrete section calculation could not be completed.");
    }

    const {
      section,
      material,
      moments,
      effectiveDepths,
      providedSteel,
      checks,
      governing,
      notes
    } = result;

    /* ─── Modal Prompt ─────────────────────────────────────── */

    const titleBlockMeta = await promptReportDetails();


    /* ─── PDF Template & Font Embedding ────────────────────── */

    const templateBytes = await fetch("../references/pdfTemplate.pdf")
      .then((r) => r.arrayBuffer());

    const pdfDoc = await PDFDocument.load(templateBytes);
    const templateDoc = await PDFDocument.load(templateBytes);
    const extraPages = await pdfDoc.copyPages(templateDoc, Array(10).fill(0));

    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const mono    = await pdfDoc.embedFont(StandardFonts.Courier);
    const symbol  = await pdfDoc.embedFont(StandardFonts.Symbol);

    const page = pdfDoc.getPages()[0];

    const c = new Cursor(
      pdfDoc,
      { regular, bold, mono, symbol },
      extraPages,
      titleBlockMeta
    );

    c.setPage(page);

    fillTitleBlock(
      page,
      regular,
      {
        ...titleBlockMeta,
        sheetNo: "1"
      }
    );


    /* ─── Report Body Content ──────────────────────────────── */

    /* ·· Section & Material ································· */

    heading(c, "1.  Section & Material");

    ln(c, "Reinforced concrete rectangular beam section", {
      x: PG.indent,
      font: bold
    });

    richLn(c, `Grade:        ${section.grade || "—"}        f{sub:ck} = ${valueOrDash(material.fck, 0)} MPa`, { x: PG.indent });
    richLn(c, `Rebar:        f{sub:yk} = ${valueOrDash(material.fyk, 0)} MPa`, { x: PG.indent });
    richLn(c, `{sym:γ}{sub:c}:           ${GAMMA_C.toFixed(2)}`, { x: PG.indent });
    richLn(c, `{sym:γ}{sub:s}:           ${GAMMA_S.toFixed(2)}`, { x: PG.indent });
    richLn(c, `{sym:α}{sub:cc}:          ${ALPHA_CC.toFixed(2)}`, { x: PG.indent });
    c.skip(PG.paraGap);

    ln(c, "Section dimensions:", {
      x: PG.indent,
      font: bold
    });

    richLn(c, `b = ${valueOrDash(section.width, 0)} mm`, { x: PG.indent2 });
    richLn(c, `h = ${valueOrDash(section.depth, 0)} mm`, { x: PG.indent2 });
    richLn(c, `Nominal cover = ${valueOrDash(section.cover, 0)} mm`, { x: PG.indent2 });
    richLn(c, `Link diameter = H${valueOrDash(section.linkDiameter, 0)}`, { x: PG.indent2 });

    c.skip(PG.secGap);


    /* ·· Reinforcement Summary ····························· */

    heading(c, "2.  Reinforcement Summary");

    drawReinforcementSummary(c, "Top reinforcement:", providedSteel.top);
    c.skip(PG.paraGap);

    drawReinforcementSummary(c, "Bottom reinforcement:", providedSteel.bottom);
    c.skip(PG.secGap);


    /* ·· Effective Depths ·································· */

    heading(c, "3.  Effective Depths");

    ln(c, "Sagging bending:", {
      x: PG.indent,
      font: bold
    });

    ln(
      c,
      "Bottom reinforcement is taken as the tension reinforcement.",
      { x: PG.indent2 }
    );

    richLn(
      c,
      `Centroid of bottom steel from bottom face = ${valueOrDash(effectiveDepths.sagging.reinforcementCentroidFromBottom, 1)} mm`,
      { x: PG.indent2 }
    );

    richLn(
      c,
      `d{sub:sagging} = h - y{sub:bottom steel} = ${valueOrDash(section.depth, 0)} - ${valueOrDash(effectiveDepths.sagging.reinforcementCentroidFromBottom, 1)} = ${valueOrDash(effectiveDepths.sagging.effectiveDepth, 1)} mm`,
      { x: PG.indent2, font: bold }
    );

    c.skip(PG.paraGap);

    ln(c, "Hogging bending:", {
      x: PG.indent,
      font: bold
    });

    ln(
      c,
      "Top reinforcement is taken as the tension reinforcement.",
      { x: PG.indent2 }
    );

    richLn(
      c,
      `Centroid of top steel from top face = ${valueOrDash(effectiveDepths.hogging.reinforcementCentroidFromTop, 1)} mm`,
      { x: PG.indent2 }
    );

    richLn(
      c,
      `d{sub:hogging} = h - y{sub:top steel} = ${valueOrDash(section.depth, 0)} - ${valueOrDash(effectiveDepths.hogging.reinforcementCentroidFromTop, 1)} = ${valueOrDash(effectiveDepths.hogging.effectiveDepth, 1)} mm`,
      { x: PG.indent2, font: bold }
    );

    c.skip(PG.secGap);


    /* ·· Design Forces ····································· */

    heading(c, "4.  Design Forces  (from analysis)");

    richLn(
      c,
      `M{sub:Ed,sagging} = ${momentOrDash(moments.maxSaggingMoment)} kNm`,
      { x: PG.indent }
    );

    richLn(
      c,
      `M{sub:Ed,hogging} = ${momentOrDash(Math.abs(moments.maxHoggingMoment))} kNm`,
      { x: PG.indent }
    );

    if (shearRes?.ok) {
      const maxShear = Math.max(
        Math.abs(shearRes.meta?.maxPos?.value ?? 0),
        Math.abs(shearRes.meta?.maxNeg?.value ?? 0)
      );

      richLn(
        c,
        `V{sub:Ed} = ${valueOrDash(maxShear, 2)} kN    (stored for future shear check)`,
        { x: PG.indent }
      );
    } else {
      ln(c, "Shear result not found. Shear check not included in this report.", {
        x: PG.indent,
        color: COL.grey
      });
    }

    c.skip(PG.secGap);


    /* ·· Sagging Bending Check ····························· */

    drawBendingCheck(c, checks.sagging);


    /* ·· Hogging Bending Check ····························· */

    drawBendingCheck(c, checks.hogging);


    /* ·· Governing Summary ································· */

    heading(c, "7.  Governing Summary");

    if (governing?.isValid) {
      ln(
        c,
        `Governing bending direction: ${governing.momentType}`,
        {
          x: PG.indent,
          font: bold
        }
      );

      richLn(
        c,
        `Governing utilisation = ${ratioOrDash(governing.utilisation)}`,
        {
          x: PG.indent
        }
      );

      ln(
        c,
        `Overall result: ${passText(governing.pass)}`,
        {
          x: PG.indent,
          font: bold,
          color: passColour(governing.pass)
        }
      );
    } else {
      ln(c, governing?.message || "No governing check could be determined.", {
        x: PG.indent,
        color: COL.red
      });
    }

    c.skip(PG.secGap);


    /* ·· End Notes ········································· */

    heading(c, "8.  Notes & Scope");

    ln(c, "This report covers a simplified ULS rectangular beam bending check.", {
      x: PG.indent,
      color: COL.grey
    });

    ln(c, "The sagging check uses bottom reinforcement as tension steel.", {
      x: PG.indent,
      color: COL.grey
    });

    ln(c, "The hogging check uses top reinforcement as tension steel.", {
      x: PG.indent,
      color: COL.grey
    });

    ln(c, "Compression reinforcement is checked where K exceeds K'.", {
      x: PG.indent,
      color: COL.grey
    });

    c.skip(PG.paraGap);

    ln(c, "Checks not included in this report:", {
      x: PG.indent,
      font: bold,
      color: COL.grey
    });

    ln(c, "Shear resistance, link design, anchorage, lap lengths, curtailment, crack control,", {
      x: PG.indent2,
      color: COL.grey
    });

    ln(c, "deflection, fire resistance, robustness, bearing, and detailed support detailing.", {
      x: PG.indent2,
      color: COL.grey
    });

    if (Array.isArray(notes) && notes.length) {
      c.skip(PG.paraGap);

      ln(c, "Calculation notes:", {
        x: PG.indent,
        font: bold,
        color: COL.grey
      });

      notes.forEach((note) => {
        ln(c, `- ${note}`, {
          x: PG.indent2,
          color: COL.grey
        });
      });
    }


    /* ─── PDF Save & Download ──────────────────────────────── */

    const pdfBytes = await pdfDoc.save();

    const blob = new Blob([pdfBytes], {
      type: "application/pdf"
    });

    const url = URL.createObjectURL(blob);

    const sectionName = `${section.width}x${section.depth} RC Beam`;

    const a = document.createElement("a");

    a.href = url;
    a.download = `${sectionName} - Concrete Section Check.pdf`;
    a.click();

    URL.revokeObjectURL(url);

  } catch (err) {
    if (err.message === "cancelled") return;

    console.error("Concrete report generation failed:", err);
    alert("Concrete report generation failed:\n" + err.message);
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

    if (material !== "concrete") {
    return;
    }

    generateConcreteReport();
  });
}
