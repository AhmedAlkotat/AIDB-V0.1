# Batch B — Employee management and role-based dashboards

Status: **implemented and verified, awaiting acceptance** (not committed). Frontend only; no
backend integration. Requirements: the 50 approved decisions (16, 17, 18, 19, 20, 15, 12) and
the Batch B brief. Roles: exactly Employee and Admin; one institution, one Admin.

## What it delivers

**Employee management** (`/admin/employees`, Admin only — route guard in the UI, and the
service refuses non-Admin callers as the backend must):
list, search by name/username (Arabic-normalized), filter by account status, create accounts with
an initial password (+ confirmation), edit name and username, set a new password (one action for
"reset" and "change": the Admin cannot see or reuse the old one), deactivate / reactivate with
confirmation dialogs, loading / empty / no-results / error / success states, field validation
and server errors next to the field, Arabic RTL and English LTR.

Rules enforced: no delete action or method anywhere; no self-registration or self-service
password change (no such screen exists); no forced change at first sign-in; passwords are never
displayed, returned by a service, or kept in the list state; deactivated accounts cannot sign
in or restore a session; deactivation keeps the account, its id and its documents/history.

**Role-based dashboards** (`/`): the Employee sees figures and recent documents for their own
documents only; the Admin sees institution-wide document figures, the employee-account figures
(total / active / deactivated) and the latest documents of everyone. Figures come from the
documents each role may see (`selectVisibleDocuments`), so they always agree with the queue and
the archive. Anything computed from temporary/mock data carries the "بيانات تجريبية" badge and a
note; there is no hardcoded demo number any more.

## Architecture

- `src/domain/employee/employee.js` — validation, filtering, counts (pure). **Provisional
  limits** (username 3–64 chars of letters/digits/`._-@`, password 8–128, name ≤ 100) are in one
  place; they are NOT approved requirements.
- `src/services/employeeService.js` — replaceable interface; production = "not connected".
- `src/dev/` (development only, absent from production bundles): `mockAccountStore.js` (the one
  account store), `mockAuthService.js` (sign-in, now backed by it), `mockEmployeeService.js`
  (plays the server: Admin check, validation, unique usernames).
- `src/state/employees/employeeDirectory.js` + `src/hooks/useEmployeeDirectory.js` — list state.
- `src/components/employees/`, `src/components/common/FormDialog.jsx`, `FormField.jsx`,
  `src/pages/AdminEmployeesPage.jsx`, `src/pages/DashboardPage.jsx`,
  `src/components/dashboard/EmployeeSummary.jsx`, `src/domain/dashboard/stats.js`.

## Open questions for the project owner / backend (nothing was invented)

1. Which employee fields exist besides name and username (e-mail, job title, phone)?
2. Username format (plain username vs e-mail) and password policy (the 8-character minimum is a
   placeholder).
3. Should the Admin's own password be changed somewhere? (Decision 19 only covers employees.)
4. Dashboard content beyond document counts (e.g. processing states of decision 12 need the
   backend; they are not shown because the frontend does not model them yet).
5. Server-side vs client-side search/filter once the list is large.
