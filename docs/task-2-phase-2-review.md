# Task 2 / Phase 2 — review findings, investigation and stabilization

Status date: 2026-11-24. Scope: the stabilization work authorised after the Phase 2
review (findings L1–L7, risks P1–P8). Nothing here starts Phase 3, and nothing is
committed: all Task 2 work is still uncommitted in the working tree.

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
