import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { query } from './db';
import { ADMIN_COOKIE, ADMIN_SESSION_HOURS, MAGIC_LINK_MINUTES, isAllowedAdmin, isSecureDeployment } from './env';
import { fail, sameOrigin } from './http';
import { newSecret, sha256hex } from './random';

/** Returns a raw token, or null if the email is rate-limited. Caller must already have checked the allowlist. */
export async function createLoginToken(email: string): Promise<string | null> {
  const { rows } = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM admin_login_tokens WHERE email=$1 AND created_at > now() - interval '1 hour'",
    [email],
  );
  if (rows[0].n >= 5) return null;
  const raw = newSecret(32);
  await query(
    `INSERT INTO admin_login_tokens(email, token_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' minutes')::interval)`,
    [email, sha256hex(raw), String(MAGIC_LINK_MINUTES)],
  );
  return raw;
}

/** Single-use, atomic. Returns the email on success. */
export async function consumeLoginToken(raw: string): Promise<string | null> {
  const { rows } = await query<{ email: string }>(
    `UPDATE admin_login_tokens SET used_at = now()
      WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING email`,
    [sha256hex(raw)],
  );
  return rows[0]?.email ?? null;
}

export async function startAdminSession(email: string): Promise<void> {
  const raw = newSecret(32);
  await query(`INSERT INTO admin_sessions(email, token_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' hours')::interval)`, [
    email,
    sha256hex(raw),
    String(ADMIN_SESSION_HOURS),
  ]);
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureDeployment(),
    path: '/',
    maxAge: ADMIN_SESSION_HOURS * 3600,
  });
}

export async function endAdminSession(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(ADMIN_COOKIE)?.value;
  jar.delete(ADMIN_COOKIE);
  if (!raw) return null;
  const { rows } = await query<{ email: string }>(
    'UPDATE admin_sessions SET revoked_at = now() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING email',
    [sha256hex(raw)],
  );
  return rows[0]?.email ?? null;
}

/** The authenticated admin's email, or null. Re-checks the allowlist on every call. */
export async function getAdminEmail(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(ADMIN_COOKIE)?.value;
  if (!raw) return null;
  const { rows } = await query<{ email: string }>(
    'SELECT email FROM admin_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()',
    [sha256hex(raw)],
  );
  const email = rows[0]?.email;
  if (!email || !isAllowedAdmin(email)) return null;
  return email;
}

type Ctx = { email: string; params: any };

/** Wrap every admin API handler: authentication + allowlist + CSRF origin check, enforced server-side. */
export function admin(handler: (req: NextRequest, ctx: Ctx) => Promise<Response>) {
  return async (req: NextRequest, routeCtx: { params: Promise<any> }): Promise<Response> => {
    const email = await getAdminEmail();
    if (!email) return fail(401, 'Not authenticated');
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return fail(403, 'Cross-origin request rejected');
    try {
      return await handler(req, { email, params: await routeCtx.params });
    } catch (e) {
      console.error('[admin api]', e);
      return fail(500, 'Server error');
    }
  };
}
