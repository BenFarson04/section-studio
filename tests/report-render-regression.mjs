import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pdfTemplateBytes = await readFile(new URL('../references/pdfTemplate.pdf', import.meta.url));
const drawLog = [];

function makeListenerBag() {
  return {
    listeners: [],
    addEventListener(type, fn) {
      this.listeners.push({ type, fn });
    },
    removeEventListener() {},
    dispatch(type) {
      for (const entry of this.listeners.filter((item) => item.type === type)) {
        entry.fn({ preventDefault() {} });
      }
    }
  };
}

function makeElement(id) {
  return {
    id,
    hidden: false,
    value: '',
    dataset: {},
    listeners: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    focus() {},
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() { return null; },
    addEventListener(type, fn) {
      this.listeners.push({ type, fn });
    },
    removeEventListener() {},
    dispatch(type) {
      for (const entry of this.listeners.filter((item) => item.type === type)) {
        entry.fn({ preventDefault() {} });
      }
    },
    click() {
      this.dispatch('click');
    }
  };
}

class FakePage {
  constructor() {
    this.texts = [];
  }

  drawText(text, opts = {}) {
    const value = String(text);
    drawLog.push(value);
    this.texts.push({ value, x: opts.x ?? 0, y: opts.y ?? 0, size: opts.size ?? 0 });
  }

  drawLine() {}
}

globalThis.PDFLib = {
  PDFDocument: class PDFDocument {
    constructor() {
      this.pages = [new FakePage()];
    }
    static async load() {
      return new PDFDocument();
    }
    async copyPages() {
      return Array.from({ length: 10 }, () => new FakePage());
    }
    getPages() {
      return this.pages;
    }
    addPage(page = new FakePage()) {
      this.pages.push(page);
      return page;
    }
    async save() {
      return new Uint8Array();
    }
    async embedFont() {
      return { widthOfTextAtSize: (text, size) => String(text).length * size * 0.55 };
    }
    registerFontkit() {}
  },
  rgb: () => ({})
};

globalThis.alert = () => {};

const stableReportForm = makeListenerBag();
const stableReportCancel = makeListenerBag();
const stableReportModal = {
  hidden: true,
  classList: { add() {}, remove() {} },
  addEventListener() {},
  removeEventListener() {}
};

const stableFieldMap = {
  designMaterial: { value: 'concrete' },
  concreteGradeSelect: { value: 'C30/37' },
  concreteWidth: { value: '300' },
  concreteDepth: { value: '500' },
  concreteCover: { value: '35' },
  linkDiameter: { value: '8' },
  linkSpacing: { value: '200' },
  linkLegs: { value: '2' },
  reportModal: stableReportModal,
  reportForm: stableReportForm,
  reportCancel: stableReportCancel,
  rf_jobTitle: { value: 'Job title', ...makeListenerBag(), focus() {} },
  rf_jobNo: { value: '123', ...makeListenerBag() },
  rf_rev: { value: 'P01', ...makeListenerBag() },
  rf_memberLoc: { value: 'B1-01', ...makeListenerBag() },
  rf_drgRef: { value: 'SK-001', ...makeListenerBag() },
  rf_madeBy: { value: 'JB', ...makeListenerBag() },
  rf_date: { value: '2025-01-01', ...makeListenerBag() },
  rf_chd: { value: 'AB', ...makeListenerBag() },
};

globalThis.document = {
  _btn: null,
  getElementById(id) {
    if (id === 'generateReportBtn') {
      if (!this._btn) this._btn = makeElement(id);
      return this._btn;
    }

    if (Object.hasOwn(stableFieldMap, id)) {
      return stableFieldMap[id];
    }

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
  createElement() { return { click() {}, setAttribute() {}, style: {} }; }
};

globalThis.window = globalThis;
globalThis.localStorage = {
  store: {},
  getItem(key) { return this.store[key] ?? null; },
  setItem(key, value) { this.store[key] = String(value); }
};
globalThis.sessionStorage = {
  store: {
    analysisShear: JSON.stringify({
      ok: true,
      meta: { maxPos: { value: 50 }, maxNeg: { value: -50 }, absMax: 50 }
    }),
    analysisBending: JSON.stringify({
      ok: true,
      meta: { maxPos: { value: 0 }, maxNeg: { value: -125 } }
    })
  },
  getItem(key) { return this.store[key] ?? null; },
  setItem(key, value) { this.store[key] = String(value); }
};
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };

