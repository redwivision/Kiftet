# Testing Guide — Kiftet

Workflow for the `prototype` branch:

- Build one phase at a time. Never move to the next phase until the current one is
  tested and fixed.
- After each phase, the implementer writes TWO sections below, under that phase:
  1. **How I tested** — exactly what commands/steps were run, what was verified,
     and *why* this approach was chosen (what failure it guards against).
  2. **How you can test** — step-by-step instructions for the developer to verify
     the phase themselves.

Phase-specific instructions begin below.

---

## Phase 0 — Skeleton (SQLite domain + API shell)

### How I tested

**What was verified:**
- SQLite migrations generated cleanly from the Drizzle schema (`bun run db:generate` in `packages/db`).
- Server boots against the fresh SQLite file, with auth tables + domain tables created automatically on first run.
- All API endpoints respond correctly and persist/return data from SQLite.
- Both `packages/db` and `apps/server` pass typecheck (`tsc --noEmit`).
- The web build (`turbo run build`) still succeeds with no regressions.
- SQLite file is gitignored (`*.db`) so no secrets or state leak into the repo.

**Steps run:**
1. `bun run env:generate` — regenerates `.ts` env types after adding `DATABASE_FILE` and `GEMINI_API_KEY` to `.env.schema` files. Guards against runtime crashes from missing env references.
2. `bun run db:generate` in `packages/db` — produces `0000_lethal_jazinda.sql` in `packages/db/src/migrations/`. Guards against schema drift: migration is the contract between code and DB shape.
3. Boot server (`bun run --cwd apps/server dev`) and smoke-test every endpoint:
   - `POST /api/chapters/ingest` → returns `{ textbookId, chapterId }`
   - `GET /api/chapters` → returns the ingested chapter
   - `POST /api/sessions/start` → returns `{ sessionId }`
   - `POST /api/sessions/:id/recall` → returns `transcriptText + gaps` (gaps empty — Phase 2 fills)
   - `POST /api/sessions/:id/microlesson` → returns `{ text: "" }` (stub)
   - `POST /api/sessions/:id/retest` → returns `{ questions: [] }` (stub)
   - `GET /api/sessions/:id/result` → returns `{ before: 0, after: null, delta: null }`
   - `POST /api/sessions/:id/complete` → returns `{ ok: true }`
4. `bun run --cwd packages/db check-types` + `bun run --cwd apps/server check-types` — both clean.

**Why this approach:** Endpoints were tested with raw `curl` calls in a single script that boots the server, runs the requests sequentially, and kills it. This catches:
- Startup crashes (missing modules, broken imports)
- Silent SQL schema errors (table mismatch between migration and Drizzle queries)
- Route wiring bugs (404s on endpoints that should exist)

### How you can test

1. **Regenerate env types** (needed after any schema change):
   ```
   bun run env:generate
   ```

2. **Generate SQLite migrations** (first time only; re-run if schema changes):
   ```
   cd packages/db && bun run db:generate
   ```

3. **Start the server:**
   ```
   bun run --cwd apps/server dev
   ```

4. **Test each endpoint** (paste into your terminal one at a time):
   ```
   # Health check
   curl http://localhost:3000/

   # Ingest a chapter
   curl -X POST http://localhost:3000/api/chapters/ingest \
     -H 'Content-Type: application/json' \
     -d '{"textbookTitle":"Test Physics","subject":"Physics","title":"Thermal Equilibrium","rawText":"Thermal equilibrium is when two objects reach the same temperature."}'

   # List chapters (copy the textbookId from above)
   curl http://localhost:3000/api/chapters

   # Start a session (replace CHAPTER_ID)
   curl -X POST http://localhost:3000/api/sessions/start \
     -H 'Content-Type: application/json' \
     -d '{"chapterId":"CHAPTER_ID_HERE"}'

   # Record a recall (copy sessionId from above)
   curl -X POST http://localhost:3000/api/sessions/SESSION_ID/recall \
     -H 'Content-Type: application/json' \
     -d '{"transcriptText":"Thermal equilibrium is when two objects reach the same temperature."}'

   # View result (before/after)
   curl http://localhost:3000/api/sessions/SESSION_ID/result
   ```

5. **Verify the SQLite file exists** after first request:
   ```
   ls -la apps/server/kiftet-dev.db
   ```
   If it's there and has data, Phase 0 is working.

6. **Typecheck** (optional, catches regressions):
   ```
   bun run --cwd packages/db check-types
   bun run --cwd apps/server check-types
   ```