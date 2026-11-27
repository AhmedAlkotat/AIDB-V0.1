# Batch E — Wave 1 (E2 API contract draft + E3 service-architecture foundation)

Branch `batch-e-integration` (from `main` @ `74c3103`). Frontend only: **no real backend, no AI, no export generation**. The 50
approved decisions remain authoritative; decisions D1–D10 of the E1 audit are implemented as stated below. **Status: closed**
(post-implementation audit, the H1/H2 fixes and the O-1/O-3 fixes done; manual acceptance passed, see §6).

## 1. What this wave adds

| Area | Result | Where |
|---|---|---|
| E2 contract draft | 53 operations, DTOs, error envelope and codes, revisions, open questions. **Proposed, not agreed.** Valid YAML and valid OpenAPI 3.0.3 (checked with a real parser). | `docs/api/openapi.draft.yaml`, `error-codes.md`, `questions.md` |
| Service mode (D1) | `VITE_API_MODE=mock\|http`, safe production default, no silent fallback, clear start-up error | `src/services/serviceMode.js`, `src/main.jsx`, `src/startupError.js`, `.env.example` |
| API client | per-request timeout, query, FormData, binary, in-memory token, one silent refresh, 401 hook | `src/services/apiClient.js` |
| Error mapping | one mapping HTTP → `SystemError` / `AuthError` / `EmployeeError` | `src/services/apiErrors.js` |
| Async document service (D2) | port + development adapter + HTTP adapter; screens no longer touch the store | `src/services/documentService.js`, `httpDocumentService.js`, `documentDto.js`, `changeFeed.js`, `src/dev/mockDocumentService.js` |
| Loading / failure / stale / cancel | framework-free live resource + hooks | `src/state/resource/liveResource.js`, `src/hooks/useLiveResource.js` |
| Unsaved work vs 401 | the session is "expiring", not ended; re-login in place | `src/state/auth/unsavedWork.js`, `authStore.js`, `components/auth/SessionExpiredBanner.jsx` |
| Contract server (D6) | development-only, Node built-ins, deterministic fixtures | `scripts/contract-server/` |
| Production bundle | no simulated store, queue, accounts or demo documents (less than before: the store used to be in the bundle) | `PURE` markers, `main.jsx` split |
| H1 fix | revision protection (see §3) | `httpDocumentService.js`, `useReviewSession.js` |
| H2 fix | contract file is valid YAML/OpenAPI; guard test | `openapi.draft.yaml`, `tests/openapiDraft.test.js` |
| O-1 fix | "Save draft" confirms itself (see §4) | `components/review/manualSave.js`, `SaveStatusIndicator.jsx` |
| O-3 fix | favicon (no more 404) | `public/favicon.svg`, `public/favicon.ico`, `index.html` |

## 2. Architecture

```
main.jsx ── checkServiceConfig() ──► invalid? show a plain message and stop
        └─ import('./bootstrap.jsx') ► LanguageProvider → AuthProvider → Router → pages
pages / hooks ─► documentService (port) ─┬─ 'mock' (DEV only): src/dev/mockDocumentService → in-memory documentStore
                                         └─ 'http': httpDocumentService → apiClient → apiErrors / documentDto
review session ─► documentService.getSessionStore(id, { revision })   (the session's write port)
```

* **Backend is authoritative.** The HTTP adapter keeps only revision numbers, caches no content, derives no state, owns no
  attempts / accepted results / candidates / versions, and enforces nothing.
* **Optional synchronous `peek*`** exists only on the development adapter, so the first render shows data at once. The HTTP adapter
  has none: its screens start in `loading`.
* **No fallback.** `http` + a service without an HTTP adapter ⇒ "not connected" (an explicit error, never a simulation). Production
  refuses `mock`. The factories keep the `import.meta.env.DEV` guard so the bundler removes `src/dev/` from production.
* **Stale responses**: every load has a ticket; only the newest may write. A failed background refresh keeps the data on screen.
  Leaving a screen aborts what is in flight.
* **Unsaved work is never dropped on a 401 or a network error**: failed writes reject and the review session keeps its unsaved
  state; a 401 with unsaved work only marks the session "expiring" and the same user re-authenticates in place.

## 3. H1 — revision protection (lost updates)

The base revision of a save belongs to the CONTENT a review session loaded. It is set by `getDocument` and advanced only by the
session's own acknowledged writes. Reading a summary, the list, a page of the list or the metadata (what the polling does) NEVER
changes it, and revisions only move forward (a late answer cannot take one back). A session store keeps its own base
(`getSessionStore(id, { revision })`). Without a loaded revision a save is refused (`invalidState`) instead of guessing one. A stale
save is refused with `409 revisionConflict`; the base stays, the user's unsaved edits stay, and a retry is refused again (no silent
rebase). Before the fix a poll moved the base and the next save silently overwrote another writer's change.
Tests: `tests/documentService.test.js` (REGRESSION H1) and `tests/contractServer.test.js` (end to end with a real review session).

## 4. O-1 — confirmation of "Save draft"

When autosave had already stored everything, the click changed nothing on screen. `components/review/manualSave.js` runs the save and
shows "تم حفظ المسودة / Draft saved" ONLY when the save really ended "saved": never after a failure, never for autosave, hidden
at once when the document changes again, restarted by a new click, ignored while a save is running. Autosave and `reviewSession`
are untouched.

## 5. Verification (isolated copies, sequential, at the end of the wave)

