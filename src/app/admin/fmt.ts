export const fmtMs = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${Math.round(v).toLocaleString()} ms`);
export const fmtSec = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${(v / 1000).toFixed(2)} s`);
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${v.toFixed(1)}%`);
export const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : '–');

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<{ ok: boolean; status: number; data: T }> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined = init?.body as any;
  if (init?.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  const r = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers as any) }, body, credentials: 'same-origin' });
  if (r.status === 401) {
    location.href = '/admin';
  }
  let data: any = null;
  try {
    data = await r.json();
  } catch {}
  return { ok: r.ok, status: r.status, data };
}
