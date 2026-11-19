import { getAdminEmail } from '@/lib/admin-auth';
import Dashboard from './Dashboard';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

// Server-side gate: unauthenticated visitors are never served the dashboard, and every
// /api/admin/* route re-checks the session and allowlist independently.
export default async function AdminPage() {
  const email = await getAdminEmail();
  if (!email) return <LoginForm />;
  return <Dashboard email={email} />;
}