| Check | Result |
|---|---|
| `npm test` | **1010 / 1010** (baseline 830 / 830; all 830 original tests still present and passing; no original test file changed) |
| `npm run lint` | clean, no warnings |
| `npm run build` | succeeds; the bundle contains no simulation (stores, queue, accounts, demo documents); `dist/` has the favicon files |
| Browser (real Chrome, dev server) | layout 79, image rotation 81, review 29, navigation 7, integration 13, UAT 184, employees 48, admin 77, documents 106, documents-admin 35 |
| Production build (`vite preview`) | 13 / 13 (no mock authentication, no simulated workflow, no demo documents in any loaded chunk) |
| Authentication browser check | 40–42 / 42, **unstable, see below** |

### Known instability of two browser checks (not a regression)
* `auth.check.mjs` — "the login page shows the form and no application shell" and "the Admin opens the Admin page" read the DOM
  right after the address changed and sometimes see the previous render. Under load they fail intermittently. The same flake was
  reproduced on the state BEFORE the O-1/O-3 changes (6 runs, none 42/42) and with the favicon link removed, so it is timing, not
  a defect of the wave. Passing runs (42/42) exist for the final code. Recommended for Wave 2: wait for the element instead of
  reading it at once.
* `layout.check.mjs` — the check "the viewer is really sticky" runs only when the page can scroll to 700 px; right after a cold
  dev-server start the page is sometimes shorter (676 px) and the check is skipped (78 instead of 79). Three reruns gave 79.
  Recommended for Wave 2: fail or wait instead of skipping.
* Browser checks depend on `src/main.jsx` loading the application as a second chunk; `cdp.mjs` therefore waits for `#root` to be
  rendered, and `auth-production.check.mjs` scans every loaded chunk (not only the first).

## 6. Manual acceptance (Mock mode) — all PASS

| # | Test | Result |
|---|---|---|
| 1 | Sign-in and navigation (employee, Admin) | PASS |
| 2 | UAT-06 tabs, save, approval, export | PASS (O-1 found, fixed) |
| 3 | UAT-08 delete while Pending/Processing, new version, re-approval, recycle bin, audit log | PASS |
| 4 | View a previous approved version | PASS (O-2 was a page-selection misunderstanding, closed) |
| 5 | Arabic RTL / English LTR | PASS |
| 6 | UAT-07 lock tools (simulation only) | PASS |
| 7 | `VITE_API_MODE`: invalid value shows the start-up message; `http` without backend never falls back to the simulation and a forged mock session signs nobody in | PASS (O-3 found, fixed) |
| O-1 / O-3 | Save confirmation; favicon | PASS (manual) |

## 7. Deferred (Wave 2 and later)

**Needs the real Backend / AI (cannot be done before):**
* UAT-07 with two real accounts and a server-enforced lock (lease, renewal, idle release, checks on save / reprocess / approve).
* UAT-06 and UAT-08 repeated against real services (durable save, binding approval, durable versions, real queue, durable recycle bin).
* The "session ended, unsaved work kept" banner with a real HTTP authentication (it is covered by unit tests only).
* Loading and error states of the document screens in `http` mode in a browser.
* Real DOCX / XLSX / PDF export (generated by the Backend, decision D3); the frontend only requests and downloads.
* Immediate session revocation on deactivation (decision 16) and the final production check with real services.

**Frontend work planned for Wave 2:**
* HTTP adapters for the other 12 services (they report "not connected" in `http` mode): auth first, then employees, settings,
  storage, notifications, recycle bin, backups, audit, templates, workflow/queue, approval, lock, export.
* D4 — Cairo font bundled locally and the Google Fonts links removed (conflict with decision 21; `index.html` still has them).
* D5 — isolate the Vite cache of the application and of the automated tests (see `docs/batch-d-document-management.md` §8).
* Archive filtering and paging on the server (`listPage` exists in both adapters and in the contract).
* Findings of the post-implementation audit that were deliberately not fixed in Wave 1:
  * M1 no end-to-end test of "unsaved work + 401" (the wiring from the review session to the registry is untested).
  * M2 the stale-response ticket is not tested in isolation.
  * M3 no HTTP path for accepting / rejecting a candidate and for the accepted-result history (decision 40): the review session does
    them locally and the HTTP session store has no `updateMeta`; the contract has the endpoints. Needs a design decision.
  * M4 the contract's `logout` requires a valid bearer token, but the frontend calls it after the token expired.
  * M5 two formal contract tests (`x-service` is matched by name only; one test title claims more than it checks).
  * M6 the HTTP path of the screens has never run in a browser.
  * M7 a session kept alive by unsaved work has no time limit (product decision).
  * M8 commit hygiene (the rename of `main.jsx` — done in this commit).
  * L1–L8 (body-read timeout, sticky-check skip, `name_asc` in the mock, bootstrap load failure, contract-server controls, contract
    pagination and wording, polling amplification, bundle-scan name list).
* Open contract questions that block the real integration: `docs/api/questions.md` (blocking ones: token model and revocation,
  revision model, page-result schema and ids, candidate storage, attempt ownership, lock lease, approval/new-version semantics).

## 8. Not in this wave

HTTP adapters other than the document service, real export, local fonts, Vite cache isolation, server-side archive queries, and any
real Backend / AI integration. The contract server proves only that the frontend matches the PROPOSED contract; it says nothing
about the real Backend. Its fixture accounts and passwords belong to that development tool only.

## 9. How to run

```
npm test            # unit + SSR tests (run from a copy outside the folder while start_AIDP.bat is running, see batch D §8)
npm run lint
npm run build
npm run contract-server        # development-only fake API on http://127.0.0.1:5301 (scripts/contract-server/README.md)
```
