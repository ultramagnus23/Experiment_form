// Non-mutating smoke test for a DEPLOYED site (creates no participants, needs no credentials).
// Usage: node tests/smoke/prod-smoke.mjs https://your-site.vercel.app
const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) { console.error('usage: node tests/smoke/prod-smoke.mjs <https://site>'); process.exit(2); }
let fail = 0;
const ok = (c, n, x) => { console.log(c ? '  ✓' : '  ✗', n, c ? '' : (x ?? '')); if (!c) fail++; };
const get = (p, init) => fetch(base + p, { redirect: 'manual', ...init });

console.log('Smoke test:', base);
ok(base.startsWith('https://'), 'served over HTTPS');
let r = await get('/experiment'); ok(r.status === 200, '/experiment loads', r.status);
ok((r.headers.get('x-frame-options') || '') === 'DENY' && r.headers.get('referrer-policy') === 'no-referrer', 'security headers present');
r = await get('/admin'); const t = await r.text(); ok(r.status === 200 && t.includes('Researcher sign-in') && !t.includes('Research dashboard'), '/admin shows only the login screen');
for (const p of ['/api/admin/stats', '/api/admin/responses', '/api/admin/settings', '/api/admin/audio', '/api/admin/audit', '/api/admin/export/complete', '/api/admin/retention'])
  { r = await get(p); ok(r.status === 401, `${p} → 401 when signed out`, r.status); }
r = await get('/api/p/audio'); ok(r.status === 401, '/api/p/audio → 401 without a participant session', r.status);
r = await get('/api/p/state'); const s = await r.json(); ok(r.status === 200 && ['consent', 'closed'].includes(s.stage) && !JSON.stringify(s).match(/crowd|brown|condition/i), '/api/p/state reveals nothing about conditions', s);
r = await fetch(base + '/api/admin/auth/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.com' }) });
ok(r.status === 403, 'admin login request without Origin is rejected (CSRF)', r.status);
r = await fetch(base.replace('https://', 'http://') + '/experiment', { redirect: 'manual' }).catch(() => null);
ok(!r || [301, 302, 307, 308].includes(r.status), 'plain http redirects to https (or is refused)', r && r.status);
console.log(fail ? `\n${fail} FAILED` : '\nAll smoke checks passed');
process.exit(fail ? 1 : 0);
