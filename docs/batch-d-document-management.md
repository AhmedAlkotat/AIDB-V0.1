# Batch D — Document management (frontend)

Status: **conditionally accepted for frontend development closure.** Manual UAT checks 1–5 and 9 passed; UAT-06, 07 and 08
are **deferred (not passed)** and moved to the Batch E integration acceptance checklist (section 7). Frontend only: every
service below is a replaceable interface with a "not connected" production implementation and a
**development-only simulation** in `src/dev/`. Nothing is really uploaded, queued, processed, locked, approved,
exported, stored or enforced by a server. Requirements authority: the 50 approved decisions
(`AIDP_50_Decisions.pdf`); decision 12 is authoritative for the states and the archive.

## 1. What was built

| Area | Decisions | What the interface now does |
|---|---|---|
| Upload | 1, 35, 36, 37, 41, 48 | Limits come from `settingsService.getLimits()` (no constant left; `constants/upload.js` lost its size limit). The file, its preview, replacement and the PDF page selection stay **local**; only **Start Processing** calls `workflowService.registerDocument()` (the server-side checks: file, size, selected pages, space), after which the document is **Pending** in the queue and the page stays put (no redirect). The page shows the Admin file-size and page limits, a page-limit error, a **storage-full** banner (Start disabled) and an **insufficient-space** message. Unselected pages are not part of the document, never "failed". |
| Lifecycle | 2, 3, 11, 12, 22–24 | Six states derived (never stored) in `domain/document/lifecycle.js`: Pending, Processing, Ready for Review, Failed, Manual Editing, Approved, with the allowed transitions. A simulated **central FIFO queue** (`dev/mockProcessingQueue.js`, pure rules in `domain/document/queue.js`) runs independently of any screen: leaving a page never cancels it; storage-full pauses it and it resumes. Completion/failure goes through the existing notification system (the bell is refreshed at once; a link, **never a redirect**); the review address shows a *processing status* view for Pending/Processing with an "Open review" **button**. Safe simulated cancellation when the Admin deletes a queued/running document (completed pages stay). |
| Failure | 11, 40 | A document that could not be extracted is **Failed** with the reason; **retry without re-upload**, **manual entry** with the original beside it (→ **Manual Editing**), and a full attempt log. |
| Archive | 9, 12, 15, 39, 42, 43, 46 | Lists **every state except Pending** (supersedes the "approved only" rule). Search by name; filters by type, status and upload date; loading, error, empty and "no results" states. Row actions come from one place (`domain/document/permissions.js`): open/read-only, retry, manual entry, export, Admin-only "move to the recycle bin". Soft-deleted documents never appear. The correction queue lists every state except Approved, with a state filter and FIFO positions. The dashboard counts the six states. |
| Review | 4, 5, 13, 38, 49, 50 | Existing viewer/editor kept. **Tabs: Texts, Tables, Fields, JSON** over the *same* page content (unclassified content lives under Texts and in the JSON; positions are always positions in the whole page). **No AI / AI Edited / Manual labels** are shown (the source is kept in `element.source`). Optional coordinates (`element.location`) highlight the element on the original page, follow the display rotation, and the review is identical without them. |
| Saving and approval | 6, 13, 14, 39, 47 | Autosave kept; explicit **Save draft** with saved / saving / unsaved / failed states, last-saved time and an unsaved warning; navigation protection kept. Saving never approves. **Approve Entire Document** opens an explicit confirmation; prerequisites: every selected page reviewed, saved, nothing processing, an employee approves **own** documents only (the Admin any), and the edit lock. An approved document is read-only for everyone; only the Admin creates a **new version** (needs its own approval; the old version stays). |
| Page reprocessing, history | 38, 40 | Page-level only, FIFO through the same queue, survives leaving the screen; current content and manual edits are preserved (also on failure); a successful result is a **candidate** that needs an explicit, confirmed replacement; the candidate persists until decided. Every accepted result is kept in full (`resultHistory`); every attempt is logged (metadata only, sanitised in `domain/document/attempts.js`); a rejected result's content is never stored. |
| Versions, lock | 14, 47 | Version history (number, date, approver, pages) with read-only viewing of any approved version. A document-level **pessimistic lock** (`editLockService`): one editor, others get a notice naming the editor and a read-only document (no edit, save, review, reprocess or approval), "Start editing" after the other leaves, "your lock ended" with saved work kept; released on leaving. |
| Templates | — | Read-only list of the layouts the system recognises (`templateService`) plus the policy text; unknown layouts are **never rejected**, no template is ever required, no management/training UI (approved: stays read-only, see §5). |
| Export | 8, 46 | Export dialog (Word, Excel, PDF, JSON) of the **latest approved version**: selected + approved pages only, original order and source page numbers in the data, internal source (AI/manual) excluded; the complete original is a separate download. **Honest simulation**: JSON is a real file (no library needed); Word/Excel/PDF produce **no file** and say so. |
| Batch C integration | 31, 35 | Audit entries (names only, never content or passwords) for upload, processing start/retry/failure, approval, new version and re-approval, honouring the category switches; storage level drives the upload message and the queue pause; recycle bin cancels queued/running work; notifications via `service.subscribe`. |

