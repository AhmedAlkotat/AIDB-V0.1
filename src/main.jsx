import { checkServiceConfig } from './services/serviceMode.js'
import { showConfigurationError } from './startupError.js'

// Entry point. The build configuration is checked FIRST (VITE_API_MODE / VITE_API_BASE_URL, see
// services/serviceMode.js): an invalid one stops here with a clear message instead of a blank page or a silent fallback
// to simulated data. The application itself (and every service it creates) is only loaded afterwards.
const configuration = checkServiceConfig()
if (configuration.ok) {
  import('./bootstrap.jsx').then(({ startApp }) => startApp())
} else {
  showConfigurationError(configuration.error)
}
