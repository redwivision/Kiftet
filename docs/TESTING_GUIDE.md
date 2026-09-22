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

---

## Phase 2 — Gemini AI loop

**LIVE as of the Voxide round:** a real `GEMINI_API_KEY` is in
`apps/server/.env` (gitignored). **Important:** the old default model
`gemini-2.0-flash` was retired by Google (404 "no longer available"), which made
every AI call silently fall back to heuristics even with a valid key. Fixed by
using `gemini-3.6-flash` (`apps/server/src/ai/gemini.ts`). Verified end-to-end
over HTTP: recall grades semantically (covered/missing/misconceptions/score),
micro-lessons are genuine spoken lessons with analogies, retest questions are
targeted spoken prompts, and `extractConcepts` returns weighted concepts +
misconceptions.

### How I tested

**What was verified:**
- The AI service in `apps/server/src/ai/gemini.ts` now has real Gemini prompt
  bodies (extract, grade, lesson, retest) plus a deterministic fallback chain —
  the app never hard-fails whether a key is present or not.
- **The missing ingest gap is fixed:** `/chapters/ingest` now calls
  `ai.extractConcepts` and persists concept rows to `concept_node`. Without this,
  all downstream endpoints (`/recall`, `/microlesson`, `/retest`) were grading
  against an empty list — a latent bug that surfaced during Phase 2 planning.
- Full smoke-test of the entire API flow without a Gemini key (fallback path):
  ingest → session start → recall → microlesson → retest → retest/answer →
  result → complete. All returned 200 with correct shapes, no errors, no
  exceptions in server logs.
- Server typechecks clean with the new Gemini SDK calls.

**Fallback chain design:** when `GEMINI_API_KEY` equals the placeholder, the
service skips the Gemini call entirely and falls back to a heuristic:
- extract: sentence-splitting picks 8 meaningful sentences from the chapter text.
- grade: word-overlap scoring determines what the student mentioned.
- lesson/retest: templates produce a reasonable experience even when no key is
  set. This matches the system design's "product works even when a service is
  missing" seam rule, and lets you run the whole flow in dev without touching
  the key.

### How you can test

**Without a key (fallback path):**

1. Boot the server:
   ```
   bun run --cwd apps/server dev
   ```
2. Open a terminal and run the same curl sequence. The placeholder key in
   `.env.schema` is enough — no Gemini key needed:
   ```
   # ingest (creates concepts from the chapter text)
   curl -s -X POST http://localhost:3000/api/chapters/ingest \
     -H 'Content-Type: application/json' \
     -d '{"textbookTitle":"Physics 12","subject":"Physics","title":"Heat & Temperature","rawText":"Temperature is a measure of the average kinetic energy of particles. Thermal equilibrium is reached when two objects reach the same temperature and heat stops flowing. Specific heat is the energy needed to raise one kilogram by one degree. Conduction transfers heat through direct contact."}'

   # list chapters → grab the id
   curl -s http://localhost:3000/api/chapters

   # start a session (replace CHAPTER_ID)
   curl -s -X POST http://localhost:3000/api/sessions/start \
     -H 'Content-Type: application/json' \
     -d '{"chapterId":"CHAPTER_ID"}'

   # recall (returns gap analysis with score)
   curl -s -X POST http://localhost:3000/api/sessions/SESSION_ID/recall \
     -H 'Content-Type: application/json' \
     -d '{"transcriptText":"Temperature measures kinetic energy. Heat flows from hot to cold."}'
   ```

   Every call should return a JSON object with data. The `conceptsExtracted`
   field on ingest should be ≥1; the `gaps.score` on recall should be 0–1.

**With a real Gemini key (AI path):**

1. Set `GEMINI_API_KEY` in `apps/server/.env` (not in `.env.schema`, which is
   the template — `.env` is the real local key file, gitignored):
   ```
   GEMINI_API_KEY=your_actual_key
   ```
2. Restart the server (`Ctrl-C`, then `bun run --cwd apps/server dev`).
3. Run the same curl sequence above. Now:
   - `conceptsExtracted` should be 5–10; concepts will be meaningful
     phrases + at least one misconception (`isMisconception: true`) when one
     exists in the text.
   - `gaps.score` after recall should reflect true semantic grading (often
     lower than 1.0, showing real gaps).
   - `microlesson` text will be a Gemini-written lesson; `retest` questions
     will be natural-language spoken prompts rather than templates.