## 2. Architecture (what is replaceable)

```
domain/document/{lifecycle,permissions,queue,lock,versions,attempts,exportScope,location,archiveFilter}.js   pure rules
services/{documentWorkflowService,approvalService,editLockService,exportService,templateService}.js          interfaces + "not connected"
dev/{mockProcessingQueue,mockDocumentWorkflowService,mockApprovalService,mockEditLockService,
     mockExportService,mockTemplateService,mockClassification}.js                                           DEV-only simulations
services/documentStore.js   + workflow metadata (workflow phase, attempts, resultHistory, candidates, versions, template)
state/documentSession/reviewSession.js   processing now goes through a queue *port* (extractPage/detach/getActivePages/adopt),
                                         lock service, ownership-aware approval, saveDraft, attempt/result history
```

Dev-only code is reachable only through `import.meta.env?.DEV` branches. The production bundle scan
(`auth-production.check.mjs`) now also asserts that it contains no simulated queue, lock, export or template data and
no demonstration documents (demo seeding was moved behind the same DEV branch; dev-only constants are plain
objects so a bundler can drop them).

## 3. Decision compliance

All of 1–9, 11–15, 36–50 as listed in section 1 are implemented in the interface. Not frontend-verifiable and left for
Batch E: server enforcement of every permission and limit, the durable queue and its restart recovery (24), real
concurrency (22), real locking, real approval/version storage, real Word/Excel/PDF files, real storage measurement,
real offline AI. Decisions 10 (superseded by 12), 16–21 and 25–35 are outside this batch except where the table
above says otherwise.

Existing tests changed because an approved decision replaced the old behaviour (not weakened): the archive tests
(12: every state except Pending), the dashboard figures (byState added), the provenance-label test (49: now asserts
**no** label), the approval-panel/header/save tests (new controls and wording), the review/upload/UAT browser checks
(the "demonstration review" shortcut was removed because documents now enter through Start Processing, and the JSON
preview/tables/fields moved into tabs; the same properties are asserted).

## 4. Verification

* `npm test` — **830 / 830** (701 before Batch D; +128 from Batch D; +1 closure regression test "class is never a file extension").
* `npm run lint` clean; `npm run build` succeeds; production bundle scan passes.
* Browser, Batch D development run: layout 79, image rotation 81, review 29, navigation guard 7, integration 13, UAT 184, auth 42,
  employees 48, admin 77 (= 560) + `documents.check.mjs` 97 + `documents-admin.check.mjs` 35 = **692 / 692**; production-build check 11 / 11.
* Closure re-run (after the classifier/label correction, only the affected scripts): `documents` **97 / 97**, `documents-admin` **35 / 35**,
  `uat` **184 / 184**, production-build **11 / 11**. The other eight suites were not repeated (unaffected by the correction).
* Two real defects found earlier by the browser checks and fixed: a review session closed and reopened at once (React StrictMode) lost its
  lock subscription and could release a lock it no longer owned; and a re-extraction result that arrived while the screen was being left
  could be lost (an undecided candidate is now also kept in the record).
* Existing tests changed because an approved decision replaced the old behaviour (not weakened): archive tests (12), dashboard figures,
  provenance-label test (49), approval-panel/header/save tests, review/upload/UAT browser checks (documents now enter through Start Processing;
  JSON preview/tables/fields moved into tabs).
* Environment: see §8 (`start_AIDP.bat` vs the SSR tests).

## 5. Approved clarifications (final closure) — formerly open questions

