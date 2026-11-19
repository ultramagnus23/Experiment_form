import { z } from 'zod';
import { fail, json, readJson, sameOrigin } from '@/lib/http';
import { consumeLoginToken, startAdminSession } from '@/lib/admin-auth';
import { isAllowedAdmin } from '@/lib/env';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Cross-origin request rejected');
  const parsed = z.object({ token: z.string().min(20).max(200) }).safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'Invalid link');
  const email = await consumeLoginToken(parsed.data.token);
  if (!email || !isAllowedAdmin(email)) return fail(401, 'This sign-in link is invalid or has expired. Please request a new one.');
  await startAdminSession(email);
  await audit(email, 'login');
  return json({ ok: true });
}
