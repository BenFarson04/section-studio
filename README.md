# Section Studio

Section Studio is a browser-based structural engineering application for beam
analysis and manual steel or reinforced-concrete section design. It calculates
support reactions, shear and bending response, displays section checks, and
generates PDF calculation reports. It is an educational tool, not a substitute
for independent engineering review.

## Application structure

- `index.html` redirects to the landing page at `html/start.html`.
- `html/index.html` contains the beam-analysis workflow; `html/manualDesigner.html`
  contains the steel and reinforced-concrete design workflow.
- `js/main.js` initializes the pages and connects their interactions.
- `js/analysis/` contains beam reactions, shear, and bending calculations.
- `js/sectionDesignerLogic/` contains steel design checks
  (`ubUcSectionCalc.js`, `pfcSectionCalc.js`, `eaUaSectionCalc.js`,
  `shsRhsSectionCalc.js`, and `chsSectionCalc.js`), reinforced-concrete checks
  (`concreteSectionCalc.js`, `concreteEffectiveDepth.js`, and
  `concreteShearCheck.js`), material and section selection, and report
  generation.
- `js/draw/`, `js/canvas/`, `js/ui/`, and `js/state/` contain rendering,
  canvas layout, page controls, and saved application state.
- `references/bluebook/` holds section catalogue data. The application loads
  the CSV files; matching XLSX workbooks are retained as editable references.
- `js/sectionDesignerLogic/generateReport.js` and
  `js/sectionDesignerLogic/generateConcreteReport.js` generate the steel and
  concrete reports. They use `references/pdfTemplate.pdf` and
  `fonts/NotoSans-Regular.ttf`.
- `styleV2.css` is the shared application stylesheet. The landing page has its
  own page-specific styles in `html/start.html`.

## Run locally

There is no bundler or compile step. Install the dependencies used by the
regression checks, then serve the repository root over HTTP so the application
can load its catalogue data:

```sh
npm install
python3 -m http.server 4173
```

Open <http://localhost:4173/>. The browser loads `pdf-lib` and fontkit from
their version-pinned CDN URLs in the HTML pages.

## Regression checks

Run the Node.js regression scripts from the repository root:

```sh
for test in tests/*.mjs; do
  node "$test" || exit 1
done
```

The checks cover beam-analysis calculations, UI copy, PDF report rendering,
and PDF page independence. The page-independence regression currently fails
its assertion that a fixture's final note is drawn; see the test output before
treating the full suite as passing.

## Build and deployment

The application is static and can be hosted by serving the repository files
without a build step. This repository does not define a GitHub Actions workflow
or deployment target.
