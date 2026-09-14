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

---

## Phase 1 — Voice spine (Voxide)

### How I tested

**What was verified:**
- The three new modules typecheck and build: `apps/web/src/lib/voice.ts` (the
  `VoiceClient` interface + Web Speech adapter), `hooks/use-voice-session.ts`,
  and `components/voice-ring.tsx`.
- A dedicated test route `/voice-test` renders identically via server-side
  rendering and client hydration — verified by producing the production build,
  starting `react-router-serve`, and curling the page (HTTP 200, correct HTML
  branch). This guards against hydration mismatch, where the server HTML and the
  browser's first render disagree (a React error that would make the page
  flash/break).
- The server-vs-client branch is explicit: SSR always renders the neutral
  "Loading voice…" state; the mic UI only mounts after hydration. See the
  `ready` flag in `voice-test.tsx`.
- Production build completes with no errors (`turbo run build`).

**Why the Web Speech adapter instead of Voxide SDK yet:** the real Voxide Web
SDK isn't in the repo yet, but Phase 1's goal is to *prove the voice loop
end-to-end with a testable seam*, not to block on the vendor. `lib/voice.ts`
defines the exact `VoiceClient` contract every screen will use; the
`WebSpeechVoiceClient` is a working implementation behind it (browser speech
recognition + synthesis). When the Voxide SDK lands, we swap one class —
nothing else changes. Same "seam" pattern as the Gemini AI layer.

**What could not be tested here (and why):** actual microphone input and audio
playback require a human in front of a browser with a mic — an automated test
can't hear. So the mic-specific behavior (transcription accuracy, TTS playback,
permission prompts) is handed to you in the next section.

### How you can test

1. Start the web app (needs the backend too, for later phases):
   ```
   bun run --cwd apps/server dev
   bun run --cwd apps/web dev
   ```
2. Open **http://localhost:5173/voice-test** in **Google Chrome** (the browser
   speech recognizer is Chrome-only). Grant microphone permission when asked.
3. **Speech-to-text (the big one):**
   - Tap the ring. It turns gold and pulses with a stop square — this is the
     "listening" state.
   - Explain a concept out loud, e.g. *"Thermal equilibrium is when two objects
     reach the same temperature."*
   - Tap the square to stop. The ring briefly shows "Thinking…", then your
     words appear under "What you said".
4. **Text-to-speech (talking back):**
   - Click "Hear a sample lesson". The ring switches to "Speaking…" and the
     browser reads the lesson aloud.
5. **Permission denied path:** revoke mic access (site settings → remove), tap
   the ring — you should get a clear "Microphone permission was denied" message
   instead of a silent failure.
6. **Unsupported path:** open the same URL in Safari (macOS) — you should see
   the "Voice isn't supported" notice.

If words appear in "What you said" and the sample lesson plays aloud, Phase 1 is
working.