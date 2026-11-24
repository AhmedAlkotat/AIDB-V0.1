import { Route, Routes } from 'react-router'
import { AppLayout } from '../components/layout/AppLayout.jsx'
import CorrectionQueuePage from '../pages/CorrectionQueuePage.jsx'
import DashboardPage from '../pages/DashboardPage.jsx'
import DocumentArchivePage from '../pages/DocumentArchivePage.jsx'
import DocumentReviewPage from '../pages/DocumentReviewPage.jsx'
import DocumentTemplatesPage from '../pages/DocumentTemplatesPage.jsx'
import NotFoundPage from '../pages/NotFoundPage.jsx'
import SettingsPage from '../pages/SettingsPage.jsx'
import UploadDocumentPage from '../pages/UploadDocumentPage.jsx'
import { ROUTES } from './paths.js'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path={ROUTES.upload} element={<UploadDocumentPage />} />
        <Route path={ROUTES.archive} element={<DocumentArchivePage />} />
        <Route path={ROUTES.corrections} element={<CorrectionQueuePage />} />
        <Route path={ROUTES.reviewDocument} element={<DocumentReviewPage />} />
        <Route path={ROUTES.templates} element={<DocumentTemplatesPage />} />
        <Route path={ROUTES.settings} element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
