/**
 * End-to-end test against a RUNNING server (default http://localhost:3000) and its database.
 * Run: DATABASE_URL=... BASE=http://localhost:3000 npx tsx tests/e2e/run.ts
 * Requires MAIL_TRANSPORT=file on the server and a fresh/empty database.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3000';
const ORIGIN = new URL(BASE).origin;
const OUTBOX = path.resolve('data/dev-outbox.log');
const FIX = path.resolve('tests/fixtures');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

let passed = 0, failed = 0;
function ok(cond: any, name: string, extra?: unknown) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (b: Buffer | ArrayBuffer) => crypto.createHash('sha256').update(Buffer.from(b as any)).digest('hex');

class Client {
  jar = new Map<string, string>();
  async req(p: string, init: RequestInit & { json?: unknown; origin?: boolean } = {}) {
    const headers: Record<string, string> = { ...(init.headers as any) };
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let body = init.body as any;
    if (init.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(init.json); }
    if (init.origin !== false && (init.method ?? 'GET') !== 'GET') headers.origin = ORIGIN;
    const res = await fetch(BASE + p, { ...init, headers, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v === '') this.jar.delete(k); else this.jar.set(k, v);
    }
    return res;
  }
  async json(p: string, init: any = {}) { const r = await this.req(p, init); let d: any = null; try { d = await r.clone().json(); } catch {} return { status: r.status, data: d, res: r }; }
}

function lastLinkFor(email: string): string | null {
  if (!fs.existsSync(OUTBOX)) return null;
  const lines = fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return lines.reverse().find((l) => l.to === email)?.link ?? null;
}

async function participantTo(c: Client, upTo: 'consent' | 'eligibility' | 'demographics' | 'instructions' | 'begin', demo: any = {}) {
  await c.json('/api/p/start', { method: 'POST' });
  if (upTo === 'consent') return;
  await c.json('/api/p/consent', { method: 'POST', json: { agree: true } });
  if (upTo === 'eligibility') return;
  await c.json('/api/p/eligibility', { method: 'POST', json: { meets: true } });
  if (upTo === 'demographics') return;
  await c.json('/api/p/demographics', { method: 'POST', json: { age: 20, genderChoice: 'woman', major: 'Psychology', ...demo } });
  if (upTo === 'instructions') return;
  return c.json('/api/p/begin', { method: 'POST' });
}

(async () => {
  await db.connect();
  const admin = new Client();

  console.log('\n[1] Admin access control');
  ok((await admin.json('/api/admin/stats')).status === 401, 'stats API rejects unauthenticated');
  for (const p of ['/api/admin/responses', '/api/admin/settings', '/api/admin/audio', '/api/admin/audit', '/api/admin/export/complete', '/api/admin/retention', '/api/admin/audio/version/1'])
    ok((await admin.json(p)).status === 401, `${p} rejects unauthenticated`);
  const adminPage = await (await admin.req('/admin')).text();
  ok(adminPage.includes('Researcher sign-in') && !adminPage.includes('Research dashboard'), '/admin shows login only, not dashboard');
  const noOrigin = await admin.json('/api/admin/auth/request', { method: 'POST', json: { email: 'x@y.com' }, origin: false });
  ok(noOrigin.status === 403, 'auth request without Origin rejected (CSRF)');

  const rUn = await admin.json('/api/admin/auth/request', { method: 'POST', json: { email: 'intruder@example.com' } });
  const rOk = await admin.json('/api/admin/auth/request', { method: 'POST', json: { email: 'Gunn.Malhotra_ug2024@ashoka.edu.in' } });
  ok(rUn.status === 200 && rOk.status === 200 && rUn.data.message === rOk.data.message, 'identical response for authorised and unauthorised (no enumeration)');
  await sleep(500);
  ok(lastLinkFor('intruder@example.com') === null, 'no link issued to unauthorised email');
  const link = lastLinkFor('gunn.malhotra_ug2024@ashoka.edu.in');
  ok(!!link && link.includes('/admin/verify#token='), 'link issued to authorised email (token in URL fragment)');
  const token = decodeURIComponent(link!.split('#token=')[1]);
  ok((await admin.json('/api/admin/auth/verify', { method: 'POST', json: { token: 'x'.repeat(43) } })).status === 401, 'bogus token rejected');
  ok((await admin.json('/api/admin/auth/verify', { method: 'POST', json: { token }, origin: false })).status === 403, 'verify without Origin rejected');
  const v = await admin.json('/api/admin/auth/verify', { method: 'POST', json: { token } });
  ok(v.status === 200 && admin.jar.has('admin_session'), 'valid link signs in');
  ok((await new Client().json('/api/admin/auth/verify', { method: 'POST', json: { token } })).status === 401, 'token is single-use');
  ok((await admin.json('/api/admin/me')).data?.email === 'gunn.malhotra_ug2024@ashoka.edu.in', 'session works');
  ok((await admin.json('/api/admin/settings', { method: 'PUT', json: { target_sample_size: 40 }, origin: false })).status === 403, 'admin POST/PUT without Origin rejected');
  const adminPage2 = await (await admin.req('/admin')).text();
  ok(adminPage2.includes('Research dashboard') || adminPage2.includes('Sign out'), '/admin shows dashboard when signed in');

  // A session for an email that is later removed from the allowlist must not work: emulate with a forged DB session
  await db.query(`INSERT INTO admin_sessions(email, token_hash, expires_at) VALUES ('stranger@example.com', $1, now()+interval '1 hour')`, [crypto.createHash('sha256').update('forged').digest('hex')]);
  const forged = new Client(); forged.jar.set('admin_session', 'forged');
  ok((await forged.json('/api/admin/stats')).status === 401, 'session for non-allowlisted email is rejected');
  const bogusCookie = new Client(); bogusCookie.jar.set('admin_session', 'nonsense');
  ok((await bogusCookie.json('/api/admin/stats')).status === 401, 'garbage session cookie rejected');

  console.log('\n[2] Experiment closed until configured');
  const closedC = new Client();
  const closed = await closedC.json('/api/p/start', { method: 'POST' });
  ok(closed.data.stage === 'closed', 'participants see closed state while disabled', closed.data);
  ok(closedC.jar.size === 0, 'no participant created / no cookie while closed');
  ok((await admin.json('/api/admin/settings', { method: 'PUT', json: { experiment_enabled: true } })).status === 400, 'cannot enable without both audio files');

  console.log('\n[3] Audio upload');
  const up = async (slot: string, file: string, mime: string, as?: string) => {
    const fd = new FormData();
    fd.append('file', new File([fs.readFileSync(path.join(FIX, file))], as ?? file, { type: mime }));
    return admin.json(`/api/admin/audio/${slot}`, { method: 'POST', body: fd });
  };
  ok((await up('crowd', 'fake.mp3', 'audio/mpeg')).status === 400, 'fake .mp3 (not audio) rejected');
  ok((await up('crowd', 'crowd.wav', 'audio/wav', 'crowd.exe')).status === 400, 'unsupported extension rejected');
  ok((await up('crowd', 'brown.mp3', 'audio/mpeg', 'renamed.wav')).status === 400, 'content/extension mismatch rejected');
  ok((await up('other', 'crowd.wav', 'audio/wav')).status === 404, 'unknown slot rejected');
  const u1 = await up('crowd', 'crowd.wav', 'audio/wav');
  ok(u1.status === 200 && Math.abs(u1.data.version.duration_seconds - 6) < 0.2, 'WAV uploaded with detected duration ≈ 6s', u1.data);
  const u2 = await up('brown', 'brown.mp3', 'audio/mpeg');
  ok(u2.status === 200 && Math.abs(u2.data.version.duration_seconds - 6) < 0.5, 'MP3 uploaded with detected duration', u2.data);
  const crowdSha = sha(fs.readFileSync(path.join(FIX, 'crowd.wav')));
  const brownV1Sha = sha(fs.readFileSync(path.join(FIX, 'brown.mp3')));
  const list = await admin.json('/api/admin/audio');
  ok(list.data.active.crowd?.original_filename === 'crowd.wav' && list.data.active.brown?.original_filename === 'brown.mp3', 'active versions listed with filenames');
  const prev = await admin.req(`/api/admin/audio/version/${list.data.active.crowd.id}`, { headers: { range: 'bytes=0-99' } });
  ok(prev.status === 206 && (await prev.arrayBuffer()).byteLength === 100, 'admin preview supports Range');

  console.log('\n[4] Settings validation + enable');
  ok((await admin.json('/api/admin/settings', { method: 'PUT', json: { playback_volume: 0.9, volume_cap: 0.5 } })).status === 400, 'volume above cap rejected');
  ok((await admin.json('/api/admin/settings', { method: 'PUT', json: { bogus: 1 } })).status === 400, 'unknown setting rejected');
  ok((await admin.json('/api/admin/settings', { method: 'PUT', json: { playback_volume: 0.25, volume_cap: 0.4, study_location: 'AC04 302' } })).status === 200, 'volume + location saved');
  ok((await admin.json('/api/admin/settings', { method: 'PUT', json: { experiment_enabled: true } })).status === 200, 'experiment enabled');

  console.log('\n[5] Participant: decline / ineligible / ordering');
  const dec = new Client();
  await participantTo(dec, 'consent');
  ok((await dec.json('/api/p/eligibility', { method: 'POST', json: { meets: true } })).status === 409, 'cannot skip consent');
  ok((await dec.json('/api/p/consent', { method: 'POST', json: {} })).status === 400, 'consent requires an explicit answer');
  const d1 = await dec.json('/api/p/consent', { method: 'POST', json: { agree: false } });
  ok(d1.data.stage === 'declined', 'declining ends participation');
  ok((await dec.json('/api/p/demographics', { method: 'POST', json: { age: 20, genderChoice: 'man', major: 'x' } })).status === 409, 'no further data accepted after decline');
  const dr = (await db.query(`SELECT * FROM participants WHERE status='declined'`)).rows[0];
  ok(dr && dr.age === null && dr.major === null && dr.condition === null, 'declined participant has no other data and no condition');

  const inel = new Client();
  await participantTo(inel, 'eligibility');
  ok((await inel.json('/api/p/demographics', { method: 'POST', json: { age: 20, genderChoice: 'man', major: 'x' } })).status === 409, 'cannot skip eligibility');
  ok((await inel.json('/api/p/eligibility', { method: 'POST', json: { meets: false } })).data.stage === 'ineligible', 'failing eligibility ends participation');
  ok((await inel.json('/api/p/begin', { method: 'POST' })).status === 409, 'ineligible participant cannot be allocated');

  const none = new Client();
  ok((await none.json('/api/p/begin', { method: 'POST' })).status === 401, 'no session → cannot begin');
  ok((await none.json('/api/p/audio')).status === 401, 'no session → no audio');

  console.log('\n[6] Participant: demographics validation');
  const dm = new Client();
  await participantTo(dm, 'demographics');
  const bad = async (j: any) => (await dm.json('/api/p/demographics', { method: 'POST', json: j })).status;
  ok((await bad({ age: 17, genderChoice: 'man', major: 'x' })) === 400, 'age 17 rejected');
  ok((await bad({ age: 23, genderChoice: 'man', major: 'x' })) === 400, 'age 23 rejected');
  ok((await bad({ age: 20.5, genderChoice: 'man', major: 'x' })) === 400, 'fractional age rejected');
  ok((await bad({ age: '20', genderChoice: 'man', major: 'x' })) === 400, 'string age rejected');
  ok((await bad({ age: 20, genderChoice: 'man', major: '   ' })) === 400, 'blank major rejected');
  ok((await bad({ age: 20, genderChoice: 'self_describe', genderOther: ' ', major: 'x' })) === 400, 'empty self-described gender rejected');
  ok((await bad({ age: 20, genderChoice: 'alien', major: 'x' })) === 400, 'invalid gender option rejected');
  ok((await bad({ age: 20, major: 'x' })) === 400, 'missing gender rejected');
  const good = await dm.json('/api/p/demographics', { method: 'POST', json: { age: 22, genderChoice: 'self_describe', genderOther: 'Agender', major: '=cmd|\' /C calc\'!A0' } });
  ok(good.data.stage === 'instructions', 'valid demographics accepted (incl. self-described gender)');
  const drow = (await db.query(`SELECT age, gender FROM participants WHERE status='demographics_done'`)).rows[0];
  ok(drow.age === 22 && drow.gender === 'Agender', 'demographics stored correctly');

  console.log('\n[7] Allocation, audio gating, trial flow (one participant in detail)');
  ok((await dm.json('/api/p/audio')).status === 409, 'audio NOT available before the experimental stage');
  ok((await dm.json('/api/p/trial-start', { method: 'POST', json: { audioStatus: 'started' } })).status === 409, 'cannot start trial before allocation');
  ok((await dm.json('/api/p/submit', { method: 'POST', json: { decision: 'yes_share', latencyMs: 500 } })).status === 409, 'cannot submit before allocation');
  const nc = (await db.query('SELECT count(*)::int n FROM participants WHERE condition IS NOT NULL')).rows[0].n;
  ok(nc === 0, 'nobody allocated before reaching the experimental stage');
  const b1 = await dm.json('/api/p/begin', { method: 'POST' });
  ok(b1.status === 200 && b1.data.stage === 'trial', 'begin → trial stage');
  ok(!JSON.stringify(b1.data).match(/condition|crowd|brown|audio_type|framing"/i), 'trial payload leaks no condition/audio/framing label', b1.data);
  ok(Math.abs(b1.data.trial.volume - 0.25) < 1e-9, 'standardised volume delivered');
  const prow = (await db.query(`SELECT * FROM participants WHERE id = (SELECT id FROM participants WHERE status='assigned')`)).rows[0];
  ok(prow.condition >= 1 && prow.condition <= 4 && prow.assigned_at && prow.allocation_seq === 0, 'condition + timestamp recorded', prow);
  const again = await dm.json('/api/p/begin', { method: 'POST' });
  const rows2 = (await db.query(`SELECT condition FROM participants WHERE id=$1`, [prow.id])).rows;
  ok(again.status === 200 && rows2[0].condition === prow.condition, 'repeat begin / reload does not re-randomise');
  ok((await dm.json('/api/p/state')).data.trial.baseline.length === 2, 'state restored after reload');
  ok((await db.query('SELECT count(*)::int n FROM allocations')).rows[0].n === 1, 'exactly one allocation row');
  const au = await dm.req('/api/p/audio');
  const auBytes = await au.arrayBuffer();
  const expectSha = prow.audio_type === 'crowd' ? crowdSha : brownV1Sha;
  ok(au.status === 200 && sha(auBytes) === expectSha, `serves the correct track for audio_type=${prow.audio_type}`);
  ok(!/filename|attachment/i.test(au.headers.get('content-disposition') ?? ''), 'audio response exposes no filename');
  ok(prow.audio_version_id !== null && prow.playback_volume !== null, 'audio version + volume pinned at allocation');

  await dm.json('/api/p/audio-event', { method: 'POST', json: { kind: 'tap_required' } });
  ok((await dm.json('/api/p/audio-event', { method: 'POST', json: { kind: 'evil' } })).status === 400, 'invalid audio event rejected');
  ok((await db.query('SELECT count(*)::int n FROM audio_events')).rows[0].n === 1, 'audio event recorded');

  const ts = await dm.json('/api/p/trial-start', { method: 'POST', json: { audioStatus: 'started_after_tap' } });
  ok(ts.data.ok && ts.data.resumed === false, 'trial start recorded (first display)');
  await sleep(1200);
  ok((await dm.json('/api/p/submit', { method: 'POST', json: { decision: 'maybe', latencyMs: 1200 } })).status === 400, 'invalid decision rejected');
  ok((await dm.json('/api/p/submit', { method: 'POST', json: { decision: 'yes_share', latencyMs: -5 } })).status === 400, 'negative latency rejected');
  ok((await dm.json('/api/p/submit', { method: 'POST', json: { latencyMs: 1200 } })).status === 400, 'submission requires a decision');
  const [s1, s2] = await Promise.all([
    dm.json('/api/p/submit', { method: 'POST', json: { decision: 'yes_share', latencyMs: 1230, audioInterrupted: false } }),
    dm.json('/api/p/submit', { method: 'POST', json: { decision: 'no_keep_private', latencyMs: 1230 } }),
  ]);
  ok([s1.status, s2.status].sort().join() === '200,409', 'concurrent double-submit: exactly one succeeds', [s1.status, s2.status]);
  const done = (await db.query(`SELECT * FROM participants WHERE id=$1`, [prow.id])).rows[0];
  ok(done.status === 'completed' && done.latency_ms === 1230 && Number(done.latency_seconds) === 1.23, 'latency stored in ms and seconds');
  ok(done.latency_source === 'client_monotonic' && done.server_elapsed_ms > 1000 && done.server_elapsed_ms < 2500 && done.flags.length === 0, 'server elapsed consistent, no flags', done);
  ok(done.audio_status === 'started_after_tap' && done.submitted_at, 'audio status + submit timestamp stored');
  ok((await dm.json('/api/p/submit', { method: 'POST', json: { decision: 'yes_share', latencyMs: 900 } })).status === 409, 'later resubmission blocked');
  ok((await dm.json('/api/p/audio')).status === 409, 'audio no longer served after completion');
  ok((await dm.json('/api/p/begin', { method: 'POST' })).data.stage === 'complete' || (await dm.json('/api/p/state')).data.stage === 'complete', 'participant stays on completion page');
  const st = JSON.stringify((await dm.json('/api/p/state')).data);
  ok(st === '{"stage":"complete"}', 'completion state reveals nothing', st);

  console.log('\n[8] Latency quality flags');
  const fl = new Client();
  await participantTo(fl, 'begin');
  await fl.json('/api/p/trial-start', { method: 'POST', json: { audioStatus: 'started' } });
  await sleep(150);
  await fl.json('/api/p/submit', { method: 'POST', json: { decision: 'no_keep_private', latencyMs: 9000, audioInterrupted: true } });
  const f1 = (await db.query(`SELECT flags, latency_ms FROM participants WHERE decision='no_keep_private' ORDER BY submitted_at DESC LIMIT 1`)).rows[0];
  ok(f1.flags.includes('timing_mismatch') && f1.flags.includes('audio_interrupted') && f1.latency_ms === 9000, 'timing mismatch + audio interruption flagged', f1);
  const rs = new Client();
  await participantTo(rs, 'begin');
  await rs.json('/api/p/trial-start', { method: 'POST', json: { audioStatus: 'started' } });
  await sleep(700);
  const ts2 = await rs.json('/api/p/trial-start', { method: 'POST', json: { audioStatus: 'started_after_tap' } });
  ok(ts2.data.resumed === true, 'second trial-start marks the trial as resumed');
  await rs.json('/api/p/submit', { method: 'POST', json: { decision: 'yes_share', latencyMs: 50 } });
  const f2 = (await db.query(`SELECT flags, latency_ms, latency_source FROM participants WHERE trial_resumed`)).rows[0];
  ok(f2.latency_source === 'server_resumed' && f2.flags.includes('resumed_trial') && f2.latency_ms >= 700, 'resumed trial uses server elapsed from first display and is flagged', f2);
  const nt = new Client();
  await participantTo(nt, 'begin');
  await nt.json('/api/p/submit', { method: 'POST', json: { decision: 'yes_share', latencyMs: 2500 } });
  ok((await db.query(`SELECT flags FROM participants WHERE flags @> ARRAY['trial_start_unacknowledged']`)).rowCount === 1, 'submit without trial-start ack is accepted but flagged');

  console.log('\n[9] Simulation: 44 more participants, 12 concurrently');
  const sims: { c: Client; i: number }[] = [];
  for (let i = 0; i < 44; i++) sims.push({ c: new Client(), i });
  const runSim = async ({ c, i }: { c: Client; i: number }) => {
    await participantTo(c, 'instructions', { age: 18 + (i % 5), genderChoice: ['woman', 'man', 'non_binary', 'prefer_not_to_say'][i % 4], major: ['Psychology', 'Economics', 'CS', 'Biology'][i % 4] });
    const b = await c.json('/api/p/begin', { method: 'POST' });
    await c.req('/api/p/audio').then((r) => r.arrayBuffer());
    await c.json('/api/p/trial-start', { method: 'POST', json: { audioStatus: 'started' } });
    await sleep(60 + (i % 7) * 20);
    return c.json('/api/p/submit', { method: 'POST', json: { decision: i % 3 === 0 ? 'no_keep_private' : 'yes_share', latencyMs: 100 + (i % 7) * 20 } });
  };
  for (let i = 0; i < 32; i += 1) await runSim(sims[i]);
  await Promise.all(sims.slice(32).map(runSim));

  const total = (await db.query(`SELECT count(*)::int n FROM participants WHERE condition IS NOT NULL`)).rows[0].n;
  const per = (await db.query(`SELECT condition, count(*)::int n FROM participants WHERE condition IS NOT NULL GROUP BY 1 ORDER BY 1`)).rows;
  console.log('   allocated:', total, per.map((r) => `C${r.condition}=${r.n}`).join(' '));
  ok(total === 48, 'every eligible participant who began was allocated (4 detailed + 44 simulated)', total);
  ok(per.length === 4 && per.every((r) => r.n === total / 4), 'perfect balance: equal n per condition (permuted blocks)', per);
  const blocks = (await db.query(`SELECT block_index, array_agg(condition ORDER BY seq) conds, count(*)::int n FROM allocations GROUP BY 1 ORDER BY 1`)).rows;
  ok(blocks.every((b) => b.n === 4 && [...b.conds].sort().join() === '1,2,3,4'), 'every block of 4 contains each condition exactly once', blocks.slice(0, 3));
  ok(new Set(blocks.map((b) => b.conds.join(''))).size > 3, 'orders vary across blocks');
  const dup = (await db.query(`SELECT count(*)::int n FROM (SELECT participant_id FROM allocations GROUP BY 1 HAVING count(*)>1) x`)).rows[0].n;
  ok(dup === 0, 'no participant allocated twice');
  const mapOk = (await db.query(`SELECT count(*)::int n FROM participants WHERE condition IS NOT NULL AND NOT (
      (condition=1 AND framing='positive' AND audio_type='crowd') OR (condition=2 AND framing='positive' AND audio_type='brown') OR
      (condition=3 AND framing='negative' AND audio_type='crowd') OR (condition=4 AND framing='negative' AND audio_type='brown'))`)).rows[0].n;
  ok(mapOk === 0, 'condition ↔ framing ↔ audio mapping correct for all rows');
  const aud = (await db.query(`SELECT count(*)::int n FROM participants p JOIN audio_versions v ON v.id=p.audio_version_id WHERE p.condition IS NOT NULL AND v.slot <> p.audio_type`)).rows[0].n;
  ok(aud === 0, 'every participant is pinned to an audio file of the correct slot');

  console.log('\n[10] Audio replacement keeps history');
  const before = (await db.query(`SELECT id, audio_version_id FROM participants WHERE audio_type='brown' ORDER BY created_at LIMIT 1`)).rows[0];
  const rep = await up('brown', 'brown_alt.m4a', 'audio/mp4');
  ok(rep.status === 200, 'M4A replacement accepted', rep.data);
  const after = (await db.query(`SELECT audio_version_id FROM participants WHERE id=$1`, [before.id])).rows[0];
  ok(after.audio_version_id === before.audio_version_id, 'earlier participants keep their original audio version');
  const hist = await admin.json('/api/admin/audio');
  ok(hist.data.history.length === 3 && hist.data.active.brown.original_filename === 'brown_alt.m4a', 'history retained, new version active');
  const old = (await db.query('SELECT count(*)::int n FROM audio_versions WHERE slot=$1 AND NOT is_active', ['brown'])).rows[0].n;
  ok(old === 1, 'old file record kept (inactive)');
  const nw = new Client();
  await participantTo(nw, 'begin');
  const nwRow = (await db.query(`SELECT audio_type, audio_version_id FROM participants ORDER BY created_at DESC LIMIT 1`)).rows[0];
  const newBytes = await (await nw.req('/api/p/audio')).arrayBuffer();
  const expect = nwRow.audio_type === 'brown' ? sha(fs.readFileSync(path.join(FIX, 'brown_alt.m4a'))) : crowdSha;
  ok(sha(newBytes) === expect, 'new participants receive the newest file');
  await nw.json('/api/p/trial-start', { method: 'POST', json: { audioStatus: 'started' } });
  await sleep(100);
  await nw.json('/api/p/submit', { method: 'POST', json: { decision: 'yes_share', latencyMs: 120 } });

  console.log('\n[11] Method lock, disable');
  ok((await admin.json('/api/admin/settings', { method: 'PUT', json: { allocation_method: 'simple' } })).status === 409, 'allocation method locked after first allocation');
  ok((await admin.json('/api/admin/settings', { method: 'PUT', json: { experiment_enabled: false } })).status === 200, 'experiment disabled');
  const late = new Client();
  ok((await late.json('/api/p/start', { method: 'POST' })).data.stage === 'closed', 'new participants blocked when disabled');
  const midway = new Client();
  await admin.json('/api/admin/settings', { method: 'PUT', json: { experiment_enabled: true } });
  await participantTo(midway, 'instructions');
  await admin.json('/api/admin/settings', { method: 'PUT', json: { experiment_enabled: false } });
  ok((await midway.json('/api/p/begin', { method: 'POST' })).status === 503, 'allocation blocked when disabled (participant not randomised)');
  ok((await db.query(`SELECT condition FROM participants WHERE status='demographics_done'`)).rows[0].condition === null, 'blocked participant has no condition');
  await admin.json('/api/admin/settings', { method: 'PUT', json: { experiment_enabled: true } });
  ok((await midway.json('/api/p/begin', { method: 'POST' })).status === 200, 'participant can continue after re-enable');

  console.log('\n[12] Analytics reflect stored data');
  const stats = (await admin.json('/api/admin/stats')).data;
  const dbDone = (await db.query(`SELECT count(*)::int n FROM participants WHERE status='completed'`)).rows[0].n;
  ok(stats.overview.completed === dbDone && stats.analysed === dbDone, `completed count matches DB (${dbDone})`);
  ok(stats.overview.declined === 1 && stats.overview.ineligible === 1, 'declined / ineligible counted');
  ok(stats.overview.opened === (await db.query('SELECT count(*)::int n FROM participants')).rows[0].n, 'opened = all participant rows');
  const dbCond = (await db.query(`SELECT condition, count(*)::int n, sum((decision='yes_share')::int)::int y, avg(latency_ms)::float m FROM participants WHERE status='completed' GROUP BY 1 ORDER BY 1`)).rows;
  ok(stats.conditions.every((c: any) => { const r = dbCond.find((x) => x.condition === c.condition); return r && r.n === c.n && r.y === c.yes && Math.abs(r.m - c.meanMs) < 0.01; }), 'per-condition n / yes / mean latency match independent SQL', { dbCond, api: stats.conditions.map((c: any) => [c.n, c.yes, c.meanMs]) });
  ok(stats.framing.positive.n + stats.framing.negative.n === dbDone && stats.noise.crowd.n + stats.noise.brown.n === dbDone, 'framing and noise groups partition the sample');
  const fl2 = (await admin.json('/api/admin/stats?exclude_flagged=1')).data;
  ok(fl2.analysed === dbDone - stats.overview.flagged, 'exclude-flagged toggle removes flagged trials');
  ok(stats.demographics.ages.length > 0 && stats.demographics.majors.length > 0, 'demographic distributions present');

  console.log('\n[13] Exports');
  const exp = async (k: string) => { const r = await admin.req(`/api/admin/export/${k}`); return { status: r.status, text: await r.text(), ct: r.headers.get('content-type'), cd: r.headers.get('content-disposition') }; };
  const e1 = await exp('complete');
  const lines1 = e1.text.replace(/^﻿/, '').trim().split('\r\n');
  ok(e1.status === 200 && e1.ct!.includes('text/csv') && e1.cd!.includes('attachment'), 'complete CSV served as attachment');
  const header = lines1[0].split(',');
  for (const col of ['participant_id', 'condition', 'framing', 'audio_type', 'decision', 'latency_ms', 'latency_seconds', 'submitted_at', 'audio_status', 'audio_version_id', 'age', 'gender', 'major'])
    ok(header.includes(col), `complete CSV has column ${col}`);
  ok(lines1.length - 1 === (await db.query('SELECT count(*)::int n FROM participants')).rows[0].n, 'complete CSV has one row per participant');
  ok(!/admin|token|email|session|secret/i.test(lines1[0]), 'no authentication/admin columns in export');
  ok(e1.text.includes("'=cmd|"), 'formula-injection payload neutralised in CSV');
  ok(!/\n=cmd|,=cmd/.test(e1.text), 'no cell begins with "=" in CSV');
  const e2 = await exp('conditions');
  ok(e2.text.replace(/^﻿/, '').trim().split('\r\n').length === 5, 'condition CSV: header + 4 rows');
  const e3 = await exp('decision_times');
  ok(e3.text.split('\r\n')[0].includes('latency_ms') && e3.status === 200, 'decision-time CSV');
  const e4 = await exp('demographics');
  ok(e4.text.split('\r\n')[0].includes('major') && e4.status === 200, 'demographic CSV');
  ok((await admin.json('/api/admin/export/nope')).status === 404, 'unknown export 404');

  console.log('\n[14] Response management + retention + audit');
  const victim = (await db.query(`SELECT id FROM participants WHERE status='completed' LIMIT 1`)).rows[0].id;
  ok((await admin.json(`/api/admin/responses/${victim}`, { method: 'PATCH', json: { excluded: true } })).status === 400, 'exclusion requires a reason');
  ok((await admin.json(`/api/admin/responses/${victim}`, { method: 'PATCH', json: { excluded: true, reason: 'equipment fault' } })).status === 200, 'exclude with reason');
  ok((await admin.json('/api/admin/stats')).data.overview.excluded === 1, 'excluded record omitted from analysis counts');
  ok((await admin.json(`/api/admin/responses/${victim}`, { method: 'DELETE', json: { reason: 'withdrawal', confirmId: 'wrong' } })).status === 400, 'delete requires typed ID');
  ok((await admin.json(`/api/admin/responses/${victim}`, { method: 'DELETE', json: { reason: 'withdrawal requested', confirmId: victim } })).status === 200, 'delete with confirmation');
  ok((await db.query('SELECT 1 FROM participants WHERE id=$1', [victim])).rowCount === 0, 'record deleted');
  ok((await db.query('SELECT 1 FROM allocations WHERE condition IS NOT NULL AND participant_id IS NULL')).rowCount === 1, 'allocation log kept, unlinked from deleted participant');
  const ret = (await admin.json('/api/admin/retention')).data;
  ok(ret.retentionYears === 7 && ret.expired === 0, 'retention info (7 years, none expired yet)');
  ok((await admin.json('/api/admin/retention/delete', { method: 'POST', json: { confirm: 'nope' } })).status === 400, 'retention delete requires typed confirmation');
  // Back-date one record to prove expiry deletion works, and that a recent full export is required.
  const expiredId = (await db.query(`SELECT id FROM participants WHERE status='completed' LIMIT 1`)).rows[0].id;
  await db.query(`UPDATE participants SET created_at = now() - interval '8 years' WHERE id=$1`, [expiredId]);
  await db.query(`DELETE FROM admin_audit WHERE action='export'`);
  ok((await admin.json('/api/admin/retention/delete', { method: 'POST', json: { confirm: 'DELETE' } })).status === 409, 'deletion refused without a recent complete export');
  await exp('complete');
  const del = await admin.json('/api/admin/retention/delete', { method: 'POST', json: { confirm: 'DELETE' } });
  ok(del.status === 200 && del.data.deleted === 1, 'after export, only the >7-year-old record is deleted', del.data);
  const purge = await admin.json('/api/admin/retention/purge-sessions', { method: 'POST' });
  ok(purge.status === 200 && (await db.query('SELECT count(*)::int n FROM participants')).rows[0].n > 40, 'purging operational sessions leaves research data intact');
  const audit = (await admin.json('/api/admin/audit')).data.rows.map((r: any) => r.action);
  for (const a of ['login', 'audio_upload', 'setting_change', 'export', 'exclude_response', 'delete_response', 'retention_delete', 'purge_sessions'])
    ok(audit.includes(a), `audit log contains ${a}`);

  console.log('\n[15] Logout');
  await admin.json('/api/admin/auth/logout', { method: 'POST' });
  ok((await admin.json('/api/admin/stats')).status === 401, 'session invalid after logout');

  console.log('\n[16] Privacy: no IPs / user agents / emails in research tables');
  const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name IN ('participants','allocations','audio_events')`)).rows.map((r) => r.column_name);
  ok(!cols.some((c) => /^(ip|ip_address|remote_addr|user_agent|ua|email|name|full_name|phone|student_id)$/.test(c)), 'no IP / user-agent / email / name / phone / student-ID columns in research tables', cols);

  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
