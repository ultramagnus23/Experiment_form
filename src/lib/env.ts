import path from 'node:path';

export const DEFAULT_ADMIN_EMAILS = [
  'akshita.sinha_ug2025@ashoka.edu.in',
  'gunn.malhotra_ug2024@ashoka.edu.in',
  'ishani.dhingra_ug2025@ashoka.edu.in',
  'meenal.goel_ug2024@ashoka.edu.in',
  'zitien.tickoo_ug2025@ashoka.edu.in',
];

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  const list = raw && raw.trim() ? raw.split(',') : DEFAULT_ADMIN_EMAILS;
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isAllowedAdmin(email: string): boolean {
  return adminEmails().includes(email.trim().toLowerCase());
}

export function appUrl(): string {
  const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
  return (process.env.APP_URL || fromVercel || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Audio goes to a private Vercel Blob store when a token is configured; otherwise to local disk (AUDIO_DIR). */
export function blobEnabled(): boolean {
  // Either a read-write token, or the store id (the SDK then authenticates with Vercel's OIDC token on Vercel).
  return !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.BLOB_STORE_ID;
}

export function isSecureDeployment(): boolean {
  return appUrl().startsWith('https://');
}

export function audioDir(): string {
  return path.resolve(process.env.AUDIO_DIR || './data/audio');
}

export const MAX_AUDIO_BYTES = Number(process.env.MAX_AUDIO_MB || 30) * 1024 * 1024;
export const ADMIN_SESSION_HOURS = 12;
export const MAGIC_LINK_MINUTES = 15;
export const PARTICIPANT_COOKIE = 'ps';
export const ADMIN_COOKIE = 'admin_session';
