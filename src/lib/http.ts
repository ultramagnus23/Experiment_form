import { NextResponse } from 'next/server';
import { appUrl } from './env';

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function fail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, status);
}

/** CSRF defence for cookie-authenticated, state-changing requests: Origin must match this deployment. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const allowed = new URL(appUrl());
    if (o.host === allowed.host) return true;
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    return !!host && o.host === host && process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

export async function readJson<T = any>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
