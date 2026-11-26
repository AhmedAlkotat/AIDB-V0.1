import { Route, Routes } from 'react-router'
import { RequireAuth } from '../components/auth/RequireAuth.jsx'
import { RequireRole } from '../components/auth/RequireRole.jsx'
import { AppLayout } from '../components/layout/AppLayout.jsx'
import { ADMIN_ROLES } from '../constants/roles.js'
import AdminEmployeesPage from '../pages/AdminEmployeesPage.jsx'
import AuditLogPage from '../pages/AuditLogPage.jsx'
import BackupsPage from '../pages/BackupsPage.jsx'
import CorrectionQueuePage from '../pages/CorrectionQueuePage.jsx'
import DashboardPage from '../pages/DashboardPage.jsx'
import DocumentArchivePage from '../pages/DocumentArchivePage.jsx'
import DocumentReviewPage from '../pages/DocumentReviewPage.jsx'
import DocumentTemplatesPage from '../pages/DocumentTemplatesPage.jsx'
import LoginPage from '../pages/LoginPage.jsx'
import LogoutPage from '../pages/LogoutPage.jsx'
import NotFoundPage from '../pages/NotFoundPage.jsx'
import NotificationsPage from '../pages/NotificationsPage.jsx'
import RecycleBinPage from '../pages/RecycleBinPage.jsx'
import SettingsPage from '../pages/SettingsPage.jsx'
import StoragePage from '../pages/StoragePage.jsx'
import SystemSettingsPage from '../pages/SystemSettingsPage.jsx'
import UploadDocumentPage from '../pages/UploadDocumentPage.jsx'
import { ROUTES } from './paths.js'

// Public: the login page and the logout step (which ends the session, then goes to login).
// Everything else sits behind RequireAuth; Admin-only pages are also behind RequireRole.
// These guards only shape the interface: the backend enforces permissions.
export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route path={ROUTES.logout} element={<LogoutPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path={ROUTES.upload} element={<UploadDocumentPage />} />
          <Route path={ROUTES.archive} element={<DocumentArchivePage />} />
          <Route path={ROUTES.corrections} element={<CorrectionQueuePage />} />
          <Route path={ROUTES.reviewDocument} element={<DocumentReviewPage />} />
          <Route path={ROUTES.templates} element={<DocumentTemplatesPage />} />
          <Route path={ROUTES.settings} element={<SettingsPage />} />
          <Route path={ROUTES.notifications} element={<NotificationsPage />} />
          <Route element={<RequireRole roles={ADMIN_ROLES} />}>
            <Route path={ROUTES.adminEmployees} element={<AdminEmployeesPage />} />
            <Route path={ROUTES.adminRecycleBin} element={<RecycleBinPage />} />
            <Route path={ROUTES.adminBackups} element={<BackupsPage />} />
            <Route path={ROUTES.adminAuditLog} element={<AuditLogPage />} />
            <Route path={ROUTES.adminStorage} element={<StoragePage />} />
            <Route path={ROUTES.adminSettings} element={<SystemSettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
