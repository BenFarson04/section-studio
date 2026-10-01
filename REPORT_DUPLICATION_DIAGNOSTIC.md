# Report Duplication Diagnostic

## 1. Reproduction Pattern

The supplied observation is a single concrete report with three pages: page 1 is normal; page 2 begins the continued Section 6 Hogging calculation at `K used = min(K, K') = 0.069` and proceeds through Section 9; page 3 shows that same continuation through the report end.

The generated PDF itself was not present in the workspace. The available PDF is only `references/pdfTemplate.pdf`. However, the checked-in report regression fixture uses a 300 x 500 mm C30/37 section, 35 mm cover, 2H16 top/bottom bars, and a hogging moment of -125 kNm. That computes the observed K value (`0.069`) and, in a trace of the actual concrete source functions, causes the same page breaks at cursor y=46 and y=50. The PDF-page alias was separately reproduced against the real installed pdf-lib and the repository template.

## 2. Exact First Duplicated Line

The first repeated line is:

`K used = min(K, K') = 0.069`

Source: `drawBendingCheck()` emits the string at [js/sectionDesignerLogic/generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L721). The Section 6 call is made once at line 1094. The renderer is `richLn()` at line 476.

## 3. Exact Last Duplicated Line

In the matching report-render regression fixture, the last text draw is:

`- Further checks normally required for a full RC beam design include shear, anchorage, curtailment, crack control, deflection, durability cover, spacing, fire resistance where relevant, and support detailing.`

It is emitted from the `notes.forEach()` body at [js/sectionDesignerLogic/generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L1246). The temporary trace recorded it as the final text draw at cursor y=598 before and y=586 after, on page 3. Because the uploaded PDF file itself was not accessible here, this exact final literal is verified for the matching fixture; a different input could produce a different final optional note. The structural result is that content appended after the first page break, including the end-of-report text, is exposed through the shared page content list on both pages 2 and 3.

## 4. Source Call Chain for the First Line

`generateConcreteReport()`
-> `drawBendingCheck(c, checks.hogging, 6)` once ([generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L1094))
-> `drawBendingCheck()` reaches the `K used` `richLn()` call (line 721)
-> `richLn()` calls `c.ensure(lh)` once, where `lh` defaults to 12 points (lines 476-495)
-> `Cursor.ensure()` creates page 2 and resets its cursor y to 675 (lines 254-276)
-> that same `richLn()` call draws the line once on page 2 and reduces y to 663.

`drawRichTokens()` iterates tokens and calls `drawText()`; it does not call `ensure()` or re-enter `richLn()` ([generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L409)). The `K used` string is plain text, so it is written as one text token. There is no retry or second execution of this source line in the traced invocation.

## 5. Cursor State at the Boundary

Temporary tracing of the current concrete source using the report regression's data produced:

| Event | Page index / trace identity | Cursor y before | Action | Cursor y after |
|---|---:|---:|---|---:|
| `richLn("K used = ...")` begins | 1 / 1 | 46 | Calls `ensure(12)` | 46 before ensure |
| `Cursor.ensure(12)` | 1 / 1 | 46 | `46 - 12 < PG.bodyBot(45)`, so add copied page | page 2 / identity 2, y=675 |
| Same `richLn` resumes | 2 / 2 | 675 | `drawRichTokens()` draws once | 663 |
| `ln("Checks not included in this report:")` begins in Notes | 2 / 2 | 50 | Calls `ensure(12)` | 50 before ensure |
| `Cursor.ensure(12)` | 2 / 2 | 50 | Adds next copied page | page 3 / identity 3, y=675 |
| Same `ln` resumes | 3 / 3 | 675 | Draws once | 663 |
| Last fixture note | 3 / 3 | 598 | Draws once | 586 |

The trace used a single generation ID (`1`). The page identities above are the unique fake-page identities recorded by the temporary renderer trace; the real pdf-lib check separately confirmed distinct page nodes and shared `Contents` arrays.

`ensure()` runs before the text drawing operation. The operation that encountered insufficient space does not draw on page 1: `ensure()` changes `c.page` and resets `c.y`, then control returns to the original `richLn()`/`ln()` call, which draws one time on the new page. No drawing call is made before `ensure()` for that logical line, and none is retried afterward.

## 6. Page Creation and Template Copying

In the concrete generator ([generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L920)):

1. `PDFDocument.load(templateBytes)` makes the output document. The repository template has one page, so it starts with page 1.
2. A second `PDFDocument.load(templateBytes)` creates the independent source template document.
3. `pdfDoc.copyPages(templateDoc, Array(10).fill(0))` asks for ten copies of source page 0 (line 925). `extraPages` therefore has ten page objects; page 2 uses the first, page 3 the second. Both are copied from the source template, not from the populated output page 2.
4. `Cursor.ensure()` uses `this.extraPages.shift()`, calls `this.doc.addPage(tpl)`, assigns `this.page = tpl`, increments the page counter, resets y to `PG.bodyTop`, and fills the title block (lines 254-279). pdf-lib's `addPage()` delegates to `insertPage()` and returns the existing `PDFPage` passed in; it does not clone page 2 ([node_modules/pdf-lib/cjs/api/PDFDocument.js](node_modules/pdf-lib/cjs/api/PDFDocument.js#L563), lines 599-616).

