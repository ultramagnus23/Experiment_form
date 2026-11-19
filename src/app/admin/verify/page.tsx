'use client';
import { useEffect, useState } from 'react';

// The token travels in the URL fragment (never sent to the server on GET, never in logs/Referer).
// Sign-in requires an explicit click, so email-security link scanners cannot consume the single-use token.
export default function Verify() {
  const [token, setToken] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const m = /token=([^&]+)/.exec(location.hash);
    if (m) setToken(decodeURIComponent(m[1]));
  }, []);

  async function go() {
    setBusy(true);
    const r = await fetch('/api/admin/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    if (r.ok) {
      history.replaceState(null, '', '/admin/verify');
      location.href = '/admin';
      return;
    }
    const d = await r.json().catch(() => ({}));
    setErr(d.error ?? 'Sign-in failed');
    setBusy(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gf-border bg-white p-6 space-y-4">
        <h1 className="text-xl font-medium">Confirm sign-in</h1>
        {token ? (
          <button className="gf-btn w-full" onClick={go} disabled={busy}>{busy ? 'Signing in…' : 'Sign in to dashboard'}</button>
        ) : (
          <p className="text-sm text-gf-error">This link is incomplete. Request a new one from the sign-in page.</p>
        )}
        {err ? <p className="text-sm text-gf-error">{err}</p> : null}
        <a href="/admin" className="block text-sm text-gf-accent">Back to sign-in</a>
      </div>
    </main>
  );
}
