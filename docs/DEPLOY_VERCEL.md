# Free hosting: Vercel (app) + Neon (Postgres) + Vercel Blob (audio)

All three have free tiers, so the whole study can run at no cost. The same code also runs on Docker/VPS (see README); the app picks the audio backend automatically: **Blob when `BLOB_READ_WRITE_TOKEN` is set, local disk otherwise.**

## How it works on Vercel
* **Database:** Neon Postgres (use the *pooled* `DATABASE_URL` in the app; migrations use `DATABASE_URL_UNPOOLED`).
* **Audio:** a **private** Vercel Blob store. Admin uploads go browser → Blob directly (no 4.5 MB serverless limit); the server then downloads the object once, validates it (extension ↔ magic bytes ↔ parsed audio) and records it. Participants never see a Blob URL: `/api/p/audio` **streams** their own track through the function (streaming avoids the 4.5 MB response cap).
* **Email:** SMTP is required for admin sign-in links (Brevo free tier = 300/day, or a Gmail app password).

## Free-tier things to know
* **Neon scales to zero** after ~5 min idle: the first request after a quiet period can take 1 to 3 s. **Open `/experiment` once a minute before each session** to warm it. The latency measurement is browser-side, so it is not affected, but the server cross-check tolerance is 4 s for this reason.
* **Vercel Hobby is for non-commercial use** (fine for a student research study).
* **No SLA, limited backups.** Download the complete CSV after every session and run `scripts/backup.sh` regularly (use `DATABASE_URL_UNPOOLED`). Keep your original audio files (Blob is not included in the DB dump; each version's SHA-256 is in the dashboard and exports).
* **Data location / third parties:** participant data will be processed by Vercel and Neon. Choose a Neon region (Singapore is closest to India) and **tell AUHREC** that cloud processors are used; the consent text's Data Storage paragraph may need to name them (`src/lib/consent.ts`).
* Keep **one canonical URL** and set `APP_URL` to exactly that (admin requests are origin-checked). If you add a custom domain later, update `APP_URL` and redeploy.

## Manual steps (about 15 minutes)
1. Push the project to a **private** GitHub repo (or use the Vercel CLI).
2. vercel.com → *Add New Project* → import it. Framework: Next.js (auto). Don't deploy yet if you want to add env vars first; deploying first is also fine.
3. Project → **Storage** → *Create* → **Neon (Postgres)** → free plan, region near you → connect to the project (this injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED`).
4. Project → **Storage** → *Create* → **Blob** → choose **Private** → connect to the project and tick **"Add a read-write token env var"** (`BLOB_READ_WRITE_TOKEN`).
5. Project → **Settings → Environment Variables** (Production): `APP_URL` (e.g. `https://your-project.vercel.app`), `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Do **not** set `MAIL_TRANSPORT`. `ADMIN_EMAILS` is optional (defaults to the five researchers).
6. Run migrations once from your computer:
   ```bash
   npm i -g vercel && vercel login && vercel link
   vercel env pull .env.local           # never commit this file
   set -a; source .env.local; set +a
   npm install && npm run db:migrate
   ```
7. Deploy: `vercel --prod` (or push to GitHub).
8. Check it: `node tests/smoke/prod-smoke.mjs https://your-project.vercel.app`
9. Sign in at `/admin`, upload both audio files, set the volume cap and volume, do a dry run, delete your test records, then enable the experiment.

## Prompt for Claude Code (paste into Claude Code, opened in the project folder)

```
This folder is a finished Next.js + PostgreSQL research app. Read README.md and docs/DEPLOY_VERCEL.md first. Deploy it to Vercel on free tiers: Neon Postgres, a PRIVATE Vercel Blob store, and Vercel hosting. Do not change application code unless a deployment bug forces it, and tell me exactly what you changed and why.

Rules:
- Never print, log, or commit secrets. .env.local must stay out of git (check .gitignore).
- Never run tests/e2e/run.ts or tests/e2e/browser.ts against production: they create and delete data. Only tests/smoke/prod-smoke.mjs is allowed against the deployed site.
- Do not create participants on the production site yourself. If you need to test the participant flow, tell me and I will do the dry run.
- Stop and ask me whenever something needs my account, my browser login, or a choice (region, project name).

Do this in order, using the Vercel CLI (check it is installed; if not, npm i -g vercel):
1. Check `vercel whoami`. If not logged in, tell me to run `vercel login` and wait.
2. `npm install`, `npx tsc --noEmit`, `npm test`, `npm run build`. All must pass before deploying. Fix nothing silently.
3. Initialise git if needed (private repo, never public), make sure .env, .env.local, data/ and node_modules are ignored, and commit. Ask me whether to push to a private GitHub repo or deploy with the CLI only.
4. `vercel link` to create/link a project.
5. Storage: tell me exactly which clicks to make in the Vercel dashboard (or use `vercel integration` / CLI if available) to (a) add a Neon Postgres database on the free plan, and (b) add a Blob store set to PRIVATE with the read-write token env var added. Both must be connected to the project for Production. Ask me which Neon region (Singapore is closest to India). Wait until I confirm.
6. Environment variables: ask me for the production URL I want to use (APP_URL) and my SMTP details (host, port, secure, user, password, from). Set them with `vercel env add` for Production only. Confirm via `vercel env ls` that these exist: DATABASE_URL, DATABASE_URL_UNPOOLED, BLOB_READ_WRITE_TOKEN, APP_URL, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM. Confirm MAIL_TRANSPORT is NOT set.
7. If the Neon region is not near the default Vercel function region, add a "regions" entry in vercel.json to match (for example sin1 for Singapore) and tell me.
8. Migrations: `vercel env pull .env.local --environment=production`, load it into the shell without echoing values, run `npm run db:migrate` (it uses DATABASE_URL_UNPOOLED), then verify tables exist with a read-only query. Delete .env.local afterwards.
9. Deploy with `vercel --prod`. Wait for READY. Show me the URL. If APP_URL differs from the real production URL, fix it and redeploy.
10. Run `node tests/smoke/prod-smoke.mjs <url>`. Everything must pass. If anything fails, diagnose using `vercel logs` and fix.
11. Admin login test: ask me to request a sign-in link at <url>/admin with one of the allowlisted emails and confirm the email arrives and signs me in. If email fails, check the function logs and the SMTP settings.
12. Audio test: ask me to upload one short audio file per slot in /admin -> Settings and press play on the previews. If the upload fails, read `vercel logs` for /api/admin/audio and fix. Confirm the Blob store is private (no public URL ever reaches the browser).
13. Tell me the participant link (<url>/experiment) and the remaining manual steps: set volume cap and volume, do a full dry run with real headphones, delete my test records in the Responses tab, then enable the experiment. Also remind me: warm the site by opening /experiment a minute before each session (Neon free tier sleeps), download the complete CSV after every session, and tell the ethics board that Vercel and Neon process the data.
14. Finish with a short summary: URLs, env vars set (names only), what I must do next, and anything you changed.
```