| # | Topic | Approved rule | Effect on the frontend |
|---|---|---|---|
| 1 | Document classification | A class is the **functional nature** of a document: invoice, certificate, contract, administrative request, or unclassified. A file extension is **not** a class. Processing and review **never wait for** a successful classification. | The simulated classifier (`dev/mockClassification.js`) now emits only those four classes (extension stripped before matching); the archive filter and the `documents.types` labels use them. A document with no class is "Unclassified" and is processed and reviewed normally. |
| 2 | Date filter | The **upload date** is the primary archive date filter. | Unchanged. |
| 3 | Templates | The templates screen stays **read-only**; creating/editing is deferred until the AI developer is consulted. Template selection is **optional**; unknown layouts stay supported. | Unchanged. |
| 4 | Editing lock | The 90-second lease is a **development simulation only**. Final lease, renewal and server-side enforcement are agreed with the backend developer. | Unchanged; the interface renews at half of the lease the service returns, so the real value needs no UI change. |
| 5 | Lifecycle | Exactly six states: Pending, Processing, Ready for Review (complete **or partial** usable results), Failed (no usable results), Manual Editing (manual entry after a failure), Approved (explicit human approval). An Admin's new version of an approved document is **Ready for Review**; the previous approved version is preserved. | Matches `domain/document/lifecycle.js` (no change needed). |
| 6 | Reprocessing candidates | A pending candidate is kept **temporarily** until explicitly accepted or rejected; existing results and manual edits are preserved until acceptance; every accepted result is kept; a rejected candidate's **content is discarded**, its attempt metadata kept; approved-version history is independent of the audit-log retention. | Matches the implementation (candidate record, `resultHistory`, sanitised attempt log). |
| 7 | System defaults | Unchanged provisional development defaults: 10 MB, 100 pages, bin 30 days, audit 90 days, backup daily 02:00, 7 unprotected backups, storage 80 % / 90 %. **Not final deployment values.** | Unchanged. |
| 8 | Export formats | Exactly **DOCX, XLSX, PDF, JSON**; no PNG/JPG. JSON export works; DOCX/XLSX/PDF generation is **deferred to real integration** and the interface produces **no placeholder file**. | Unchanged (`dev/mockExportService.js` returns a blob only for JSON). |

Correction made at closure: the simulated classes (report, letter, ID document) were replaced by the approved functional list
(certificate and administrative request added); a regression test asserts that no file extension is ever a class.

Still open (not decided, no code depends on them): the real lease duration and renewal protocol (4); real concurrency and capacity of
the queue; the notification rule for employees vs the Admin (employees see their own documents only; the Admin also sees others').

## 6. Remaining limitations / backend dependencies

Nothing is durable (reload empties documents, queue, locks, versions); the queue, lock and approval are simulations;
export of Word/Excel/PDF needs the server; the bundle still contains the pre-existing development mock extraction
text; roles are interface shaping only. Proposed backend requirements (no contract fixed):
document registration with server-side checks (35, 36, 41, 48) and storage before queueing; a durable FIFO queue with
recovery and per-page jobs (22–24, 38); events for completion/failure (3); per-document lock with lease/renewal and
checks on save/reprocess/approve (47); approval creating an immutable version with approver and date (14, 39);
attempt log and accepted-result history independent of the audit log (40); archive query by text/type/status/date
(9) honouring ownership and the recycle bin; export of the latest approved version in four formats and the
original download (8, 46); optional coordinates and recognised-layout metadata from the model (50).

## 7. Manual UAT status

| Check | Scope | Status |
|---|---|---|
| UAT-01…05 | Upload and limits; storage-full behaviour; failure, retry and manual entry; archive filters and permissions; review tabs and highlights | **Passed** (manual) |
| UAT-06 | Review tabs, draft saving, approval and export | **Deferred — not passed.** Covered only by automated/browser checks. Carried to Batch E acceptance. |
| UAT-07 | Editing lock and concurrent-editor simulation | **Deferred — not passed.** Carried to Batch E acceptance (must be re-run against the real lock). |
| UAT-08 | Deletion during processing, Admin version creation and re-approval | **Deferred — not passed.** Carried to Batch E acceptance. |
| UAT-09 | Arabic RTL and English LTR on all of the above | **Passed** (manual) |

Original steps for the deferred checks: **06** open a ready document, switch the four tabs, edit, *Save draft*, confirm approval,
check it becomes read-only, open the export dialog (JSON downloads; DOCX/XLSX/PDF say they are not available). **07** with the
review dev tools simulate another editor → read-only notice; they leave → *Start editing*; let the lease expire → notice, saved work
kept. **08** as Admin delete a Pending/Processing document (work cancelled, completed pages kept), then create a new version of an
approved one, edit, re-approve; check the audit log and recycle bin.

## 8. Environment note: `start_AIDP.bat` and the SSR tests (unresolved, worked around)

`start_AIDP.bat` runs `npm run dev` (Vite on port 5173) in the project folder. While that server runs, the UI tests that render
real `.jsx` through Vite's SSR API fail with **"Invalid hook call"** (two React copies / a shared dependency cache with the live
dev server). It also happens on the untouched Batch C code, so it is an environment conflict, not a Batch D defect.

* **Workaround A:** close the `start_AIDP.bat` window (stop Vite) before `npm test`, then restart it.
* **Workaround B (used for the closure run):** copy the project (without `.git`, `dist`, `node_modules/.vite`) to a folder outside
  the running server's reach and run `npm test` / `npm run check:browser` there.
* Browser checks must also never run at the same time as `npm test` (shared dependency cache) and need `npm run dev -- --port 5199`.
* Not fixed: a permanent fix (separate Vite `cacheDir` for the test runner, or running SSR tests with their own config) is a
  recommended small follow-up, deliberately not done in this closure.
