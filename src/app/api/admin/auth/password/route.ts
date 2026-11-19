import { z } from 'zod';
import { fail, json, readJson, sameOrigin } from '@/lib/http';
import { isAllowedAdmin } from '@/lib/env';
import { startAdminSession } from '@/lib/admin-auth';
import { audit } from '@/lib/audit';
import {
  accessConfig,
  clientIp,
  isPasswordLoginBlocked,
  recordPasswordFailure,
  slugMatches,
  verifyAdminPassword,
} from '@/lib/admin-password';

const GENERIC_FAILURE = 'Sign-in failed. Check your email and password.';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Cross-origin request rejected');

  // Feature off (either env var unset or malformed): behave exactly like a missing route.
  const cfg = accessConfig();
  if (!cfg) return fail(404, 'Not found');

  const parsed = z
    .object({
      slug: z.string().max(200),
      email: z.string().trim().toLowerCase().email().max(200),
      password: z.string().min(1).max(1024),
    })
    .safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'Please enter your email and password');
  const { slug, email, password } = parsed.data;
  const ip = clientIp(req);

  if (await isPasswordLoginBlocked(email, ip)) {
    return fail(429, 'Too many failed attempts. Try again in 15 minutes.');
  }

  // All three checks are evaluated unconditionally (no short-circuit), and scrypt always runs,
  // so the response time does not reveal which part was wrong.
  const slugOk = slugMatches(slug, cfg.slug);
  const passwordOk = verifyAdminPassword(password, cfg.hash);
  const emailOk = isAllowedAdmin(email);

  if (!(slugOk && passwordOk && emailOk)) {
    await recordPasswordFailure(email, ip);
    return fail(401, GENERIC_FAILURE);
  }

  await startAdminSession(email);
  await audit(email, 'login', { method: 'password' });
  return json({ ok: true });
}
