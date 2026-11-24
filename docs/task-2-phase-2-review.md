# Task 2 / Phase 2 — review findings, investigation and stabilization

Status date: 2026-11-24. This document started as the Phase 2 stabilization record
(findings L1–L7, risks P1–P8) and now also holds the **Task 2 closure** (sections 7–9).
The Phase 1 + Phase 2 checkpoint is `efc8fff`; the Phase 3 work and the UAT fixes were committed
afterwards (see section 9). **Task 2 is accepted** within its frontend-only scope.

## 0. How to read this document

- **Fixed and verified** — a code change exists and an automated test and/or a real
  browser check demonstrates it.
- **Fixed, partially verified** — a code change exists; the verification has a stated gap.
- **Investigated, not reproduced** — the risk was examined; the described failure did
  not happen. Any change made is hardening and is labelled as such.
- **Deferred** — intentionally not changed in this task.
- **Not verified** — could not be checked; the reason is given.

**Source of the finding descriptions.** The repository contained no written review
report: the only trace of the original review was the header of `tests/reviewFixes.test.js`
(M-1…M-5). The L1–L7 and P1–P8 descriptions below are the ones given in the stabilization
brief; nothing was invented beyond it. Where this document says "reproduced", it means
reproduced in this session, in the browser or in a test.

## 1. Existing frontend-only limitations (unchanged)

These are by design in this phase and are labelled in the UI:

- No backend and no real AI: extraction is a mock (`mockProcessingService`), results are
  placeholders marked "[تجريبي]"; pages 4, 8, … fail their first mock attempt.
- Storage is the browser tab's memory (`documentStore`, `isDurable: false`): reloading
  loses everything. "Saved" only means the in-memory store acknowledged the write.
- Approval is not connected (`approvalService` always refuses): nothing can really be approved.
- The roles are a demo constant; `VITE_DEMO_ROLE` only exists for manual testing (see P6).
- The review UI texts exist in Arabic only (the English dictionary has no `review.*`
  section; English falls back to Arabic). The strings added here follow that convention.
- PDF.js font/CMap data is not bundled (pages without embedded fonts use substitute fonts).
- The final system must run fully offline with one local AI model; nothing in this work
  adds a network dependency (the browser checks use a locally installed Chrome/Edge).

## 2. Original findings M1–M5 (already fixed before this task)

Documented from `tests/reviewFixes.test.js`; their regression tests are unchanged and still
pass (the full suite, including them, is green).

| ID | Finding | Existing fix |
|----|---------|--------------|
| M-1 | Invalid extraction results could be applied, or leave a page stuck on "processing". | Results are validated (`extractionResult.js`); an invalid result marks the page failed or leaves content untouched. |
| M-2 | Invalid candidates could be kept; the comparison view could crash. | Candidates are validated before they are kept; the view tolerates malformed data. |
| M-3 | A refused "accept" could look like success. | `acceptFlow.js`: the dialog stays open and shows the reason. |
| M-4 | The document could change while an approval request was pending; approval was not persisted. | Document frozen while pending; the approval is written to the store once acknowledged. |
| M-5 | Autosave rewrote the whole document. | `savePages` stores only changed pages. |

## 3. Findings L1–L7

### L1 — Sticky viewer hidden behind the header — **Fixed and verified**

- **Investigation (reproduced).** At a 1280×720 window scrolled 700px the original viewer
  was at y = −227 (off screen), its zoom/rotate controls unreachable. Root cause: the
  viewer's grid panel was only as tall as the viewer (`align-items: start`), so
  `position: sticky` could never take effect; raising the offset alone would not have helped.
- **Fix.** Side by side, panels stretch to the row height so the viewer can stick; the
  sticky offset is `calc(var(--app-header-height) + 16px)`, where `--app-header-height` is the
  *measured* height of the header (`AppLayout` publishes it with a `ResizeObserver`; default
  `--header-height`). The divider is full-height and only its grip is sticky. The viewer's
  frame height now leaves room for header + toolbar so the whole stuck card fits the window.
  `html { scroll-padding-block-start }` keeps focused/scrolled elements out from under the header.
