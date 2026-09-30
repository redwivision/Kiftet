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
- **Mastery (per-concept)** — a `0`–`3` level for one checklist concept: `0` not
  addressed, `1` raised but not explained, `2` explained *wrong*, `3` explained
  correctly. Grading returns a map of these; the covered/missing/misconception
  lists and the overall score are both derived from it, never graded separately.
- **Weight** — how important a concept is (1–5, from the chapter checklist).
  Weights decide how much each concept contributes to the overall score, so a
  heavy idea counts for more than an aside.
- **Estimated grade** — a grade produced by the deterministic fallback instead of
  Gemini. It can detect *which* ideas were mentioned but not whether they were
  explained, so it deliberately under-credits and is flagged `estimated: true`
  in the API and labelled in the UI. Never present one as a real measurement.
- **Concept checklist** — the list of ideas a chapter must cover, extracted at
  ingest. It is the yardstick for every grade, and the key a mastery map is
  stored against.
- **Guide section** — one concept's teaching content: `what` (the idea), `why`
  (why it matters), `recall` (the say-it-back prompt). Generated once per
  `(chapter, concept, language)` and shared by every student; the *order* of the
  sections is per-student.
- **Triage order** — the study order the guide uses, computed from a mastery map
  with no AI call: `2` (wrong) first, then `1` (raised, not explained), then `0`
  (untouched) by weight, then `3` (already solid) last as a confirmation. Wrong
  beliefs come first because re-reading cannot fix them.
- **Source anchor** — a concept's real character offset and sentence in the
  chapter's own text, found by lexical overlap and computed rather than
  generated. A model asked for a location invents one, so it is never asked.
- **Student-independent content** — content that depends on the chapter and the
  language but not on who is asking. This is the property that makes a cached
  guide possible: the second student on a chapter generates nothing.
