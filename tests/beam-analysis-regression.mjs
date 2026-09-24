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
const { calculateConcreteShearResistance } = await import('../js/sectionDesignerLogic/concreteShearCheck.js');
const { getDesignShearForce, calculateConcreteSection } = await import('../js/sectionDesignerLogic/concreteSectionCalc.js');
const { sanitizePdfText } = await import('../js/sectionDesignerLogic/reportText.js');

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

function testConcreteShearLinkResistance() {
  const result = calculateConcreteShearResistance({
    grade: 'C30/37',
    width: 300,
    depth: 500,
    cover: 35,
    linkDiameter: 10,
    linkSpacing: 200,
    linkLegs: 2,
    topBars: [{ numberOfBars: 2, barDiameter: 16 }],
    bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
    VEd: 120,
    cotTheta: 2,
    longitudinalSteelArea: 3 * Math.PI * (20 ** 2) / 4,
  });

  assert.equal(result.isValid, true, 'shear check valid');
  assertAlmostEqual(result.linkArea, 2 * Math.PI * (10 ** 2) / 4, 1e-6, 'Asw');
  assert.ok(result.VRdS > 0, 'VRdS positive');
  assert.ok(result.governingResistance > 0, 'governing resistance positive');
  assert.ok(result.pass, 'pass for adequate shear');
  assertAlmostEqual(result.utilisation, result.VEd / result.governingResistance, 1e-6, 'utilization');
}

function testConcreteShearLinkDeficiency() {
  const result = calculateConcreteShearResistance({
    grade: 'C30/37',
    width: 300,
    depth: 500,
    cover: 35,
    linkDiameter: 8,
    linkSpacing: 300,
    linkLegs: 2,
    topBars: [{ numberOfBars: 2, barDiameter: 16 }],
    bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
    VEd: 500,
    cotTheta: 2,
    longitudinalSteelArea: 3 * Math.PI * (20 ** 2) / 4,
  });

  assert.equal(result.isValid, true, 'shear check valid for deficient case');
  assert.equal(result.pass, false, 'shear fails when demand exceeds resistance');
}

function testConcreteDesignShearEnvelope() {
  const shearResult = {
    ok: true,
    meta: {
      maxPos: { value: 35 },
      maxNeg: { value: -48 },
    },
  };

  assertAlmostEqual(getDesignShearForce(shearResult), 48, 1e-6, 'design shear uses absolute envelope');
  assertAlmostEqual(getDesignShearForce(null), 0, 1e-6, 'missing shear result defaults to zero');
}

function testConcreteSectionCalculationUsesStoredShear() {
  sessionStorage.setItem('analysisShear', JSON.stringify({
    ok: true,
    meta: { maxPos: { value: 48 }, maxNeg: { value: -52 }, absMax: 52 },
  }));

  sessionStorage.setItem('analysisBending', JSON.stringify({
    ok: true,
    meta: { maxPos: { value: 65 }, maxNeg: { value: -75 }, absMax: 75 },
  }));

  const result = calculateConcreteSection({
    grade: 'C30/37',
    width: 300,
    depth: 500,
    cover: 35,
    linkDiameter: 8,
    linkSpacing: 200,
    topBars: [{ numberOfBars: 2, barDiameter: 16 }],
    bottomBars: [{ numberOfBars: 2, barDiameter: 16 }],
  }, {
    ok: true,
    meta: { maxPos: { value: 65 }, maxNeg: { value: -75 }, absMax: 75 },
  });

  assert.equal(result.isValid, true, 'concrete section calculation valid with stored shear and bending');
  assertAlmostEqual(result.shearCheck.VEd, 52, 1e-6, 'shear check uses maximum absolute SFD value');
  assert.ok(Number.isFinite(result.shearCheck.utilisation), 'shear utilisation computed');
}

function testConcreteReportUnicodeSafety() {
  const text = 'cotθ = 2.0, γc = 1.5, αcc = 0.85, A², √(1 - K), ρ ≤ 0.5, ρ ≥ 0.2';
  const safe = sanitizePdfText(text);

  assert.equal(safe.includes('cotθ'), false, 'theta removed from plain text');
  assert.equal(safe.includes('γc'), false, 'gamma removed from plain text');
  assert.equal(safe.includes('αcc'), false, 'alpha removed from plain text');
  assert.ok(safe.includes('{sym:θ}'), 'theta token present');
  assert.ok(safe.includes('{sym:γ}'), 'gamma token present');
  assert.ok(safe.includes('{sym:α}'), 'alpha token present');
  assert.ok(safe.includes('{sup:2}'), 'superscript token present');
  assert.ok(safe.includes('{sym:√}'), 'sqrt token present');
  assert.ok(safe.includes('<='), 'less-than-or-equal normalized');
  assert.ok(safe.includes('>='), 'greater-than-or-equal normalized');
}