- **Files.** `src/styles/review.css`, `src/styles/layout.css`, `src/styles/global.css`,
  `src/components/layout/AppLayout.jsx`, `src/components/layout/Header.jsx`.
- **Verification.** Browser: `layout.check.mjs` (scroll 150/400/700px: viewer below header,
  controls reachable by hit-testing, viewer really sticky, card fits the window, grip below the header).

### L2 — Horizontal overflow around 1024px — **Fixed and verified**

- **Investigation (reproduced).** Sidebar open at 1024–1029px: content width 673–678px < the
  694px minimum (320 + 14 + 360); the pane overflowed by 16–21px in both RTL and LTR.
- **Fix.** `SplitPane` decides stacking from the width it *really* has (measured with a
  `ResizeObserver` before paint), in addition to the existing "window < 900px" rule; below the
  needed width it stacks, otherwise it stays side by side. Panels are keyed so the editor is not
  remounted when the mode changes; the user's chosen ratio is kept and only *displayed* clamped.
  Stacked panels now stretch (`align-items: stretch`), which removed a second 10px overflow.
- **Files.** `src/components/review/SplitPane.jsx`, `src/styles/review.css`.
- **Verification.** Browser: widths 1024/1025/1029/1100/1200/1280 × RTL/LTR × sidebar open/closed:
  no page overflow, panels inside the container, side by side whenever the container ≥ 700px.
- **Decision recorded.** The 900px window rule was kept (the README documents it), so
  between 900 and 1023px the drawer layout may still stack; only the overflow was fixed.

### L3 — InsertPoint keyboard focus and ARIA — **Fixed and verified (Chrome)**

