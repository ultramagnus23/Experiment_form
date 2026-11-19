import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { query } from './db';

// Second admin sign-in path: a hidden URL slug + shared password, in addition to the allowlist and the
// magic link. Feature is OFF unless both ADMIN_ACCESS_SLUG and a well-formed ADMIN_PASSWORD_HASH are set.

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SALT_BYTES = 16;
const KEY_BYTES = 64;
export const RATE_WINDOW = '15 minutes';
export const MAX_FAILS_PER_EMAIL = 5;
export const MAX_FAILS_PER_IP = 20;

type Parsed = { salt: Buffer; hash: Buffer };

/** Parses `scrypt$<salt hex>$<hash hex>`. Returns null for anything malformed. */
function parseHash(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return null;
  const [, saltHex, hashHex] = parts;
  const hex = /^(?:[0-9a-f]{2})+$/i;
  if (!hex.test(saltHex) || !hex.test(hashHex)) return null;
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  if (salt.length < 8 || hash.length < 16) return null;
  return { salt, hash };
}

/** Feature config from the environment, or null when the feature must stay off (404 everywhere). */
export function accessConfig(): { slug: string; hash: string } | null {
  const slug = process.env.ADMIN_ACCESS_SLUG;
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!slug || !hash || !parseHash(hash)) return null;
  return { slug, hash };
}

/** Constant-time equality of two slugs (both hashed first so the length is not leaked either). */
export function slugMatches(candidate: string, expected: string): boolean {
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Verifies a password against a stored scrypt hash. The scrypt work is always performed, with a
 * matching-length derived key, so callers can run it regardless of other checks.
 */
export function verifyAdminPassword(password: string, stored: string): boolean {
  const parsed = parseHash(stored);
  // Malformed input never reaches here via the route (accessConfig() rejects it); this keeps the function total.
  const salt = parsed?.salt ?? Buffer.alloc(SALT_BYTES);
  const expected = parsed?.hash ?? Buffer.alloc(KEY_BYTES);
  const derived = scryptSync(password, salt, expected.length, SCRYPT);
  return parsed !== null && timingSafeEqual(derived, expected);
}

/** Produces a stored value in the `scrypt$<salt hex>$<hash hex>` format. Used by scripts/hash-admin-password.ts. */
export function hashAdminPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_BYTES, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** True when either the email (5 / 15 min) or the client IP (20 / 15 min) has too many recent failures. */
export async function isPasswordLoginBlocked(email: string, ip: string): Promise<boolean> {
  const { rows } = await query<{ by_email: number; by_ip: number }>(
    `SELECT
       (SELECT count(*) FROM admin_password_attempts WHERE email=$1 AND created_at > now() - interval '${RATE_WINDOW}')::int AS by_email,
       (SELECT count(*) FROM admin_password_attempts WHERE ip=$2 AND created_at > now() - interval '${RATE_WINDOW}')::int AS by_ip`,
    [email, ip],
  );
  return rows[0].by_email >= MAX_FAILS_PER_EMAIL || rows[0].by_ip >= MAX_FAILS_PER_IP;
}

export async function recordPasswordFailure(email: string, ip: string): Promise<void> {
  await query('INSERT INTO admin_password_attempts(email, ip) VALUES ($1, $2)', [email, ip.slice(0, 64)]);
}

/** Client IP as reported by the first hop of X-Forwarded-For. Falls back to a shared bucket if absent. */
export function clientIp(req: Request): string {
  const first = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim();
  return first || 'unknown';
}
