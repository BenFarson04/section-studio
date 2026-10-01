# Report Generation Audit

Audit basis: current worktree at `fc78a32` (`fix report`), plus the report-related history described in section 9. No application code or tests were changed for this audit.

## 1. Executive Summary

The manual designer has one `Generate Report` button and one module script. On startup, `js/main.js` calls `bindReportGenerationButton()`. The router attaches one click listener (and guards repeated binding), then routes by `#designMaterial`: exactly `concrete` calls `generateConcreteReport()`; every other value, including a missing element, calls the steel `generateReport()`.

The concrete generator has a module-scoped in-flight promise. It calculates once, draws sections 1-9 in source order, saves one PDF, and clicks one download anchor. Sagging, Hogging, Shear, Governing Summary, and Notes each appear once in that straight-line body. The current regression test passed and counted each section heading once. Its run also recorded one `drawBendingCheck()` start for each bending direction and page breaks while later text was drawn.

I found no confirmed current application path that emits the concrete body twice within one generated PDF. The exact reported browser behavior is not explained by the source paths traced here. Repeated independent clicks after a generation has completed can create multiple PDF downloads, and out-of-band direct calls can bypass the router lock, but neither is a confirmed explanation for duplicate content in one report. The fake-PDF test does not exercise a real browser click or inspect a real saved PDF, so it cannot exclude a browser/PDF-library/output issue.

## 2. Generate Report Entry Point

