# Handover for Batch D

Project: **AIDP** (Arabic Intelligent Document Processing), React 19 + Vite + React Router 7, Arabic RTL
(default) and English LTR. Repository `AhmedAlkotat/AIDB-V0.1`, branch `main`.
Requirements authority: the **50 approved decisions** (`AIDP_50_Decisions.pdf`); they override the old
task roadmap in `docs/task-2-phase-2-review.md`. Roadmap: A auth → B employees/dashboards → C system
administration (all **done**) → **D remaining document features** → E real backend and AI.

## 1. Architecture (frontend only; no backend is connected)

```
main.jsx → LanguageProvider → AuthProvider → RouterProvider
routes:  /login, /logout (public) · RequireAuth → AppLayout (NotificationsProvider) → pages
         RequireRole(Admin) → /admin/* ; guards only shape the UI, the backend must enforce
layers:  domain/ (pure rules, tested)  →  services/ (replaceable interfaces)  →  state/ + hooks/  →  components/ + pages/
         dev/ = development-only mocks, reachable ONLY through `import.meta.env?.DEV` branches, so
         production bundles contain none of them (checked by a bundle scan + a production browser check)
i18n:    src/i18n/translations.js (ar + en, identical keys, enforced by tests/i18nCoverage.test.js)
```

Pattern for every backend-backed capability: `services/xService.js` exports the interface, a
"not connected" production service (rejects `notConnected`, `isMock: false`, no `dev`), and
`createXService()` returning the mock from `src/dev/` in development. Screens take an optional
`service` prop (tests). Mocks play the server (Admin checks, validation, retention) and share
`dev/mockContext.js`, `mockAccountStore.js` (sessionStorage) and `mockSystemState.js` (sessionStorage).

Key constraints: **no real backend, no AI, no persistence.** Documents live in `services/documentStore.js`
(in-memory, `isDurable: false`, wiped on sign-out/reload); every mock screen is labelled as simulated.

## 2. Status

| Part | Status | Document |
|---|---|---|
| Task 1: upload, validation, PDF page selection | done (mock submit) | `README.md` |
| Task 2: review/editor/autosave/reprocess/approval UI | done against mocks | `docs/task-2-phase-2-review.md` |
| Batch A: login, guards, role navigation, logout, API client | done, committed | `docs/batch-a-authentication.md` |
| Batch B: employee management, role dashboards | done, committed | `docs/batch-b-employee-management.md` |
| Batch C: recycle bin, backups/restore, audit log, storage, notifications, settings | done, UAT passed | `docs/batch-c-system-administration.md` |

Commits on `main`: `31b8d97` (A), `9692533` (B), Batch C is the commit that contains this file.

## 3. Where things are

- **Services** (`src/services/`): `authService`, `employeeService`, `settingsService`, `recycleBinService`,
  `backupService`, `auditLogService`, `storageService`, `notificationService` (all replaceable);
  `apiClient` (fetch wrapper, bearer token hook, 401 hook, **not used by any screen yet**);
  `documentStore` (temporary store: summaries, soft delete, drafts, approval status),
  `approvalService` and `documentProcessingService` (both "not connected" stubs), `mockProcessingService`.
- **State stores** (framework-free, tested): `state/auth/authStore`, `state/employees/employeeDirectory`,
  `state/notifications/notificationStore`, `state/resource/resourceStore`,
  `state/documentSession/{reviewSession,documentReducer}` (review session, undo/redo, autosave, reprocess),
  `services/autosaveController`.
- **Domain** (`src/domain/`): `document/*` (canonical document, review, approval, access rules),
  `employee`, `settings` (**all provisional defaults live here**), `backup`, `audit`, `storage`,
  `recycleBin`, `notification`, `dashboard`.
- **Mocks** (`src/dev/`): accounts, auth, employees, settings, recycle bin, backups, audit, storage,
  notifications, system state, shared context. Dev accounts: `employee/employee-dev`,
  `admin/admin-dev`, `disabled/disabled-dev` ("reset mock accounts" on the login page).
- **Pages** (`src/pages/`): Login, Logout, Forbidden, Dashboard, Upload, CorrectionQueue, DocumentArchive,
  DocumentReview, Templates (placeholder), Settings (preferences), Notifications, AdminEmployees,
  RecycleBin, Backups, AuditLog, Storage, SystemSettings.
