import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as PDFLib from 'pdf-lib';
import * as fontkitModule from '@pdf-lib/fontkit';

const pdfTemplateBytes = await readFile(new URL('../references/pdfTemplate.pdf', import.meta.url));
const { PDFDocument, PDFPage, StandardFonts } = PDFLib;
const fontkit = fontkitModule.default;

function contentArray(page) {
  const contents = page.node.Contents();
  assert.ok(contents && typeof contents.size === 'function', 'page Contents should be an array');
  return contents;
}

function contentRefs(page) {
  const contents = contentArray(page);
  return Array.from({ length: contents.size() }, (_, index) => contents.get(index).toString());
}

async function makeIndependentTemplatePages(pageCount) {
  const pdfDoc = await PDFDocument.load(pdfTemplateBytes);
  const templateDoc = await PDFDocument.load(pdfTemplateBytes);
  const extraPages = [];

  for (let index = 0; index < pageCount; index += 1) {
    const [page] = await pdfDoc.copyPages(templateDoc, [0]);
    extraPages.push(page);
  }

  return { pdfDoc, extraPages };
}

async function testIndependentPdfPageContents() {
  const { pdfDoc, extraPages } = await makeIndependentTemplatePages(12);
  const page2 = extraPages[0];
  const page3 = extraPages[1];
  for (const page of extraPages) {
    pdfDoc.addPage(page);
  }

  assert.equal(pdfDoc.getPageCount(), 13, 'twelve template copies plus the original page should be created');
  assert.equal(new Set(extraPages.map(contentArray)).size, extraPages.length, 'every copied page should have an independent Contents array');

  const page2Contents = contentArray(page2);
  const page3Contents = contentArray(page3);
  assert.notEqual(page2Contents, page3Contents, 'page 2 and page 3 must own separate Contents arrays');

  const page2CountBefore = page2Contents.size();
  const page3CountBefore = page3Contents.size();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page2.drawText('PAGE_TWO_ONLY', { x: 55, y: 675, size: 8, font });
  const page2CountAfterItsDraw = page2Contents.size();
  assert.ok(page2CountAfterItsDraw > page2CountBefore);
  assert.equal(page3Contents.size(), page3CountBefore, 'drawing on page 2 must not mutate page 3');

  page3.drawText('PAGE_THREE_ONLY', { x: 55, y: 675, size: 8, font });
  assert.equal(page2Contents.size(), page2CountAfterItsDraw, 'drawing on page 3 must not retroactively mutate page 2');
  assert.ok(page3Contents.size() > page3CountBefore);

  const serialized = await pdfDoc.save();
  const reloaded = await PDFDocument.load(serialized);
  assert.equal(reloaded.getPageCount(), 13, 'template plus twelve copied pages should serialize as thirteen pages');
  const reloadedPages = reloaded.getPages();
  assert.equal(new Set(reloadedPages.slice(1).map(contentArray)).size, 12, 'serialized copied pages should retain independent Contents arrays');
  assert.notEqual(
    contentArray(reloadedPages[1]),
    contentArray(reloadedPages[2]),
    'serialized page 2 and page 3 must retain separate Contents arrays'
  );
}

await testIndependentPdfPageContents();

function makeListenerBag() {
  return {
    listeners: [],
    addEventListener(type, fn) {
      this.listeners.push({ type, fn });
    },
    removeEventListener(type, fn) {
      this.listeners = this.listeners.filter((entry) => entry.type !== type || entry.fn !== fn);
    },
    dispatch(type) {
      for (const entry of this.listeners.filter((item) => item.type === type)) {
        entry.fn({ preventDefault() {} });
      }
    }
  };
}

const reportForm = makeListenerBag();
const reportCancel = makeListenerBag();
const reportModal = {
  hidden: true,
  classList: { add() {}, remove() {} }
};

const fieldMap = {
  designMaterial: { value: 'concrete' },
  concreteGradeSelect: { value: 'C30/37' },
  concreteWidth: { value: '300' },
  concreteDepth: { value: '500' },
  concreteCover: { value: '35' },
  linkDiameter: { value: '8' },
  linkSpacing: { value: '200' },
  linkLegs: { value: '2' },
  reportModal,
  reportForm,
  reportCancel,
  rf_jobTitle: { value: 'Regression job', focus() {} },
  rf_jobNo: { value: '123' },
  rf_rev: { value: 'P01' },
  rf_memberLoc: { value: 'B1-01' },
  rf_drgRef: { value: 'SK-001' },
  rf_madeBy: { value: 'JB' },
  rf_date: { value: '2025-01-01' },
  rf_chd: { value: 'AB' }
};

