# Handover for Batch E — real backend and AI integration

Project: **AIDP** (Arabic Intelligent Document Processing). React 19 + Vite + React Router 7, Arabic RTL (default) and
English LTR. Requirements authority: the **50 approved decisions** (`AIDP_50_Decisions.pdf`). Batches A–D and Tasks 1–2
are finished **on the frontend against development simulations**. Batch E connects them to the real FastAPI/PostgreSQL
backend and the offline AI model. **No API contract or database schema is fixed by this document**: everything under
"requirements" is a proposal to be agreed with the backend and AI developers.

## 1. Current frontend architecture

```
main.jsx → LanguageProvider → AuthProvider → RouterProvider
routes:  /login, /logout (public) · RequireAuth → AppLayout (NotificationsProvider) → pages
         RequireRole(Admin) → /admin/*   (guards only shape the UI; the backend must enforce every rule)
layers:  domain/ (pure rules, tested) → services/ (replaceable interfaces) → state/ + hooks/ → components/ + pages/
         dev/ = development-only simulations, reachable ONLY through `import.meta.env?.DEV` branches
i18n:    src/i18n/translations.js (ar + en, identical keys, enforced by tests/i18nCoverage.test.js)
```

Pattern for every backend-backed capability: `services/xService.js` exports the interface, a "not connected" production
implementation (rejects `notConnected`, `isMock: false`, no `dev`) and `createXService()`, which returns the simulation from
`src/dev/` in development. Screens take an optional `service` prop (tests). The simulations play the server (Admin checks,
validation, retention). **Production builds contain no simulation** (verified by a bundle scan, section 5).

Document model: `services/documentStore.js` (in-memory, `isDurable: false`) keeps the record (file, canonical page content, drafts,
workflow phase, attempts, `resultHistory`, undecided `candidates`, `versions`, `documentType`, `template`). The six lifecycle states
are **derived, never stored** (`domain/document/lifecycle.js`). Review session: `state/documentSession/reviewSession.js`
(undo/redo, autosave, explicit save, page reprocessing through a queue *port*, lock, ownership-aware approval).

## 2. Completed work

| Part | Content | Doc |
|---|---|---|
| Task 1 | Upload, validation, PDF page selection | `README.md` |
| Task 2 | Review/editor, autosave, reprocess, approval UI | `docs/task-2-phase-2-review.md` |
| Batch A | Login, guards, role navigation, logout, API client | `docs/batch-a-authentication.md` |
| Batch B | Employee management, role dashboards | `docs/batch-b-employee-management.md` |
| Batch C | Recycle bin, backups/restore, audit log, storage, notifications, settings | `docs/batch-c-system-administration.md` |
| Batch D | Upload limits and registration, six-state lifecycle, simulated FIFO queue, failure/retry/manual entry, archive filters, review tabs, Save draft, approval confirmation, versions, edit lock, read-only templates, export dialog | `docs/batch-d-document-management.md` |

Commits on `main`: A `31b8d97`, B `9692533`, C `abc14fa`, D = `feat(documents): complete document management frontend`.

## 3. The approved clarifications (Batch D closure)

1. **Classification:** by functional nature (invoice, certificate, contract, administrative request, unclassified); a file extension is
   not a class; processing and review never require a successful classification.
2. **Date filter:** the upload date is the primary archive date filter.
3. **Templates:** the screen stays read-only; creation/editing is deferred until the AI developer is consulted; selection is optional;
   unknown layouts remain supported.
4. **Edit lock:** 90 s is a development simulation only; lease, renewal and server-side enforcement are for the backend.
5. **Lifecycle:** exactly six states — Pending, Processing, Ready for Review (complete or partial usable results), Failed (no usable
   results), Manual Editing, Approved (explicit human approval). An Admin's new version of an approved document is Ready for Review and
   the previous approved version is preserved.
6. **Reprocessing candidates:** kept temporarily until explicitly accepted/rejected; existing results and manual edits preserved until
   acceptance; every accepted result kept; a rejected candidate's content discarded, attempt metadata kept; approved-version history is
   independent of the audit-log retention.