1. The button is `#generateReportBtn` in [html/manualDesigner.html](html/manualDesigner.html#L472), with visible text `Generate Report`. The same page has one `type="module"` script loading `../js/main.js` at [html/manualDesigner.html](html/manualDesigner.html#L498). The report modal form is `#reportForm` at line 512 and its cancel button is `#reportCancel` at line 559.
2. `main.js` imports both report modules and imports `bindReportGenerationButton` from the router at [js/main.js](js/main.js#L57). The concrete and steel generator imports are module imports, not additional button listeners.
3. `initApp()` calls `bindReportGenerationButton()` once in its startup flow at [js/main.js](js/main.js#L97). Startup either registers `initApp` once for `DOMContentLoaded`, or calls it immediately, at [js/main.js](js/main.js#L793).
4. `bindReportGenerationButton()` looks up the button and attaches one `click` listener at [js/sectionDesignerLogic/reportGeneratorRouter.js](js/sectionDesignerLogic/reportGeneratorRouter.js#L34). The module-level `reportButtonBound` flag is set only after the button exists and prevents another binding through this module instance (lines 4, 35-46).
5. The click callback invokes `runReportGeneration()` with no override. `createReportGenerationRunner()` uses a closure-scoped `isGenerating` flag to ignore a concurrent re-entry and resets it in `finally` (router lines 6-31, 43-47).

**Listener count and lifetime:** The normal page path creates one report-button click listener. It is attached from `initApp()` during module startup, not from rendering or a repeatable render callback. The button is static markup, not re-created by rendering. Other modules have their own DOM-ready listeners, but the source search found no other listener attached to `#generateReportBtn`.

**Repeated load considerations:** The page includes `main.js` once. `main.js` imports each report module and the router; the router imports those same module specifiers. In this one module graph, ES module caching means those imports do not execute separate module instances. `html/index.html` also loads `main.js` once, but it is the beam page and has no `#generateReportBtn`; the root `index.html` redirects to `html/index.html`.

## 3. Report Routing

### Steel

`Generate Report click` -> router listener -> `runReportGeneration()` -> read `document.getElementById("designMaterial")?.value` -> if that value is not exactly `"concrete"`, await `generateReport()` (`reportGeneratorRouter.js:20-28`). On the manual designer's steel mode, the select/button state is represented by `#designMaterial` and the router chooses the steel generator.

### Concrete

`Generate Report click` -> same router listener -> `runReportGeneration()` -> material is exactly `"concrete"` -> await `generateConcreteReport()` -> return without calling the steel generator (`reportGeneratorRouter.js:20-25`). The branch is mutually exclusive; it does not fall through to the steel generator.

There are two dispatcher functions in the application flow: `bindReportGenerationButton()` attaches the UI callback, while `createReportGenerationRunner()` reads material and selects a generator. Application call-site search found the router as the only production caller of either generator. Tests import/call the router and concrete generator separately.

## 4. Concrete Report Execution Flow

`Generate Report click`
-> `bindReportGenerationButton()` listener
-> `runReportGeneration()`
-> `generateConcreteReport()`
-> validate input/session state and `runConcreteSectionCalc()`
-> prompt for report metadata
-> load template, create PDF document/pages/fonts and cursor
-> emit sections 1-9 in order
-> `pdfDoc.save()`
-> create Blob/object URL/download anchor and `a.click()`
-> PDF download

Detailed path and content:

1. `generateConcreteReport()` starts at [js/sectionDesignerLogic/generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L867). It reads concrete form state using `getConcreteSectionInput()`, and stored shear/bending state using `loadShearFromSession()` and `loadBendingFromSession()` (lines 881-883; store functions at [js/state/store.js](js/state/store.js#L57)). It checks section dimensions and bending availability (lines 885-891).
2. It calls `runConcreteSectionCalc()` (line 895). That calls `getConcreteSectionInput()`, `loadBendingFromSession()`, then `calculateConcreteSection()` ([js/sectionDesignerLogic/concreteSectionCalc.js](js/sectionDesignerLogic/concreteSectionCalc.js#L72)). `calculateConcreteSection()` normalizes input and computes material properties, effective depths, provided reinforcement, design moments, shear force/check, sagging and hogging bending checks, governing result, and notes (lines 95-221). Specifically it calls `calculateConcreteEffectiveDepths()` and `calculateConcreteShearResistance()` (lines 111-140), then `checkConcreteBending()` once for sagging and once for hogging (lines 145-188). The result is data consumed by report drawing; this calculation does not draw the PDF.
3. The generator awaits `promptReportDetails()` (concrete generator lines 171-228 and call at line 915). That helper opens the modal, registers one form-submit, cancel, and Escape handler for that prompt, then removes those handlers in `close()` before resolving/rejecting. It does not initiate PDF drawing.
4. The generator fetches `../references/pdfTemplate.pdf`, loads a `PDFDocument` and a second template document, copies ten template pages, loads fonts, constructs one `Cursor`, sets the first page, and fills its title block (lines 920-950). Font loading is `loadPdfFonts()` in [js/sectionDesignerLogic/reportText.js](js/sectionDesignerLogic/reportText.js#L84), which embeds regular/bold fonts through `embedPdfFont()` (lines 63-81).
5. Body emission is a single source-ordered sequence in the same generator invocation:
   - Section 1, Section & Material: `heading()` then `ln()`/`richLn()` (concrete generator lines 957-981).
   - Section 2, Reinforcement Summary: one top and one bottom call to `drawReinforcementSummary()` (lines 986-992; helper at line 602). It iterates provided reinforcement layers, not report sections.
   - Section 3, Effective Depths: explicit Sagging and Hogging text blocks, each written once (lines 997-1047). These are depth descriptions; they are distinct from the later bending checks.
   - Section 4, Design Forces: one heading and the force lines (lines 1052-1084).
   - Section 5, Sagging bending check: one `drawBendingCheck(c, checks.sagging, 5)` call (line 1089).
   - Section 6, Hogging bending check: one `drawBendingCheck(c, checks.hogging, 6)` call (line 1094).
   - Section 7, Shear Resistance Check: one heading and one conditional body (lines 1099-1152). It includes link-related subcalculations only when the result has valid link properties.
   - Section 8, Governing Summary: one heading and one conditional body (starting line 1156).
   - Section 9, Notes & Scope: one heading, fixed notes, and optional calculation notes (starting line 1197).
6. `drawBendingCheck()` selects the heading from `check.momentType`, emits one heading, then its detail/check lines; its start log is at [js/sectionDesignerLogic/generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L633). It does not call itself or invoke report generation recursively.
7. The body concludes with `pdfDoc.save()`, one Blob and object URL, one anchor setup, one `a.click()`, then URL revocation (lines 1257-1272). Errors are caught and reported; the module in-flight promise is reset in `finally` (lines 1274-1286).

The report's section 7 contains a shear check, while the section 9 scope prose says shear resistance/link design are not included. That is a content inconsistency, not a duplicate-render path.

## 5. Steel Report Execution Flow

`Generate Report click`
-> same `bindReportGenerationButton()` listener
-> same `runReportGeneration()`
-> non-concrete material branch
-> `generateReport()`
-> validate steel section/grade and stored beam analysis
-> prompt for report metadata
-> load template, create PDF document/pages/fonts and cursor
-> emit steel sections 1-6
-> `pdfDoc.save()`
-> create Blob/object URL/download anchor and `a.click()`
-> PDF download

`generateReport()` is defined at [js/sectionDesignerLogic/generateReport.js](js/sectionDesignerLogic/generateReport.js#L269). It reads `window.selectedSteelSection`, `window.selectedSteelGrade`, section type, and stored shear/bending results; it rejects missing/unsupported data before PDF creation (lines 274-298). It prompts for metadata (line 301), computes design values and section classification, then loads the template and fonts and initializes a cursor/title block (lines 450-461).

Its body is also emitted sequentially once: Section & Material (line 468), Cross-section Classification (506), Design Forces (579), Shear Resistance (586), Bending Resistance (637), and Deflection (702). It saves once and triggers one anchor click at lines 748-755. Steel uses its own local `Cursor`, `heading()`, `ln()`, `richLn()`, and `fillTitleBlock()` helpers (lines 153-267), rather than calling the concrete renderer.

Unlike concrete, `generateReport()` has no generator-local in-flight promise. In the UI route, the shared router runner still serializes it; a direct or separately-created invocation can bypass that router guard.

## 6. PDF Rendering

Both generators use `pdf-lib` from the global `PDFLib` loaded by the HTML pages. Each creates its own `PDFDocument`, cursor, and local rendering helpers; neither uses a shared generic report-body renderer.

For concrete:

- `heading()` writes a heading through `c.page.drawText()` and a rule through `c.page.drawLine()` ([generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L297)).
- `ln()` writes sanitized plain text with `c.page.drawText()` (line 324); `richLn()` calls `drawRichTokens()`, which writes text, subscript, superscript, and symbol tokens through `drawText()` (lines 409-495). `richPassLine()` similarly emits rich text and a PASS/FAIL tag (line 506).
- `fillTitleBlock()` writes metadata directly to a page via `page.drawText()` (line 349). `Cursor.ensure()` adds another copied/fresh page when the cursor reaches the body bottom and writes that page's title block (lines 236-286). It does not re-run the report body or replay a heading.
- PDF serialization/output occurs at lines 1257-1272.

Steel has corresponding independent helpers at [js/sectionDesignerLogic/generateReport.js](js/sectionDesignerLogic/generateReport.js#L178) and serializes/downloads at lines 748-755. A heading/plain-text helper may make multiple PDF draw calls for one logical rich-text line, but those calls render token fragments at successive x positions; this is not a second report-generator invocation.

The concrete regression test's fake PDF implementation logs `drawText()` calls and stubs `save()` to return an empty byte array ([tests/report-render-regression.mjs](tests/report-render-regression.mjs#L47)). It does not exercise actual `pdf-lib` page serialization or inspect the resulting PDF pages/text.

## 7. Duplicate Execution Analysis

| Suspected path | Evidence and trigger | Assessment |
|---|---|---|
| Multiple report-button listeners | Only the router attaches to `#generateReportBtn` (router lines 34-47); `reportButtonBound` guards repeat binding (lines 4, 35). `initApp()` calls the binder in one startup path (main lines 97-110, 793-797). | **Not confirmed in the current page.** The listener guard covers repeat calls through one router module instance. Separately evaluated module URLs/instances are theoretically outside that guard, but no such loading path exists in the HTML found. |
| Re-entrant/rapid click while a report is active | `createReportGenerationRunner()` returns early while its `isGenerating` flag is true and resets it in `finally` (router lines 10-29). | **Confirmed prevention in the normal UI route.** A second click during the active generation does not call either generator. A later click after completion is a new generation and can create another download; that is separate user-triggered output, not duplicated content within one PDF. |
| Concurrent direct concrete calls | `concreteReportGenerationPromise` is checked and returned at [generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L867), then reset after completion (lines 876, 1284-1286). | **Confirmed prevention while in flight.** A direct call after completion is allowed to generate a new report. Source search found no production direct caller other than the router; tests call the export directly. |
| Router calling both generators | Material branch awaits concrete and returns, otherwise awaits steel (router lines 20-28). | **Ruled out in the traced router flow.** Concrete and steel are mutually exclusive in one runner invocation. |
| Generic and concrete generators both imported/run | `main.js` imports both modules (lines 57-59), and router imports both (router lines 1-2); only the router calls them at runtime. | **No duplicate invocation found.** Imports alone do not execute each generator function; identical ESM module specifiers share module instances within this page graph. |
| Duplicate HTML button/script elements | One report button at manualDesigner line 472 and one app module script at line 498. | **Not found in current markup.** A duplicated DOM or separately loaded app module would be an unverified deployment/runtime condition, not a path present in the checked HTML. |
| Recursive/nested report generation | Concrete calculation/drawing helpers are called in the generator body; no call from them back to a report generator was found (concrete calculation lines 72-221; renderer lines 602-860). | **Not found.** The generator invokes each bending-check renderer once and proceeds forward through later headings. |
| Cursor page breaks replay content | Concrete `Cursor.ensure()` adds a page and fills a title block (lines 254-286); body calls follow once in lines 957-1249. | **Page breaks are confirmed; body replay is not.** The regression run logged page breaks after bending began, but also recorded one start per bending direction and one of each section heading. A real PDF/page-text inspection has not been performed, so a PDF-library or actual serialized-page issue is not excluded. |
| Modal submit/listener duplication | Each `promptReportDetails()` registers submit/cancel/Escape callbacks and removes them in its `close()` helper (concrete lines 171-228; steel lines 120-149). | **No normal-flow duplicate found.** Router/concrete locks prevent concurrent normal prompts. Concurrent external steel generator calls could create separate prompt flows because steel has no local lock, but none are present in application call sites. |
| Multiple report calls from other code | Application-wide call-site search found `generateConcreteReport()` only in the router and the regression test; likewise `generateReport()` is routed, with its other appearances being tests/imports. | **No second production caller found.** Browser console, injected scripts, a second page/tab, stale deployed assets, or manual repeated clicks remain external possibilities, not confirmed current source paths. |

No suspected path above is a confirmed cause of the user's exact "same report content printed twice from around Sagging/Hogging onward" symptom.

## 8. Concrete vs Steel Comparison

| Aspect | Concrete | Steel |
|---|---|---|
| Route | `designMaterial === "concrete"` -> `generateConcreteReport()` | Every other material value -> `generateReport()` |
| UI listener/runner | Shared router listener and `isGenerating` guard | Same shared router listener and `isGenerating` guard |
| Generator-local lock | Yes, module-level promise at concrete generator lines 867-876, cleared at 1284-1286 | No generator-local in-flight guard |
| Body structure | Sections 1-9, with separate Sagging/Hogging depth lines and bending checks, then shear/governing/notes | Sections 1-6, one bending resistance section and a deflection section |
| Renderer | Concrete-local `Cursor`, `heading`, `ln`, `richLn`, reinforcement/bending helpers | Steel-local counterparts; not shared with concrete |
| Output | One `save()`, Blob, anchor click (concrete lines 1257-1272) | One `save()`, Blob, anchor click (steel lines 748-755) |
| Existing render assertion | Concrete section headings/text are counted in fake draw calls | No steel rendering assertion in the existing report test |

The concrete code has more body content and exercises page breaks in the passing regression setup. This is a structural difference relevant to the reported onset: later concrete content can continue on additional PDF pages. However, a page break advances the cursor and fills a title block; the traced code does not restart the body. Steel's lack of a generator-local lock is a difference, but it does not explain why concrete alone duplicates under the normal UI path, since the shared router guard applies to both.

## 9. Previous Duplicate-Printing Fixes

Current history and source show these relevant changes:

- `f2fafa8` introduced the router module and its `reportButtonBound` bind-once check. Current locations are [reportGeneratorRouter.js](js/sectionDesignerLogic/reportGeneratorRouter.js#L4) and lines 34-47.
- `91d9926` changed the concrete report numbering around the bending checks: Sagging and Hogging gained section numbers 5 and 6, then Shear/Governing/Notes shifted to 7/8/9. The current calls/headings are concrete generator lines 1087-1099 and 1156-1197. That diff changes labels and numbering, not call multiplicity.
- `18566c7` added text sanitization/report-font support and a Unicode-safety assertion. It does not add a duplicate-generation guard; current sanitization and font loading are in [reportText.js](js/sectionDesignerLogic/reportText.js#L63) and lines 84-147.
- `629ccc9` (Sept. 28 `fix report`) added `createReportGenerationRunner()`, its `isGenerating` re-entry guard, and the concrete/steel branch; it also expanded `tests/report-render-regression.mjs` to cover runner coalescing and concrete section text. Current router lines 6-31 contain that mechanism.
- `629ccc9` also added `concreteReportGenerationPromise` around the concrete body. It coalesces direct concurrent concrete calls, but resets at completion, so it is not an "only ever once" guard. Current code is at concrete generator lines 867-876 and 1284-1286.
- `fc78a32` (current `fix report`) added diagnostic console output for concrete generator entry/in-flight status, page breaks, and each bending-check start (concrete generator lines 254-281, 638, 870-873). These logs observe calls; they do not prevent them.

These protections are layered, not obviously conflicting: the router lock is per runner instance and protects UI calls for both materials; the concrete promise is module-scoped and protects concurrent direct concrete calls. Neither deduplicates reports after a prior call has finished. The test-created runner is a separate runner instance from the one made by the button binder, as expected for unit isolation.

## 10. Existing Tests

### `tests/report-render-regression.mjs`

- Builds stubs for DOM, `PDFLib`, storage, fonts/fetch, Blob, and URL (lines 1-195).
- Calls `bindReportGenerationButton()` once and asserts one click listener exists (lines 196-203). It does not call `btn.click()` or dispatch that bound click handler.
- Tests `createReportGenerationRunner()` with injected slow/mock generators: two overlapping concrete runner calls produce one invocation, and a later call after completion starts another (lines 205-227). This tests the runner closure, not the actual default concrete/steel functions through the UI callback.
- Imports and calls `generateConcreteReport()` directly once, dispatches one modal submit, then counts section titles and selected lines in the stub's `drawText` log (lines 229-256). It would catch duplicate section calls occurring inside that one invocation, but it does not call the real generator twice, test repeated binder calls, exercise actual UI clicks, assert steel output, count downloads/saves, or parse a real PDF.
- Its PDF fake returns empty bytes from `save()` and its fake anchor's `click()` does nothing (lines 47-87 and 129-134). Thus it verifies draw-call text, not actual PDF serialization, page composition, browser downloads, or print-dialog behavior.

The test can pass while a real-world issue remains if duplication requires a browser-only event/module lifecycle, a separate invocation not represented by its single direct call, or behavior in actual `pdf-lib` page serialization/download/printing. It currently demonstrates that the tested single concrete invocation emits each checked heading once, not that every real-world path invokes that generator exactly once.

### `tests/beam-analysis-regression.mjs`

This is primarily beam-analysis and concrete calculation coverage. It includes concrete shear/calculation checks and `testConcreteReportUnicodeSafety()` for `sanitizePdfText()` (lines 169-262 and 294-306; invoked at 621-622). It does not generate either report, test report routing/listeners, inspect PDF output, or assert duplicate-render behavior.

No other test file in the current `tests/` directory tests report rendering or event/listener behavior.

**Observed test run:** `node tests/beam-analysis-regression.mjs && node tests/report-render-regression.mjs` passed. The report test's logs showed one Sagging renderer start, one Hogging renderer start, and two cursor page breaks in the later body. Its section-count assertions passed.

## 11. Most Likely Root Cause

I cannot confidently identify a root cause from the code currently traced. The current normal UI path contains a single listener, mutually exclusive material routing, an in-flight UI guard, a second concrete in-flight guard, one source-ordered concrete body, and one save/download sequence. The current regression run sees each section once for one direct concrete invocation.

The most defensible code-level conclusion is that the duplicate is not established as an unconditional duplicate inside `generateConcreteReport()`. The onset near Sagging/Hogging coincides with the denser concrete body and page breaks in the test, but page breaks alone do not rerun body functions. The test does not inspect a real PDF, leaving actual page serialization/output behavior and a browser-only extra invocation unresolved.

## 12. Recommended Next Investigation

1. Reproduce once in the target browser and record timestamps/counts for the button click callback, router runner entry, `generateConcreteReport()` entry, both `drawBendingCheck()` calls, `pdfDoc.save()`, and anchor click. Compare counts for a single click.
2. Inspect the actual downloaded PDF with a text/page extractor and compare page count and repeated text by page, especially the first page after sections 5-6. This distinguishes repeated draw calls from duplicated/overlapped/printed pages.
3. In browser devtools, verify the loaded document URL, the count of `#generateReportBtn`, the number of click listeners/loaded `main.js` module instances, and whether a single click event is delivered once. Check deployed/cached assets against this worktree.
4. Capture the cursor's page number and page object identity at each body heading in a real `pdf-lib` run, then compare with extracted text. The existing fake page does not model real copied-page serialization.
5. If routing counts remain one but printed sheets duplicate, inspect the PDF viewer/print workflow separately from generation/download; current application code only creates and downloads the PDF and does not invoke `window.print()`.

AUDIT COMPLETE

Files inspected:
- `html/manualDesigner.html`, `html/index.html`, `index.html`
- `js/main.js`, `js/sectionDesignerLogic/reportGeneratorRouter.js`
- `js/sectionDesignerLogic/generateConcreteReport.js`, `js/sectionDesignerLogic/generateReport.js`, `js/sectionDesignerLogic/reportText.js`
- `js/sectionDesignerLogic/concreteSectionCalc.js`, `js/sectionDesignerLogic/concreteEffectiveDepth.js`, `js/sectionDesignerLogic/concreteShearCheck.js`, `js/state/store.js`
- `tests/report-render-regression.mjs`, `tests/beam-analysis-regression.mjs`
- Report-related Git history for `f2fafa8`, `91d9926`, `18566c7`, `629ccc9`, and `fc78a32`

Concrete report entry point: `#generateReportBtn` -> `bindReportGenerationButton()` -> `runReportGeneration()` -> `generateConcreteReport()`.

Steel report entry point: `#generateReportBtn` -> `bindReportGenerationButton()` -> `runReportGeneration()` -> `generateReport()`.

Concrete PDF renderer: `heading()`, `ln()`, `richLn()`/`drawRichTokens()`, `fillTitleBlock()`, `Cursor.ensure()` in `js/sectionDesignerLogic/generateConcreteReport.js`, using `pdf-lib` `drawText()`/`drawLine()`.

Confirmed duplicate execution path(s): None found in the current single-click application path. Concurrent normal UI calls are suppressed; one invocation writes each concrete section once in the tested setup.

Unconfirmed possibilities: separate post-completion clicks/downloads; external/direct callers or separately evaluated app modules; browser/deployed asset lifecycle; actual PDF page serialization or downstream viewer/printing behavior.

Files changed: `REPORT_GENERATION_AUDIT.md` only.