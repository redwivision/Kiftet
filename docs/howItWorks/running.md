# How Kiftet Works — how to run everything

> Part of the [how-it-works index](README.md).


```bash
# 1. Install dependencies
bun install

# 2. Regenerate env types (varlock reads .env.schema → TS)
bun run env:generate

# 3. Start the backend
bun run --cwd apps/server dev        # → http://localhost:3000

# 4. Start the web app (different terminal)
bun run --cwd apps/web dev           # → http://localhost:5173
```

The server applies pending migrations automatically on boot, then listens. The
database is Postgres; `DATABASE_URL` / `DATABASE_URL_DIRECT` come from your
`.env` (a local Postgres in development, Neon in production).

