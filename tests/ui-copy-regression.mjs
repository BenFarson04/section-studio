import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workspace = new URL('../', import.meta.url);

const files = [
  'html/manualDesigner.html',
  'js/main.js',
  'js/state/manualDesignerMaterialToggle.js',
  'js/sectionDesignerLogic/concreteSectionCalc.js',
  'js/sectionDesignerLogic/sectionCalcShared.js',
  'js/sectionDesignerLogic/chsSectionCalc.js',
  'js/sectionDesignerLogic/shsRhsSectionCalc.js',
  'js/sectionDesignerLogic/eaUaSectionCalc.js',
  'js/sectionDesignerLogic/pfcSectionCalc.js'
];

const contents = await Promise.all(files.map((file) => readFile(new URL(file, workspace), 'utf8')));
const source = contents.join('\n');

const removedCopy = [
  'Use the concrete report button to generate the PDF calculation report.',
  'The shear check uses the maximum absolute SFD value',
  'This is a simplified rectangular-section ULS bending check only.',
  'Further checks normally required for a full RC beam design include',
  'Note: This check covers cross-section bending/shear only.',
  'No LTB check required for hollow sections.',
  'This check covers cross-section bending/shear only. Torsion, LTB and biaxial effects not included.',
  'Generate a detailed design check report on your title block.'
];

for (const text of removedCopy) {
  assert.equal(source.includes(text), false, `Unexpected explanatory UI copy remains: ${text}`);
}

assert.match(source, /Select section and grade\./);
assert.match(source, /Concrete check unavailable\./);
