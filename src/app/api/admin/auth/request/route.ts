import { after } from 'next/server';
import { json, readJson, sameOrigin, fail } from '@/lib/http';
import { appUrl, isAllowedAdmin } from '@/lib/env';
import { createLoginToken } from '@/lib/admin-auth';
import { sendMagicLink } from '@/lib/mailer';
import { z } from 'zod';

const GENERIC = { ok: true, message: 'If that address is authorised, a sign-in link has been sent. It expires in 15 minutes.' };

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Cross-origin request rejected');
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'Please enter a valid email address');
  const email = parsed.data.email;

  // Identical response whether or not the address is on the allowlist (no account enumeration).
  if (isAllowedAdmin(email)) {
    const raw = await createLoginToken(email);
    if (raw) {
      const link = `${appUrl()}/admin/verify#token=${encodeURIComponent(raw)}`;
      // after(): keeps the serverless function alive until the email is sent, without delaying the response.
      after(() => sendMagicLink(email, link).catch((e) => console.error('[mail] failed to send sign-in link:', e?.message ?? e)));
    }
  }
  return json(GENERIC);
}
