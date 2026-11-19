# Decision-Making Study: self-hosted experiment platform

A Google-Forms-style research platform for the 2 × 2 between-subjects study on **crowd vs brown noise × positive vs negative framing**, measuring decision and decision latency. Next.js 15 (React 19, TypeScript, Tailwind) · PostgreSQL · plain-SQL migrations · Recharts. No Google Forms / Jotform / Firebase / Supabase / third-party trackers or fonts.

| URL | Who | What |
|---|---|---|
| `/experiment` | Participants (the one shareable link) | consent → eligibility → demographics → instructions → experiment → thank-you |
| `/admin` | The five authorised researchers only | magic-link sign-in, analytics, audio, settings, exports, audit log |

---

## 1. Quick start (local development)

Requirements: Node 20+ (22 recommended), PostgreSQL 14+.

```bash
npm install
cp .env.example .env            # then edit: DATABASE_URL, APP_URL, and for local testing MAIL_TRANSPORT=file
createdb experiment             # or any database matching DATABASE_URL
npm run db:migrate              # applies migrations/*.sql (idempotent)
npm run dev                     # http://localhost:3000
```

Local sign-in without SMTP: set `MAIL_TRANSPORT=file` in `.env`. Sign-in links are then appended to `data/dev-outbox.log` instead of being emailed. **Testing only.**

### First-time study set-up (in `/admin` → Settings)
1. Upload the **crowd noise** and **brown noise** files (MP3 / WAV / M4A).
2. Set the **approved volume cap** and the **standardised playback volume** (see "Volume" below).
3. Optionally set the **study location** (shown on the consent page) and target sample size.
4. Click **Enable experiment**. The study is **disabled by default** and cannot be enabled until both audio files exist.
5. Do a full dry run yourself on the lab machine and headphones, then **delete your test records** (Responses tab) so they are not analysed.

## 2. Production deployment (Docker Compose)

```bash
cp .env.example .env
# Edit .env: POSTGRES_PASSWORD (long random), APP_URL=https://your-domain, SMTP_*, DOMAIN
docker compose up -d --build                 # app on 127.0.0.1:3000, migrations run automatically on start
docker compose --profile https up -d         # optional: Caddy reverse proxy with automatic HTTPS for $DOMAIN
```
* Use HTTPS. `APP_URL` must be the exact public `https://…` origin: it controls the cookie `Secure` flag, the sign-in link, and CSRF origin checks.
* `http://` is only acceptable on `localhost`: Web Audio, cookies and sign-in links should not travel unencrypted.
* **Persistent storage:** Postgres data lives in the `pgdata` volume, uploaded audio in the `audio` volume (`/data/audio`). Without Docker, point `AUDIO_DIR` at a persistent directory on disk.
* Bare-metal alternative: `npm ci && npm run build && npm run db:migrate && npm start` behind nginx/Caddy (set `client_max_body_size 40m` for uploads), with `NODE_ENV=production`.
* SMTP is **required** in production (the app refuses to issue sign-in links without it). Any provider works (university SMTP, Gmail app password, Mailgun, SES…).

### Migrations
Plain SQL in `migrations/`, applied in filename order by `node scripts/migrate.mjs` (`npm run db:migrate`), tracked in `schema_migrations`, guarded by an advisory lock. The Docker image runs it on every start. To change the schema add `002_….sql`, never edit an applied file.

### Backup and restore
```bash
./scripts/backup.sh                       # docker compose: DB dump + audio archive + checksums → backups/<UTC timestamp>/
./scripts/restore.sh backups/<timestamp>  # DESTRUCTIVE; asks you to type RESTORE
```
Bare metal: run with `DATABASE_URL` and `AUDIO_DIR` set. Schedule `backup.sh` (cron) during data collection and copy `backups/` off the machine. Also download the **complete CSV** from the dashboard after each session: it is your analysis-ready copy.

### Free hosting alternative (no VPS)
See **`docs/DEPLOY_VERCEL.md`**: Vercel + Neon Postgres + private Vercel Blob (all free tiers), including a ready-to-paste Claude Code deployment prompt. Audio storage switches to Blob automatically when `BLOB_READ_WRITE_TOKEN` is set. Local-disk mode (everything above) is unchanged.

## 3. How the experiment works

**Flow.** Pages are separate screens; the server is authoritative for which page a participant may see (a status machine in the DB), so pages cannot be skipped, revisited or re-submitted, whatever the browser does. The Back button is neutralised and a reload resumes at the correct page.

**Randomisation.** Server-side only, when the participant clicks **Next on the Instructions page** (after consent, eligibility, demographics). Uses Node `crypto.randomInt` (CSPRNG) with **randomised permuted blocks of four**: every block of four allocations contains each condition exactly once in random order (stored in `allocation_blocks`). Allocation is serialised with an advisory lock, idempotent per participant (reload never re-randomises), independent of demographics/answers, and logged immutably in `allocations`. A `simple` method is available (configurable *before* the first allocation; locked afterwards). No admin can set a participant's condition. Verified: 48 simulated participants (12 concurrent) → exactly 12 per condition.

**Conditions.** 1 = positive+crowd, 2 = positive+brown, 3 = negative+crowd, 4 = negative+brown. The browser receives only the baseline text, its own framing sentence and the question: never its condition number, framing label or sound category. Scenario wording is in `src/lib/experiment.ts`, exactly as supplied.

