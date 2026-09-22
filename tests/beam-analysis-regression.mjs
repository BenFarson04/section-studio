import assert from 'node:assert/strict';

const documentStub = {
  getElementById(id) {
    if (id === 'length') return { value: '5' };
    return null;
  },
};

globalThis.document = documentStub;
globalThis.sessionStorage = {
  data: {},
  setItem(key, value) { this.data[key] = String(value); },
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
  removeItem(key) { delete this.data[key]; },
};

const { supports, udls, pointLoads } = await import('../js/state/store.js');
const { solveReactions } = await import('../js/analysis/reactions.js');
const { computeShear } = await import('../js/analysis/shear.js');
const { computeBending, momentAt } = await import('../js/analysis/bending.js');

function resetModel() {
  supports.length = 0;
  udls.length = 0;
  pointLoads.length = 0;
}

function assertAlmostEqual(actual, expected, tol = 1e-6, label = 'value') {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: expected ${expected}, got ${actual}`);
}

function testSimplySupportedPointLoad() {
  resetModel();
  supports.push({ location: 0, type: 'Pinned' }, { location: 5, type: 'Roller' });
  pointLoads.push({ location: 2.5, load: 10 });

  const reactions = solveReactions();
  assert.equal(reactions.ok, true);
  assertAlmostEqual(reactions.reactions[0].Rv, 5, 1e-6, 'RA');
  assertAlmostEqual(reactions.reactions[1].Rv, 5, 1e-6, 'RB');

  const shear = computeShear({ samples: 200 });
  const bending = computeBending({ samples: 200 });

  assertAlmostEqual(shear.meta.maxPos.value, 5, 1e-6, 'Smax');
  assertAlmostEqual(shear.meta.maxNeg.value, -5, 1e-6, 'Smin');
  assertAlmostEqual(bending.meta.maxPos.value, 12.5, 1e-6, 'Mmax');
  assertAlmostEqual(momentAt(2.5, reactions), 12.5, 1e-6, 'M@2.5');
}

function testSimplySupportedUDL() {
  resetModel();
  supports.push({ location: 0, type: 'Pinned' }, { location: 6, type: 'Roller' });
  udls.push({ start: 0, end: 6, startLoad: 3, endLoad: 3 });

  const reactions = solveReactions();
  assert.equal(reactions.ok, true);
  assertAlmostEqual(reactions.reactions[0].Rv, 9, 1e-6, 'RA');
  assertAlmostEqual(reactions.reactions[1].Rv, 9, 1e-6, 'RB');

  const shear = computeShear({ samples: 200 });
  const bending = computeBending({ samples: 200 });

  assertAlmostEqual(bending.meta.maxPos.value, 13.5, 1e-6, 'UDL max moment');
  assertAlmostEqual(shear.meta.maxPos.value, 9, 1e-6, 'UDL max shear');
}

function testMixedLoads() {
  resetModel();
  supports.push({ location: 0, type: 'Pinned' }, { location: 6, type: 'Roller' });
  pointLoads.push({ location: 2, load: 8 }, { location: 4, load: 12 });
  udls.push({ start: 1, end: 5, startLoad: 0, endLoad: 4 });

  const reactions = solveReactions();
  assert.equal(reactions.ok, true);
  assertAlmostEqual(reactions.reactions[0].Rv, 12.4444444444, 1e-4, 'mixed RA');
  assertAlmostEqual(reactions.reactions[1].Rv, 15.5555555556, 1e-4, 'mixed RB');

  const Mmid = momentAt(3, reactions);
  const shear = computeShear({ samples: 200 });
  const bending = computeBending({ samples: 200 });

  assert.ok(Number.isFinite(Mmid), 'mixed moment finite');
  assert.ok(bending.meta.maxPos.value > 0, 'mixed moment positive');
  assert.ok(shear.meta.absMax > 0, 'mixed shear nonzero');

  const dx = 6 / 200;
  let approxSlopeMatch = true;
  for (let i = 1; i < bending.x.length - 1; i += 1) {
    const x = bending.x[i];
    const nearDiscontinuity = supports.some((support) => Math.abs(x - support.location) < 2 * dx)
      || pointLoads.some((pl) => Math.abs(x - pl.location) < 2 * dx)
      || udls.some((udl) => Math.abs(x - udl.start) < 2 * dx || Math.abs(x - udl.end) < 2 * dx);

    if (nearDiscontinuity) continue;

    const dMdx = (bending.M[i + 1] - bending.M[i - 1]) / (2 * dx);
    if (Math.abs(dMdx - shear.V[i]) > 0.5) {
      approxSlopeMatch = false;
      break;
    }
  }
  assert.ok(approxSlopeMatch, 'SFD/BMD derivative relationship holds away from load discontinuities');
}

function testCantileverPointLoad() {
  resetModel();
  supports.push({ location: 0, type: 'Fixed' });
  pointLoads.push({ location: 3, load: 10 });

  const reactions = solveReactions();
  assert.equal(reactions.ok, true);
  assertAlmostEqual(reactions.reactions[0].Rv, 10, 1e-6, 'cantilever reaction');
  assertAlmostEqual(reactions.reactions[0].M, -30, 1e-6, 'cantilever support moment');

  const M = momentAt(1, reactions);
  assertAlmostEqual(M, -20, 1e-6, 'cantilever moment at x=1');

  const shear = computeShear({ samples: 200 });
  const bending = computeBending({ samples: 200 });
  assertAlmostEqual(shear.meta.maxPos.value, 10, 1e-6, 'cantilever shear');
  assertAlmostEqual(bending.meta.maxNeg.value, -30, 1e-6, 'cantilever max hogging');
}

function testCantileverUDL() {
  resetModel();
  supports.push({ location: 0, type: 'Fixed' });
  udls.push({ start: 0, end: 4, startLoad: 5, endLoad: 5 });

  const reactions = solveReactions();
  const bending = computeBending({ samples: 200 });

  assertAlmostEqual(reactions.reactions[0].Rv, 20, 1e-6, 'cantilever udl reaction');
  assertAlmostEqual(reactions.reactions[0].M, -40, 1e-6, 'cantilever udl moment');
  assertAlmostEqual(bending.meta.maxNeg.value, -40, 1e-6, 'cantilever udl max negative moment');
}

function testUnloadedBeam() {
  resetModel();
  supports.push({ location: 0, type: 'Pinned' }, { location: 5, type: 'Roller' });

  const reactions = solveReactions();
  assert.equal(reactions.ok, true);
  assertAlmostEqual(reactions.reactions[0].Rv, 0, 1e-6, 'empty beam RA');
  assertAlmostEqual(reactions.reactions[1].Rv, 0, 1e-6, 'empty beam RB');

  const bending = computeBending({ samples: 200 });
  assertAlmostEqual(bending.meta.maxPos.value, 0, 1e-6, 'empty beam moment');
}

function testLoadAtSupport() {
  resetModel();
  supports.push({ location: 0, type: 'Pinned' }, { location: 5, type: 'Roller' });
  pointLoads.push({ location: 0, load: 10 });

  const reactions = solveReactions();
  assert.equal(reactions.ok, true);
  assertAlmostEqual(reactions.reactions[0].Rv, 10, 1e-6, 'reaction with load at left support');
  assertAlmostEqual(reactions.reactions[1].Rv, 0, 1e-6, 'right reaction zero');
  const bending = computeBending({ samples: 200 });
  assertAlmostEqual(bending.meta.maxPos.value, 0, 1e-6, 'moment at support load is zero');
}

try {
  testSimplySupportedPointLoad();
  testSimplySupportedUDL();
  testMixedLoads();
  testCantileverPointLoad();
  testCantileverUDL();
  testUnloadedBeam();
  testLoadAtSupport();
  console.log('beam-analysis-regression: all tests passed');
} catch (error) {
  console.error('beam-analysis-regression: failed');
  console.error(error);
  process.exitCode = 1;
}
