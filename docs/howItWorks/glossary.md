# How Kiftet Works — glossary

> Part of the [how-it-works index](README.md).

---
- **API** — the agreed list of operations one program exposes to another.
- **JSON** — a readable text format for sending structured data.
- **Route / endpoint** — a URL + method the server handles, e.g. `GET /api/chapters`.
- **Middleware** — code that runs *around* every request (e.g. CORS, JSON parsing).
- **Foreign key** — a column that points at another table's row, linking them.
- **Migration** — a recorded, replayable change to the database schema.
- **ORM** — a tool that lets you write database queries in your programming
  language instead of raw SQL (Drizzle).
- **Seeder / ingest** — code that puts starting data (chapters) into the DB.
- **STT / TTS** — speech-to-text (hear) and text-to-speech (speak).
- **PWA** — a website that can be installed and works offline like an app.
- **Separation of concerns** — splitting a system so each part has one job and
  only talks to others through clear interfaces.
- **Cookie** — a small key/value a server tells the browser to remember and send
  back with every subsequent request. Our session cookie is how the server knows
  "this request is from who signed in on that phone."
- **Session** — in our app, a row in the `session` table representing one
  logged-in browser. The cookie value maps to a session row; the row says when it
  expires and which user owns it.
- **Hash / hashing** — turning a value into a one-way fingerprint. Passwords are
  stored hashed (with scrypt) so even the database leaking can't reveal them.
- **Origin** — scheme + host + port, e.g. `https://app.kiftet.com`. Browsers use
  origins, not just domains, to decide what to trust.
- **CORS** — "Cross-Origin Resource Sharing"; the rules a server publishes for
  *which other origins* may call it. See [security](security.md).
- **CSRF** — "Cross-Site Request Forgery"; a hostile website tricking your
  browser into sending an authenticated request to a site you trust. We defend
  against it by verifying the Origin header ([security §9.4](security.md)).
- **Rate limit** — capping how many times something can happen per unit of time
  (e.g. 30 AI calls per user per minute) so one user can't overload the system.
- **Idempotency** — doing the same operation twice has no extra effect. Our
  duplicate-recognizing `attemptId` makes a network retry harmless ([policies §10.4](security.md)).
- **Health check** — a ping endpoint (`GET /`) that monitoring systems hit to
  confirm the server is alive.