**Audio.** (On Vercel the track is streamed from a private Blob store; elsewhere from disk.) Web Audio API (no `<audio>` element → no player, seek bar or scrubbing surface exists). `AudioBufferSourceNode.loop` gives gapless looping; playback is never restarted by React re-renders. The audio context is created inside the participant's **Next click** on the Instructions page (the user gesture browsers require). The scenario is shown only after the audio clock is verified to be advancing. If the browser blocks audio, a minimal "Tap once to start the experiment audio" screen appears and the trial does **not** begin until audio is really running; failures are logged in `audio_events`. Audio stops the instant Submit is clicked. `/api/p/audio` serves only the participant's own track, pinned to the audio **version** recorded at allocation; same URL for every condition, no filename.

**Latency.** Timer = `performance.now()` (monotonic), started **after the scenario has been painted** (double `requestAnimationFrame`), held in a ref (re-renders can't reset it), captured synchronously in the Submit click. Stored: `latency_ms`, `latency_seconds`, plus the server's own elapsed time (`server_elapsed_ms`) as a cross-check. Duplicate submission is impossible (row lock + status guard; tested with concurrent requests).

**Quality flags** (stored per record, exported, filterable; analyses can exclude them): `timing_mismatch` (browser vs server differ > 1.5 s), `audio_interrupted` (audio context suspended mid-trial, e.g. tab backgrounded / headphones unplugged), `resumed_trial` (page reloaded mid-trial; latency then comes from the server, measured from first display), `trial_start_unacknowledged`.

**Privacy.** Anonymous random IDs (`P-XXXXXXXXXX`). No names, emails, student IDs, IPs or user agents are stored in research tables. One strictly necessary, HttpOnly session cookie (`ps`, 24 h) holds a random secret whose hash lives in `participant_sessions` (*operational*, purgeable from the dashboard). No analytics, third-party requests or web fonts.

**Admin security.** Passwordless magic link, allowlist enforced **on the server for every API route** (and re-checked on every request), links valid 15 min and single-use, the token travels in the URL fragment and needs an explicit click (so mail scanners can't burn it), identical response for allowed/disallowed emails, 5 links/hour/address, 12 h HttpOnly SameSite=Lax sessions, Origin check on every state-changing request, no-store headers. Exports contain research data only.

**Researcher actions & audit.** Responses are never edited. A record can be *excluded* from analysis (reversible, reason required) or *deleted* (reason + typed ID). Logins, audio uploads, setting changes, exports, exclusions, deletions and purges are in the **Audit log**. Replacing audio keeps old versions; each participant's record keeps the version they heard.

**Retention.** Default 7 years (configurable). "Delete records past retention" removes only records older than the period and **refuses unless a complete CSV was downloaded in the previous 24 h**. "Purge operational session data" removes session secrets/tokens without touching research data.

### Volume: please read
The app applies one fixed digital gain (≤ the researcher-set cap) to every participant. Real loudness also depends on the computer's output level and the headphones. Fix the device volume, **measure the output with a sound-level meter**, and get the level approved by AUHREC. The app never tries to raise the system volume. Also **match the loudness of the two audio files** (e.g. equal LUFS), otherwise sound *type* is confounded with loudness. Prefer 30–120 s **WAV** loops: MP3/AAC encoders add padding that can cause a tiny gap at the loop point, and the browser decodes the whole file into memory.

## 4. Admin dashboard
Overview (counts + the condition table C1–C4: n, Yes/No, %, mean/median/SD) · Charts (decisions, %s, latency by condition, individual response times, framing and noise comparisons) · Demographics · Responses (sort/filter by condition, decision, status, gender, age, major) · Export & data (4 CSVs, retention) · Settings (audio, volume, enable, target n, location, allocation) · Audit log.

Definitions: *Incomplete* = started but neither completed, declined nor ineligible. Percentages/means use completed, non-excluded responses; the checkbox additionally drops flagged trials. SD is the sample SD (n−1). CSV cells that begin with `= + - @` are prefixed with `'` (participants type their own "major", so formula injection is a real risk); UTF-8 with BOM for Excel; list fields joined with `|`.

## 5. Tests
```bash
npm test                                   # unit tests (stats, CSV, randomisation, design mapping)
# end-to-end (needs a running server started with MAIL_TRANSPORT=file, an EMPTY database, and DATABASE_URL set):
DATABASE_URL=… npx tsx tests/e2e/run.ts    # 158 API/DB checks incl. 48 simulated participants
DATABASE_URL=… npx tsx tests/e2e/browser.ts  # 45 real-Chrome checks (needs /usr/bin/google-chrome; run after run.ts)
```
**Never run the e2e tests against a live study database**: they create and delete data.

## 6. Known limitations
* **Repeat participation** can't be prevented without identifiers: someone who clears cookies could start again. The supervised, one-at-a-time lab setting is the real safeguard.
* **Dropout after allocation** leaves unequal cell sizes; blocks balance *allocations*, not completions. Monitor counts and consider replacing dropouts.
* **Audio hardware** can't be verified: the app confirms the browser's audio clock is running, not that sound reaches the participant's ears.
* **Latency** is a browser measurement (typically ±10–20 ms input/paint jitter) and is not comparable across very different devices. The study design (same device for everyone) addresses this.
* Browsers' own sound-device handling (sleeping tabs, Bluetooth) can interrupt audio; the app flags this but cannot prevent it.

## 7. Items for the researchers / ethics board to confirm
See the hand-off notes in the project summary: consent-text discrepancies (Jotform, disclosure of the noise manipulation, age 18+ vs 18–22), small-sample re-identifiability, volume calibration, loudness matching and option-order.