7. **System defaults** (provisional, **not final**): 10 MB, 100 pages, recycle bin 30 days, audit log 90 days, backup daily 02:00,
   7 unprotected backups, storage warning 80 % / critical 90 %.
8. **Export:** exactly DOCX, XLSX, PDF, JSON (no PNG/JPG). JSON works now; DOCX/XLSX/PDF are deferred to real integration and the
   frontend never produces a placeholder file.

## 4. Current test results

Run on the final sources (from a copy outside the project folder, see §6 "Environment"):

* `npm test`: **830 / 830** (829 before the closure + 1 regression test "class is never a file extension"; ~30 s). `npm run lint`: clean.
  `npm run build`: succeeds.
* Browser (real Chrome/Edge, fresh dev server): `documents.check.mjs` **97 / 97**, `documents-admin.check.mjs` **35 / 35**,
  `uat.check.mjs` **184 / 184**; production-build check against `vite preview` **11 / 11** (no simulation in the bundle).
  These cover the *automated* equivalents of the deferred scenarios (tabs/save/approval/export, lock and concurrent editor, deletion during
  processing, Admin new version and re-approval) — they do **not** replace the deferred manual UAT.
* The remaining suites (layout 79, image rotation 81, review 29, navigation guard 7, integration 13, auth 42, employees 48, admin 77 = 376)
  were **not re-run** at closure: the only closure changes are the simulated classifier and the type labels, which they do not touch.
  Their last result (before the closure edit) was 376 / 376.
* No failures are outstanding.

## 5. Deferred manual UAT (must be part of the Batch E acceptance checklist)

* **UAT-06** review tabs, draft saving, approval and export — **deferred, not passed**.
* **UAT-07** editing lock and concurrent-editor simulation — **deferred, not passed** (re-run against the real lock with two real accounts).
* **UAT-08** deletion during processing, Admin version creation and re-approval — **deferred, not passed**.

UAT-01…05 and 09 (RTL/LTR) passed manually. Steps for 06–08 are in `docs/batch-d-document-management.md` §7. Batch D is *conditionally*
accepted for frontend closure only.

## 6. Known limitations

* Nothing is durable: documents, queue, locks, versions, drafts and the recycle bin live in memory/`sessionStorage` and vanish on reload or
  tab close. Production builds cannot sign in or use any service ("not connected").
* Frontend role checks are UI shaping only. A 401 ends the session without the unsaved-work prompt; no cross-tab logout; JWT storage and
  the API contract are **not agreed**.
* Word/Excel/PDF export, real approval, real locking, real queue, real storage measurement, real offline AI: **not implemented**.
* The bundle still contains the pre-existing development mock extraction text (`mockProcessingService`) behind `DEV` branches only.
* Provisional defaults (clarification 7) are not deployment values; username 3–64 chars and password ≥ 8 are also provisional.
* Admin role label is "مدير المؤسسة" / "Organization Administrator" (the decisions say "Admin"/"المدير"): wording not confirmed.
* English dictionary is complete; demo document names and mock data are Arabic.
* **Environment:** `start_AIDP.bat` (Vite on port 5173 in the project folder) makes the SSR UI tests fail with "Invalid hook call"
  (also on Batch C code). Stop it before `npm test`, or run the suite from a copy of the project outside the folder. Browser checks need
  `npm run dev -- --port 5199`, never concurrently with `npm test`. A separate Vite `cacheDir` for the tests would fix it permanently
  (not done). Details: `docs/batch-d-document-management.md` §8.
* The full automated suite takes several minutes.

## 7. Mock services and where to replace them

