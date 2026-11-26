import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './styles/global.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/pages.css'
import './styles/review.css'
import './styles/auth.css'
import './styles/employees.css'
import './styles/admin.css'
import './styles/documents.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthProvider.jsx'
import { LanguageProvider } from './contexts/LanguageProvider.jsx'
import { documentStore } from './services/documentStore.js'

// A data router (instead of <BrowserRouter>) is required by useBlocker, which
// the review page uses to protect unsaved work when navigating. All routes are
// still declared in AppRoutes; this single splat route simply renders them.
const router = createBrowserRouter([{ path: '*', element: <App /> }])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      {/* When a user signs out (or the session ends) the in-memory documents are wiped, so
          the next user never sees them. */}
      <AuthProvider onSessionEnded={() => documentStore.reset()}>
        <RouterProvider router={router} />
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