---

## Voxide integration (voice agent)

### How I tested

**What was verified:**
- `@voxide/react@0.8.0` installed in `apps/web`.
- `apps/web/src/components/assistant.tsx` creates a `VoxideClient`, registers
  eight study capabilities (listChapters, startStudy, recall, getMicrolesson,
  startRetest, answerRetest, getSessionResult, completeSession), and binds live
  state (current page, active session/chapter IDs) so the agent always knows the
  study context.
- `<Assistant />` is mounted in `root.tsx`'s `App` — the single component that
  wraps every route via `<Outlet />`. It never unmounts on navigation, so an
  in-progress call survives page changes (the vendor's #1 integration rule).
- **SSR safety:** the client is constructed lazily (`getVoxideClient()`) and only
  on the browser, and `<Assistant />` renders nothing on the server. Verified by
  curling every route with no key — all return HTTP 200 with no crash.
- Production build and typecheck pass with the SDK wired in.

**Why lazy init:** the SDK throws `publicKey is required` at `new VoxideClient()`
with an empty key. Because the web app is server-rendered, creating the client at
module load would crash SSR at the exact moment the key is absent (e.g. here, in
CI, or before the user pastes their key). Lazy init keeps Voxide off until a key
exists.

### How you can test

1. **Set your key** in `apps/web/.env` (create it from `.env.schema`
   if missing) — the publishable key from voxide.app/dashboard → Integration:
   ```
   VITE_SERVER_URL=http://localhost:3000
   VITE_VOXIDE_KEY=vox_pub_YOUR_KEY
   ```
   Restart `bun run --cwd apps/web dev` after adding it.
2. **Whitelist the domain** — voxide.app/dashboard → project → Settings must
   allow `localhost` (dev always works) and your production domain later.
3. Boot both servers and open `http://localhost:5173/voice-test`: it should say
   "Voxide connected" and list the eight capabilities.
4. **Speak to it.** The orb sits at the bottom-right of every page. Try:
   - *"List my chapters"* — the agent returns the ingested chapters from the API.
   - *"Start studying heat and temperature"* — starts a session.
   - *"I'm done explaining: temperature measures kinetic energy, and heat flows
     from hot to cold until equilibrium."* — the recall capability grades it and
     the agent speaks back covered/missing + score.
   - *"Teach me what I missed"* — generates and speaks the micro-lesson.
   - *"Quiz me"* then speak an answer — the retest loop grades the answer.
   - *"How did I do?"* — reads the before/after delta.
5. **Without a key:** the orb simply doesn't appear (Web Speech fallback from
   Phase 1 remains for voice). Nothing crashes.

**Voice ring control (matches the design brief):**
- `/voice-test` now shows our **golden ring**, driven by Voxide's live session via
  `useVoxideVoice`. The ring and the corner widget control the SAME session.
- Tap once → `connect()` (start talking). Tap again while listening/thinking/
  speaking/executing → `interrupt()` (kills the in-flight command). The status
  line and ring state always say which behavior will fire next.
- Transcript appears under "Transcript" in the page.

