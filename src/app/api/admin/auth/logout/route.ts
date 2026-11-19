import { fail, json, sameOrigin } from '@/lib/http';
import { endAdminSession } from '@/lib/admin-auth';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Cross-origin request rejected');
  const email = await endAdminSession();
  if (email) await audit(email, 'logout');
  return json({ ok: true });
}
