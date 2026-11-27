# AIDP API — error envelope and domain error codes (DRAFT)

Status: **proposal**, part of Batch E / Wave 1. Not agreed with the Backend developer. The **frontend already uses most of these
codes** (`src/services/*Errors.js`, `src/components/common/workflowErrorMessage.js`), so keeping the names avoids a mapping layer.
Codes marked **new** do not exist in the frontend yet.

## 1. Envelope (proposed)

Every non-2xx answer carries the same JSON body:

```json
{
  "error": {
    "code": "revisionConflict",
    "message": "The document changed since it was loaded.",
    "fields": { "identifier": "tooShort" },
    "details": { "currentRevision": 7 },
    "requestId": "b6f1…"
  }
}
```

* `code` — one value from the closed list below. The frontend switches on `code` only, never on `message` (the UI shows its own
  Arabic/English text).
* `message` — for developers and logs; may be English only.
* `fields` — validation failures, `field name → validation code` (`required`, `tooShort`, `tooLong`, `invalidChars`, `notInteger`,
  `outOfRange`, `invalidTime`, `mustBeBelowCritical`, `mustDiffer`, `mismatch`; the same codes the frontend validators use).
* `details` — code-specific data (see the table).
* Never put a password, token or document content into any field.

The frontend's mapping (`src/services/apiErrors.js`) when the body is missing or unreadable: `401 → unauthenticated`,
`403 → forbidden`, `404 → notFound`, `5xx → unknown`, network failure → `network`, timeout → `timeout`.

## 2. Codes

| Code | HTTP | Meaning | `details` | Frontend today |
|---|---|---|---|---|
| `unauthenticated` | 401 | No valid access token / refresh cookie | — | **new** (ends the session) |
| `sessionExpired` | 401 | The session ended (token expiry, revoked, account deactivated, decision 16) | — | maps to `SESSION_EXPIRED` in `authStore` |
| `invalidCredentials` | 401 | Wrong identifier or password (**login only**; must not end an existing session) | — | `AUTH_ERROR.invalidCredentials` |
| `accountDisabled` | 403 | The account is deactivated | — | `AUTH_ERROR.accountDisabled` |
| `missingFields` | 400 | Identifier or password empty | `fields` | `AUTH_ERROR.missingFields` |
| `forbidden` | 403 | The caller's role/ownership does not allow it | — | `SYSTEM_ERROR.forbidden` |
| `notFound` | 404 | Unknown, deleted, or **not visible to the caller** (existence is not revealed) | — | `SYSTEM_ERROR.notFound` |
| `invalidInput` | 400 | Malformed request or a validation rule failed | `fields` | `SYSTEM_ERROR.invalidInput` |
| `blocked` | 423 | Refused because of the system state (a restore is running, writes are blocked) | `reason` | `SYSTEM_ERROR.blocked` |
| `duplicateIdentifier` | 409 | Another account has the identifier | — | `EMPLOYEE_ERROR.duplicateIdentifier` |
| `fileTooLarge` | 413 | Above the Admin's limit (decision 36; the server checks again) | `maxFileSizeMb` | `WORKFLOW_ERROR.fileTooLarge` |
| `unsupportedFileType` | 415 | Not PDF/JPG/JPEG/PNG | — | **new** |
| `tooManyPages` | 422 | More selected pages than the Admin's limit (decision 48) | `maxSelectedPages` | `WORKFLOW_ERROR.tooManyPages` |
| `storageFull` | 507 | No free space: uploads and processing are refused (decision 35) | — | `WORKFLOW_ERROR.storageFull` |
| `insufficientStorage` | 507 | Some space, but not enough for this document | — | `WORKFLOW_ERROR.insufficientStorage` |
| `invalidState` | 409 | The document's state does not allow the operation (e.g. approving an approved document) | `state` | `WORKFLOW_ERROR.invalidState` |
| `notEligible` | 409 | Approval prerequisites not met (pages not reviewed, processing, …) | `reasons[]` | `WORKFLOW_ERROR.notEligible` |
| `lockHeld` | 409 | Someone else is editing (decision 47) | `lock` | `WORKFLOW_ERROR.lockHeld` |
| `lockLost` | 409 | The caller's own lock expired or was taken over | — | `WORKFLOW_ERROR.lockLost` |
| `noSuchVersion` | 404 | The approved version does not exist | — | `WORKFLOW_ERROR.noSuchVersion` |
| `revisionConflict` | 409 | `baseRevision` is not the current revision (stale save / stale approval / lost-update protection) | `currentRevision` | **new** |
| `unknown` | 500/502/503 | Anything else | — | `SYSTEM_ERROR.unknown` |

Client-side only codes (never sent by the server, produced by `apiClient`): `network` (no response), `timeout`,
`notConnected` (the service has no HTTP implementation yet), `invalidResponse` (the body is not what the contract says).

## 3. Behaviour rules the frontend relies on (proposed)

1. **401 on `/auth/login` is `invalidCredentials`, not a session end.** Any other 401 means the session is over; the frontend
   tries ONE refresh (`/auth/refresh`) and, if that fails, ends the session — but keeps unsaved review work on screen
   (see `docs/api/questions.md` Q-A3).
2. **A refused write changes nothing.** `revisionConflict`, `lockHeld`, `lockLost`, `forbidden`, `blocked` and `storageFull` leave
   the stored data exactly as it was; the frontend keeps the user's unsaved edits and offers a retry.
3. **`revisionConflict` carries `details.currentRevision`** so the frontend can reload and offer to re-apply.
4. **Document existence is not revealed**: a document that the caller may not see is `404 notFound` (employees opening another
   employee's document), not `403`. (The frontend handles both.)
5. **Validation is repeated on the server**: file size, selected pages, type, free space (decisions 35, 36, 41, 48).

## 4. Status of this table

| Part | Status |
|---|---|
| Behaviour (which situations must be refused) | **confirmed requirement** (the 50 decisions) |
| Code names reused from the frontend | **proposed**, cheap to keep |
| HTTP status numbers | **proposed** |
| `revisionConflict`, `unsupportedFileType`, `unauthenticated` | **proposed** (new) |
