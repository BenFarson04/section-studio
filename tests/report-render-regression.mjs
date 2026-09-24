const buttonListeners = new Map();

function makeElement(id) {
  return {
    id,
    hidden: false,
    value: '',
    dataset: {},
    listeners: [],
    addEventListener(type, fn) {
      this.listeners.push({ type, fn });
      buttonListeners.set(this.id, this.listeners.length);
    },
    removeEventListener() {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    focus() {},
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() { return null; },
    dispatch(type) {
      const handlers = this.listeners.filter((entry) => entry.type === type);
      for (const entry of handlers) entry.fn({ preventDefault() {} });
    },
    click() {
      this.dispatch('click');
    }
  };
}

globalThis.PDFLib = {
  PDFDocument: class PDFDocument {},
  rgb: () => ({})
};
globalThis.alert = () => {};
globalThis.document = {
  getElementById(id) {
    if (id === 'generateReportBtn') {
      if (!this._btn) this._btn = makeElement(id);
      return this._btn;
    }
    return null;
  },
  addEventListener() {},
  removeEventListener() {},
  createElement() { return makeElement('mock-element'); }
};
globalThis.window = globalThis;
globalThis.localStorage = {
  store: {},
  getItem(key) { return this.store[key] ?? null; },
  setItem(key, value) { this.store[key] = String(value); }
};
globalThis.sessionStorage = {
  store: {},
  getItem(key) { return this.store[key] ?? null; },
  setItem(key, value) { this.store[key] = String(value); }
};
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };

globalThis.URL = class {
  static createObjectURL() { return 'blob:fake'; }
  static revokeObjectURL() {}
};

globalThis.Blob = class Blob { constructor(parts = []) { this.parts = parts; } };

Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node' },
  configurable: true,
  writable: true
});

await import('../js/sectionDesignerLogic/generateReport.js');
await import('../js/sectionDesignerLogic/generateConcreteReport.js');
const { bindReportGenerationButton } = await import('../js/sectionDesignerLogic/reportGeneratorRouter.js');

bindReportGenerationButton();

const btn = document.getElementById('generateReportBtn');
const listenerCount = btn.listeners.filter((entry) => entry.type === 'click').length;

console.log(`click listeners on #generateReportBtn: ${listenerCount}`);

if (listenerCount !== 1) {
  process.exit(1);
}