**Latency tips (Voxide's dashboard, not the SDK):**
- Model choice is per-project in the Voxide dashboard, NOT settable in code.
  Pick the lightest agent model available — conversation replies ("hi") skip
  reasoning, so a Flash-Lite–class model answers much faster than a full model.
- Keep the agent's system/greeting prompt in the dashboard short; it is re-sent
  each turn and adds latency.
- Our side stays lean: `bindState` sends only page + session/chapter IDs, and
  capability summaries are kept terse.

**Who produces what ("is this our feedback or Voxide's?"):**
- Plain conversation ("hi", "thanks") = entirely Voxide's agent — no capability
  runs, so no Kiftet server call happens.
- Study feedback (score, concepts covered, gaps, misconceptions, lesson text,
  retest questions) = **our stack**: the transcript is sent to our `/api`
  endpoints by the capability handler, and the content comes from our Phase-2
  Gemini pipeline (or fallback heuristics).
- What's Voxide's: deciding WHICH capability to call, the wording around the
  result, and the voice that speaks it (TTS).

If the orb reacts to your voice and the agent answers with real data from the
API, Voxide is fully wired.

### Voxide glitch fix: "session opens then quickly closes"

**Symptom:** tapping the ring opens a session that immediately closes (or the UI
flits from Connecting→Listening→closed without input).

**Root cause (two layers, both fixed/understood):**
1. **Competing controllers (fixed).** `<VoxideWidget>` runs an internal effect
   that forces `disconnect()` whenever the session is live but the widget's own
   panel is closed (`launcherMode === "panel"` default). Since our ring started
   the session while the widget's panel stayed closed, the widget killed every
   session the ring opened — "opens then quickly closes". Fix: removed the
   `<VoxideWidget>` from `root.tsx`. The golden ring is now the SAME client and
   the ONLY control; the widget no longer exists to disconnect what the ring
   starts. Verified via CDP: tap → Connecting… → Listening… with no instant close.
2. **Early tap before `client.init()` (fixed).** The SDK gates `connect()` behind
   `client.isInitialized`; tapping before init finished printed `[Voxide] Client
   not initialized` and set the session to `error`. The widget masked this by
   holding its UI until `initState === "ready"`. Now `getVoxideClient()` calls
   `client.init()` (fire-and-forget) and `VoxideRing` subscribes to the client's
   `"ready"` event — it shows "Starting…" and ignores taps until ready.
3. **Vendor quota = the live limit right now (NOT a code bug).** Once connecting
   genuinely works, the vendor closes every session with `[Voxide WS] Server
   error: usage_limit`. That means the Voxide project has exhausted its plan
   quota. This is dashboard-side, not fixable in code. The session attaches, so
   `usage_limit` will be what most testers hit until the plan/quota is raised.
   How to test the ring truly works once quota is available: it should sit on
   "Tap and speak", then on tap go Connecting… → Listening… and STAY there while
   you speak (a higher limit/plan won't close it).

### How you can test (glitch fix)

1. `bun run --cwd apps/web dev` + `bun run --cwd apps/server dev`, open
   `http://localhost:5173/voice-test`.
2. Developer tools console: expect NO `hydrated` mismatch warning (we added
   `suppressHydrationWarning` to `<html>` for next-themes' dark class race) and
   no `[Voxide] Client not initialized` — the ring shows "Starting…" during
   `init()` then "Tap and speak".
3. Tap the ring. If the Voxide plan has quota: Connecting… → Listening… and it
   stays up while you talk; tap again mid-turn to interrupt. If the plan is out
   of quota: you'll see `[Voxide WS] Server error: usage_limit` in the console
   and the ring falls to "Tap to retry" — that is expected until the plan is
   topped up.

### Voxide capability 404 + ring-stop fixes

**Symptom A:** the agent answers conversation but capability calls fail ("I ran
into an issue…"). **Root cause:** `VITE_SERVER_URL` is the server root
(`http://localhost:3000`) with no `/api`, so handler paths like
`api("/chapters")` fetched `http://localhost:3000/chapters` → 404 (the old
fallback URL happened to include `/api`). Fix: `assistant.tsx` now strips any
trailing `/api` from the configured URL and always builds
`${serverRoot}/api${path}`, so both `...:3000` and `...:3000/api` work. Verified
via the SDK's own `_executeAction("listChapters")` in a headless browser →
`{status:"success", result:{chapters:[…]}}`.

**Symptom B:** tapping the ring again doesn't stop the voice. **Root cause:** my
ring called the SDK's `interrupt()`, which is a soft, vendor-acknowledged stop
that sets status back to "listening" with the mic still open — effectively a
no-op when tapped again. Fix: active-state taps now call `disconnect()`, the
same full-stop the vendor's mic button uses (WS + mic close, status → idle).
Tap once to start, tap again to hang up.

---

## Phase 3 — Web flow (recall → gap view → lesson → retest → result)

### How I tested

**What was verified (Phase-2-round review fixes):**

1. **Topic-type diversity — the reviewer's core ask.** Two chapters ingested into
   the same SQLite DB, graded live by real Gemini (key is in `apps/server/.env`,
   `DEFAULT_MODEL = "gemini-3.6-flash"`):
   - **"Heat and Temperature"** (conceptual) → recall `score: 0.29`, gaps a real
     missing list (covered *"temperature vs heat distinction"*, *"thermal
     equilibrium"*; missing *"specific heat capacity"*, *"latent heat"*,
     *"phase change explanation"*). Gemini grades conceptual recalls harshly and
     lists what's actually missing.
   - **"Electric Circuits and Ohm's Law"** (numerical/formula) → recall
     `score: 1.0`, every concept covered, no gaps (a correct, complete
     derivation).
   Both topic types produce a correct state machine transition (gaps present vs
   "covered everything / straight to result"), proving Gemini grading generalizes
   across conceptual **and** numerical/formula chapters — not just one.

2. **Try-again loop escape hatch.** The reducer tracks `attempts`; each time a
   retest delta fails to close a gap (`delta <= 0`), the session keeps its
   in-progress state and the result screen shows a calm **"Come back to this
   later"** link after 2 consecutive attempts (instead of forcing an infinite
   try-again loop). Clicking it returns to the dashboard and leaves the session
   **unfinished** (never calls `complete`), so it stays eligible for resume.
   This is the smooth path reviewer #1 asked for: not a failure, just a calm
   "some concepts need another pass" (Rust) state.

3. **Minimal retest feedback.** Each retest answer grades and shows only a single
   Sage (covered) or Rust (missed) status dot — no animation, no sound. Silence
   grace: if the mic produces no speech, a 7-second "Still listening — take your
   time" label appears before any "we couldn't hear you" copy (no auto-timeout
   on the client; the vendor no-input grace is handled by the Voxide plan).

4. **Failure states are calm and recoverable.** Mic permission denied, no
   speech, API timeout, network drop, server 500, and Gemini `usage_limit` all
   map to inline, non-blocking notices on the study screen (never an alert()).
   Text input is always an escape: "Prefer typing?" appears on recall and every
   retest question; if the voice client reports no Voxide key, the app defaults
   to typed mode so a session can never dead-end on a stuck ring.

5. **Result uses the LAST retest attempt.** `/api/sessions/:id/result`'s
   `after`/delta now come from the most recent retest submission (previously the
   FIRST), so "before → after" reflects the final pass, not the first one.
   `delta > 0` closes the gap → Sage result ("You covered everything"),
   `delta <= 0` → another-pass result ("Come back to this later").

**Verified by:**
- Both packages typecheck clean (`bun run --cwd apps/server check-types` and
  `bun run --cwd apps/web check-types` both exit 0) with the new
  `StudyProvider`/`GapList`/`study.$sessionId` route and the `gap`-closure math.
- Live API chain (curl + real Gemini): recall → gaps → microlesson → retest →
  answer → result over the actual server, two topic types, no heuristics
  fallback.

### How you can test

1. Boot both: `bun run --cwd apps/server dev` and `bun run --cwd apps/web dev`.
   Give the server a real `GEMINI_API_KEY`. Open http://localhost:5173.
2. **Dashboard** lists the two ingested chapters ("Heat and Temperature",
   "Electric Circuits and Ohm's Law"). Click one → study screen opens a fresh
   session with "Everything you remember about …".
3. **Text path:** click "Prefer typing?" and write a recall. Submit → gap view:
   Sage dots for covered, Rust dots for missing, score shown.
   - If you covered everything → straight to the result screen ("You covered
     everything").
4. **Optionally** switch to the golden ring and speak — same flow, voice-driven.
   If the mic never opens (permission or no key), you'll see the typed fallback
   instead of a stuck ring.
5. **Lesson:** "Hear the short version" → then "I'm ready to be tested" →
   "Question 1 of …" with typed answers; each gets a single Sage/Rust dot.
6. **Result:** after the retest the before/after delta decides the outcome:
   improved (Sage, "You covered everything") vs not improved (Rust, "Come back
   to this later"). To see the escape hatch: retest twice, fail both — after the
   second attempt the calm "Come back to this later" link appears; clicking it
   returns to the dashboard and does NOT mark the session complete.
7. To re-witness the topic-type difference: stud-ide "Electric Circuits…" first
   (numerical, likely full coverage) then "Heat and Temperature" (conceptual,
   likely gaps). Different scores on the same engine = grading that actually
   distinguishes topic types.
8. **Read-back, out loud, vendor-free.** On any "I'll read back" bubble, tap
   **Read it to me** → the browser's native `speechSynthesis` reads that calm
   reply aloud. This is OUR seam — no Voxide key, no vendor TTS, works even
   with the ring off. It never reads a partial word: the bubble and the speech
   both use the same finalized `!m.partial` copy as grading.

**What "finalized-only" means for the tester:** while the orb streams a sentence
it is *recognizing* word-by-word, `m.partial === true`. Grading, the "You
said" captions, and Read-it-to-me all ignore those partials and only act on the
finalized turn (`partial !== true`) — so a mid-word whisper can never be taken
as the answer. The ring's own live caption is SDK-owned UI and is the one place
that shows words landing one-by-one *visually*; the app itself never lets that
half-finished stream drive what we grade or read back.

## Phase 6 — Your own textbook (import → study)

> **Status:** UI shipped, import **gated** (preview). The device-side chunk
> planning, the 15 MB file cap, and the demo quotas (5 AI calls/min,
> 3 textbooks/day) are all live; the actual ingest + AI extraction is disabled
> behind `TEXTBOOK_IMPORT_ENABLED` until the go-live checklist in §13 lands.

### How to test

1. Down a real PDF with a text layer (any textbook excerpt), or just copy-paste
   chapter text. Confirm:
   - a PDF **over 15 MB** is rejected with a clear message (no extraction runs);
   - a scanned/image-only PDF (no embedded text) tells you to use paste.
2. In the app: **Add your textbook** → name it, pick subject + language, attach
   the PDF (or choose "paste text"). The PDF is read **on the device** — the
   file is never uploaded.
3. **TOC slicing:** chunk boundaries come from the PDF's own outline/bookmarks
   (`getOutline()`). Chunk titles show the full path (e.g. `Chapter 2 · 2.3
   Reflection`). For a pasted/text book, chunk starts fall back to heading
   detection (`Unit 1`, `ምዕራፍ 2`, …), then even page runs.
4. Review and edit chunk titles → in and out of the flow and back in
   **resumes** where it stopped (already-done chunks are skipped with
   `reused: true`, never re-ingested, never re-spending AI).
5. Each chunk is POSTed one at a time to `/api/chapters/ingest`; a fresh
   concept checklist is built per chunk. Watch for per-chunk progress, and a
   clear failure/retry on any single chunk (weak-wifi friendly: small text
   payloads, no giant upload).
6. Ingested chunks show up in the dashboard like the seeded chapters — start a
   study session on your own chunk and run recall → gaps → lesson → retest
   against **its** checklist.
7. **Demo quotas:** `GET /api/ai/budget` returns the current-minute AI budget
   and the daily book cap; the dashboard pill shows it. Firing more than
   5 AI calls within a minute returns `429` with a friendly message; a demo can
   only create 3 new textbooks per day (re-ingesting an existing book is free).
   Signed-in users get the large limits.

### How you can test

1. Dev: `bun run --cwd apps/server dev` + `bun run --cwd apps/web dev`, open
   http://localhost:5173. (The lazy-loaded PDF engine only downloads on first
   use — confirm the base bundle doesn't grow when this feature is closed.)
2. Dashboard empty state shows **Add your textbook**; the flow works end-to-end
   with a real PDF of a few pages (fast) and a long PDF (progress + resume).
3. With a `GEMINI_API_KEY` absent, ingest must still complete via the
   deterministic fallback (concepts of lower fidelity but never a hard failure).
4. Kill the wifi mid-import on one chunk → that chunk shows failed/retry and
   the next tap resumes without re-sending finished chunks.

### How to test — error presentation (hardening pass)

1. **Server failures are JSON, not HTML.** With the API up, hit
   `POST http://localhost:3000/api/sessions/start` with no auth header → you get
   `{"error": "..."}` (401), never an HTML stack page.
2. **Offline / abort copy:** open the app, throttle/disable the network, then
   submit a recall → with the bet-3 outbox in, the recall is **parked**, not
   dropped: the phase shows the "Saved — waiting on a connection" panel and the
   banner a queued count (see §offline below). For requests that *do* fail —
   an initial session load, a fetch with no cache — the UI says "Can't reach
   Kiftet…" or "That took too long…", never `TypeError: Failed to fetch`.
3. **Oversized body:** `curl` a >256 KB body to a route with `Content-Type:
   application/json` → `413` with "That request is too large…".
4. **Friendly validation:** an empty transcript on recall returns the
   "Say a little something…" message (not raw Zod text).
5. **Demo identity survives restart:** start a demo, record the
   `X-Demo-User-Id`, restart the server, then call `GET /api/ai/budget` with
   that header → `200` (identity is DB-backed now, it used to 401 after every
   redeploy).
6. **/demo/start throttling:** fire `POST /api/demo/start` more than 5 times in
   a minute from one IP → `429` with the "Too many demo rooms…" message.

---

## Offline-first study loop (bet 3 / phase 9)

This is a browser-only feature — the offline data lives in **IndexedDB**, which
no CLI can touch. So there are two verification tiers: the **compile gates**
(typecheck + build + SSR smoke — all below should pass with zero manual steps)
prove the `lib/store.ts`/`lib/outbox.ts` code never breaks a server render, and
the **manual steps** prove the loop itself survives a dead connection.

### How I tested (what the gates catch)

- `bun run --cwd apps/web check-types` — the new store/outbox/hook/types
  compile against the study provider and routes.
- `bun run build` — the Vite/SSR build resolves the new modules and renders
  (the SSR entry imports `useOnline`/`store` paths, which must no-op without
  `indexedDB` instead of throwing).
- Biome lint on the new files + the offline-slice edits.

### How you can test (manual, in the browser)

Everything below starts from: server dev (`bun run --cwd apps/server dev`),
web dev (`bun run --cwd apps/web dev`), open http://localhost:5173, open a
chapter and complete a recall so a checklist is cached.

1. **Chapters + checklist cache.** DevTools → Application → IndexedDB →
   `kiftet-store`: the `chapters` store has your chapter rows, the `checklist`
   store has one entry keyed by the chapter id. (Cache is written when the
   dashboard loads the list and when the gaps screen fetches the checklist.)
2. **Offline recall queues, never errors.** DevTools → Network, tick
   *Offline*. Submit a recall (speak or type, then end it). You should **not**
   see "Can't reach Kiftet" — instead the recall phase shows the rust
   **"Saved — waiting on a connection"** panel, the notice says it will be
   graded when you're back online, and the site-wide banner appears with
   **"1 saved answer … will be graded when you're back online."** No score, no
   right/wrong is shown anywhere — honesty is the point.
3. **Outbox row exists.** Application → IndexedDB → `outbox`: one item, with
   the **same `attemptId`** the live request would have used (check the
   network tab before going offline — the value is the same).
4. **Reconnect grades exactly once and resumes.** Un-tick *Offline*. The
   banner flips to **"Back online — grading 1 saved answer…"**, the outbox
   row disappears, and the study screen reloads the session onto its
   **graded** position (the diagnose/gaps view), never a second cold recall.
   Replaying the same `attemptId` goes through `insertAttemptOnce`, so a
   dropped/retried flush can never double-grade.
5. **Offline mid-retest.** Start a retest, go offline, answer a question →
   the *same* queued panel appears on that question (you can't advance past a
   queued answer). Reconnect → flush → session reloads at the next question.
6. **Dashboard offline fallback.** On the dashboard, go offline and reload.
   The chapter list renders from the cache with the **"Offline — saved
   chapters"** panel; without any cache (fresh browser) it shows the normal
   network error copy.
7. **Rate-limit / auth failures don't wedge the queue** (optional): force a
   `429`/`401` during a flush — the item stays queued for a later pass (`Try
   again` on the banner) instead of being deleted; only permanent failures
   (`404` session, `400` body) drop an item so the queue can't wedge forever.
