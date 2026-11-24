import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './styles/global.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/pages.css'
import './styles/review.css'
import App from './App.jsx'
import { LanguageProvider } from './contexts/LanguageProvider.jsx'

// A data router (instead of <BrowserRouter>) is required by useBlocker, which
// the review page uses to protect unsaved work when navigating. All routes are
// still declared in AppRoutes; this single splat route simply renders them.
const router = createBrowserRouter([{ path: '*', element: <App /> }])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <RouterProvider router={router} />
    </LanguageProvider>
  </StrictMode>,
)