function referenceShearCase(input) {
  const grade = input.grade || 'C30/37';
  const width = Number(input.width || 0);
  const depth = Number(input.depth || 0);
  const cover = Number(input.cover || 0);
  const linkDiameter = Number(input.linkDiameter || 0);
  const linkSpacing = Number(input.linkSpacing || 0);
  const linkLegs = Math.max(Number(input.linkLegs || 2), 1);
  const topBars = Array.isArray(input.topBars) ? input.topBars : [];
  const bottomBars = Array.isArray(input.bottomBars) ? input.bottomBars : [];
  const VEd = Number(input.VEd || 0);
  const cotTheta = Number(input.cotTheta ?? 2.0);

  const fck = Number(String(grade).match(/C\s*(\d+)\//)?.[1] || 30);
  const fcd = 0.85 * fck / 1.5;
  const fywd = 500 / 1.15;
  const maxBar = Math.max(0, ...[...topBars, ...bottomBars].map((layer) => Number(layer.barDiameter || 0)));
  const d = depth - (cover + linkDiameter + maxBar / 2);
  const totalSteelArea = [...topBars, ...bottomBars].reduce((sum, layer) => {
    const bars = Number(layer.numberOfBars || 0);
    const dia = Number(layer.barDiameter || 0);
    return sum + bars * Math.PI * dia * dia / 4;
  }, 0);
  const rhoL = totalSteelArea / (width * d);
  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);
  const vMin = 0.035 * k ** 1.5 * Math.sqrt(fck);
  const vRdC = Math.max((0.18 / 1.5) * k * (100 * rhoL * fck) ** (1 / 3), vMin) * width * d;

  const hasValidLinks = linkDiameter > 0 && linkSpacing > 0 && linkLegs > 0;
  const Asw = hasValidLinks ? linkLegs * Math.PI * linkDiameter * linkDiameter / 4 : 0;
  const z = 0.9 * d;
  const nu1 = Math.min(0.6, 0.6 * (1 - fck / 250));
  const vRdS = hasValidLinks ? (Asw / linkSpacing) * z * fywd * cotTheta : 0;
  const vRdMax = hasValidLinks ? (width * z * nu1 * fcd) / (cotTheta + 1 / cotTheta) : 0;

  const governingResistance = hasValidLinks ? Math.min(vRdS, vRdMax) : vRdC;
  const pass = VEd * 1000 <= governingResistance;

  return {
    fck,
    fcd,
    fywd,
    d,
    rhoL,
    k,
    vMin,
    vRdC,
    Asw,
    vRdS,
    vRdMax,
    governingResistance,
    pass,
    VEdkN: VEd,
    VEdN: VEd * 1000,
  };
}

function testConcreteShearReferenceCases() {
  const cases = [
    {
      label: 'valid 2-leg ø10 @ 200 mm c/c',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 10,
        linkSpacing: 200,
        linkLegs: 2,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 120,
        cotTheta: 2,
      },
      expectation: {
        Asw: 2 * Math.PI * (10 ** 2) / 4,
        pass: true,
      },
    },
    {
      label: '2-leg ø10 @ 300 mm c/c',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 10,
        linkSpacing: 300,
        linkLegs: 2,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 120,
        cotTheta: 2,
      },
      expectation: {
        Asw: 2 * Math.PI * (10 ** 2) / 4,
        pass: true,
      },
    },
    {
      label: '2-leg ø12 @ 200 mm c/c',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 12,
        linkSpacing: 200,
        linkLegs: 2,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 180,
        cotTheta: 2,
      },
      expectation: {
        Asw: 2 * Math.PI * (12 ** 2) / 4,
        pass: true,
      },
    },
    {
      label: '4-leg configuration',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 10,
        linkSpacing: 200,
        linkLegs: 4,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 180,
        cotTheta: 2,
      },
      expectation: {
        Asw: 4 * Math.PI * (10 ** 2) / 4,
        pass: true,
      },
    },
    {
      label: 'different concrete strength',
      input: {
        grade: 'C40/50',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 10,
        linkSpacing: 200,
        linkLegs: 2,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 200,
        cotTheta: 2,
      },
      expectation: { pass: true },
    },
    {
      label: 'shear reinforcement governs',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 10,
        linkSpacing: 200,
        linkLegs: 2,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 120,
        cotTheta: 2,
      },
      expectation: { governingResistanceCheck: 'VRdS' },
    },
    {
      label: 'VRd,max governs',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 8,
        linkSpacing: 50,
        linkLegs: 2,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 300,
        cotTheta: 1.5,
      },
      expectation: { maxGoverns: true, VRdMax: 499.9908184615385, VRdS: 527.525311112003 },
    },
    {
      label: 'design shear exceeds available resistance',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 8,
        linkSpacing: 300,
        linkLegs: 2,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 500,
        cotTheta: 2,
      },
      expectation: { pass: false },
    },
    {
      label: 'invalid missing links',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 0,
        linkSpacing: 0,
        linkLegs: 0,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 80,
      },
      expectation: { warningContains: 'No valid shear links were supplied', pass: true },
    },
    {
      label: 'very small spacing',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 10,
        linkSpacing: 50,
        linkLegs: 2,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 180,
        cotTheta: 2,
      },
      expectation: { pass: true },
    },
    {
      label: 'hand-checked independent value',
      input: {
        grade: 'C30/37',
        width: 300,
        depth: 500,
        cover: 35,
        linkDiameter: 10,
        linkSpacing: 200,
        linkLegs: 2,
        topBars: [{ numberOfBars: 2, barDiameter: 16 }],
        bottomBars: [{ numberOfBars: 3, barDiameter: 20 }],
        VEd: 120,
        cotTheta: 2,
      },
      expectation: { VRdS: 273.52344733972003, VRdMax: 431.38656 },
    },
  ];

  for (const testCase of cases) {
    const reference = referenceShearCase(testCase.input);
    const actual = calculateConcreteShearResistance(testCase.input);

    assert.equal(actual.isValid, true, `${testCase.label}: result valid`);

    if (Object.hasOwn(testCase.expectation, 'Asw')) {
      assertAlmostEqual(actual.linkArea, testCase.expectation.Asw, 1e-6, `${testCase.label}: Asw`);
    }

    if (Object.hasOwn(testCase.expectation, 'pass')) {
      assert.equal(actual.pass, testCase.expectation.pass, `${testCase.label}: pass/fail`);
    }

    if (testCase.expectation.warningContains) {
      assert.ok(actual.warning.includes(testCase.expectation.warningContains), `${testCase.label}: warning includes expected text`);
    }

    if (testCase.expectation.governingResistanceCheck === 'VRdS') {
      assert.ok(actual.VRdS < actual.VRdMax, `${testCase.label}: VRdS governs`);
      assertAlmostEqual(actual.governingResistance, actual.VRdS, 1e-6, `${testCase.label}: governing resistance = VRdS`);
    }

    if (testCase.expectation.maxGoverns) {
      assert.ok(actual.VRdMax < actual.VRdS, `${testCase.label}: VRd,max governs`);
      assertAlmostEqual(actual.governingResistance, actual.VRdMax, 1e-6, `${testCase.label}: governing res`);
    }

    if (Object.hasOwn(testCase.expectation, 'VRdS')) {
      assertAlmostEqual(actual.VRdS, testCase.expectation.VRdS, 1e-4, `${testCase.label}: VRdS`);
      assertAlmostEqual(actual.VRdMax, testCase.expectation.VRdMax, 1e-4, `${testCase.label}: VRdMax`);
    }

    assertAlmostEqual(actual.linkArea, reference.Asw, 1e-6, `${testCase.label}: reference Asw`);
    assertAlmostEqual(actual.VRdS, reference.vRdS / 1000, 1e-3, `${testCase.label}: reference VRdS`);
    assertAlmostEqual(actual.VRdMax, reference.vRdMax / 1000, 1e-3, `${testCase.label}: reference VRdMax`);
    assertAlmostEqual(actual.VRdC, reference.vRdC / 1000, 1e-3, `${testCase.label}: reference VRdC`);
  }
}

try {
  testSimplySupportedPointLoad();
  testSimplySupportedUDL();
  testMixedLoads();
  testCantileverPointLoad();
  testCantileverUDL();
  testUnloadedBeam();
  testLoadAtSupport();
  testConcreteShearLinkResistance();
  testConcreteShearLinkDeficiency();
  testConcreteDesignShearEnvelope();
  testConcreteSectionCalculationUsesStoredShear();
  testConcreteReportUnicodeSafety();
  testConcreteShearReferenceCases();
  console.log('beam-analysis-regression: all tests passed');
} catch (error) {
  console.error('beam-analysis-regression: failed');
  console.error(error);
  process.exitCode = 1;
}
