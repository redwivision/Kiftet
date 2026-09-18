# KIFTET — Operations Runbook

Everything needed to run and deploy Kiftet: prerequisites, day-to-day
commands, the release path, environment variables, deployment, verification,
rollback, and the incident playbook.

This is the *operations* document. For *how the code works* read
[`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md); for the manual test script read
[`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md).

---

## 1. Architecture at a glance

| Piece | What it is | Runs where |
|---|---|---|
| `apps/web` | The app users see — React Router + Tailwind + PWA (installable, offline fallback) + Voxide voice agent | Vercel, or any Bun/Node host |
| `apps/server` | The **one production process** — Express API (Better Auth sessions, the study loop, Gemini grading, rate limiting) **plus** the built web app (SSR + static) in `NODE_ENV=production` | Any Bun/Node host; SQLite needs a **persistent disk** (see §6) |
| `packages/db` | Drizzle schema + migrations. **SQLite today** (`bun:sqlite`); the Postgres/Neon driver + env scaffold exist but are not yet wired in | Same box as the API |
| `packages/auth` | Better Auth configuration | part of `apps/server` |
| `packages/ui` | Shared shadcn-style components | build-time only |

**One fact that decides everything:** the database is a SQLite *file*
(`DATABASE_FILE`, default `./kiftet-dev.db`). The box running the API must
give that file a **persistent volume**. On ephemeral filesystems (most
serverless/PaaS redeploys discard the disk) every account and every study
history is lost on each deploy. Either mount a volume, or take the time to
switch to the scaffolded Postgres path (`/docs/HOW_IT_WORKS.md` §6).

---

## 2. Prerequisites

- **Node ≥ 22.22.0.** react-router hard-requires > 22.22. The repo pins
  22.23.2 in `.nvmrc`. Run `nvm use` (or `fnm use`) before any non-trivial
  work — the local shell may be on an older Node.
- **Bun ≥ 1.4.2** — `bun install` at the repo root installs everything.
- Accounts: **Vercel** (web), a **Bun/Node host** for the API (Railway, Fly,
  Render, or a VPS with a volume), **Google AI Studio** (Gemini key),
  **Voxide** (optional — voice; pages fall back to typing/browser speech).

---

## 3. Day-to-day local development

```bash
bun install                # postinstall regenerates the typed env modules (varlock)
bun run dev:server         # terminal 1 — API on http://localhost:3000 (hot reload)
bun run dev:web            # terminal 2 — web app
```

- No `.env` files are required locally — the `.env.schema` files ship dev-safe
  placeholders and generate `src/env.ts` types on install.
- The **server runs migrations automatically on boot**
  (`packages/db/src/index.ts` reads the migrations folder and applies any new
  SQL before serving).
- The SQLite file is created on first server start (`./kiftet-dev.db`, WAL
  mode, foreign keys on).

### When you change a `.env.schema`

```bash
bun run env:generate       # regenerate the typed env modules (web, server, db)
```

---

## 4. The quality gates

```bash
bun run check-types   # TypeScript across the workspace — MUST be green
bun run build         # Turborepo build; also regenerates PWA icons + service worker — MUST be green
bun run check         # biome format + lint — run it; safe to `--write`
```

**Note on `bun run check`:** biome currently reports ~95 *pre-existing*
formatting errors across the repo (files like `turbo.json`, package.jsons)
that predate this runbook. They are auto-fixable formatting, not logic — but
if you run `bun run check -- --write` it will reformat ~35 files. Do that as
a deliberate, separate "formatting baseline" commit, not as part of a feature
release.

If `check-types` complains only about the Node version, the shell is on a
stale Node — run `nvm use` and retry before investigating further.

---

## 5. The release path — the only way to production

1. Do all work on a feature branch (currently `vibe-v2`).
2. Run the §4 gates locally; fix until green.
3. Merge to `main` (production). Today `main` fast-forwards cleanly:
   ```bash
   git checkout main
   git merge <branch> --ff-only
   git push origin main
   ```
4. Deploy the combined service (§6) and set the production environment
   variables from §8.
5. Run the verification checklist (§9). Fix → redeploy → re-verify.

---

## 6. Deploying the combined service (one process that runs everything)

In production the Express server **also serves the built web app** — API,
SSR pages, static assets, and the PWA all behind one process and one domain.
This is the layout EthioDeploy needs (one service per project), and it makes
cookies and CORS a non-issue because everything is same-origin.

Build then start, from the repo root:

```bash
bun run build          # Turbo: web build + tsdown → apps/server/dist/index.mjs
bun run start          # = bun run serve → runs the built server
```

The server reads the `PORT` env (PaaS platforms inject it) and falls back to
3000 locally.

Routes this one process owns:

| Path | What | Notes |
|---|---|---|
| `/health` | liveness | returns `200 OK` — **probe this, not `/`** |
| `/api/*` | API (auth + study loop) | `/api/auth/*` is public; the rest requires a session |
| `/` + everything else | the web app | SSR + static, only when `NODE_ENV=production` |

