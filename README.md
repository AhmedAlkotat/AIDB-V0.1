# AIDP v0.1

Arabic Intelligent Document Processing graduation project.

React and Vite application written in JavaScript.

**Phase 1 (done):** application shell with sidebar navigation, header, an
initial dashboard (demo statistics only), and placeholder pages for every
section, in Arabic (RTL, default) and English (LTR). OCR, AI processing,
and backend services are future work. Authentication and roles are in place with a
development-only mock (see below).

## Development

Use Node.js 22.13+ (Node.js 24 LTS recommended) and npm. 22.13 is the minimum
required by PDF.js (`pdfjs-dist`).

```sh
npm install
npm run dev
npm run lint
npm run build
npm run preview
```

Open the local URL printed by Vite. Run `build` before using `preview` to check
the production build locally.

## Upload Document page

One document per upload (PDF, JPG, JPEG or PNG). The maximum size defaults to
10 MB and can be changed with `VITE_MAX_UPLOAD_SIZE_MB` (e.g. in `.env.local`);
10 MB is not a final system requirement.

For PDFs the page count is read locally with PDF.js (`pdfjs-dist`, pinned to an
exact version, **legacy build** so it also runs on older browsers). The library
and its worker are bundled by Vite and loaded lazily only when a PDF is
selected; nothing is fetched from a CDN, so it works offline. The user can
process all pages (default) or type page numbers and ranges (`1-3, 5, 8`;
Arabic digits are accepted). Password-protected PDFs are blocked for now.
Images are treated as single-page documents.

`createProcessingRequest()` in `src/services/documentProcessingService.js`
builds the frontend request: the complete, unchanged original file plus the
selected page numbers stored separately (`pageSelection.pages`). The service is
still **not connected** to any backend or AI, so nothing is sent or processed
and no result is ever fabricated. The later integration only needs to replace
the body of `submitDocumentForProcessing`.

## Document review (Task 2)

The **Correction Queue** (`/corrections`) lists the documents waiting for human
review (approved ones move to the **Archive**, `/archive`, read-only; an employee sees their
own documents and an administrator all of them: a simulation, not enforced by any server); opening one goes to its own page (`/corrections/review/:documentId`).
The page shows the original PDF page (zoom, pan, display-only rotation; one
page is rendered at a time, so large PDFs stay light) next to a structured
editor (headings, paragraphs, tables, key/value fields and unclassified
content) with a resizable split, page navigation over the *selected* pages
only, an explicit "تمت مراجعة الصفحة" action, undo/redo, search in the current
page, a read-only JSON preview, autosave, a mock re-extraction with a
comparison step, and an approval checklist.

Architecture (nothing competes with the Phase 1 model):

```text
src/domain/document/   canonical model, validation, operations, JSON, review
                       rules; approval.js, pageStatus.js, search.js,
                       pageNavigation.js, saveStatus.js
src/state/documentSession/
  documentReducer.js   Phase 1 reducer: the ONLY thing that changes the document
  reviewSession.js     framework-independent session: reducer + autosave +
                       mock processing + comparison + approval rules
src/services/          autosaveController, documentStore (temporary, in memory),
                       mockProcessingService, approvalService (not connected),
                       pdfDocumentService (one page at a time)
src/components/review/ the review UI;  src/pages/DocumentReviewPage.jsx
```

What is mock or temporary (and labelled as such in the UI):

- **Extraction results are validated** before they are applied or kept for
  comparison (a list of canonical elements with unique IDs that do not clash
  with the rest of the document); an invalid result marks the page failed (or
  leaves existing content untouched) instead of being applied.
- **No real AI and no backend.** Extraction results are made-up placeholder
  content marked "[تجريبي]"; pages 4, 8, ... fail their first mock attempt so
  the failure/retry flow can be tried.