- **Tests**: `tests/*.test.js` (Node runner; UI tests render real `.jsx` through Vite SSR);
  browser checks in `scripts/browser-checks/` (real Chrome/Edge, need `npm run dev -- --port 5199`).
  Run the browser checks on a freshly started dev server and **not while `npm test` runs** (they share
  Vite's dependency cache). The full suite takes more than 9 minutes.

## 4. Latest results

- `npm test`: **701 / 701** · `npm run lint`: clean · `npm run build`: succeeds.
- Browser: layout 79, image rotation 81, review 29, navigation guard 7, integration 13, UAT 184, auth 42,
  employees 48, admin 77 = **560 / 560**; production-build check (`auth-production.check.mjs`, run
  against `vite preview`) **9 / 9**.
- Manual UAT for Batches A, B and C: passed.

## 5. Known limitations (current)

- Nothing is durable: documents, the recycle bin and mock accounts are lost on reload (documents) or tab close (mocks).
- Production builds cannot sign in or use any admin service ("not connected").
- Frontend role checks are UI shaping only. Sessions: a 401 ends the session without the unsaved-work prompt;
  no cross-tab logout; the JWT storage strategy and the real API contract are **not agreed**.
- Provisional, **unapproved** defaults (`domain/settings/settings.js`, `domain/employee/employee.js`): 10 MB, 100 pages,
  bin 30 days, audit 90 days, 7 backups, 80/90 % storage, username 3–64 chars, password ≥ 8, allowed ranges.
- Admin role label is "مدير المؤسسة" / "Organization Administrator" (the decisions say "Admin"/"المدير").
- English dictionary is complete; demo document names and mock data are Arabic.

## 6. Batch D scope — remaining document-related frontend (proposed; confirm before starting)

Current-state gaps found by reading the code (each with the decision it serves):

1. **Upload flow (1, 36, 37, 41, 48, 35):** read the Admin limits from `settingsService.getLimits()` instead of `constants/upload.js`
   and the page-count limit in the page selection, with clear messages; show a clear message when the server (later) refuses an
   upload for lack of space; keep "selection, preview, replacement and page choice are local until Start processing".
2. **Document states (12):** model and display Pending, Processing, Ready for Review, Failed, Manual Editing, Approved on
   lists, dashboards and the review header. **Clarify** decision 12 ("all states appear in the archive except Pending"): the
   archive is **approved-only** today (an earlier approved rule), which conflicts with it.
3. **Review screen (4, 5, 38, 13, 49, 50):** tabs for texts / tables / fields / JSON (today one editor plus a JSON toggle);
   **manual Save button** (only autosave and "retry" exist today); **hide source marks** from the correction UI while tracking
   the source internally (`ElementCard` still shows "added manually / extracted by AI/demo"); optional element coordinates to
   highlight the element in the original (decision 50: works without them).
4. **Approval and versions (6, 14, 39):** employee approves own documents, Admin all (the real approval needs Batch E; keep the
   "acknowledged by the service" contract); **version history UI** and Admin-only "new version" flow with previous versions and
   dates kept; approved documents stay read-only for everyone including the owner.
5. **Attempts (11, 40):** attempt history (date, status, failure reason), retry without re-upload, manual entry after failure,
   keep every accepted result, never persist rejected content, independent of the audit log.
6. **Archive and export (7, 8, 9, 46):** archive search/filter by type, date and status; export approved results to Word, Excel,
   PDF and JSON (selected and approved pages only, original order, source page numbers in the data); the full original available
   separately per permissions.
7. **Concurrent editing (47):** document-level edit lock UI: one editor, others view-only with a notice; lock release on finish or
   idle without losing saved work (server-checked on save, reprocess and approve).
8. **Processing visibility (2, 3, 22–24):** background processing continues when the user navigates (today the review session
   aborts running extractions when the page is left), queue position/state display, completion/failure notifications from real
   events with a review link and no automatic navigation; audit entries for upload, processing and approval (31).
9. **Templates page** is still a placeholder (not covered by the decisions: ask before building).

Rules for D: do not redesign completed interfaces; keep mocks replaceable and dev-only; keep Arabic and English complete from
the start (the i18n coverage test enforces it); update tests and add browser checks; do not start E.

## 7. Batch E — real backend and AI integration requirements

- FastAPI + PostgreSQL (backend teammate), local/offline AI model (AI teammate), everything on the local network, no internet (21).
- **Auth (15–20, JWT):** agree login identifier, JWT storage, refresh/expiry and cross-tab logout; server-enforced Employee/Admin
  rules; hashed passwords; **immediate session revocation when an account is deactivated (16)**; one institution, one Admin (20).
- **Documents:** durable storage of originals, results, drafts, last visited page, approvals, versions, attempts; soft delete and
  recycle bin with retention job (42–45); ownership and permission checks on every call (15, 39); edit lock (47).
- **Processing (2, 22–24, 41):** persistent central FIFO queue with recovery after a stop (no loss or duplication), concurrent
  processing when resources allow; upload starts on "Start processing", the server checks file, size, pages and space, registers
  Pending, queues after successful storage; closing the browser does not cancel the work.
- **AI contract (4, 5, 11, 37, 49, 50):** per-page extraction of texts, tables, fields and JSON for printed and handwritten Arabic;
  unknown templates; optional coordinates; retry per page without affecting others.
- **Admin services:** backups, encryption with a separately held key, restore with protective backup and write blocking (25–30);
  audit events for the eight categories (31–33); storage measurement, thresholds, refusal when full, Admin alerts (34, 35);
  settings read/write with server validation (36, 48); notifications per user with read state (3).
- **Frontend cut-over:** implement each `services/*Service.js` against the agreed endpoints (not yet defined), delete `src/dev/`
  usage, remove the demo seeds (`data/mock/`), re-run the production bundle scan, offline PDF.js fonts/CMaps, re-test the P1/P2
  crash/recovery scenarios against real storage, and the 401/session-expiry-while-editing behaviour.

## 8. Approved decisions that must be preserved (summary; the PDF is authoritative)

1 one document per upload · 2 processing continues while navigating · 3 completion notification with link, no auto-navigation ·
4 original beside results with texts/tables/fields/JSON tabs · 5 edit before approval · 6 explicit human approval, none automatic ·
7 approved document auto-archived with original and result · 8 export approved results to Word/Excel/PDF/JSON ·
9 archive search/filter by type, date, status, view/export per permissions · 10 superseded by 12 ·
11 clear failure error, retry without re-upload, manual entry, attempts log · 12 six states, all shown in the archive except Pending, honouring the bin ·
13 autosave + manual save + status + unsaved warning, saving ≠ approval · 14 Employee never edits an approved document; only the Admin creates a new
version, needing re-approval, previous versions and dates kept · 15 employee sees own documents, Admin all, server enforces ·
16 Admin deactivates/reactivates employees, no deletion, work kept, sessions revoked · 17 only the Admin resets passwords ·
18 only the Admin creates accounts and initial password, no forced change · 19 only the Admin changes passwords, no self-service, hashed ·
20 one institution, one Admin, no SaaS, no Super Admin · 21 local server/DB/AI, LAN access, no internet ·
22 persistent central queue, concurrent when resources allow · 23 FIFO, no role priority · 24 safe recovery without loss or duplication ·
25–30 backups (scheduled + manual, local + separate device, schedule, retention with protection, encryption with separate key, restore with
protective backup, warning, explicit confirmation, write block, cancel on failure) · 31–33 audit log (eight categories, Admin only, no export,
retention, independent of version history) · 34–35 storage monitoring and full-disk behaviour · 36 Admin file-size limit, UI + server ·
37 PDF page selection, original kept whole, unselected pages are not failures · 38 page-by-page review, per-page reprocess with warning,
approval from the review screen under the conditions · 39 approval permissions, no separate reviewer role · 40 keep every accepted result and
all attempts, never persist rejected content · 41 upload only on Start processing · 42 only the Admin deletes, with confirmation ·
43–45 recycle bin (soft delete, Admin only, retention, deletion during processing) · 46 export selected and approved pages only, original order,
source page numbers · 47 document-level edit lock · 48 Admin page-count limit, UI + server · 49 no distracting source marks, track source
internally · 50 optional element coordinates.
