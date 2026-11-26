# Batch A — Authentication and role-based access

Status: **implemented, tested and accepted** (manual UAT passed). Frontend only: there is no
backend integration yet. The 50 approved decisions (`AIDP_50_Decisions.pdf`) are the
authoritative requirements and take precedence over the old task roadmap in
`docs/task-2-phase-2-review.md`.

## 1. What Batch A delivers

- Login page (Arabic RTL / English LTR) with loading, error, submitting and session-ended states.
- Centralized authentication state (`src/state/auth/authStore.js`, `src/contexts/AuthProvider.jsx`,
  `src/hooks/useAuth.js`). The runtime identity comes from authentication; the hardcoded demo
  identity and `VITE_DEMO_ROLE` were removed (closes P6 of the Phase 2 review).
- Route guards `RequireAuth` / `RequireRole` (`src/components/auth/`, `src/routes/routeAccess.js`),
  a 403 page, role-based sidebar (`src/routes/navigation.js`), dynamic user badge.
- Functional logout through `/logout`, so the review page's unsaved-work guard runs first.
- The in-memory documents are wiped when the signed-in user signs out or is replaced, so no
  document data leaks between mock sessions.
- Replaceable auth service (`src/services/authService.js`), shared API client
  (`src/services/apiClient.js`, not used by any screen yet) and a development-only mock
  (`src/dev/mockAuthService.js`).

Roles: exactly two, Employee (`employee`) and Admin (`orgAdmin` in the code). Frontend role checks
only shape the interface; they are **not** a security boundary (decisions 15, 39, 42: the server
enforces permissions).

## 2. Automated verification (at the time of the batch)

| Check | Result |
|---|---|
| `npm test` | 541 / 541 pass (483 existing + 41 in `tests/auth.test.js` + 17 in `tests/authUi.test.js`) |
| `npm run lint` | clean |
| `npm run build` | succeeds; the built files contain no mock accounts, passwords, session key or `VITE_DEMO_ROLE` |
| Browser regression (layout, image rotation, review, navigation guard, integration, UAT) | 79 + 81 + 29 + 7 + 13 + 184 checks pass |
| `scripts/browser-checks/auth.check.mjs` (dev server) | 42 / 42 pass |
| `scripts/browser-checks/auth-production.check.mjs` (`vite preview`) | 8 / 8 pass: a forged dev-session marker signs nobody in, the former mock credentials are refused, no dev helper is shown |

## 3. Manual UAT

The Batch A manual UAT checklist was executed by the project owner and **passed**
(sign-in guards, invalid/disabled logins, role-based navigation, direct Admin URLs, reload,
logout with unsaved work, Admin vs. Employee behaviour, data separation, AR/EN, production build).

## 4. Deferred limitations

| # | Limitation | Why it is deferred / what is needed |
|---|---|---|
| L1 | **Session expiry during editing.** An HTTP 401 ends the session at once; the review screen unmounts without the unsaved-work prompt (it only stores pending edits locally, which are then wiped with the session). No screen uses the API client yet, so this cannot happen today. | Needs a token-expiry/refresh strategy agreed with the backend, and server-side persistence of drafts (decision 13). |
| L2 | **Cross-tab logout synchronization.** Signing out in one tab does not sign out other tabs. | Depends on the final token storage strategy (e.g. a cookie or a `storage`/BroadcastChannel signal). |
| L3 | **Real backend authentication and session revocation.** Production builds cannot sign in ("not connected"). Immediate revocation of a deactivated account's sessions (decision 16) is only modelled by the mock. | Backend (FastAPI/PostgreSQL) work, Batch E. |
| L4 | **Final authentication API contract.** Endpoint names, the login identifier (username or email), JWT storage, refresh behaviour and response schemas are **not** agreed and are not defined in the frontend. | Joint decision with the backend teammate. |

Other known points (unchanged by Batch A): the notification bell is still a placeholder; demo
documents are seeded in every build; the English dictionary still lacks review/queue/archive
text; the Admin role label reads "مدير المؤسسة" / "Organization Administrator" while the decisions
say "المدير" / "Admin".

## 5. Development mock accounts (development builds only)

`employee` / `employee-dev`, `admin` / `admin-dev`, `disabled` / `disabled-dev` (a deactivated
account). They exist only in `src/dev/` and are removed from production bundles.
