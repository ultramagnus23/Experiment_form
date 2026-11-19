/** Real-browser test (system Chrome via playwright-core). Needs the server running, enabled, with audio uploaded. */
import { chromium, Page } from 'playwright-core';
import pg from 'pg';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
let passed = 0, failed = 0;
const ok = (c: any, n: string, x?: unknown) => { c ? (passed++, console.log('  ✓', n)) : (failed++, console.log('  ✗', n, x !== undefined ? JSON.stringify(x) : '')); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const INIT = `
  window.__log = [];
  const AC = window.AudioContext;
  window.AudioContext = class extends AC { constructor(...a){ super(...a); window.__log.push({e:'ctx_created', t: performance.now(), page: location.pathname}); window.__ctx = this; } };
  const S = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function(...a){ window.__log.push({e:'start', loop: this.loop, dur: this.buffer && this.buffer.duration, t: performance.now()}); return S.apply(this,a); };
  const T = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function(...a){ window.__log.push({e:'stop', t: performance.now()}); return T.apply(this,a); };
`;

async function toTrial(page: Page, major = 'Psychology') {
  await page.goto(BASE + '/experiment');
  await page.getByText('Informed Consent Script').waitFor();
  await page.getByLabel('Yes, I agree to participate.').check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Eligibility').first().waitFor();
  await page.getByLabel('Yes, I meet all three criteria.').check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Demographic Details').waitFor();
}

(async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

  console.log('\n[A] Full participant journey in a real browser');
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

  await page.goto(BASE + '/experiment');
  await page.getByText('Informed Consent Script').waitFor();
  await page.screenshot({ path: `${SHOTS}/1-consent.png`, fullPage: false });
  const txt = await page.innerText('body');
  for (const s of ['Akshita Sinha, Gunn Malhotra', 'AC04 302', '9971228718', 'AUHREC', 'auhrec@ashoka.edu.in', 'seven years', 'Page 1 of 5']) ok(txt!.includes(s), `consent page contains "${s}"`);
  ok(txt!.includes('AC04 302') && txt!.includes('Study Location'), 'configured study location is displayed');
  ok(!txt!.includes('Jotform'), 'consent text does not claim Jotform is used');

  // Required consent
  await page.getByRole('button', { name: 'Next' }).click();
  ok(await page.getByText('This is a required question').isVisible(), 'Next without an answer shows "required" error');
  await page.getByLabel('Yes, I agree to participate.').check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Eligibility').first().waitFor();
  ok((await page.innerText('body'))!.includes('Page 2 of 5'), 'progress indicator advances');
  await page.screenshot({ path: `${SHOTS}/2-eligibility.png` });
  await page.getByLabel('Yes, I meet all three criteria.').check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Demographic Details').waitFor();

  // Demographics validation
  await page.getByRole('button', { name: 'Next' }).click();
  ok((await page.getByText('This is a required question').count()) === 3, 'all three demographic fields are required');
  await page.getByLabel('Age', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Next' }).click();
  ok(await page.getByText('Age must be a whole number between 18 and 22').isVisible(), 'age outside 18–22 blocked');
  await page.getByLabel('Age', { exact: true }).fill('20');
  await page.getByLabel('Woman', { exact: true }).check();
  await page.getByLabel('Major', { exact: true }).fill('Psychology');
  await page.screenshot({ path: `${SHOTS}/3-demographics.png` });

  ok(((await page.evaluate('window.__log')) as any[]).length === 0, 'no audio context exists on consent/eligibility/demographics');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Instructions').first().waitFor();
  ok(((await page.evaluate('window.__log')) as any[]).length === 0, 'no audio context on the instructions page');
  ok((await page.innerText('body'))!.includes('Once you submit, you cannot go back.'), 'instructions text present');
  await page.screenshot({ path: `${SHOTS}/4-instructions.png` });

  // Back button must not leave/step back
  await page.goBack().catch(() => {});
  await sleep(300);
  ok(page.url().includes('/experiment') && (await page.innerText('body'))!.includes('Instructions'), 'browser Back does not navigate away or go to an earlier page');

  // Enter the experimental page
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Will you share this technique?').waitFor({ timeout: 10000 });
  const t0 = Date.now();
  const log = (await page.evaluate('window.__log')) as any[];
  const created = log.find((l) => l.e === 'ctx_created');
  const started = log.find((l) => l.e === 'start' && l.dur > 1); // skip the 1-sample silent iOS unlock tick
  ok(created && started, 'audio context created and a source started on entering the experimental page', log);
  ok(started?.loop === true, 'source is set to loop (seamless looping)');
  ok(started && Math.abs(started.dur - 6) < 0.3, 'decoded buffer is the uploaded track (~6 s)', started);
  const state = await page.evaluate('({s: window.__ctx.state, ct: window.__ctx.currentTime})') as any;
  ok(state.s === 'running' && state.ct > 0.1, 'audio clock is running', state);
  ok((await page.locator('audio, video, [controls]').count()) === 0, 'no <audio>/<video>/controls element in the DOM (no player, seek bar, buttons)');
  const body = (await page.innerText('body'))!;
  ok(!/crowd|brown|noise|condition|\.mp3|\.wav/i.test(body), 'page reveals no sound category / filename / condition');
  ok(body.includes('You are taking a difficult course graded on a strict curve') && body.includes('25% increase in your exam score'), 'baseline scenario shown');
  const pos = 'If you share this technique, your classmates will gain higher scores and improve their academic standing in class.';
  const neg = 'If you do not share this technique, your classmates will miss out on higher scores and academic standing.';
  ok((body.includes(pos) ? 1 : 0) + (body.includes(neg) ? 1 : 0) === 1, 'exactly ONE framing sentence is displayed');
  ok(body.includes('Yes, share.') && body.includes('No, keep private.'), 'both response options displayed');
  await page.screenshot({ path: `${SHOTS}/5-trial.png` });
  const row = (await db.query(`SELECT * FROM participants ORDER BY created_at DESC LIMIT 1`)).rows[0];
  ok(row.trial_started_at && row.audio_status === 'started', 'server recorded trial start + audio started (via the Next-click gesture)', row.audio_status);
  ok(body.includes(row.framing === 'positive' ? pos : neg), 'displayed framing matches the stored condition');

  // Submit without choosing
  await sleep(1400);
  await page.getByRole('button', { name: 'Submit' }).click();
  ok(await page.getByText('This is a required question').isVisible(), 'cannot submit without a decision');
  await sleep(600);
  await page.getByLabel('No, keep private.').check();
  const tClick = Date.now();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByText('Your response has been recorded. Thank you for participating in this study.').waitFor();
  const wall = Date.now() - t0;
  const after = (await page.evaluate('window.__log')) as any[];
  ok(after.some((l) => l.e === 'stop'), 'audio source stopped on submission');
  ok((await page.evaluate('window.__ctx.state')) === 'closed', 'audio context closed after submission');
  const done = (await db.query(`SELECT * FROM participants WHERE id=$1`, [row.id])).rows[0];
  ok(done.status === 'completed' && done.decision === 'no_keep_private', 'decision stored');
  ok(done.latency_ms >= 2000 && done.latency_ms <= wall + 100, `latency measured by browser timer is plausible (${done.latency_ms} ms; ≥2000 expected, page wall time ${wall} ms)`);
  ok(done.latency_source === 'client_monotonic' && done.flags.length === 0 && Math.abs(done.server_elapsed_ms - done.latency_ms) < 500, `server elapsed agrees with browser timer (${done.server_elapsed_ms} vs ${done.latency_ms})`, done.flags);
  const finalText = (await page.innerText('body'))!;
  ok(!/crowd|brown|positive|negative|no, keep|yes, share|ms|second/i.test(finalText), 'completion page shows no condition/decision/time');
  await page.screenshot({ path: `${SHOTS}/6-complete.png` });
  await page.reload();
  await page.getByText('Your response has been recorded').waitFor();
  ok(true, 'reloading after completion still shows the completion page (no second attempt)');
  ok(errors.filter((e) => !/favicon/.test(e) && !/status of 404/.test(e)).length === 0, 'no console/page errors (favicon 404 ignored)', errors);

  console.log('\n[B] Reload mid-trial: tap-to-resume, flagged');
  const ctx2 = await browser.newContext();
  await ctx2.addInitScript(INIT);
  const p2 = await ctx2.newPage();
  await toTrial(p2);
  await p2.getByLabel('Age', { exact: true }).fill('19');
  await p2.getByLabel('Man', { exact: true }).check();
  await p2.getByLabel('Major', { exact: true }).fill('Economics');
  await p2.getByRole('button', { name: 'Next' }).click();
  await p2.getByRole('button', { name: 'Next' }).click();
  await p2.getByText('Will you share this technique?').waitFor();
  const cBefore = (await db.query(`SELECT condition FROM participants ORDER BY created_at DESC LIMIT 1`)).rows[0].condition;
  p2.on('dialog', (d) => d.accept());
  await p2.reload({ waitUntil: 'domcontentloaded' });
  await p2.getByText('Tap once to start the experiment audio').waitFor();
  ok(true, 'after reload, the participant is asked to tap once to restart audio');
  ok(((await p2.evaluate('window.__log')) as any[]).length === 0, 'no audio started without a user gesture');
  await p2.screenshot({ path: `${SHOTS}/7-tap.png` });
  await p2.getByRole('button', { name: 'Start' }).click();
  await p2.getByText('Will you share this technique?').waitFor();
  ok(((await p2.evaluate('window.__log')) as any[]).some((l) => l.e === 'start' && l.loop), 'audio restarted after tap');
  await sleep(300);
  await p2.getByLabel('Yes, share.').check();
  await p2.getByRole('button', { name: 'Submit' }).click();
  await p2.getByText('Your response has been recorded').waitFor();
  const r2 = (await db.query(`SELECT * FROM participants ORDER BY created_at DESC LIMIT 1`)).rows[0];
  ok(r2.condition === cBefore, 'same condition after reload (no re-randomisation)');
  ok(r2.trial_resumed && r2.flags.includes('resumed_trial') && r2.latency_source === 'server_resumed', 'resumed trial is flagged and timed from first display', r2.flags);

  console.log('\n[C] Admin dashboard in browser');
  const actx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const ap = await actx.newPage();
  await ap.goto(BASE + '/admin');
  await ap.getByText('Researcher sign-in').waitFor();
  await ap.screenshot({ path: `${SHOTS}/8-admin-login.png` });
  await ap.getByPlaceholder('name@ashoka.edu.in').fill('Zitien.Tickoo_ug2025@ashoka.edu.in');
  await ap.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await ap.getByText('If that address is authorised').waitFor();
  await sleep(500);
  const lines = fs.readFileSync('data/dev-outbox.log', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const link = lines.reverse().find((l: any) => l.to === 'zitien.tickoo_ug2025@ashoka.edu.in').link;
  await ap.goto(link);
  await ap.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await ap.getByText('Research dashboard').waitFor();
  ok(true, 'magic link → explicit confirm → dashboard');
  await ap.getByText('Condition-wise comparison').waitFor();
  await sleep(500);
  await ap.screenshot({ path: `${SHOTS}/9-admin-overview.png`, fullPage: true });
  await ap.getByRole('button', { name: 'Charts' }).click();
  await ap.getByText('Decisions by condition (count)').waitFor();
  await sleep(1200);
  await ap.screenshot({ path: `${SHOTS}/10-admin-charts.png`, fullPage: true });
  ok((await ap.locator('svg.recharts-surface').count()) >= 5, 'charts render (≥5 SVG charts)');
  await ap.getByRole('button', { name: 'Responses' }).click();
  await ap.getByText('Participant ID').waitFor();
  await ap.getByText('records').first().waitFor();
  await ap.screenshot({ path: `${SHOTS}/11-admin-responses.png` });
  await ap.getByRole('button', { name: 'Settings' }).click();
  await ap.getByRole('heading', { name: 'Playback volume' }).waitFor();
  await sleep(500);
  await ap.screenshot({ path: `${SHOTS}/12-admin-settings.png`, fullPage: true });
  await ap.getByRole('button', { name: 'Demographics' }).click();
  await ap.getByText('Age distribution').waitFor();
  await ap.getByRole('button', { name: 'Export & data' }).click();
  const [dl] = await Promise.all([ap.waitForEvent('download'), ap.getByRole('link', { name: 'Download CSV' }).first().click()]);
  ok(/experiment_complete_\d{4}-\d{2}-\d{2}\.csv/.test(dl.suggestedFilename()), 'Download CSV button delivers a file', dl.suggestedFilename());

  await browser.close();
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