In local development you don't use this process — `bun run dev:server` and
`bun run dev:web` run the two dev servers separately.

**EthioDeploy / PaaS host notes**

- Build command: `bun install && bun run build`
- Start command: `bun run start`
- Set the full env set from §8.2 on this service — including the same-origin
  values: `BETTER_AUTH_URL` and `CORS_ORIGIN` are both just
  `https://<your-site>.ethiodeploy.com`.
- **The container disk is recycled on every deploy.** Until the Postgres path
  is wired (below), every redeploy erases all accounts and study history.
  Treat the current state as a live preview, not a store of user data.

> Not yet committed: a `Dockerfile`, `docker-compose.yml`. The root `docker:*`
> scripts target one but the file doesn't exist — this runbook's plain-Bun
> path is the supported production path.

### Postgres — the designed fix for the ephemeral-disk problem

EthioDeploy offers built-in Postgres. `DATABASE_URL` /
`DATABASE_URL_DIRECT`, the Neon driver, and the typed env already exist, but
`createDb()` still opens SQLite. Wiring the Postgres data path is the
#1 follow-up before real students sign up. See `docs/HOW_IT_WORKS.md` §6.

---

## 7. Web-only split (advanced — do not use until you know why)

Running the web app on its own (Vercel, or `react-router-serve`) while the
API lives elsewhere is possible but brings real costs: a second origin means
`VITE_SERVER_URL`, cross-origin cookies, and `CORS_ORIGIN` must all line up,
and a missing API will manifest exactly as "the site renders but sign-up
stops" (all `/api/*` calls hit the web server and come back 404). Prefer §6.

If you do split: build the web with `VITE_SERVER_URL=https://api.domain`,
`VITE_SITE_URL=https://app.domain`, and run the API from §6 with
`BETTER_AUTH_URL=https://api.domain` and `CORS_ORIGIN=https://app.domain`.

**PWA behavior to know:** the service worker auto-updates (`autoUpdate`);
page navigations are network-first circuits with a branded offline page as
the fallback (`/offline.html`). Unless you changed the cache policy, a stale
page after a deploy resolves itself on the next load; hard-refresh if it lingers.

---

## 8. Environment variables — the full checklist

