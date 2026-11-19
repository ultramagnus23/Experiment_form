'use client';
import { useState } from 'react';

export default function PasswordLoginForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch('/api/admin/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, email, password }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      location.href = '/admin';
      return;
    }
    setPassword('');
    setErr(d.error ?? 'Something went wrong');
    setBusy(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-gf-border bg-white p-6 space-y-4">
        <h1 className="text-xl font-medium">Researcher sign-in</h1>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@ashoka.edu.in"
          className="w-full rounded border border-gf-border px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border border-gf-border px-3 py-2 text-sm"
        />
        <button className="gf-btn w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {err ? <p className="text-sm text-gf-error">{err}</p> : null}
      </form>
    </main>
  );
}