- **Storage is this browser tab's memory** (`documentStore`): it is *not*
  durable, nothing is sent to a server, and everything is lost on reload. The
  autosave states ("تغييرات بانتظار الحفظ" / "جارٍ الحفظ" / "تم حفظ جميع
  التعديلات" / "فشل الحفظ") only reflect what that store acknowledged. Autosave
  stores only the pages that changed (`savePages`), never the whole document, so
  an edit stays cheap even in a 1,000-page document. A later phase replaces the
  store behind the same interface.
- **Approval is not connected** (`approvalService`): the checklist is real but
  nothing is ever approved, so no document can become approved from the UI.
  While an approval request is pending the document is frozen, and once a
  service acknowledges an approval it is written to the store (`setApprovalStatus`).
  Approved documents (a demo record) are read-only for everyone; only the admin
  may ask for a new editable version, which also needs the backend.
- Demo documents (`src/data/mock/reviewDemo.mock.js`) are created in the queue,
  with a generated real PDF (`demoPdf.js`). Development builds also show a small
  "demo tools" panel to simulate a failing storage or extraction.
- To try the admin-only action, sign in with the development mock Admin account
  (see "Authentication and roles" below). `VITE_DEMO_ROLE` no longer exists.
- Leaving the page is guarded with `useBlocker`, which needs a data router, so
  `main.jsx` uses `createBrowserRouter` + `RouterProvider` (all routes are still
  declared in `AppRoutes`).
- PDF pages without embedded fonts use the browser's substitute fonts; PDF.js
  font/CMap data is not bundled yet (scanned documents are unaffected).

## Authentication and roles (Batch A)

- Exactly two roles: **Employee** and **Admin** (`orgAdmin` in the code). Everything
  except `/login` and `/logout` is behind `RequireAuth`; Admin-only pages are also behind
  `RequireRole` (`src/routes/AppRoutes.jsx`), and the sidebar lists only what the role may
  open (`src/routes/navigation.js`). **These checks only shape the interface**: the backend
  must enforce every permission.
- The authentication service is replaceable (`src/services/authService.js`). It is **not
  connected to a backend yet**: a production build cannot sign in (it reports "not
  connected"); there is no bypass and no built-in credential. Endpoint names, the login
  identifier, the JWT storage strategy and the response schemas are still to be agreed.
- `npm run dev` uses a **development-only mock** (`src/dev/mockAuthService.js`, never part of
  production bundles). The login page offers buttons that fill in its accounts:
  `employee` / `employee-dev`, `admin` / `admin-dev`, and `disabled` / `disabled-dev` (a
  deactivated account). The mock keeps a session marker in `sessionStorage` so a reload keeps
  you signed in.
- Signing out goes through `/logout`, so the review page's unsaved-work guard runs first.
  When the user signs out the in-memory documents are wiped, so nobody sees the previous
  user's documents.
- `src/services/apiClient.js` is the shared HTTP client for the future API (not used by any
  screen yet).
- `/admin/employees` is only a placeholder (Admin-only) that gives the guards something to
  protect; employee management itself is not built yet.

Browser checks (real Chrome/Edge, no extra dependency): start `npm run dev -- --port 5199`
in one terminal and run `npm run check:browser` in another. They cover the layout (sticky
viewer, split pane around 1024px, RTL/LTR), image rotation, the review interactions and the
navigation guard and sign-in/roles (`auth.check.mjs`); `auth-production.check.mjs` runs against
`vite preview` and proves the mock sign-in is absent from a production build (see its header). See
`scripts/browser-checks/`. Findings, fixes and the remaining gaps of the
Phase 2 stabilization are in `docs/task-2-phase-2-review.md`.

Tests: `npm test` runs the Node test runner over `tests/` (domain, session,
autosave and the UI render tests, which load the real `.jsx` components through
Vite's SSR loader; no extra dependency).

## Structure

```text
public/                Static files served directly
src/
  assets/              Imported images and other assets
  components/
    common/            Icon, Alert, StatCard, DemoBadge, PlaceholderPage
    layout/            AppLayout, Sidebar, Header, BrandLogo,
                       LanguageSwitcher, UserBadge
    upload/            DocumentDropZone, DocumentPreview, FileInfoPanel,
                       PageSelectionPanel, PdfViewer, ImageViewer
  constants/           User roles (not enforced yet)
  contexts/            Language context and provider
  data/mock/           DEMO DATA ONLY (dashboard stats, demo user)
  hooks/               useLanguage, useTranslation, usePdfPageCount, ...
  i18n/                Arabic/English interface text and translate()
  pages/               Dashboard and placeholder pages
  routes/              Paths, sidebar navigation config, AppRoutes
  services/            documentProcessingService (not connected),
                       pdfMetadataService (local PDF.js page count)
  utils/               documentFile (validation), pageSelection (ranges)
  styles/              global (tokens), layout, components, pages
  App.jsx              Renders the routes
  main.jsx             React entry point: LanguageProvider + BrowserRouter
index.html             Metadata and default language/direction
vite.config.js         Vite React configuration
.oxlintrc.json         JavaScript/React lint configuration
```

## Arabic and English

Arabic is the default (`lang="ar"`, `dir="rtl"`). `LanguageProvider` updates
the document language and direction when language state changes. Future
components inside the provider can use:

```jsx
import { useLanguage } from './hooks/useLanguage.js'

const { language, direction, setLanguage } = useLanguage()
// Call from an event handler:
setLanguage('en') // English, LTR
setLanguage('ar') // Arabic, RTL
```

Only `ar` and `en` are accepted. Language state is stored in memory; reloading
defaults to Arabic. The AR / EN switch is in the header. Interface text lives in
`src/i18n/translations.js`; read it in components with:

```jsx
import { useTranslation } from './hooks/useTranslation.js'

const { t } = useTranslation()
t('nav.dashboard')
```

`useTranslation` reads the existing language context and adds no state of its own.
Use logical CSS properties such as `margin-inline-start`, `padding-inline`, and
`text-align: start` so layouts follow the selected direction.

Dependencies are locked in `package-lock.json`. During initialization npm's
cache was kept inside the project in the gitignored `.npm-cache/` folder.