**In the recommended combined mode (§6) you only need one set: §8.2 (the
service's env).** The `VITE_*` build-time values (§8.3) only matter if you
revert to the split layout (§7) — in combined mode the client talks to the
same origin automatically and `VITE_SITE_URL` is the sole nice-to-have (it
makes link-preview images absolute; on the combined service use the same
origin your site already is). Example values below use
`https://kiftet.ethiodeploy.com`.

**Do not commit real secrets.** The `.env.schema` files carry dev-only
placeholders so local builds pass with no `.env` files; every one of them
must be replaced by its real value on the host.

### 8.1 The web app's note (VITE_SITE_URL) — a short walkthrough

Social platforms (Facebook, Telegram, WhatsApp) will only show the app icon
when a link is shared if `og:image` is a **full URL** (e.g.
`https://app.kiftet.com/logo-mark.png`), not a bare path like
`/logo-mark.png`. Their bots are not sitting on the site, so a relative path
has nothing to resolve against and the image is dropped.

`VITE_SITE_URL` is the note that tells the build "your public address is
<url>". The code turns `logo-mark.png` into a full URL using it — and if
that note is *absent*, it automatically falls back to
`VERCEL_PROJECT_PRODUCTION_URL` (Vercel injects its own domain at build time).
Net effect in production on Vercel: **working share previews with zero
configuration.**

| Variable | Purpose | If missing/wrong |
|---|---|---|
| `VITE_SITE_URL` | Your web app's public origin (e.g. `https://app.kiftet.com`); makes `og:image`/`twitter:image` absolute | Relative image → social previews don't render (unless on Vercel, where the fallback covers it) |

To set it manually: Vercel → your project → **Settings → Environment
Variables** → add `VITE_SITE_URL` = `https://your-domain.com` → redeploy. Then
verify via §9.5.

### 8.2 The API server's environment (~/host: API box)

| Variable | Value in prod | Wrong / missing = |
|---|---|---|
| `NODE_ENV` | `production` | HTTPS-only cookies off, verbose errors exposed |
| `BETTER_AUTH_SECRET` | random string ≥ 32 chars | every login 500s / sessions rejected |
| `BETTER_AUTH_URL` | API's public URL (e.g. `https://api.kiftet.com`) | session cookie points at the wrong domain |
| `CORS_ORIGIN` | comma-separated trusted origins, **includes the web origin** (e.g. `https://app.kiftet.com`) | browser blocks every POST; login appears to loop on 401 |
| `DATABASE_FILE` | path to the SQLite file **on the volume** (e.g. `/data/kiftet.db`) | server crashes on boot |
| `DATABASE_URL` / `DATABASE_URL_DIRECT` | Postgres conn. strings — only if you switch off SQLite first | (currently unused at runtime) |
| `GEMINI_API_KEY` | real key from Google AI Studio | grading returns empty placeholders; lessons fall back to templates |

### 8.3 The web app's build-time variables (Vercel/host: web app)

| Variable | Value in prod | Wrong / missing = |
|---|---|---|
| `VITE_SERVER_URL` | API root without `/api` (e.g. `https://api.kiftet.com`) | every API call 404; loud console warning |
| `VITE_SITE_URL` | web origin — see §8.1 | relative `og:image` (Vercel fallback usually covers) |
| `VITE_VOXIDE_KEY` | Voxide publishable key (optional) | voice features off; typed + browser-speech fallback activate |

**Cookie note:** the session cookie is `sameSite=none`, `secure`, scoped to
`BETTER_AUTH_URL`'s domain. For an `api.`/`app.` split this is deliberate —
do not "fix" it by removing `secure`.

---

## 9. Post-deploy verification checklist

Run in order; expected result in parentheses.

1. **Health** — `curl https://<your-site>/health` → `200 OK`.
2. **Sign-up happy path** — browser → web origin → sign up with a real email →
   you land on the dashboard (not a 401/loop).
3. **Study loop smoke** — open a chapter, run one recall → one diagnose →
   one lesson → one retest; scores appear on the result screen.
4. **Session persists** — reload mid-study → the loop resumes at the same
   step; sign out → sign in → still signed in after another reload.
5. **Install / offline** — Lighthouse (mobile) on the home page → PWA badge;
   DevTools → Application → Manifest valid. Then DevTools → Network → Offline
   → navigate → the branded *You are offline* page, and it auto-recovers on
   reconnect.
6. **Social preview** — share a link in Facebook/Twitter/Telegram debugger → the
   **open-ring logo** renders. If only text shows, check `og:image` value in
   the page source (§8.1) — it must be `https://…`.
7. **Rate limit sanity** — 30+ rapid AI calls in a minute → `429` (expected,
   not a fault).

---

## 10. Rollback and backups

- **Code:** push the offending build's parent commit (or `git revert`) and
  redeploy. Migrations are forward-only, so roll back code — never the schema.
- **Data (SQLite):** keep a nightly copy of the DB file, taken after a safe
  checkpoint:
  ```bash
  sqlite3 /data/kiftet.db "PRAGMA wal_checkpoint(TRUNCATE);"   # flush WAL
  cp /data/kiftet.db /backups/kiftet-$(date +%F).db            # then copy
  ```
- **Before any release:** one fresh backup + one manual
  `SELECT count(*) FROM user;` to know the fleet you're protecting.
- Retention: keep 14 nightly copies, 4 weekly.

---

## 11. Incident playbook

| Symptom | Cause | Fix |
|---|---|---|
| Login loops; every auth call 401 | `CORS_ORIGIN` missing/wrong on the API | set it to the exact web origin and redeploy |
| All API calls 404 | `VITE_SERVER_URL` wrong/missing at web build time | set it, rebuild the web app |
| Any login 500s | `BETTER_AUTH_SECRET` mismatch or too short (`< 32`) | set a stable secret, redeploy API |
| Empty "graded" output / template lessons | `GEMINI_API_KEY` missing/invalid | set key, redeploy; check the server log |
| `429 Too Many Requests` | AI rate limit (30/min/user) — working as designed | wait a minute; don't throttle-cap it |
| API process dies every boot | `DATABASE_FILE` points at a path that isn't writable/persistent | point it at the volume; check the disk |
| Stale UI after a deploy | cached by the service worker | hard refresh; it self-heals on next load (autoUpdate) |
| Offline page on every load | web app can't reach the API *or* no network | check §9.1 health; check the client's connectivity |
| Server boots but locals see 500s while you don't | node/bun version drift | `nvm use` to 22.23.2, `bun install`, restart |
| varlock/env errors after pulling | `.env.schema` changed | `bun run env:generate` then rebuild |

When you take corrective action, update this table, then re-run §9.

---

## 12. Scheduled care (calendar, every month)

- Rotate `BETTER_AUTH_SECRET` (log everyone out) and `GEMINI_API_KEY`.
- Confirm nightly backups ran and open one to check it isn't empty.
- Re-run Lighthouse on the home page; keep the PWA badge green.
- Confirm the API's disk has headroom (SQLite grows with study history).
- Re-audit the dependency tree (`bun audit`) — dependency health is in
  `docs/HOW_IT_WORKS.md` §15.

---

## 13. Where to look when something is confusing

- **How the code works** — `docs/HOW_IT_WORKS.md` (auth, CORS, DB, policies,
  env, glossary; 15 sections).
- **What to test by hand** — `docs/TESTING_GUIDE.md`.
- **Humans and environments** — this runbook.
