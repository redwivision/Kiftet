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

---

