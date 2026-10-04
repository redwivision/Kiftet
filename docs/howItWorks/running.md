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

For a phone-on-Wi-Fi test, use the mobile setup below instead of opening a
`localhost` URL on the phone.

### Testing from a phone on the same network

`localhost` on a phone points to the phone, not this computer. Set the
computer's LAN address (shown by `ipconfig getifaddr en0` on macOS, for example)
in both local env files, replacing `192.168.1.5` below:

```dotenv
# apps/web/.env — API root, without /api
VITE_SERVER_URL=http://192.168.1.5:3000

# apps/server/.env — Better Auth public URL and allowed web origin
BETTER_AUTH_URL=http://192.168.1.5:3000
CORS_ORIGIN=http://192.168.1.5:5173
```

Restart both dev servers after changing the env files. Start the web server
with `bun run --cwd apps/web dev --host 0.0.0.0`, keep the API running on port
3000, and open `http://192.168.1.5:5173` on the phone while it is on the same
Wi-Fi. The API listener accepts connections on the host's network interfaces.
For OAuth, the provider must also allow the callback URL
`http://192.168.1.5:3000/api/auth/callback/<provider>`; use an HTTPS tunnel if
the provider does not accept a local-network callback.
