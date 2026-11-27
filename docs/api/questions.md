# AIDP API — open questions for the Backend and AI developers (DRAFT)

Status: Batch E / Wave 1. Each question names **what the frontend assumed** (isolated behind an adapter, so changing the answer
does not touch the screens) and whether it **blocks** the next integration wave. Nothing here is decided.

Legend — **Blocking**: Wave 2 cannot be finished against the real server without an answer. **Non-blocking**: a default is used.

## A. Authentication and session (Backend)

| # | Question | Frontend assumption (adapter) | Priority |
|---|---|---|---|
| Q-A1 | Login identifier: username or e-mail? | field `identifier`, 3–64 chars of `A-Za-z0-9._@-` (provisional) | Non-blocking |
| Q-A2 | Token model. **Proposed (D7):** short-lived access JWT returned in the JSON body and kept **in memory only**; refresh token in an **HttpOnly, Secure, SameSite=Strict cookie** scoped to `/api/v1/auth`. No `localStorage`/`sessionStorage`. Is this acceptable? Access-token lifetime? Refresh lifetime and rotation? | `authService` + `apiClient` (`credentials: 'include'` on `/auth/*`); on 401 one `/auth/refresh` then retry | **Blocking** |
| Q-A3 | A 401 while the user has **unsaved review work**: the frontend will not drop the work. Proposed: keep the screen, show "session expired – sign in again", re-login in place (same user), then retry the save. Is a re-login by a *different* user to be refused? | `state/auth/authStore.js` defers `expireSession` while unsaved work exists | Non-blocking |
| Q-A4 | Immediate revocation of an account's sessions on deactivation (decision 16): invalidate the access token server-side (token version / deny-list) or rely on a very short lifetime? | the frontend only reacts to 401 | **Blocking** |
| Q-A5 | Cross-tab logout (not implemented): is a `BroadcastChannel` signal enough, or does the cookie scheme make it unnecessary? | none | Non-blocking |
| Q-A6 | CORS/same-origin: is the API served from the same origin as the frontend (nginx reverse proxy on the LAN)? | same origin, `VITE_API_BASE_URL` empty or `/api/v1` | Non-blocking |
| Q-A7 | Role names in responses (`employee`, `admin`)? | mapped to the frontend's `employee`/`orgAdmin` in one place | Non-blocking |

## B. Documents, processing, queue (Backend + AI)

| # | Question | Frontend assumption | Priority |
|---|---|---|---|
| Q-B1 | **Registration format**: multipart with `file` + `selectedPages` (JSON array string). Maximum upload time/size to configure the proxy? | `POST /documents` multipart; per-request timeout raised for uploads | **Blocking** |
| Q-B2 | **Concurrency model.** Proposed: one integer `revision` per document, sent as `baseRevision` on every write (save pages, approve, accept candidate, reprocess); stale → `409 revisionConflict`. Alternatives: ETag/`If-Match`, per-page revisions. Which one? Does a queue write (new extraction result) also increment the revision? | `documentService.sessionStore` keeps the last revision and sends it; reviewSession untouched | **Blocking** |
| Q-B3 | **Page result schema** produced by the AI: elements `heading/paragraph/table/field/unclassified`, `content` as in `CanonicalDocument`, optional `location` {x,y,width,height} relative (0..1) to the **unrotated** page (decision 50). Who assigns element/row/cell ids (the frontend rejects duplicates inside a document)? Confidence scores? | the backend assigns unique ids; a result with duplicate ids is rejected as a whole | **Blocking** |
| Q-B4 | **Preserved original extraction** (decision 49): the server stores `originalExtraction` per page separately from the corrected `elements` and returns both. Confirm. | `Page.originalExtraction` | Non-blocking |
| Q-B5 | **Status delivery.** D8: polling first. Proposed polling endpoints: `GET /documents/{id}/status`, `GET /queue`, `GET /notifications` (30 s today). Acceptable intervals? Should `/documents?updatedSince=` exist? Later SSE would deliver the same payloads. | `documentService.subscribe` implemented by a polling timer in the HTTP adapter | Non-blocking |
| Q-B6 | **Reprocessing a page** (decision 38): `POST …/pages/{n}/reprocess` returns a job; the result becomes a *candidate* stored on the server until accepted/rejected (decision 40). Is the candidate stored server-side (frontend assumes yes, so a reload does not lose it)? How long? | `DocumentRecord.candidates` | **Blocking** |
| Q-B7 | **Attempt log** (decisions 11 and 40): the server writes attempts (metadata only) and accepted-result history; the frontend only reads them via `/meta`. Today the frontend writes them (mock). Confirm that the server owns them. | `getDocumentMeta` | **Blocking** |
| Q-B8 | **Document class catalogue** (decision clarification 1): enumeration (`invoice`, `certificate`, `contract`, `administrativeRequest`, unclassified) or free text? Who owns it? | `documentType` string or null | Non-blocking |
| Q-B9 | **Templates** (clarification 3): `GET /templates` is read-only; CRUD deferred until the AI developer is consulted. Confirm shape `{id, name, documentType}`. | `listTemplates` | Non-blocking |
| Q-B10 | **Queue** (decisions 22–24): concurrency limit, behaviour on storage full (paused), cancellation when the Admin deletes a document (decision 45), recovery after a restart. Is the queue visible to employees only for their own jobs? | `GET /queue` scoped by ownership | Non-blocking |
| Q-B11 | **Archive queries**: parameters in the draft (`view`, `q`, `type`, `state`, `uploadedFrom/To`, `sort`, `page`, `pageSize`). Default and maximum page size? Is the Arabic search normalised on the server (diacritics, alef variants)? | the frontend filters client-side today; `listPage` is ready for the server | Non-blocking |
| Q-B12 | **Original file**: streaming `GET /documents/{id}/original` with the bearer token; maximum size; range requests for large PDFs? | fetched as a `Blob` through the API client (no direct `<img src>`) | Non-blocking |