The copied pages are **distinct page nodes but not independent mutable content lists** in this repeated-source-page case. In pdf-lib 1.17.1, `copyPages()` constructs one `PDFObjectCopier` before looping over all requested indices ([node_modules/pdf-lib/cjs/api/PDFDocument.js](node_modules/pdf-lib/cjs/api/PDFDocument.js#L636), lines 647-654). That copier memoizes copied arrays in `traversedObjects` and returns the existing clone when an already-seen source array is encountered ([node_modules/pdf-lib/cjs/core/PDFObjectCopier.js](node_modules/pdf-lib/cjs/core/PDFObjectCopier.js#L72)). Thus each copied page node is different, but each page's `Contents` entry points at the same copied `PDFArray` object. `PDFPageLeaf.addContentStream()` appends the drawing stream to that array ([node_modules/pdf-lib/cjs/core/structures/PDFPageLeaf.js](node_modules/pdf-lib/cjs/core/structures/PDFPageLeaf.js#L72)).

Real-library experiment using this template and `Array(10).fill(0)`:

- Template pages: 1; output initial pages: 1; extra copies requested: 10.
- Copied page nodes were distinct (10 unique nodes).
- `Contents` JavaScript object identities across those copies: 1 unique object.
- Before drawing, the shared Contents array had 4 template stream references.
- Drawing text on copied page 2 increased the shared array; page 3 immediately observed the same changed array.
- After save and reload, page 2 and page 3 had identical serialized `Contents` lists, including the body stream reference added by drawing on page 2.

The template's pre-existing streams are shared too, but those are template content. The report body is appended after page 2 is added. Page 3 is not copied from populated page 2; rather, its distinct template page node points to the same mutable `Contents` array. Later drawing on page 3 appends further streams to that same list, so page 2 also sees those later streams.

## 7. Page Transition Diagram

```text
Section 6 Hogging check starts on page 1
  -> prior Hogging lines reduce cursor to y=46
  -> richLn("K used = min(K, K') = 0.069") calls ensure(12)
  -> 46 - 12 < 45: ensure takes extraPages[0], adds page 2, resets y=675
  -> the same richLn call draws K used once on page 2, y 675 -> 663
  -> remaining Hogging, Shear, Governing Summary, and Notes are drawn on page 2
  -> Notes line "Checks not included in this report:" encounters y=50
  -> ensure(12) takes extraPages[1], adds page 3, resets y=675
  -> page 3 already references the same Contents array as page 2
  -> Notes tail is appended to that shared array
  -> save serializes the same post-break content streams on both pages 2 and 3
```

That produces the observed boundary: page 1 is independent and normal; page 2 and page 3 both display the continuation beginning at the first body stream written to page 2, which is `K used...`. The second page break does not restart Section 6; shared page contents make page 3 show page 2's existing continuation.

## 8. Do Source Renderers Execute Once or Twice?

**B: the source rendering functions execute once; the PDF page/content structure makes the content appear on both pages.**

Evidence:

- `generateConcreteReport()` calls the Sagging and Hogging renderers once each, then continues forward to sections 7-9 ([generateConcreteReport.js](js/sectionDesignerLogic/generateConcreteReport.js#L1089)).
- `drawBendingCheck()` reaches `K used` once, and `richLn()` calls `ensure()` before drawing. `Cursor.ensure()` returns to the caller; it contains no retry loop or section callback (lines 254-286, 476-495).
- Temporary tracing showed the `K used` renderer `before` event once at page 1, y=46, and the matching `after` event once at page 2, y=663. It showed one Section 6 `drawBendingCheck()` start, one Section 7/8/9 flow, and the later page 3 transition during Notes.
- The real pdf-lib experiment demonstrated actual `Contents` array aliasing and equal page 2/page 3 serialized content lists after a page-2 draw.
- `PDFPage.drawText()` obtains a page content stream, and `getContentStream()` adds that stream to the page leaf's Contents array ([node_modules/pdf-lib/cjs/api/PDFPage.js](node_modules/pdf-lib/cjs/api/PDFPage.js#L832), lines 1359-1366; `PDFPageLeaf.addContentStream()` at lines 72-76). Since that array is aliased, the draw stream is visible to both copied pages.

## 9. Why the Existing Regression Test Misses This

`tests/report-render-regression.mjs` implements its own fake PDF classes. Its `copyPages()` returns ten independently constructed `FakePage` objects (lines 50-73), and `addPage()` only pushes the passed page into a JavaScript list (lines 78-80). Its `drawText()` appends strings to one global `drawLog` (lines 55-59); `save()` returns empty bytes (lines 82-84). This fake has no PDF page tree, object copier, indirect references, `Contents` arrays, or shared mutable PDF graph.

The test directly calls the concrete generator once and asserts each section/text occurs once in that global draw log (lines 229-256). That assertion correctly verifies source call count for one invocation, but the fake cannot model the real pdf-lib aliasing responsible for duplicate visible page content. A passing test is therefore consistent with the actual defect: one set of draw operations can be referenced by two serialized pages.

## 10. Identified Mechanism and Remaining Uncertainty

**Identified mechanism:** The repeated calls to `PDFDocument.copyPages(templateDoc, Array(10).fill(0))` use pdf-lib's single copier/memoized object graph for all ten repeated page-0 copies. The copied page dictionaries are distinct, but their mutable `Contents` arrays are shared. `Cursor.ensure()` appends page 2 and later page 3 from that copy list. Drawing on either page mutates the common content list, so both serialized pages contain the same streams. Page 1 is the original page from the separately loaded output document and does not share this copied-page list, which explains why it remains normal. The first page-2 stream is created by the `K used` line after the first break, which explains the exact duplicate start point.

This mechanism is directly confirmed by inspecting the installed pdf-lib implementation and the actual template with real pdf-lib. The full uploaded generated PDF binary was not available to independently inspect; the matching source trace and object-graph experiment reproduce the stated three-page boundary and explain the supplied observation. The regression fixture's final literal above should be checked against the original PDF if its optional calculation notes differ.

Temporary renderer trace instrumentation was removed after the run. The existing beam-analysis and report-render regression scripts both pass in the restored worktree. Only this diagnostic document was added; no source, test, template, or configuration changes remain.