| Interface (`src/services/`) | Simulation (`src/dev/`) | Replace with |
|---|---|---|
| `authService` | `mockAuthService`, `mockAccountStore` | login/logout/session, account status |
| `employeeService` | `mockEmployeeService` | employee CRUD, activate/deactivate, password reset (Admin) |
| `settingsService` | `mockSettingsService`, `mockSystemState` | read/write system settings + `getLimits()` |
| `recycleBinService` | `mockRecycleBinService` | soft delete, restore, purge, retention job |
| `backupService` | `mockBackupService` | backups, protection, restore with protective backup |
| `auditLogService` | `mockAuditService` | append-only audit events, query (no export) |
| `storageService` | `mockStorageService` | real measurement and thresholds |
| `notificationService` | `mockNotificationService` | per-user notifications, read state, events |
| `documentWorkflowService` | `mockDocumentWorkflowService`, `mockProcessingQueue`, `mockClassification` | registration + checks, durable queue, status, retry, manual entry, cancel, recognised class/template |
| `approvalService` | `mockApprovalService` | approval, immutable versions, Admin new version |
| `editLockService` | `mockEditLockService` | document lease (acquire/renew/release/subscribe) |
| `exportService` | `mockExportService` | export of the latest approved version + original download |
| `templateService` | `mockTemplateService` | read-only layout catalogue |
| `documentProcessingService`, `mockProcessingService` | (stubs) | per-page extraction |
| `documentStore` | (in-memory) | durable persistence of documents/drafts/history |
| `apiClient` | — | fetch wrapper with bearer hook and 401 hook; **not yet used by any screen** |

Cut-over per service: implement against the agreed endpoint, keep the interface, delete the `import.meta.env?.DEV` branch and the
`src/dev/` import, remove demo seeds (`src/data/mock/`), keep the "not connected" behaviour only for tests.

## 8. Backend and AI integration requirements (proposals — not contracts)

* **Stack:** FastAPI + PostgreSQL, local/offline AI model, everything on the local network, no internet (21).
* **AI:** per-page extraction of texts, tables, fields and a JSON view for printed and handwritten Arabic; unknown layouts supported;
  optional element coordinates (50); optional document class and recognised layout (clarifications 1, 3); partial results allowed (a document
  is Failed only when no usable result exists); retry per page without affecting others (38); template management only after coordination.
* **Admin services:** server validation of every limit and rule listed in section 6 of the decisions summary; settings read/write (36, 48).

### 8.1 Authentication and session management (15–20)

Agree: login identifier, JWT storage (cookie vs memory/storage), expiry/refresh, cross-tab logout, behaviour on 401 while a user has unsaved
work. Server-enforced Employee/Admin rules; hashed passwords; **immediate session revocation when an account is deactivated (16)**; only the
Admin creates accounts/passwords (17–19); one institution, one Admin (20). The frontend only hides what a role may not use.

### 8.2 Documents, queue, locking, versioning

* **Registration (35, 36, 41, 48):** upload starts only on *Start processing*; the server validates file type, size, selected pages and free
  space, stores the original, registers **Pending**, then queues. Closing the browser must not cancel processing (2).
* **Queue (22–24):** persistent central FIFO, no role priority, concurrent processing when resources allow, safe recovery after a stop with no
  loss or duplication, per-page jobs for reprocessing (38), cancellation when the Admin deletes a queued/running document with completed pages
  kept (45), pause while storage is full.
* **Persistence:** originals (whole file; unselected pages are not failures, 37), canonical result per page, drafts, last visited page, state
  derivation inputs, attempts (metadata only), accepted-result history, undecided candidates (temporary), versions with approver and date.
* **Locking (47):** one document-level editor; lease, renewal, release on leave/idle without losing saved work; **checks on save, reprocess and
  approve**. Duration/renewal to be agreed (the 90 s simulation is not a requirement).
* **Approval and versions (6, 14, 39):** explicit human approval only; employee approves own documents, Admin any; approved documents read-only
  for everyone; only the Admin creates a new version (Ready for Review, needs its own approval); previous approved versions and dates kept,
  independent of the audit-log retention.
* **Archive (9, 12, 15, 42, 43):** query by text, class (functional), status, **upload date**; every state except Pending; ownership enforced;
  soft-deleted documents excluded.

