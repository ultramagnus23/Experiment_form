'use client';
import { useState } from 'react';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await fetch('/api/admin/auth/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) setMsg(d.message);
    else setErr(d.error ?? 'Something went wrong');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-gf-border bg-white p-6 space-y-4">
        <h1 className="text-xl font-medium">Researcher sign-in</h1>
        <p className="text-sm text-gf-muted">Enter your authorised email address. We will send a single-use sign-in link.</p>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ashoka.edu.in" className="w-full rounded border border-gf-border px-3 py-2 text-sm" />
        <button className="gf-btn w-full" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
        {msg ? <p className="text-sm text-green-700">{msg}</p> : null}
        {err ? <p className="text-sm text-gf-error">{err}</p> : null}
      </form>
    </main>
  );
}
