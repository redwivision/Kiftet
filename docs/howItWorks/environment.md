# How Kiftet Works — environment variables

> Part of the [how-it-works index](README.md).


Every env var used by the system, where it's set, and what happens if it's
wrong.

| Variable | Where | What | Wrong = |
|---|---|---|---|
| `NODE_ENV` | Server, web | `development` / `production` / `test` | Dev-only features exposed in prod, or vice versa |
| `BETTER_AUTH_SECRET` | Server | Random string (≥32 chars), the master signing key for session tokens | Sessions rejected, every login 500s |
| `BETTER_AUTH_URL` | Server | The public URL of the API (e.g. `https://api.kiftet.com`) | Session cookie points to the wrong domain |
| `CORS_ORIGIN` | Server | Comma-separated trusted origins (e.g. `https://app.kiftet.com`) | Browser silently blocks every POST, login loop |
| `DATABASE_FILE` | Server (SQLite only) | Path to the `.db` file (e.g. `./kiftet-dev.db`) | Server crashes on boot |
| `DATABASE_URL` | Server (Postgres only) | Postgres connection string | Server crashes on boot |
| `DATABASE_URL_DIRECT` | DB package | Direct (non-pooled) Postgres connection for migrations | Migrations fail, schema stale |
| `GEMINI_API_KEY` | Server | Google Gemini API key | Grading returns empty placeholders; lessons fallback to templates |
| `VITE_SERVER_URL` | Web (client) | Root URL of the API (no `/api` suffix); falls back to `localhost:3000` in dev | All API calls 404; loud console warning in production |
| `VITE_SITE_URL` | Web (client) | Public origin of the web app (e.g. `https://app.kiftet.com`); makes `og:image`/`twitter:image` absolute | Relative share images — social previews may not render |
| `VITE_VOXIDE_KEY` | Web (client) | Voxide publishable key | Voice features disabled; typed fallback activates |

**How to set them:**
- **Local dev:** every package has a `.env.schema` file with safe placeholder
  values; `bun run env:generate` reads the schema and produces TypeScript types
  (`apps/server/src/env.ts`, `packages/db/src/env.ts`). Fill in real values
  in a `.env` file (never committed).
- **Production (hosting platform):** set the same variable names as environment
  secrets — Varlock reads them at build and runtime automatically.

## The boot-time env probe

On every server start the app prints a short diagnostic block **before** it
contacts the database, so a wrong or missing URL is visible in the logs instead
of a cryptic crash. Source: `apps/server/src/env-probe.ts`.

```
[env-probe] ==================== start
[env-probe] database-related env keys in the container: DATABASE_URL, DATABASE_URL_DIRECT
[env-probe] process.env.DATABASE_URL = postgresql://***@ep-silent-dream-...neon.tech/neondb
[env-probe] resolved app env DATABASE_URL = postgresql://***@ep-silent-dream-...neon.tech/neondb
[env-probe] resolved app env DATABASE_URL_DIRECT = postgresql://***@ep-silent-dream...neon.tech/neondb
[env-probe] OK: the app sees a real (non-placeholder) DATABASE_URL
[env-probe] ==================== end
```

How to read it:

- `process.env.DATABASE_URL` shows what the **platform actually injected**; the
  `resolved app env …` lines show what the app will use after its proxy
  (`apps/server/src/env.server.ts`) applies defaults — they can differ.
- `no database-related variables in the container env at all` means the
  platform's variables never reached the container (wrong service, not
  redeployed after setting, or overwritten by a platform database add-on).
- `WARNING: the app sees the localhost placeholder` means `DATABASE_URL` came
  through **empty**, so the app fell back to the `.env.schema` default
  (`postgresql://postgres:postgres@localhost:5432/kiftet`). Inside a container
  nothing listens on `localhost:5432`, so boot fails with `ECONNREFUSED` /
  `errno: -111` and the health check rolls the container back.
- Passwords are never printed — the probe redacts credentials and keys.

The probe emits every line to **both stdout and stderr**. Some platforms
surface only one stream in the boot log (often the stderr side where Node's
crash drill prints), so the dual write guarantees the block shows up no matter
which one is captured. If the block is missing entirely the deployed image was
built from a commit older than `cf68afe` and must be rebuilt from the latest
source.

---

