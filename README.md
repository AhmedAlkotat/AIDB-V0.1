# AIDP v0.1

Arabic Intelligent Document Processing graduation project.

React and Vite application written in JavaScript.

**Phase 1 (done):** application shell with sidebar navigation, header, an
initial dashboard (demo statistics only), and placeholder pages for every
section, in Arabic (RTL, default) and English (LTR). OCR, AI processing,
backend services, and authentication are future work.

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