- **Fix.** The trigger stays in the DOM (disclosure pattern) with `aria-expanded` and
  `aria-controls`; opening focuses the first type; Escape, "cancel" and choosing a type return
  focus to the trigger (after a successful add the editor moves focus into the new element);
  every trigger is named by its position ("إضافة عنصر هنا، قبل العنصر 2 من 5" / "… في نهاية
  الصفحة …"), so repeated buttons are distinguishable and the visible text is part of the name.
- **Files.** `src/components/review/editor/InsertPoint.jsx`, `StructuredEditor.jsx`,
  `src/i18n/translations.js`, `src/styles/review.css`.
- **Verification.** Render tests (`stabilizationUi.test.js`); browser (`review.check.mjs`):
  keyboard open, `aria-*`, focus after open / Escape / cancel / add.
- **Gap.** Checked with Chrome only; no screen-reader run.

### L4 — Image rotation layout — **Fixed and verified**

- **Investigation (reproduced).** A 3:1 image rotated 90°/270° spilled 114px above and below
  its layout box (the top part clipped and unreachable by scrolling).
- **Fix.** The viewer reserves the box of the *rotated* picture and centres the unrotated image
  in it (`imageLayout.js`, pure and unit-tested). Fit-to-width matches PDF pages. PDF rendering,
  zoom and rotation code paths are untouched.
- **Files.** `src/components/review/imageLayout.js` (new), `OriginalViewer.jsx`, `review.css`.
- **Verification.** Unit tests of the geometry; browser (`image-rotation.check.mjs`): wide and
  tall PNGs × 0/90/180/270° × two zoom levels × RTL/LTR: nothing clipped, whole image reachable,
  fits the frame at 100%. A screenshot of a rotated image was inspected for orientation.

### L5 — Undo/Redo behind modal dialogs — **Fixed and verified**

- **Fix.** The page-level shortcuts live in `historyShortcuts.js` and do nothing while any
  `dialog[open]` exists; inside text inputs the browser's own undo is left alone.
- **Files.** `src/components/review/historyShortcuts.js` (new), `src/pages/DocumentReviewPage.jsx`.
- **Verification.** Unit tests; browser: with the delete-confirmation dialog open Ctrl+Z/Ctrl+Y
  leave the document unchanged, and with no dialog Ctrl+Z / Ctrl+Y still undo / redo.

### L6 — Silent JSON clipboard failure — **Fixed and verified**

- **Fix.** Copy reports "copied" only after `writeText` resolved; a rejection, or a missing
  clipboard API, shows a visible `role="alert"` Arabic message; the message belongs to the page
  that was copied; the timer is cleaned up. The JSON stays read-only.
- **Files.** `src/components/review/JsonPreview.jsx`, `src/i18n/translations.js`, `review.css`.
- **Verification.** Browser, with the clipboard replaced by a rejecting / missing / accepting
  implementation (the real permission prompt cannot be driven headlessly); render tests.

### L7 — Flexible Arabic search — **Fixed and verified**

- **Change.** `normalizeChar` now also folds taa marbuta → haa, hamza on waw → waw and hamza on
  yaa → yaa (diacritics, tatweel, alef variants and alef maqsura were already handled). A bare
  hamza (ء) is intentionally not changed. Normalization is used only by `findTextMatches`
  (query and text alike); ranges still point into the original text; stored data, original
  extraction and JSON are never touched; search remains current-page only.
- **Files.** `src/domain/document/search.js`.
- **Verification.** One test per approved pair, in both directions (مدرسة/مدرسه, مسؤول/مسوول,
  أحمد/احمد, مصطفى/مصطفي, مُحَمَّد/محمد, الكــتاب/الكتاب); highlight-range tests; a test that
  searching leaves content, original extraction and JSON identical; a browser check that the
  highlighted text keeps its original letters.
- **Changed existing assertion (deliberate).** `tests/reviewDomain.test.js` asserted the exact
  normalized form `'العربية'`; with the approved rule it is `'العربيه'`. This is the only
  existing assertion that was edited. It reflects the approved behaviour change, not a weakening.

## 4. Potential risks P1–P8

### P1 — Interrupted reprocessing / restored page state — **Confirmed; fixed, partially verified**

- **Investigation.** The status `processing` was written to the store by autosave while a run
  was active; if the session never closed (tab died), the next load turned the page into
  `failed / PROCESSING_INTERRUPTED`, even though it held a successful extraction. A clean
  `close()` already restored the earlier status.
- **Fix.** The session never stores the transient `processing` status: while a run is active the
  page is stored with the status it had before (content edits are still stored, so the save
  status stays truthful). Restoring after a failed run or `close()` now also restores the earlier
  `errorCode`. A stored `processing` page from another writer is restored as `succeeded` when it
  already holds an extraction, otherwise `failed` as before. Content, manual corrections and the
  review status are untouched.
- **Files.** `src/state/documentSession/reviewSession.js`.
- **Verification.** Session tests with a memory store: the store never holds `processing`; a
  simulated crash and reopen restores status, corrected text, review and original extraction;
  failed pages keep their error code. Disabling the fix makes 3 tests fail.
- **Remaining risk.** Persistence is simulated by an in-memory store. A real durable backend
  (including a crash during a write) needs the same scenario tested once it exists. A pending
  comparison candidate is session state and is not stored.

### P2 — StrictMode duplicate session initialization — **Confirmed (narrow); fixed, partially verified**

- **Investigation.** The state initializer does run twice under StrictMode and builds two
  sessions. Creating a session had one side effect: for a *recovered* document it scheduled an
  autosave write. The discarded session is never opened or closed, so its timer could not be
  cancelled and wrote the same recovered state a second time. Otherwise a duplicate session is inert.
- **Fix.** The recovery write is scheduled in `open()` (once), not at creation. StrictMode is kept.
- **Files.** `src/state/documentSession/reviewSession.js`.
- **Verification.** Tests: no timer after creation, one after `open()`, none duplicated after
  `close()`/`open()`, and one write for two sessions of the same record. The browser run is the
  dev build (inside StrictMode): extraction runs once and there are no console errors.
- **Gap.** The recovery scenario cannot be produced in the browser (the memory store is lost on
  reload), so the duplicate-timer behaviour is verified by tests only.

### P3 — Repeated navigation blocker execution — **Investigated, not reproduced; hardened**

- **Investigation.** The original effect depended on the `blocker` object. In the browser the
  original code navigated exactly once and "stay"/"leave" worked, with re-renders while the
  dialog was open (the same script was run against the original hook and the new one: identical results).
- **Hardening.** The effect now depends on the *blocked state and the blocked attempt id*
  (location key), reads the newest blocker through a ref, and the save-then-decide logic is the
  pure `resolveBlockedNavigation` (proceeds at most once; a superseded attempt does nothing).
- **Files.** `src/hooks/useNavigationGuard.js`.
- **Verification.** Unit tests of the pure function; browser (`navigation.check.mjs`): saved-then-
  proceeds, blocked-by-running-extraction, stay, leave, with `history` writes counted (exactly one per navigation).
- **Status.** The described failure was not observed; the change protects against it structurally.

### P4 — Review confirmation and pending text — **Confirmed; fixed and verified**

- **Investigation.** Confirmation used the committed document while typing commits after 400ms.
  A click that does not blur the field (e.g. assistive technology) confirmed older text and the
  late commit then invalidated the confirmation. The mouse path commits on blur first, but a
  second problem was found while testing: for an already-reviewed page the status badge changes
  on commit, shifting the layout between mouse-down and mouse-up and swallowing the click.
- **Fix.** Inputs register a commit function while their text is pending; `confirmPageReview`
  (and re-extraction, accepting, closing) commit it first, then validate. While text is pending
  the button stays usable and the bar already shows the post-commit status (no layout shift).
  Locked states (approved, approval pending) are unchanged; a refusal after committing is not silent.
- **Files.** `reviewSession.js`, `useDraftText.js`, `DraftField.jsx`, `StructuredEditor.jsx`,
  `DocumentReviewPage.jsx`, `PageReviewBar.jsx`.
- **Verification.** Session tests (5), render tests (4), browser: confirming immediately after
  typing without a blur and with a real mouse click both confirm the new text and stay confirmed.

### P5 — Accepting a candidate during processing — **Confirmed; fixed and verified**

- **Investigation.** A page with manual content can show a comparison *and* offer "reprocess".
  Accepting while the second run was active replaced the content, and the run then restored the
  status it started from (overwriting `succeeded`) and replaced the candidate.
- **Fix.** `acceptCandidate` refuses with `PAGE_PROCESSING` while the page is processing (state
  level); the accept button is disabled while running. Validation and M1–M5 protections untouched.
- **Files.** `reviewSession.js`, `ProcessingPanel.jsx`, `translations.js`.
- **Verification.** Session tests (3, including the run finishing afterwards); browser: on page 8
  the accept button is disabled during a re-run and enabled afterwards.

### P8 — Pending text lost during candidate acceptance — **Confirmed at session level; fixed, verified**

- **Investigation.** If typed text was still pending when the content was replaced, its commit
  failed with `ELEMENT_NOT_FOUND` and the text was lost without notice. Through the normal UI the
  field is usually blurred (committed) first, so the window is narrow, but the session did not
  protect it.
- **Fix.** `acceptCandidate` commits pending text *before* replacing anything. If that changed the
  page, nothing is replaced, the candidate stays, and the user is told (`PENDING_EDITS_COMMITTED`)
  to look at the comparison again — explicit consent is preserved, the typed text is kept and
  undoable. Re-extraction also commits pending text first, so a candidate is compared instead of overwriting it.
- **Files.** `reviewSession.js`, `AcceptCandidateDialog.jsx`, `errorMessages.js`, `translations.js`.
- **Verification.** Session tests (5); disabling the fix makes 3 fail. UI: render test of the dialog message.
- **Residual.** A draft whose element disappears by another path is still refused on commit and
  the field reverts (existing behaviour, reported to the caller); no such path was found in the UI.

### P6 — Demo role configuration — **Deferred (documentation only)**

`VITE_DEMO_ROLE` can make the frontend behave as an administrator, and in a production build the
value is embedded in the shipped bundle. Required later: real authentication, authorization and
backend-enforced permissions; remove the override from production builds (or restrict it to
development only); and never treat frontend role checks as a security boundary — every
privileged action (new editable version, approval) must be re-checked by the backend.

### P7 — Temporary memory accumulation — **Deferred (documentation only)**

Uploaded `File` objects and document records accumulate in the in-memory store for the life of
the tab. Required later: persistent storage with a document lifecycle (retention, deletion,
size limits and quotas), release of in-memory files when a record is closed or deleted, and a
test with many/large documents on the real storage. Not addressed here by decision.

## 5. Verification results

Taken from the final runs of this session:

- `npm test`: 447 tests, 447 passing, 0 failing (388 existing + 46 in `tests/stabilization.test.js`
  + 13 in `tests/stabilizationUi.test.js`; one existing expected value was updated for L7, see above).
- `npm run lint`: no warnings or errors.
- `npm run build`: succeeds (Vite reports the PDF.js chunk as large; unrelated to this work).
- Mutation check: temporarily disabling each of the P1, P2, P4, P5, P8 fixes made 3, 2, 3, 2, 3 of
  the new tests fail; the files were restored afterwards (tests green again).
- Browser (real Chrome, headless, driven over the DevTools Protocol with no new dependency):
  `npm run check:browser` runs `layout`, `image-rotation`, `review` and `navigation` checks.
  The L1, L2 and L4 defects were reproduced *before* the fixes (failing runs) and pass after.
  Final run: layout 80, image rotation 81, review interactions 29, navigation 7 = **197 checks, 0 failed**.

## 6. Remaining test coverage gaps

- Browsers: Chrome/Chromium only (headless). Firefox, Safari, touch input, high-DPI and real
  screen readers were not tested.
- The real clipboard permission flow, a real beforeunload prompt, and mobile widths were not tested
  (the clipboard is replaced by stubs; the unload prompt is auto-accepted and recorded).
- RTL/LTR layout was tested for the review page at ≥1024px; the <1024px drawer layouts were not.
- P2's recovery timer and P1's crash recovery are verified against simulated persistence only.
- English text for the review UI does not exist, so no English wording is tested.
- Large documents (1,000 pages) were not exercised in the browser.

## 7. Task 2 closure (consolidated plan and final Phase 3)

### 7.1 The consolidated plan

| Task | Content |
|------|---------|
| 1 | Document upload and PDF page selection — completed. |
| 2 | Document review and correction — see below. |
| 3 | Backend, database, authentication and authorization. |
| 4 | AI integration, document processing and archive management. |
| 5 | Export, templates, dashboard and settings. |
| 6 | Local AI model integration, offline deployment, final system testing. |

Task 2 has three phases: **Phase 1** canonical model and state management (completed);
**Phase 2** review UI, editor, autosave and stabilization (approved, sections 1–6);
**Phase 3** the remaining frontend functionality and final integration (this section; the
old phases 3–6 are merged into it).

### 7.2 Requirement check (frontend-only scope)

Everything in A–D was already implemented in Phase 1/2 and was left unchanged.

| Area | Requirement | Status |
|------|-------------|--------|
| A | PDF and image viewer; side-by-side with the editor; resizable split; vertical layout when narrow; zoom, pan, reset, display-only rotation; selected-page mapping; one page rendered at a time | Complete (Phase 2 + L1, L2, L4) |
| B | Headings, paragraphs (long handwritten text grows the box), tables (rows, columns, cells), key-value fields, unclassified elements; inline editing; insert, delete, reorder, type conversion; manual-content marking; Undo/Redo; Arabic-normalized current-page search; read-only synchronized JSON | Complete (Phase 1/2 + L3, L5, L6, L7) |
| C | Navigation over selected pages, direct page number, progress, last visited page, explicit confirmation, invalidation after edits/Undo/Redo, autosave status, leave protection, failed pages and manual corrections, honest "temporary storage" labelling | Complete (Phase 2 + P1–P4) |
| D | Processing status, failure handling, retry/reprocess, preserved original extraction, comparison, explicit accept/reject, pending-text safety, invalidation after accepting, history cleared on accepting | Complete as a mock (Phase 2 + P5, P8); no real OCR/AI |
| E | Upload → Correction Queue → Review → Archive consistency; pending documents not in the archive; approval rules; approved documents read-only; admin-only new version; employees see own documents, administrators all | **Gaps found and closed in this phase** (7.3) |

Already implemented before Phase 3 for E: approval needs all selected pages reviewed, saved
changes and no running extraction; approved documents are read-only for everyone; only an
administrator may *ask* for a new editable version (the request is refused: no backend).

### 7.3 Missing functionality found and implemented in Phase 3

1. **The Archive was a placeholder.** It now lists approved documents only, read-only, with
   the same row component as the queue (`DocumentListItem`). Search/filter/management with
   real data stays in Task 4.
2. **The queue also listed approved documents.** The queue now holds pending documents only;
   an approved document moves to the archive (the lists are derived from the store, so an
   acknowledged approval moves it automatically).
3. **No document owner existed, so "employees see their own, administrators see all" was not
   implemented.** Records now carry `ownerId` (set by the upload page and the demo seeds);
   `src/domain/document/access.js` holds the pure rules (`canViewDocument`,
   `selectCorrectionQueue`, `selectArchive`); the queue, the archive and the review page use
   them. Opening another employee's document by its address shows a "no permission" message.
4. **Navigation.** The review page gets a "back" link: to the queue for a pending document,
   to the archive for an approved one.
5. **Simulated vs real.** The queue and the archive state plainly that the role and the
   approval are a simulation in the interface and that nothing is enforced by a server.

Files: `src/domain/document/access.js`, `src/hooks/useCurrentUser.js`,
`src/hooks/useDocumentList.js`, `src/components/review/DocumentListItem.jsx` (new);
`src/pages/CorrectionQueuePage.jsx`, `DocumentArchivePage.jsx`, `DocumentReviewPage.jsx`,
`UploadDocumentPage.jsx`, `src/hooks/useReviewSession.js`, `src/services/documentStore.js`,
`src/services/reviewDocuments.js`, `src/data/mock/reviewDemo.mock.js`, `src/routes/paths.js`,
`src/i18n/translations.js`, `tests/access.test.js` (new), browser script
`scripts/browser-checks/integration.check.mjs` (new).

Decisions: no third demo document was added (the existing store test pins the seed at two),
so with the demo data an employee and an administrator see the same two documents; the rule
itself is covered by tests with other owners. A document without an owner is visible to
administrators only.

### 7.4 Remaining backend-dependent functionality (assigned to future tasks)

| Item | Task |
|------|------|
| Real authentication; server-enforced authorization (employee/administrator visibility, review and approval permissions); removal of `VITE_DEMO_ROLE` from production builds (**P6**) | 3 |
| Durable storage of documents, drafts, last visited page and approval; real approval and "new editable version"; re-test P1 (crash/reload) and P2 against the real storage; document lifecycle, retention and memory release (**P7**) | 3 |
| Real OCR/AI extraction replacing `mockProcessingService` behind the same `extractPage` call; persisted attempt history; real failure modes | 4 |
| Archive search, filtering and management with real data | 4 |
| Export of reviewed documents; templates; dashboard with real figures; settings | 5 |
| Local single-model AI, fully offline deployment (including bundling PDF.js font/CMap data for offline PDFs), final system testing | 6 |
| English text for the review UI (the dictionary only has Arabic `review.*`, `queue.*`, `archive.*`) — proposed for Task 5 (settings/localization); not scheduled | 5 (proposed) |

### 7.5 Deferred manual verification scenarios

Manual testing was intentionally deferred. To run before the final system test (Task 6):
real screen reader on the insert menu and the review bar; Firefox, Safari and touch devices;
the drawer layouts below 1024px; the real clipboard permission prompt; a 1,000-page PDF in the
browser; a long handwritten paragraph, a table with many columns and mixed RTL/LTR text by
eye; an uploaded private document of realistic size; the administrator role
(`VITE_DEMO_ROLE=orgAdmin` in `.env.local`) across queue, archive and review.

### 7.6 Known limitations (Task 2 as delivered)

- Everything is frontend-only and in the memory of one tab (section 1); nothing is durable.
- Approval cannot succeed from the UI (no backend), so the only approved document is the
  labelled demo record; "move from queue to archive on approval" is tested at store level only.
- Visibility and roles are a simulation, not a security boundary.
- The checks of this phase: targeted browser script (13 checks) plus unit/render tests; the
  review workspace itself cannot be server-rendered in tests (it uses a client-only store hook).

### 7.7 Final Task 2 status

All Task 2 requirements that can be met without a backend or a real AI are implemented and
verified; what remains is listed in 7.4 under its future task. Phase 3 verification:
`npm test` 463 passing / 0 failing (447 before + 16 in `tests/access.test.js`), `npm run lint`
clean, `npm run build` succeeds, `integration.check.mjs` 13/13. The earlier 197 browser checks
were not repeated, as agreed.

## 8. User acceptance testing (UAT-01 … UAT-05)

Manual acceptance testing of Task 2 found five issues. Each was investigated for its root
cause in a real Chrome before changing code; the failing behaviour was reproduced first (except
where stated). All five checks are in `scripts/browser-checks/uat.check.mjs`.

| ID | Issue | Root cause | Fix | Status |
|----|-------|-----------|-----|--------|
| UAT-01 | Image upload and review (JPG, JPEG, PNG) | **No defect found.** Upload rules, the queue, the review viewer, zoom/rotate/reset and "pending images are not in the archive" all work for `.png`, `.jpg`, `.jpeg` and `.JPG`. (The image rotation clipping had already been fixed as L4.) | none needed | Not reproduced; verified working |
| UAT-02 | Arabic PDF letters separated, wrong spacing in the review viewer | The page is `dir="rtl"`; a canvas 2D context's `direction` defaults to `"inherit"`, so PDF.js drew every text run right-to-left. Proven by pixel comparison: all CSS variants gave identical broken output except `direction: ltr`, which equals a clean render. The upload preview uses the browser's native viewer, and the demo PDFs were English, so it was never seen. | `pdfDocumentService.renderPage` forces `canvas.dir`/`style.direction = 'ltr'` before drawing (so no caller can regress), plus `dir="ltr"` on the canvas and `direction: ltr` in the CSS. The PDF is never modified. | Fixed and verified |
| UAT-03 | Flicker when rotating 90°/270° | A feedback loop. The page was fitted to the frame's `clientWidth`, which loses ~15px when a vertical scrollbar shows; the scrollbar shows or not depending on the page height, which depends on the fit width. When a page's height is close to the frame's (an A4 page turned 90° is the common case) it alternated between two sizes forever. Reproduced: at a panel width of 692–702px the canvas alternated `659×465` / `644×455`. | The fit width is taken from the frame's **border box** (observed with `box: 'border-box'`) minus borders and **one** scrollbar, always (`fitWidth.js`). Zoom, pan and reset are unchanged. | Fixed and verified |
| UAT-04 | Panels do not use all the space, especially at the drag extremes | Two causes. (1) CSS Grid: the columns were `minmax(320px, Nfr) 14px minmax(360px, (1-N)fr)`; once a track is held at its minimum the remaining flex sum is below 1 and the other track gets only that fraction of the free space (215–253px left empty). (2) `.app-content` was capped at 1320px, so on wide screens the pane was 1256px wide. Both reproduced. | Columns are `minmax(0, ratio fr) 14px minmax(0, (1-ratio) fr)` (factors add up to 1, no pixel minimums); the minimum widths (320/360) are enforced by clamping the ratio (`splitMath.js`). The review page alone drops the 1320px cap (`.app-content--wide`). RTL, the <900px stacking and the container-width stacking are unchanged. | Fixed and verified |
| UAT-05 | New table cells far too wide | `table { min-inline-size: max-content }` with automatic layout: a text input's intrinsic width is about 20 characters (`inline-size: 100%` does not count for intrinsic sizing), so every column demanded ~190px, plus `td { min-inline-size: 110px }`. | `table-layout: fixed`; columns share the width equally; the table's minimum width is `columns × 5.5rem + tools column` (via `--table-columns`), so it scrolls sideways only when there are many columns. Data model, JSON, editing, undo/redo untouched. | Fixed and verified |

Files changed: `src/services/pdfDocumentService.js`, `src/components/review/OriginalViewer.jsx`,
`SplitPane.jsx`, `editor/TableEditor.jsx`, `src/components/layout/AppLayout.jsx`,
`src/styles/review.css`, `src/styles/layout.css`; new: `src/components/review/fitWidth.js`,
`splitMath.js`, `tests/uatFixes.test.js`, `scripts/browser-checks/uat.check.mjs`,
`scripts/browser-checks/make-arabic-pdfs.mjs`.

Verification of this round: `npm test` 483 passing / 0 failing (463 + 20 in `tests/uatFixes.test.js`);
`npm run lint` clean; `npm run build` succeeds; browser (real Chrome): the UAT script 184 checks / 0 failed
(UAT-01 images in 4 file names; UAT-02 six real Arabic PDFs — Arial, Segoe UI, Sakkal Majalla, Arabic
Typesetting, Times New Roman, and a landscape page — in Arabic and English interfaces, compared pixel for
pixel with a clean render, plus a control showing the check can fail; UAT-03 four rotations × three window
sizes for 4 seconds each and a divider sweep through the critical width; UAT-04 three window sizes × RTL/LTR ×
sidebar open/closed, both drag extremes; UAT-05 tables in RTL/LTR at two sizes, including 12 columns, rows,
undo/redo and JSON). The earlier layout, image-rotation, review, navigation and integration scripts were
re-run after these changes: 0 failures.

Limits of this verification: the Arabic PDFs were produced by Chrome (real shaped text with embedded fonts),
not by Word or a scanner, and PDFs with non-embedded fonts are not covered (PDF.js standard-font/CMap data is
still not bundled); the user's own PDF and screen were not available, so UAT-03 was reproduced with an A4 page
at the geometry that triggers it, and the fix removes the dependency rather than tuning a size; Chrome only;
scrollbar width 0 (overlay scrollbars, e.g. macOS) was reasoned about, not run.

## 9. Final acceptance of Task 2

**Manual verification.** The project owner completed the manual user-acceptance checks of
UAT-01 (image upload and review), UAT-02 (Arabic PDF rendering), UAT-03 (rotation stability),
UAT-04 (split-pane width) and UAT-05 (table cell width) and approved all five. This is the
real-world confirmation of what section 8 verified in a browser with generated documents, and it
covers the points section 8 listed as limits (the owner's own PDF documents and screen).

**Acceptance.** Task 2 (document review and correction) is accepted **within its frontend-only
scope**: the canonical document model and state (Phase 1), the review UI, editor, autosave and
stabilization (Phase 2), and the final integration of upload, correction queue, review and archive
(Phase 3), with the five UAT fixes.

**Not part of this acceptance (unchanged, still open).**

- Everything assigned to future tasks in section 7.4 — real authentication and server-enforced
  permissions, durable storage, real approval and new editable versions, real OCR/AI, archive
  search/management, export/templates/dashboard/settings, the local offline model — remains to be
  done in Tasks 3–6, including the deferred risks **P6** (demo role in production builds) and **P7**
  (memory accumulation in the temporary store).
- The known limitations of section 7.6 and of the verification limits in section 8 still apply
  (frontend-only temporary storage, simulated roles and approval, Arabic-only review texts, PDFs with
  non-embedded fonts and bundled PDF.js font data not covered, Chrome as the only automated browser).
- The deferred manual scenarios of section 7.5 are still to be run before the final system test (Task 6).
