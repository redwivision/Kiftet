# KIFTET — Operations Runbook

Everything needed to run and deploy Kiftet: prerequisites, day-to-day
commands, the release path, environment variables, deployment, verification,
rollback, and the incident playbook.

This is the *operations* document. For *how the code works* read
[`docs/howItWorks/`](docs/howItWorks/README.md); for the manual test script read
[`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md).

---

## 1. Architecture at a glance

| Piece | What it is | Runs where |
|---|---|---|
| `apps/web` | The app users see — React Router + Tailwind + PWA (installable, offline fallback) + Voxide voice agent | served by `apps/server` in prod (§6) |
| `apps/server` | The **one production process** — Express API (Better Auth sessions, the study loop, Gemini grading, rate limiting) **plus** the built web app (SSR + static) in `NODE_ENV=production` | Any Bun/Node host (EthioDeploy today) |
| `packages/db` | Drizzle schema + migrations on **Neon Postgres** (`pg` driver; pooled string for traffic, direct string for migrations) | same box as the API |
| `packages/auth` | Better Auth configuration | part of `apps/server` |
| `packages/ui` | Shared shadcn-style components | build-time only |

**One fact that decides everything:** the database is **Neon Postgres**, not a
file. That means the API's disk can be a throwaway container — accounts and
study history live in Neon and survive every redeploy. The two connection
strings (`DATABASE_URL` pooled, `DATABASE_URL_DIRECT` unpooled) come from the
Neon console and are set as env vars on the host. See §6.4.

---

## 2. Prerequisites

- **Node ≥ 22.22.0.** react-router hard-requires > 22.22. The repo pins
  22.23.2 in `.nvmrc`. Run `nvm use` (or `fnm use`) before any non-trivial
  work — the local shell may be on an older Node.
- **Bun ≥ 1.4.2** — `bun install` at the repo root installs everything.
- Accounts: **EthioDeploy** (hosts the combined service), **Neon** (the
  Postgres database — connection strings in §6.4), **Google AI Studio**
  (Gemini key), **Voxide** (optional — voice; pages fall back to
  typing/browser speech).

---

## 3. Day-to-day local development

```bash
bun install                # postinstall regenerates the typed env modules (varlock)
bun run dev:server         # terminal 1 — API on http://localhost:3000 (hot reload)
bun run dev:web            # terminal 2 — web app
```

- **Phone on the same Wi-Fi:** use the computer's LAN address, not
  `localhost`, on the phone. Configure the web API root and server auth/CORS
  origins, then bind the web dev server to `0.0.0.0`. Follow the exact
  `.env` example in [`docs/howItWorks/running.md`](docs/howItWorks/running.md).
- No `.env` files are required locally — the `.env.schema` files ship dev-safe
  placeholders and generate `src/env.ts` types on install.
- The **server runs migrations automatically on boot** — `migrateDb` in
  `packages/db/src/index.ts` applies any pending SQL over the *direct*
  (unpooled) connection before the server starts listening. Each migration is
  transactional, so a crash mid-migrate can't leave a half-applied schema.
- No local database file to manage — both local dev and production talk to
  the same Neon project configured in `apps/server/.env`.

### When you change a `.env.schema`

```bash
bun run env:generate       # regenerate the typed env modules (web, server, db)
```

---

## 4. The quality gates

```bash
bun run check-types   # TypeScript across the workspace — MUST be green
bun run build         # Turborepo build; also regenerates PWA icons + service worker — MUST be green
bun run lint          # biome format + lint, reports only — MUST be green
```

These three are exactly what CI runs (`.github/workflows/ci.yml`), and **CI
blocks merges into `main`** — a PR cannot land until the check is green. So a
green local run means the same thing CI will say.

`bun run check` is kept as an alias of `bun run format` (`biome check --write .`),
which **rewrites your files**. Use it when you want the fixes applied; use
`bun run lint` when you want to know whether CI would pass.

> **Formatting baseline (settled 2026-09-27).** The repo used to carry ~95
> pre-existing biome errors — mostly the config demanding tab indentation
> against an entirely 2-space codebase, so `biome check` had never once passed.
> Fixed at the source: `biome.json` now asks for 2-space/80 columns, which is
> what the code actually is, and the whole tree was formatted once. **The tree
> is clean — `bun run lint` exits 0. Keep it that way.**

Two categories are deliberately exempt, both stated in `biome.json` rather than
scattered as inline suppressions:

- **Generated output** is not linted — `.react-router/**` (React Router typegen),
  `src/env.ts` (varlock codegen), and `routeTree.gen.ts` (already exempt). These
  are rewritten by their generators on every build and typecheck, so a hand-fix
  would be undone immediately.
- **`packages/ui/**`** (vendored shadcn primitives) is exempt from three a11y
  rules — `useSemanticElements`, `useKeyWithClickEvents`, `noLabelWithoutControl`.
  Those are pass-through wrappers where the rule can't see the consumer's
  `htmlFor` or the real focus target. Standalone `.svg` brand assets are exempt
  from `noSvgWithoutTitle` for the same reason: they're a favicon and an
  og:image, never inlined into the accessibility tree.

If `check-types` complains only about the Node version, the shell is on a
stale Node — run `nvm use` and retry before investigating further.

### Branch protection (one-time setup)

`main` is production, so it is protected. If you ever see a PR merge without CI
running, re-apply it: **repo → Settings → Branches → Add rule** (or
`gh api -X PATCH repos/redwivision/Kiftet/branches/main/protection`):

- **Branch name pattern:** `main`
- **Require status checks to pass:** on, and require the `lint, types, build`
  and `lint, types, build, test` checks. (CI now has four gates — a `test` job
  was added with the first automated tests. If a PR shows as mergeable but you
  expected CI to block, the required-check list is usually the stale part.)
- **Require branches to be up to date:** on
- **Require at least one approval:** on (you can approve your own PR if solo)

---

## 5. The release path — the only way to production

1. Do all work on a feature branch named for the change. Never commit to
   `main` — branch protection requires the CI check, and a direct push has
   been used to skip it in the past, which is exactly what the gate is for.
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
- **The container disk is recycled on every deploy — and that's fine now.**
  All data lives in Neon Postgres (§6.4), so redeploys are stateless and safe.

> Not yet committed: a `Dockerfile`, `docker-compose.yml`. The root `docker:*`
> scripts target one but the file doesn't exist — this runbook's plain-Bun
> path is the supported production path.

### 6.4 The database — Neon Postgres (persistent, no disk needed)

The app runs on **Neon**, a serverless Postgres. No data lives on the host's
disk, which removes the ephemeral-disk failure mode entirely — this is now
wired and verified, not a plan.

- `DATABASE_URL` — the **pooled** connection string (hostname has
  `-pooler`). Used for all application traffic (`createDb` in
  `packages/db/src/index.ts` keeps a small warm pool).
- `DATABASE_URL_DIRECT` — the **unpooled** string (no `-pooler`). Used only
  for migrations at boot (`migrateDb`), which need a session-stable
  connection.
- Migrations are plain Drizzle SQL in `packages/db/src/migrations/`, generated
  with `bun run db:generate` and applied on every boot; each runs inside a
  transaction.

**How to control Neon** (the "it was set up automatically" feeling goes away
here):

1. Open https://console.neon.tech and sign in with the account that owns the
   project (it's the one whose credentials are already in your
   `apps/server/.env`). The project will be listed — its name is what that
   "automatic" setup used.
2. Dashboard → the project → **Connection details**: copy the **pooled** and
   **direct** strings. They are all you ever need; paste them into the host's
   `DATABASE_URL` / `DATABASE_URL_DIRECT`.
3. The **SQL Editor** tab queries the DB directly (check `SELECT * FROM user`,
   `SELECT * FROM study_session`, etc.).
4. Point-and-click **Backups / PITR** (instant restore) is under
   **Branching**; Neon keeps a history window automatically.
5. To inspect schema or browse tables visually from a terminal:
   `bun run db:studio` (Drizzle Studio, driven by
   `packages/db/drizzle.config.ts`).
6. After any schema change: edit `packages/db/src/schema/*`, then
   `bun run db:generate` (creates the next migration) and redeploy — the next
   boot applies it. Never hand-edit the database directly for app schema.

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
| `BETTER_AUTH_URL` | the site's public URL (same-origin in combined mode, e.g. `https://kiftet.ethiodeploy.com`) | session cookie points at the wrong domain |
| `CORS_ORIGIN` | comma-separated trusted origins (same-origin in combined mode) | browser blocks every POST; login appears to loop on 401 |
| `DATABASE_URL` | **pooled** Neon string (hostname has `-pooler`) | server crashes on boot |
| `DATABASE_URL_DIRECT` | **unpooled** Neon string (no `-pooler`) | migrations fall back to pooled (still works) or fail on session ops |
| `GEMINI_API_KEY` | real key from Google AI Studio | grading returns empty placeholders; lessons fall back to templates |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | both, from Google Cloud Console | Google button hidden (only one half = not a provider) |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | both, from Meta app settings | Facebook button hidden (only one half = not a provider) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | both, from a GitHub OAuth App | GitHub button hidden (only one half = not a provider) |
| `REQUIRE_EMAIL_VERIFICATION` | `false` until a real mail transport ships | `true` on the console transport locks out every signup |
| `AUTH_EMAIL_TRANSPORT` | `console` — the only member of its enum | password-reset links go to the server log, not the student |

**Social providers are optional.** Leave all six provider credentials unset
and password sign-in works exactly as before — the buttons are simply absent.
Setting only one half of a pair is treated as not configured on purpose:
offering a button there sends the student to the provider to be refused, which
looks like our bug.

Full provider setup — Google, Meta and GitHub consoles, the exact redirect
URIs, the Google Testing / Facebook Development restrictions, and a failure
table — is in [`docs/howItWorks/auth.md`](docs/howItWorks/auth.md) §9.

### 8.3 The web app's build-time variables (Vercel/host: web app)

| Variable | Value in prod | Wrong / missing = |
|---|---|---|
| `VITE_SERVER_URL` | API root without `/api` (e.g. `https://api.kiftet.com`); required for split hosting and phone-on-LAN dev | requests go to the wrong host |
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
8. **Auth provider discovery** — `curl -s https://<your-site>/api/auth-providers`
   → `{"providers":[…]}`. This reads the same function that built the auth
   config, so it is the ground truth for which buttons should render. `[]` means
   no provider pair is complete, or the env never reached the API service.
9. **Social sign-in** — only if step 8 lists a provider. Test each configured
   provider on a real phone or in a private window:
   click the button → the provider's genuine consent screen appears → you land
   on `/dashboard` signed in. Separately verify password sign-in; Google and
   Facebook may link under the trusted-provider rules, but GitHub is not
   configured as a trusted linking provider.

> **If step 9 fails**, the provider console is often the answer, not
> Kiftet: Google rejects accounts not in **Test users** while the consent screen
> is in *Testing*, and Meta rejects everyone who is not an app role/admin while
> the app is in *Development*. Check the selected provider's callback URL too.
> See the failure table in
> [`docs/howItWorks/auth.md`](docs/howItWorks/auth.md) §9.7.

10. **Waitlist + Telegram funnel** — only once the env in §8.2 has
    `TELEGRAM_*` values. See §9.1; it has its own preflight.

### 9.1 The waitlist / Telegram reward funnel

The one flow where a *green* status can hide a broken business. The webhook
health check passes, the bot welcomes everyone, the status page looks right —
and nobody is actually eligible for the reward they were promised.

**How membership is established, and why it is not `getChatMember`.**

The obvious API for this is `getChatMember`. It does not work on this group. It
returns `Bad Request: invalid user_id specified` for *every* member, including
the group's creator, while `getChatMemberCount` answers fine. Verified against a
known member; it is not an admin-rights problem, and re-running the check does
not change it. A checker built on it would report a perfectly correct bot as
broken — or, worse, quietly answer "not a member" for everyone.

So membership comes from two things Telegram already sends:

| Source | Covers |
| --- | --- |
| `chat_member` join event | The normal order: press Start, then join |
| `/joined@KiftetBot` in the group | Joined *before* pressing Start, or any missed event |

The join event is why `allowed_updates` must include `chat_member`. It is also
why the bot must be an **admin**: join events are delivered to admins only.

**Preflight (read-only; safe to run any time):**

```bash
bun run --cwd apps/server telegram:webhook:check -- --url=https://kiftet.ethiodeploy.com
```

Exit code is `0` only if every check passed.

| Check | Fails when | Fix |
| --- | --- | --- |
| Token | BotFather token wrong or revoked | Regenerate via `/token` |
| Channel | `TELEGRAM_CHANNEL_URL` is not a public `t.me/<Name>` link | Use the public link, not `t.me/+…` |
| Admin | `@yourbot` is not in `getChatAdministrators` | Add it to the group as admin |
| Webhook | Not registered, or points elsewhere | `telegram:webhook` with the same `--url` |

> **Private invite links cannot work.** `https://t.me/+AbCd…` and `/joinchat/…`
> carry no username, so there is nothing to match a join against. Set
> `TELEGRAM_CHANNEL_URL` to the group's public link, and
> `TELEGRAM_CHANNEL_ID` to its numeric `-100…` id (from `getChat`) — the id
> keeps working if the group is ever switched to private.

**Register the webhook — only after the code is actually deployed:**

```bash
bun run --cwd apps/server telegram:webhook -- --url=https://kiftet.ethiodeploy.com
```

`--url` is not optional in practice. Without it the script uses
`BETTER_AUTH_URL`, which in a developer's `.env` is legitimately
`http://localhost:3000`, and Telegram **accepts** that webhook — reporting
success and then spending ~24 hours delivering every update to a machine that is
switched off. The script warns loudly when the origin is local.

> **Do not register the webhook until the deployed service actually serves
> `/api/telegram/hook`.** If it does not, Telegram receives a non-2xx response
> and retries the same update for 24 hours. Probe it first:
> ```bash
> curl -i -X POST https://kiftet.ethiodeploy.com/api/telegram/hook \
>   -H 'content-type: application/json' -d '{}'
> ```
> A `403` or `503` JSON means the route exists and is checking its secret.
> A `401 {"error":"You must be signed in."}` means the deployed build predates
> this code — deploy before registering.

Re-run `--check` afterwards to confirm `url` matches and `last_error_message`
is empty.

**Manual walk-through — on a real phone, every time.** This is the only test
that proves the funnel; automated checks cannot.

1. Live site → scroll to the waitlist form → submit your real number → tick
   consent. Expect "Wave 1 · you're in" with three steps.
2. **Connect Telegram** → bot opens → **Start**. Expect a welcome reply.
   Log: `[telegram] activation … channelVerified=false`.
3. Join the group. This fires a `chat_member` event.
4. **Check my place** → step 2 should tick itself. Log: `channel join … status=member`.
   If it does not tick, you joined before pressing Start (or the webhook is not
   registered) — send `/joined` in the group as in step 6.
5. Reply to the bot with one line of feedback. If the join is not yet confirmed,
   the bot says so explicitly instead of promising a reward it cannot honour.
6. In the group, send `/joined@<bot>`. The bot replies **privately**, never in
   the group. Log: `/joined … known=1`.
7. **Check my place** → all three steps struck through, premium month locked in.
8. Reload the page. Status survives, because the id lives in `localStorage`.

A join **never** clears an already-recorded `channelVerifiedAt`. Leaving the
group is logged (`channel status … status=left`) but does not revoke: punishing
a student who accidentally left, or who was muted by Telegram, is worse than the
gaming it prevents at this scale.

**Reading the feedback.** Every testimonial from step 5 lands in
`waitlist_signup.testimonial_text` and is normally read nowhere. To have the new
ones pushed to your own Telegram:

```bash
bun run --cwd apps/server telegram:testimonials            # only what is new
bun run --cwd apps/server telegram:testimonials -- --all   # every one, again
bun run --cwd apps/server telegram:testimonials -- --dry-run
```

Set `TELEGRAM_ADMIN_CHAT_ID` in `apps/server/.env` once (message `@userinfobot`
for the number, or read your own `waitlist_signup.telegram_chat_id`), or pass
`--to=<chat id>` for a single run. The script stamps `testimonial_sent_at` after
each delivery, so re-running only sends what arrived since — safe to schedule.
The marker column ships with migration `0009`, applied automatically at boot.

---

## 10. Rollback and backups

- **Code:** push the offending build's parent commit (or `git revert`) and
  redeploy. Migrations are forward-only, so roll back code — never the schema.
- **Data (Neon):** Neon keeps an automatic history window and point-in-time
  restore (console → **Branching** → restore to a point in time). For a
  portable copy, dump via a Postgres client over the **direct** URL:
  ```bash
  psql "$DATABASE_URL_DIRECT" -c "SELECT count(*) FROM \"user\";"  # sanity
  pg_dump "$DATABASE_URL_DIRECT" > kiftet-$(date +%F).sql           # full copy
  ```
- **Before any release:** one fresh backup + one manual
  `SELECT count(*) FROM user;` to know the fleet you're protecting.
- Retention: keep 14 nightly copies, 4 weekly.

---

## 11. Incident playbook

| Symptom | Cause | Fix |
|---|---|---|
| Login loops; every auth call 401 | `CORS_ORIGIN` missing/wrong on the API | set it to the exact web origin and redeploy |
| API calls reach the wrong host | `VITE_SERVER_URL` wrong/missing (or a phone is using `localhost`) | set the API root; for a phone on Wi-Fi, use the computer's LAN address per [`docs/howItWorks/running.md`](docs/howItWorks/running.md) |
| Any login 500s | `BETTER_AUTH_SECRET` mismatch or too short (`< 32`) | set a stable secret, redeploy API |
| Empty "graded" output / template lessons | `GEMINI_API_KEY` missing/invalid | set key, redeploy; check the server log |
| `429 Too Many Requests` | AI rate limit (30/min/user) — working as designed | wait a minute; don't throttle-cap it |
| API process dies every boot | `DATABASE_URL` missing, malformed, or pointing at the wrong Neon project | set pooled URL (`-pooler`); check the Neon console for the right project |
| Migrations fail on boot ("already exists") | stale DB schema vs. migration journal (e.g. after a manual schema edit) | do not hand-edit schema; `git revert` unschema changes and redeploy, or ask before touching the DB |
| Stale UI after a deploy | cached by the service worker | hard refresh; it self-heals on next load (autoUpdate) |
| No Google, Facebook or GitHub button | provider pair incomplete, or set on the wrong service | `curl /api/auth-providers`; set both halves on the **API** service and redeploy |
| Social button → provider → Kiftet error page | redirect URI mismatch (trailing slash, `www`, or `http` vs `https`) | fix the URI character by character; add both spellings to the provider's allow-list |
| "Access blocked" (Google) | consent screen still in **Testing** | publish it, or add the account as a test user |
| "This app isn't available right now" (Facebook) | app still in **Development** mode | Meta → app settings → switch to **Live** |
| Everyone silently signed out after a deploy | `BETTER_AUTH_URL` or `BETTER_AUTH_SECRET` changed | restore the previous value; the cookie is `HttpOnly`, so nothing on the page can explain it |
| Password reset "does nothing" | `AUTH_EMAIL_TRANSPORT=console` — the link is in the server log, not the student's inbox | expected today; needs a transport shipped in `packages/auth/src/email.ts` |
| Offline page on every load | web app can't reach the API *or* no network | check §9.1 health; check the client's connectivity |
| Server boots but locals see 500s while you don't | node/bun version drift | `nvm use` to 22.23.2, `bun install`, restart |
| varlock/env errors after pulling | `.env.schema` changed | `bun run env:generate` then rebuild |

When you take corrective action, update this table, then re-run §9.

---

## 12. Scheduled care (calendar, every month)

- Rotate `BETTER_AUTH_SECRET` (logs everyone out) and `GEMINI_API_KEY`.
- Confirm Neon backups/PITR window is healthy and a `pg_dump` copy restores.
- Re-run Lighthouse on the home page; keep the PWA badge green.
- Keep Neon under its free-tier limits (connections, storage) — the server
  pool is capped at 5 connections already.
- Re-audit the dependency tree (`bun audit`) — dependency health is in
  [`docs/howItWorks/inventory.md`](docs/howItWorks/inventory.md) (§15.2).

---

## 13. Where to look when something is confusing

- **How the code works** — [`docs/howItWorks/`](docs/howItWorks/README.md), split
  by concern: product, stack, data flow, database, API, auth, security, env,
  decisions, glossary.
- **What to test by hand** — `docs/TESTING_GUIDE.md`.
- **Humans and environments** — this runbook.
