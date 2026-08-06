# Deploying Zoffec CMS — free, permanent hosting

Three services, fully card-free, all verified locally before writing this:

| Piece | Host | Why |
|---|---|---|
| Postgres | [Neon](https://neon.tech) | Free tier has no forced expiry (unlike Render's own free DB, which auto-deletes after 90 days) |
| Backend (Node/Express + cron jobs) | [Render](https://render.com) | Free web service, no card. Sleeps after 15 min idle — kept awake by a free pinger (step 3) so the scheduled jobs still fire reliably |
| Frontend (static React build) | [Cloudflare Pages](https://pages.cloudflare.com) | Genuinely free forever, no card, unlimited bandwidth |

This matches how you said you'll actually use it: not a 24/7-critical service, just something that's there and working when you open it. Render's free tier fits that exactly — the only wrinkle is that `node-cron` (overdue invoice detection, follow-up reminders, daily digest email) only runs while the process is awake, so step 3 sets up a free external ping to keep it from sleeping, which makes the schedule reliable without needing a paid tier anywhere.

**No card required anywhere in this guide.**

---

## 0. Before you start

Free accounts, no card needed for any of them:
- [neon.tech](https://neon.tech) — sign up with GitHub/Google
- [render.com](https://render.com) — sign up with GitHub/Google
- [dash.cloudflare.com](https://dash.cloudflare.com)
- [brevo.com](https://brevo.com) — you already picked this for SMTP; 300 emails/day free forever
- [cron-job.org](https://cron-job.org) — keeps Render awake (step 3)

Push this repo to GitHub first — both Render and Cloudflare Pages deploy from a git connection.

---

## 1. Database — Neon

1. neon.tech → **New Project** → name it `zoffec-cms`, region closest to you (e.g. Singapore for India).
2. Copy the **connection string** from the project dashboard (`postgres://user:pass@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`). Save it — this is your production `DATABASE_URL`.
3. Run migrations against it from your machine (one-time, and again whenever a new migration is added):
   ```bash
   cd backend
   DATABASE_URL="<neon connection string>" npx node-pg-migrate up
   ```
4. Seed the admin user + services (also one-time):
   ```bash
   DATABASE_URL="<neon connection string>" npx tsx src/db/seed.ts
   ```
   Creates `admin@zoffec.com` / `ChangeMe123!` — **change this immediately after first login**.

Neon free tier: 0.5 GB storage (this app's data will stay well under that for years), autosuspends compute after 5 min idle, wakes in ~1s on the next query — not noticeable behind Render's own wake-up.

---

## 2. Backend — Render

1. Render dashboard → **New** → **Web Service** → connect this repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
3. **Environment variables** (Environment tab):
   ```
   NODE_ENV=production
   DATABASE_URL=<neon connection string>
   SESSION_COOKIE_NAME=zoffec_sid
   SESSION_TTL_HOURS=12
   SESSION_REMEMBER_TTL_DAYS=30
   APP_BASE_URL=<set after step 4, see below>
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=<your Brevo SMTP login>
   SMTP_PASS=<your Brevo SMTP key>
   MAIL_FROM=Zoffec CMS <no-reply@zoffec.com>
   ```
4. Deploy. Render gives you a URL like `https://zoffec-cms-backend.onrender.com`.
5. Verify:
   ```bash
   curl https://zoffec-cms-backend.onrender.com/api/health
   # {"ok":true,"db":"connected"}  (first hit after a cold start takes 30-60s — that's expected)
   ```

(A `Dockerfile` and `fly.toml` are also in `backend/` from an earlier draft of this guide, in case you ever want to move to an always-on host later — not needed for this path.)

---

## 3. Keep it awake — cron-job.org

Without this, Render puts the backend to sleep after 15 min of no traffic, and a sleeping process can't run `node-cron`'s scheduled jobs (invoice overdue detection at 1am, follow-up reminders at 7am, digest email at 7:30am, notification archiving at 2am) — they'd simply never fire.

1. cron-job.org → sign up → **Create cronjob**.
2. URL: `https://zoffec-cms-backend.onrender.com/api/health`
3. Schedule: every 10 minutes, every day (this covers all four job times above with room to spare).
4. Save, enable.

This keeps the backend continuously warm for free, so the scheduled jobs run on time same as an always-on host would — you're just using a free ping instead of paying for a VM that never sleeps.

---

## 4. Frontend — Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → this repo.
2. Build settings:
   - **Framework preset:** Vite
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Environment variables** (Settings → Environment Variables, Production):
   - `VITE_API_URL` = `https://zoffec-cms-backend.onrender.com` (your real Render URL from step 2)
4. Deploy. Cloudflare gives you a URL like `https://zoffec-cms.pages.dev`.

**Now go back to Render** (step 2's environment variables) and set the real `APP_BASE_URL` to this exact Cloudflare Pages URL, then let it redeploy (Render redeploys automatically on env var changes, or trigger manually). This matters because the backend's CORS only allows requests from `APP_BASE_URL` — if it doesn't match the frontend's real origin exactly, login fails with a CORS error in the browser console.

---

## 5. Verify the whole thing works

1. Open your Cloudflare Pages URL. First load may be slow if Render's backend was asleep — that's the cold start, expected.
2. Log in as `admin@zoffec.com` / `ChangeMe123!`.
3. **Change the admin password immediately** — no in-app "change my own password" screen exists yet; use the password-reset flow (`POST /api/auth/password-reset/request`, follow the emailed link).
4. Create the real users for Zoffec's team (Users screen, admin-only).
5. Add real services if the seeded 6 don't cover it (`POST /api/services` as admin).
6. Trigger a password reset for a real inbox to confirm Brevo is actually sending, not just falling back to console logging.
7. Check the cron-job.org dashboard after 24h to confirm pings are landing (200 responses) — that's your signal the scheduled jobs are getting the chance to run.

---

## 6. Custom domain (optional, still free)

- **Frontend:** Cloudflare Pages → your project → Custom Domains → e.g. `crm.zoffec.com` (one click if `zoffec.com`'s DNS is already on Cloudflare).
- **Backend:** Render → Settings → Custom Domain → add e.g. `api.zoffec.com`, follow Render's CNAME instructions at your DNS provider. Update `VITE_API_URL` and `APP_BASE_URL` to match, redeploy both. Update the cron-job.org ping URL too.

---

## 7. Limits to watch

- **Neon free:** 0.5 GB storage — fine for years at this team size.
- **Render free:** 750 instance-hours/month shared across your free services (plenty for one always-pinged service), builds are slower than paid tiers but that only affects deploys, not runtime.
- **Cloudflare Pages:** effectively unlimited for a static site this size.
- **Brevo:** 300 emails/day — this app sends rare password resets + ~10-20 digest emails/day at Zoffec's team size, nowhere close.
- **cron-job.org free tier:** allows frequent enough pings for this (every 10 min is well within free limits).

---

## If you later want zero cold-start (always-on, needs a card)

Render's free tier's only real downside is the 30-60s cold start on the first request after idle. If that ever becomes annoying, the fix is Fly.io instead of Render — same Neon/Cloudflare setup, swap step 2 for the `Dockerfile`/`fly.toml` already sitting in `backend/`. It requires a card for identity verification (usage-based billing, typically $0-3/month for an app this size, not contractually free) but removes cold starts and the need for the cron-job.org workaround entirely. Not needed unless the cold start actually bothers you in practice.