## C. Locking, approval, versions (Backend)

| # | Question | Frontend assumption | Priority |
|---|---|---|---|
| Q-C1 | **Lock lease and renewal** (decision 47 leaves it to technical coordination). Lease length, renewal interval, idle release, whether an Admin may take over? | the frontend renews at **half of the lease** the server returns; no number is built in | **Blocking** |
| Q-C2 | Lock change notification: polling `GET /documents/{id}/lock` (proposed) or push? | polling timer in the adapter | Non-blocking |
| Q-C3 | **Approval**: the request body carries `baseRevision` so a stale approval is refused; the server checks lock, ownership, reviewed pages and no processing. Version numbering (1, 2, …) and what a version snapshot contains (full canonical document)? | `approveDocument` | **Blocking** |
| Q-C4 | **New version** (Admin only): does it create a draft revision of the same document (frontend assumption) or a new document id? | same id, revision increments, approvalStatus returns to `none` | **Blocking** |

## D. Export (Backend — D3)

| # | Question | Frontend assumption | Priority |
|---|---|---|---|
| Q-D1 | **Synchronous or asynchronous?** Proposed: synchronous `POST /documents/{id}/exports {format}` returning the file. If generation can be slow, an async job (`202` + polling) — which? | the frontend `exportService` accepts a binary result; an async variant is an adapter change | **Blocking for Wave 3** |
| Q-D2 | File naming for Arabic names (`Content-Disposition` with RFC 5987 `filename*`), maximum size, timeout. | filename taken from the header, falling back to `<name>.<ext>` | Non-blocking |
| Q-D3 | Layout of each format: DOCX (headings → heading styles, tables → Word tables, RTL paragraphs), XLSX (one sheet per page/table? right-to-left sheet view), PDF (embedded Arabic font, shaping), JSON (the dataset in `src/domain/document/exportScope.js`: `{version, file, selectedPages, pageCount, pages:[{sourcePage, elements}]}`). Should JSON also contain document id, approver and approval date? | the frontend does **not** generate any format | **Blocking for Wave 3** |
| Q-D4 | Headers `X-AIDP-Page-Count`, `X-AIDP-Source-Pages`, `X-AIDP-Version` so the dialog can say what was exported — acceptable? | optional; the dialog works without them | Non-blocking |

## E. Administration (Backend)

| # | Question | Frontend assumption | Priority |
|---|---|---|---|
| Q-E1 | Backups: encryption, key custody, local + external device paths, protective backup before restore, write blocking (decisions 25–30). Does `restore` stream progress, or return all steps at the end? | steps returned at the end | Non-blocking |
| Q-E2 | Audit entry schema and the eight categories (decision 31): names `approval, approvedEdits, employeeAccounts, restore, backups, authentication, uploads, processing`. Server-side filters/pagination as in the draft? | as in the draft | Non-blocking |
| Q-E3 | Storage measurement source and thresholds; notifications raised by the server on threshold crossings. | `GET /storage/status` | Non-blocking |
| Q-E4 | Final values of the **provisional** defaults (10 MB, 100 pages, bin 30 days, audit 90 days, backup daily 02:00, 7 unprotected backups, 80/90 %); username/password rules. | the frontend reads limits from the server; its own defaults are for the mock only | Non-blocking |

## F. What is already confirmed (not a question)

The following come from the 50 approved decisions and are only *shaped* by this draft: one document per upload (1); processing continues
when the browser closes (2, 41); notification with a link and no redirect (3); explicit approval only (6, 39); six states (12); autosave +
manual save, saving is not approval (13); an employee never edits an approved document, only the Admin creates a new version (14);
ownership enforced by the server (15); no account deletion, immediate session revocation (16); Admin-only password handling (17–19);
local server, database and AI (21); durable FIFO queue (22–24); backups and restore rules (25–30); audit rules, **no export of the log**
(31–33); storage rules (34, 35); Admin limits checked on both sides (36, 48); page selection with the whole original kept (37);
page-level reprocessing (38); every accepted result kept, rejected content never persisted (40); only the Admin deletes, recycle bin,
cancellation during processing (42–45); export of selected and approved pages only (46); document-level lock (47); no source marks in the UI (49);
optional element coordinates (50).