### 8.3 Export (8, 46) — real DOCX, XLSX, PDF

The frontend already offers the four formats and sends `documentId` + `format`. Real generation (server side) must: use the **latest approved
version**, include only selected and approved pages in original order with source page numbers, exclude the internal source (AI/manual), preserve
Arabic shaping/RTL, tables and fields (DOCX layout, XLSX sheets per page/table, PDF with an embedded Arabic font), and offer the complete original
separately. JSON already follows the same dataset (`domain/document/exportScope.js`); the backend may reuse its shape. **No PNG/JPG.**

### 8.4 Backup, restore, encryption, storage, notifications, audit

* **Backups (25–30):** scheduled (default daily 02:00, provisional) and manual; local plus a separate device; retention with protection (default
  7 unprotected); encryption with a **separately held key**; restore verifies, takes a **protective backup first**, blocks writes, needs explicit
  confirmation, is cancelled if the protective backup fails.
* **Storage (34, 35):** real measurement, thresholds (80 %/90 % provisional), refusal when full, Admin alerts; the upload and queue already react to a level.
* **Notifications (3):** per-user, read state, completion/failure with a review link and no automatic navigation; employees see their own
  documents only, the Admin also sees others' and system alerts.
* **Audit (31–33):** eight categories, Admin only, **no export**, retention independent of version history, never content or passwords. Events the frontend
  currently expects: upload, processing start/retry/failure, approval, new version, re-approval, restore/backup, settings, account actions.

## 9. Outstanding API contract questions (to settle with the backend and AI developers)

1. Auth: identifier, token storage/refresh, revocation mechanism, 401 handling with unsaved work, cross-tab logout.
2. Document registration: multipart format, page selection payload, error codes for size/pages/space (frontend maps `fileTooLarge`, `tooManyPages`,
   `storageFull`, `insufficientStorage`, `invalidState`, `notEligible`, `lockHeld`, `lockLost`, `noSuchVersion`).
3. Status delivery: polling vs server-sent events/WebSocket for queue position, state, completion/failure notifications.
4. Result schema per page (texts, tables, fields, JSON, optional `location`, class, layout, per-page failure) and the canonical document format
   (`domain/document/*`); candidate/accept/reject protocol.
5. Lock lease duration, renewal interval, heartbeat, who may take over, behaviour on expiry.
6. Version model: what a snapshot contains, numbering, how an Admin "new version" is created and approved.
7. Export: synchronous download vs asynchronous job, file naming, Arabic fonts, size limits.
8. Class and template catalogue ownership (AI developer), whether classes are an enumeration or free text, template CRUD later.
9. Archive query parameters, pagination and sorting.
10. Audit event schema and retention job; backup transport/encryption/key custody; storage metrics source.
11. Final deployment values for every provisional default.

## 10. Recommended integration sequence

1. Agree the contracts above and the shared error-code list; freeze a first OpenAPI draft **together** with the other developers.
2. **Auth** (`authService`, `apiClient`, session/401) → unlocks everything else; then employee management.
3. **Settings, storage, notifications** (cheap, needed by upload limits and the bell).
4. **Document persistence and registration** (`documentStore` → API, original storage), then the archive and the correction queue.
5. **Queue + AI per-page extraction** with status delivery; re-test failure, retry, manual entry, partial results, cancellation on delete.
6. **Review persistence:** drafts, Save, autosave, candidates, accepted-result history.
7. **Lock, approval, versions**, then the audit events.
8. **Export** (JSON first, then DOCX, XLSX, PDF), **recycle bin**, **backups/restore/encryption**.
9. Remove `src/dev/` usage and demo seeds, re-run the production bundle scan, offline PDF.js fonts/CMaps, re-test crash/recovery.
10. **Acceptance:** run the deferred UAT-06, 07, 08 against real services plus the full browser suite; re-confirm the provisional defaults.

Do not implement or finalise any contract, schema or default value without the backend and AI developers' agreement.
