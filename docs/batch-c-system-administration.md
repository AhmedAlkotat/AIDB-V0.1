# Batch C — System administration, notifications and settings

Status: **closed — implemented, verified and accepted** (manual UAT passed). Frontend only: every
service is a development mock behind a replaceable interface, and **nothing real** is backed up,
encrypted, restored, monitored or enforced by a server. Requirements: the 50 approved decisions
(`AIDP_50_Decisions.pdf`).

> Scope note: the brief for this batch arrived truncated (it began in the middle of the
> notifications item). The scope was taken from the approved roadmap and the decisions, and was
> then re-checked against decisions 2–3, 25–36, 42–45 and 48 in a gap check (section 4).

## 1. Screens (Admin pages live under `RequireRole`; the mock services refuse non-Admin callers as the backend must)

| Route | Roles | What it does |
|---|---|---|
| `/admin/recycle-bin` | Admin | Deleted documents (soft delete), days left, restore (confirmation) and permanent deletion (confirmation + acknowledgement) |
| `/admin/backups` | Admin | Manual backup, list, protect from retention, "test restore", restore wizard (verify → protective backup → restore, explicit acknowledgement, cancelled if the protective backup fails) |
| `/admin/audit-log` | Admin | View/search/filter by category, outcome, text and dates. **No export.** No passwords or content |
| `/admin/storage` | Admin | Usage, thresholds, level (ok/warning/critical/full), breakdown, what the server does when full |
| `/admin/settings` | Admin | Five groups: uploads, recycle bin, audit log, backups, storage alerts; a shorter retention shows what it would delete and needs an acknowledged confirmation |
| `/settings` | all | Employee-accessible preferences: interface language, account (name, role), read-only upload limits |
| `/notifications` + header bell | all | Own notifications; an employee sees only their own documents' notifications, the Admin all plus storage/backup alerts; never navigates by itself |

The **delete** action (move to the bin) appears only for the Admin on the queue, the archive and the
dashboard (decision 42).

Everything simulated is labelled: each page shows a "simulation" notice and the demo badge while its
service is the mock; production builds use "not connected" services and show an error state instead
of inventing data. Development-only simulation panels exist only on mock services (`service.dev`).

## 2. Verification
- `npm test` 701 / 701 (595 before Batch C + `systemAdmin` 69 + `systemAdminUi` 30 + `i18nCoverage` 7); lint clean; build succeeds.
- Browser: layout 79, image rotation 81, review 29, navigation guard 7, integration 13, UAT 184,
  auth 42, employees 48, **admin 77** (560 in total), and the production-build check 9 / 9.
- The production bundle contains no mock accounts, passwords, seed data, mock services or dev switches.

## 3. Manual UAT
The Batch C manual UAT was executed by the project owner and **passed (all eight checks)**, covering
localization (Arabic RTL and English LTR), backups and restore, recycle bin, storage, notifications,
settings, audit log and permissions.

## 4. Gap check against the decisions (2–3, 25–36, 42–45, 48)

| # | Decision | Frontend status in Batch C | Left for |
|---|---|---|---|
| 2 | Processing continues while the user navigates | Not in scope of C: the review session still aborts running extractions when the page is left (Task 2 mock) | **D/E** (queue, background processing) |
| 3 | Notification on completion with a review link, no automatic navigation | **Done (simulated)**: bell + page, per-role/ownership visibility, link only, no redirect. Events are simulated | **E** feeds real processing events |
| 25 | Scheduled + manual backups of data, assets, results, drafts, approvals, versions, logs | Manual backup, list, schedule settings and "next backup" shown; **simulated** (no scheduler, no files) | **E** |
| 26 | Local + separate device, no cloud, protection, restore test | Local and external paths, warning when no separate device, "test restore"; simulated | **E** |
| 27 | Admin sets frequency and time | Done (settings → backups) | — |
| 28 | Admin sets count or age; protect chosen backups; keep incremental dependencies | Count/age retention, protection, retention applied after each backup; **incremental dependencies not modelled** | **E** |
| 29 | All backups encrypted, key kept separately, restore Admin only | Statement + Admin-only restore enforced in the mock; no real encryption or key | **E** |
| 30 | Restore: verify/decrypt, protective backup, data-loss warning, explicit confirmation, writes blocked, cancel if protective fails | Whole sequence with acknowledgement and cancellation; **simulated**; the frontend cannot block server writes | **E** |
| 31 | Admin enables/disables FUTURE logging of eight categories; no secrets; history independent | Done: eight switches, no secrets (tested), independent of version/approval/attempt history | entries for upload/processing/approval come from **D/E** |
| 32 | Admin only views/searches/filters; no Excel/PDF export | Done; no export control exists (tested) | — |
| 33 | Admin sets log retention; never deletes versions/approvals/backups | Done, with a destructive-change confirmation | — |
| 34 | Storage monitoring and alerts at configurable thresholds | Done (simulated figures, scenarios, Admin notifications) | real measurement **E** |
| 35 | When full: block uploads/processing, notify Admin, protect data, no auto-deleting approved, resume | Explained and notified; level "full" shown. **Uploads/processing are NOT blocked in the UI**: the server must refuse them and the upload screen must show that message | **D** (message) + **E** (enforcement) |
| 36 | Admin sets max file size; checked in UI and server | Setting + validation done. **The upload screen still uses its own constant** (`constants/upload.js`) | **D** wires it, **E** server check |
| 42 | Only the Admin deletes (approved or not), explicit confirmation; not the removal of a local file before upload | Done (button only for the Admin, confirmation, tested for employees) | — |
| 43 | Soft delete keeping original/results/drafts/versions; hidden from normal lists; Admin-only bin; restore/permanent delete with extra confirmation | Done (in the temporary in-memory store) | durability **E** |
| 44 | Retention from the move date (30/60/90 days as examples) or automatic deletion off; restore/delete before expiry; not the archive | Done; the examples are hints, not fixed choices | real retention job **E** |
| 45 | Deleting during processing: after confirmation, cancel or wait safely, keep finished results, others unaffected | Warning + the mock reports/stops processing; no real queue | **E** |
| 48 | Admin sets the maximum selected pages (independent of file size); checked in UI and server; default after performance testing | Setting + validation done. **The page selection does not read it yet** | **D** wires it, **E** server check |

No further frontend change was needed within Batch C: the open items all sit in the upload, review and
queue flows (Batch D) or need the backend (Batch E), and are recorded in `docs/batch-d-handover.md`.

## 5. Provisional defaults — NOT approved final values
All are in `src/domain/settings/settings.js` and were **left unchanged**; the decisions say their
examples (10 MB, 80/90 %, 30/60/90 days) are not final and that the page limit comes after performance
testing. The Settings page says "provisional" in its description and hints.

Max file size 10 MB; max selected pages 100; recycle bin: automatic deletion on, 30 days; audit
retention 90 days, all eight categories on; backups: daily at 02:00 (weekly day Friday), keep the last
7 unprotected, no paths set; storage alerts 80 % / 90 %; allowed ranges (file size 1–1024 MB, pages
1–10000, retention 1–3650 days, count 1–365, thresholds 1–99 %). Mock sizes (500 GB disk, 3.3 GB
backups) are invented demo figures.

## 6. Deferred (details and ownership in `docs/batch-d-handover.md`)
Upload validation and page selection reading the settings; the storage-full message on the upload
screen; real processing events and background processing; entries for upload/processing/approval in
the audit log; durability of the bin; real backups, encryption, key management, scheduler, restore,
storage measurement, retention jobs and server-side enforcement of every permission and limit.