const clickLog = [];
globalThis.PDFLib = PDFLib;
globalThis.fontkit = fontkit;
globalThis.alert = (message) => { throw new Error(String(message)); };
globalThis.document = {
  getElementById(id) {
    if (Object.hasOwn(fieldMap, id)) return fieldMap[id];
    if (id === 'topBarsTbody' || id === 'bottomBarsTbody') {
      return {
        querySelectorAll() {
          return [{
            querySelector(selector) {
              if (selector === 'input') return { value: '2' };
              if (selector === 'select') return { value: '16' };
              return null;
            }
          }];
        }
      };
    }
    return null;
  },
  addEventListener() {},
  removeEventListener() {},
  createElement() {
    return {
      click() { clickLog.push({ href: this.href, download: this.download }); }
    };
  }
};
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem() { return null; },
  setItem() {}
};
globalThis.sessionStorage = {
  getItem(key) {
    if (key === 'analysisShear') {
      return JSON.stringify({ ok: true, meta: { maxPos: { value: 50 }, maxNeg: { value: -50 } } });
    }
    if (key === 'analysisBending') {
      return JSON.stringify({ ok: true, meta: { maxPos: { value: 0 }, maxNeg: { value: -125 } } });
    }
    return null;
  },
  setItem() {}
};
globalThis.requestAnimationFrame = (callback) => { callback(); return 0; };
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => pdfTemplateBytes });
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node' },
  configurable: true,
  writable: true
});

const concreteDraws = [];
let generatedPdfBytes;
const originalDrawText = PDFPage.prototype.drawText;
const originalSave = PDFDocument.prototype.save;
PDFPage.prototype.drawText = function (text, options) {
  const result = originalDrawText.call(this, text, options);
  concreteDraws.push({
    text: String(text),
    pageIndex: this.doc.getPages().indexOf(this) + 1,
    streamRef: this.contentStreamRef?.toString()
  });
  return result;
};
PDFDocument.prototype.save = async function (...args) {
  generatedPdfBytes = await originalSave.apply(this, args);
  return generatedPdfBytes;
};

try {
  const { generateConcreteReport } = await import('../js/sectionDesignerLogic/generateConcreteReport.js');
  const generation = generateConcreteReport();
  reportForm.dispatch('submit');
  await generation;
} finally {
  PDFPage.prototype.drawText = originalDrawText;
  PDFDocument.prototype.save = originalSave;
}

assert.ok(generatedPdfBytes instanceof Uint8Array, 'concrete report should serialize with real pdf-lib');
assert.equal(clickLog.length, 1, 'concrete report should trigger one download');

const expectedSections = [
  '1.  Section & Material',
  '2.  Reinforcement Summary',
  '3.  Effective Depths',
  '4.  Design Forces  (from analysis)',
  '5.  Sagging bending check — bottom steel in tension',
  '6.  Hogging bending check — top steel in tension',
  '7.  Shear Resistance Check',
  '8.  Governing Summary',
  '9.  Notes & Scope'
];
for (const section of expectedSections) {
  assert.equal(concreteDraws.filter((entry) => entry.text === section).length, 1, `section heading should be drawn once: ${section}`);
}

const firstDuplicatedLine = "K used = min(K, K') = 0.069";
const kDraws = concreteDraws.filter((entry) => entry.text === firstDuplicatedLine);
assert.equal(kDraws.length, 1, 'K used line should be drawn once');
assert.equal(kDraws[0].pageIndex, 2, 'K used continuation should begin on page 2');

const finalFixtureNote = '- Further checks normally required for a full RC beam design include shear, anchorage, curtailment, crack control, deflection, durability cover, spacing, fire resistance where relevant, and support detailing.';
const noteDraw = concreteDraws.find((entry) => entry.text === finalFixtureNote);
assert.ok(noteDraw, 'fixture final note should be emitted');
assert.equal(noteDraw.pageIndex, 3, 'fixture tail should continue onto page 3');

for (const section of expectedSections.slice(6)) {
  assert.ok(concreteDraws.some((entry) => entry.text === section && entry.pageIndex === 2), `${section} should begin on page 2`);
  assert.ok(!concreteDraws.some((entry) => entry.text === section && entry.pageIndex === 3), `${section} must not be replayed on page 3`);
}

const savedReport = await PDFDocument.load(generatedPdfBytes);
assert.equal(savedReport.getPageCount(), 3, '300 x 500 concrete fixture should generate three pages');
const [page1, page2, page3] = savedReport.getPages();
const page2Contents = contentArray(page2);
const page3Contents = contentArray(page3);
assert.notEqual(page2Contents, page3Contents, 'generated PDF pages 2 and 3 must have independent Contents arrays');

const page2Refs = contentRefs(page2);
const page3Refs = contentRefs(page3);
const kStreamRef = kDraws[0].streamRef;
const noteStreamRef = noteDraw.streamRef;
assert.ok(kStreamRef, 'K used draw should have a serialized content stream');
assert.ok(noteStreamRef, 'page 3 note should have a serialized content stream');
assert.ok(page2Refs.includes(kStreamRef), 'page 2 must reference the stream containing K used');
assert.ok(!page3Refs.includes(kStreamRef), 'page 3 must not reference the K used content stream');
assert.ok(page3Refs.includes(noteStreamRef), 'page 3 must reference its continuation-note stream');
assert.ok(!page2Refs.includes(noteStreamRef), 'page 2 must not reference the page 3 continuation-note stream');
assert.ok(concreteDraws.some((entry) => entry.text === expectedSections[0] && entry.pageIndex === 1), 'page 1 should retain the report beginning');
assert.ok(concreteDraws.some((entry) => entry.text === expectedSections[5] && entry.pageIndex === 1), 'page 1 should contain the start of Section 6');

console.log('real pdf-lib report regression: independent copied-page Contents verified');
console.log('real concrete report: 3 pages; K used and Sections 1-9 each emitted once; page 3 contains only its own continuation stream');