globalThis.URL = class {
  static createObjectURL() { return 'blob:fake'; }
  static revokeObjectURL() {}
};

globalThis.Blob = class Blob { constructor(parts = []) { this.parts = parts; } };

globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => pdfTemplateBytes });

Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node' },
  configurable: true,
  writable: true
});

const routerModule = await import('../js/sectionDesignerLogic/reportGeneratorRouter.js');
const { bindReportGenerationButton, createReportGenerationRunner } = routerModule;

bindReportGenerationButton();

const btn = document.getElementById('generateReportBtn');
const listenerCount = btn.listeners.filter((entry) => entry.type === 'click').length;
assert.equal(listenerCount, 1, 'button has exactly one click handler');

const generationCalls = [];
const slowConcrete = async () => {
  generationCalls.push('concrete');
  await new Promise((resolve) => setTimeout(resolve, 10));
};

const runner = createReportGenerationRunner({
  concreteGenerator: slowConcrete,
  steelGenerator: async () => generationCalls.push('steel')
});

const first = runner('concrete');
const second = runner('concrete');
await Promise.resolve();
assert.equal(generationCalls.length, 1, 're-entrant concrete generation calls are coalesced');

await first;
await second;
assert.equal(generationCalls.filter((item) => item === 'concrete').length, 1, 'only one concrete generation runs while in flight');

const third = runner('concrete');
await third;
assert.equal(generationCalls.filter((item) => item === 'concrete').length, 2, 'a fresh generation starts after completion');

const steelRunner = createReportGenerationRunner({
  concreteGenerator: async () => generationCalls.push('unexpected-concrete'),
  steelGenerator: async () => generationCalls.push('steel')
});
await steelRunner('steel');
assert.equal(generationCalls.filter((item) => item === 'steel').length, 1, 'steel material routes to the steel generator');
assert.equal(generationCalls.filter((item) => item === 'unexpected-concrete').length, 0, 'steel material does not route to the concrete generator');

const { generateConcreteReport } = await import('../js/sectionDesignerLogic/generateConcreteReport.js');
drawLog.length = 0;
const reportForm = document.getElementById('reportForm');
const concreteReportPromise = generateConcreteReport();
setTimeout(() => reportForm.dispatch('submit'), 0);
await concreteReportPromise;

const sectionTitles = [
  '1.  Section & Material',
  '2.  Reinforcement Summary',
  '3.  Effective Depths',
  '4.  Design Forces  (from analysis)',
  '5.  Sagging bending check — bottom steel in tension',
  '6.  Hogging bending check — top steel in tension',
  '7.  Shear Resistance Check',
  '8.  Governing Summary',
  '9.  Notes & Scope',
];

for (const title of sectionTitles) {
  assert.equal(drawLog.filter((text) => text === title).length, 1, `section title should appear once: ${title}`);
}

assert.equal(drawLog.filter((text) => text.includes('K used = min(K, K\')')).length, 1, 'K used line appears once');
assert.equal(drawLog.filter((text) => text.includes('Hogging bending check — top steel in tension')).length, 1, 'hogging check appears once');
assert.equal(drawLog.filter((text) => text.includes('7.  Shear Resistance Check')).length, 1, 'shear check appears once');
assert.equal(drawLog.filter((text) => text.includes('8.  Governing Summary')).length, 1, 'governing summary appears once');
assert.equal(drawLog.filter((text) => text.includes('9.  Notes & Scope')).length, 1, 'notes scope appears once');

console.log('report generation runner: single in-flight generation enforced');
console.log('report render: concrete sections 1-9 and critical hogging/shear summary content each appear once');
