import { PlaceholderPage } from '../components/common/PlaceholderPage.jsx'

// Admin-only. Only a placeholder in Batch A: it is the first Admin route, so the route
// guards and the role-based navigation have something real to protect. The employee
// management itself (create accounts, reset passwords, deactivate/reactivate) is Batch B.
export default function AdminEmployeesPage() {
  return <PlaceholderPage icon="users" titleKey="nav.adminEmployees" descriptionKey="pages.adminEmployees.description" />
}
