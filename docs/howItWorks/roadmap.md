# How Kiftet Works — where we are (roadmap)

> Part of the [how-it-works index](README.md). Phase-by-phase status and the go-live checklist.

## The current thread

**Read this first when picking the work back up.** The table below tracks
*phases*; this tracks *what was actually in flight*, which is the thing a phase
table can't tell you.

| When | What landed | Notes |
|---|---|---|
| 2026-09-27 | **Official period allocations — the schema, and the discipline around it** | `syllabus_unit.periods` + `periods_source` (migration `0004`), surfaced by the syllabus API and rendered on `/syllabus` only when a figure exists. Two deliberate refusals: the column lives on the **unit**, not the concept (MoE allocates per unit/sub-unit; there is no official per-concept number, and a number there would manufacture authority we don't have), and all six Biology 12 units ship as `NULL` because the verified source — the textbook's table of contents — does not state allocations. Guessing them would be exactly the fabricated ground truth the bet exists to prevent. The seed writes a figure only when a unit declares one and omits the columns from its `ON CONFLICT` SET, so a teacher's transcription can't be blanked by a boot — verified on a scratch Postgres (declared written, undeclared `NULL`, stored `24` survived a seed replay that overwrote the title). **Remaining: transcribe the real numbers from the official MoE Grade 12 Biology syllabus.** See [`SYLLABUS.md`](../SYLLABUS.md) §4. |
| 2026-09-27 | **Fixed: we were serving fallbacks to rate-limited students and never saying so** | Our per-user AI allowance (30/min) was 3× the Gemini free tier's *per-project* ceiling (~10/min), so 429s were being manufactured by our own limit. Each one hit `catch { return fallback(); }` with **no log and no counter** — a student on a fallback was indistinguishable from a successful student. Now: allowance lowered to 8/min (demo 3), `askJson` retries 429/5xx with jittered backoff inside one 24s budget (under the 30s client timeout), 400/404 fail fast instead of burning quota, and every degraded path logs a reason to `[ai]` plus a counter, exposed at `GET /api/ai/telemetry`. Retrying also means fewer fallbacks overall. Verified the retry/classification branches with a throwaway harness (13 cases) before deleting it — it is not a lasting test, because it duplicates the private logic. |
| 2026-09-27 | **The smart study guide was designed** (not built) | Agreed on scope: the student picks the chapter(s) and/or topic(s), the guide prioritises weak concepts, and retest becomes an *optional* tool usable **before** studying to diagnose and **after** to verify. Kiftet was explicitly reframed as one instrument in a larger kit that routes the student out to the textbook, NotebookLM, FutureX etc. — that dissolved the "walled garden" objection to a written guide, and it is why the guide needs real **source anchors**. Hard constraint recorded: the Gemini free tier is per _project_ and shared by all users, so the guide **must** be cached per concept, not generated per session. Full design, free-tier budget and sequencing in [Phase 11 below](#phase-11--the-smart-study-guide); two forks still need a decision. |
| 2026-09-27 | `09bd00d` — rebuilt the control layer, failure states and PWA caching | `error-screen.tsx`, `navigation-progress.tsx`, the typed `messages.ts` corpus, the rebuilt `root.tsx`/auth shell, and a PWA caching pass. Shipped **without** being recorded here, which is why this section now exists. |
| 2026-09-27 | The repo's quality baseline, settled | The formatting debt is gone and `bun run lint` exits 0 for the first time. See [the gates](../RUNBOOK.md#4-the-quality-gates). Two real bugs fell out of it — see below. |
| 2026-09-27 | `migrateDb()` takes a Postgres advisory lock | Was an unchecked go-live item; two instances of a rolling deploy could race the migration journal. |
| 2026-09-27 | CI: `.github/workflows/ci.yml`, blocking `main` | Lint + typecheck + build on every push and PR to `main`. **There are still no automated tests** — CI proves it builds and typechecks, not that it works. |

### Bugs the lint pass actually found

Not cosmetic — both were live in the study loop:

- **Stale closure in the "still listening" grace timer.** It read the message
  count from its own closure, which React had frozen at mount. While the student
  spoke, the count never appeared to change, so the timer fired a false
  "still listening?" nudge seven seconds into a perfectly healthy answer. It now
  reads through a ref, and a timer whose window has moved on retires itself.
- **`useExhaustiveDependencies` was suppressed, not satisfied.** Every effect in
  `VoiceCapture` carried a dead `eslint-disable` comment from a previous lint
  setup. The rule is now `error` and all of them pass honestly — the unstable
  inline `submit` props became `useCallback`s, and the values that are
  deliberately read "as of right now" go through refs. No behaviour change
  intended; the study loop is the one place to watch on the next manual pass.

## Phases

| Phase | Name | Status |
|---|---|---|
| 0 | Skeleton — domain, API shell, AI seam | ✅ Done |
| 1 | Voice spine — Voxide capture/playback + voice-state UI | ✅ Done |
| 2 | AI loop — real Gemini: extraction, grading, micro-lessons, retest | ✅ Done |
| 3 | Web flow — Web recall→gap→lesson→retest screens | ✅ Done |
| 4 | Demo dataset + polish | ✅ Done (live demo) |
| 5 | Deploy (EthioDeploy) + Postgres (Neon) switch | ✅ Done |
| 6 | Your own textbook — student uploads their book (PDF/paste), device reads the TOC and slices it into chunks, per-chunk ingest → study | ⏭️ Next (UI shipped, import gated; chunking + MB cap + demo quotas are in) |
| 7 | Syllabus anchoring (bet 1) — browse the national syllabus unit by unit, map your chapters to units, watch unit coverage grow | 🔨 In progress (slice shipped: `syllabus`/`syllabus_unit` tables + migrations, **verified** Biology 12 seed — the 6 MoE New-Curriculum units with provenance in `sourceNote`, `/syllabus` routes, chapter→unit mapping, `/syllabus` UI) |
| 8 | Misconception events + first aggregate map (bet 2) — count each known misconception surfaced in a session, show only clusters above the k-anonymity floor | 🔨 In progress (first slice shipped: `misconception_hit` table + migration, recorder on recall grading, `GET /misconceptions` with K=5 floor, dashboard panel) |
| 9 | Offline-first loop (bet 3) — cached checklists/chapters, a submission outbox with an honest "saved — will be graded when you're back online" state, reconnect sync through the existing attempt idempotency | 🔨 In progress (slice shipped: `lib/store.ts` IndexedDB stores, `lib/outbox.ts` replaying with the original `attemptId`, `use-online` hook, offline banner, queued-state panels on recall/retest, checklist + chapter caching with offline fallbacks, per-session lesson + retest-question cache with honest offline re-reads)
| 10 | Amharic everywhere (bet 4) — bilingual EN/🇪🇹 both-script chrome, generated content in both scripts, Ethiopic type verified | ✅ Done (slices A–D shipped: `Language` pref at `kiftet-language` + persisted through the `LanguageProvider`, pre-hydration `lang` script, `LanguageSwitcher` in the header, typed `messages.ts` corpus where `am` must cover every key, and the study loop's load-bearing chrome wired → `t()`: the four step pills, phase headings/bodies, every primary CTA, session/error/queued/result/voice-guide copy, and the offline banner), plus the landing page and the dashboard, syllabus, textbooks, and voice-test routes. Slice C makes generated content follow the pref: the loop sends `language: "am"`, gemini.ts writes lessons/retest questions in Amharic (Ge'ez) via the `AMHARIC_OUTPUT` instruction with concept names kept verbatim as data, offline fallback content is Amharic too, cached reads honestly flag their language, and a "በአማርኛ / In Amharic" badge marks generated text. Slice D verified the SVG/icon set (same `OPEN_ARC` geometry as the brand mark) and the Ethiopic type stack (Noto Sans Ethiopic loaded at 400–700, Ethiopic-first font stacks, pre-hydration `lang`), and closed the doc gaps — including this doc being split into `docs/howItWorks/` |

| 11 | The smart study guide — scope the student picks (chapter(s) and/or topic(s)), per-concept mastery, a structured guide cached per concept, retest as an optional pre/post tool | 🔨 In progress (**design settled, nothing built** — [see below](#phase-11--the-smart-study-guide); the micro-lesson it replaces is still what ships) |
| 12 | Syllabus depth — official `periods` per unit, then Biology 9/10/11 | 🔨 Schema landed (migration `0004`: nullable `periods` + `periods_source` on `syllabus_unit`, exposed via the syllabus API and shown on `/syllabus`; the seed writes figures only when a unit declares one, and never blanks a teacher's transcription on boot). **The data is the remaining work** — Biology 12's six units are deliberately `NULL` until transcribed from the official syllabus document ([`SYLLABUS.md`](../SYLLABUS.md) §4, §6) |

The five product bets that steer the phases after this — syllabus
anchoring, the national misconception map, the offline-first study loop, Amharic
in everything, and Ethiopian texture — live in [`STRATEGY.md`](../STRATEGY.md);
each phase in this table names the bet it advances. Phase 11 is the exception:
it is a bet of its own, but it *serves* three of the others — per-concept
mastery is what finally makes the misconception map per-concept, its cached
sections are a hard requirement of the offline bet, and Amharic parity applies
to every section it generates.

**The bets were reframed in `STRATEGY.md` v2** around one rule: *content is
delivery, diagnosis is the product.* Syllabus anchoring is now the **core
defensible asset** rather than one bet among several, and a **subject boundary**
was drawn — conceptual subjects only, explicitly, until the assessment instrument
supports computation. Both are argued in [`STRATEGY.md`](../STRATEGY.md) and
[`SYLLABUS.md`](../SYLLABUS.md); the subject boundary is a marketing
commitment, not only an engineering one.

## Phase 11 — the smart study guide

**Read this second when picking the work back up.** The micro-lesson is the
weakest part of an otherwise real product, and this is the agreed design for
replacing it. **None of it is built yet** — what ships today is still the
micro-lesson.

### Why the micro-lesson has to go

Not a matter of taste. Four things are wrong with it, all verifiable:

- **`LESSON_SYSTEM` fights structure on purpose.** It demands 4–8 sentences of
  plain prose — "no headings, no lists, no markdown" — tuned for a single voice
  playback. Right brief for a nudge, wrong brief for a study guide.
- **The model never sees the book.** `generateMicroLesson` sends
  `gapsSummary(gaps)` and nothing else: concept *names*. Meanwhile
  `chapter.rawText` has been sitting in the database the whole time. The lesson
  is thin because it was never given the source.
- **The checklist is fetched, then discarded.** `generateMicroLesson` and
  `generateRetestQuestions` both take a `concepts` argument and ignore it
  (`_concepts`, `gemini.ts:497` and `:518`).
- **Positive signal is erased on the way out.** `POST /sessions/:id/microlesson`
  hardcodes `covered: []` and `score: 0`, so the summary the lesson reads is
  built from absence alone.

The loop around it compounds this: retest is a *mandatory* phase 4 asking 2–3
questions immediately, so a student who just read the answer is asked to prove
they learned it.

### The constraint that decides the design

**The Gemini free tier is per _project_, not per key.** Roughly ~10 requests per
minute and ~1,000–1,500 per day, **shared by every user we have**; the daily
quota resets at midnight Pacific. Input and output are both free, context
caching is available on free, Batch is not. Google is explicit that "specified
rate limits are not guaranteed and actual capacity may vary," and secondary
sources disagree on the exact RPD figure — so treat this as the *shape* of the
budget, and the numbers in AI Studio as the budget.

Against a chapter of ~12 concepts:

| Guide generation | AI calls | Capacity at ~1,500 calls/day |
|---|---|---|
| Per session, uncached | 12 to show one guide | ~125 guide views, ever, across all users |
| Per chapter, cached | 12 once, then none | bounded by how many *distinct chapters* exist |

This is not a tuning decision. Per-session generation is dead on arrival, and
the cache *is* the design. Note the offline store already works against us
here: `CachedLessonRow` is keyed by `sessionId` (`store.ts:175`), so it cannot
dedupe across students even in principle.

### The architecture: split student-independent from student-dependent

This one idea is what the phase rests on.

> **A concept section depends on the chapter text and the language. It does not
> depend on the student.**

So the content half is generated once per `(chapter, concept, language)`,
stored, and shared by every session and every student from then on. The
personalisation half — ordering, the "focus here" badges, the "already solid"
line — is computed **deterministically from mastery data, at zero AI cost.**

Four things fall out of that split:

- **Cost per chapter, not per session.** Break-even is the second student.
- **Small calls.** One concept per call, so a timeout or a malformed reply costs
  a *section*, never the whole guide.
- **Reviewable once.** Every student sees the same guide, so it gets read,
  corrected and Amharic-checked one time instead of per session.
- **Generation leaves the critical path.** Warm the cache when a chapter is
  first opened, queue the rest behind a concurrency cap, and never make a
  student wait on twelve sequential calls to read a page.

### The reliability ladder

Every section degrades in three steps, and the student should be able to tell
which step they got:

1. Valid JSON from the model → use it.
2. Timeout, 429, or malformed → build the section deterministically from
   `conceptText` plus the overlapping chapter sentences. That lexical machinery
   (`significantTokens`, `fallbackExtract`) already exists in `gemini.ts`.
3. Nothing at all → show the concept name and weight. The checklist *is* the
   skeleton; a chapter with no prose is still a usable revision list.

### A live bug this exposes

**We were degrading silently.** `AI_REQUESTS_PER_MINUTE` was
`{ signedIn: 30, demo: 5 }` — three times what the free tier allows — and
`askJson` had no retry and no status handling. Every 429 therefore landed in a
bare `catch { return fallback(); }` **with no logging and no counter**, so a
rate-limited student got the fallback lesson, no indication anything went
wrong, and nothing anywhere recorded that it had happened.

**Fixed** (see the current thread): the per-user allowance is now `8`/`3`,
deliberately under the per-project ceiling; `askJson` retries `429/5xx` with
exponential backoff *and jitter* inside a single 24s wall-clock budget, so
retrying can't outlive the 30s client fetch timeout; `400`/`404` fail fast
instead of burning quota; and every fallback path logs a reason and bumps a
counter, readable at `GET /api/ai/telemetry` (auth-gated, in-memory for now).
Retrying a 429 also means fewer students see a fallback at all — the old
behaviour threw the request away on the first 429.

So: treat 429 as a state the UI can surface rather than a secret, and revisit
the quota only against real counters.

### Prove it before paying for it

We cannot argue about cost yet, because **usage is invisible**: no count of AI
calls, 429s, or fallbacks per user exists. Instrumenting that is free, and it
is the prerequisite for the money conversation — not "we need more users" but
"here is the per-user cost curve, and here is the fallback rate." Once the daily
quota is the binding constraint and there are real numbers on the table, Gemini
Tier 1 input is $0.75/1M. We would be buying **headroom**, long before we would
be buying intelligence.

### Two things in the data that make the "plan" real

- `chapter.rawText` is already stored, so a chapter-wide guide is possible at
  all. The source is there; the prompt just never asks for it.
- `conceptNode` has **no source anchor** — no page, offset, or heading. For a
  plan that deliberately hands the student *out* to NotebookLM, their textbook,
  or FutureX, each concept needs a deterministic anchor into `rawText`. That is
  free to compute, and it is what turns a guide into a plan that routes.

### The spine: per-concept mastery

`focusScore` (`gemini.ts:357`) already loops over every concept and then throws
away everything but one weighted scalar. Extend grading to a 0–3 estimate per
concept and the rest of the phase falls out of it: guide ordering, retest
targeting, per-concept before/after on the result screen, and a misconception
map that is genuinely per-concept.

**One trap in the new pre/post retest.** Retest questions deliberately mirror
the student's *own* recall wording, and the cache carries the originating gap
set to stay honest about staleness (`store.ts:181-184`). That is good for
engagement and **invalid as a before/after delta** — you cannot compare two
different questions. Keep the mirroring; grade pre and post against the same
per-concept rubric, targeting the same concepts.

### Sequencing

1. **Instrument first.** Per-user AI call / 429 / fallback counters, plus a
   429-aware `askJson`. *(Partly landed: the counters and the 429-aware retry
   are in; `GET /api/ai/telemetry` is the read side.)*
2. **Per-concept mastery.** Replace the scalar with the 0–3 map; stop
   hardcoding `covered: []`.
3. **Guide sections + cache.** New table keyed by (chapter, concept, language);
   the three-step ladder; Amharic parity; source anchors.
4. **Scope selection** — chapters and/or topics, the student's choice.
5. **Retest as an optional tool**, pre- and post-, with the before/after view.
6. **Tests.** All of the above is currently verifiable by hand only.

**Cheap and high-leverage, done:** `syllabus_unit.periods` (migration `0004`)
carries the official period allocation from the MoE document, with
`periods_source` provenance, and `/syllabus` shows it when present. This turns
prioritisation from the model's 1–5 guess into a fact from the state — but
**only once the figures are transcribed**; all six Biology 12 units are `NULL`
on purpose, because inventing them would be the fabricated authority this
exists to prevent. Still to do: transcribe the real numbers, and let a unit's
allocation drive concept ordering in the Phase 11 guide. Details in
[`SYLLABUS.md`](../SYLLABUS.md) §4.

### Open forks — decisions needed before step 4

- **Surface.** The existing loop is a *session*, and a session is structurally
  one chapter; but the agreed scope is "chapter(s) and/or topic(s), the
  student's choice," which can span chapters. Either the guide lives inside the
  session loop and scope is capped at one chapter, or a new **Plan** surface is
  defined first and the retest becomes an optional tool inside it. The second
  matches what was actually asked for, and it is much larger.
- **A structured guide is an object, not a string.** `lessonText` is
  `string | null` through the reducer, the IndexedDB cache, the Amharic corpus
  and `LessonPhase`. Convert it deliberately in step 3 rather than smuggling
  JSON through a string field.
- **When to pay** is not a step here. Revisit only against real counters.

## Go-live checklist — Phase 6
- [ ] **DB-backed quotas** — replace the in-memory AI window with a per-user
      usage table (e.g. `ai_usage`) so caps survive restarts and multiple
      server instances, and signed-in users get a much larger budget than demo
      (30/min → generous).
- [ ] **Idempotency keys on chunk import** — the server `reused` check already
      prevents double-spend; add a client `chunkKey` (from the TOC path) so a
      retry is provably the same chunk even across re-planning.
- [ ] **Optional server-side Docling pass** — Docling (IBM, MIT) or Marker 2.0
      (Apache-2.0) are free, on-device/server-side converters that produce
      layout-aware markdown (tables, formulas, reading order) and are a strict
      upgrade for scanned or layout-mangled PDFs. Keep the pdf.js-outline path
      for the school-wifi case; offer Docling as the "high quality" route.
- [ ] **Usage visibility** — promote the demo budget pill to a real per-user
      quota screen once quotas are DB-backed.
- [ ] **Session lifetime** — configure Better Auth `expiresIn` (currently the
      default ~7 days) once product decides on a cadence.
- [ ] **Cookie hardening** — switch `sameSite: "none"` → `"lax"` if app and
      API stay same-origin; keep `"none"` only while the split dev/server
      origins need the cookie to cross.
- [ ] **DB TLS verification** — enable `rejectUnauthorized` for Neon now that
      the pooled-cert question is pinned down, so connections can't be
      intercepted.
- [x] **Migration advisory lock** — `migrateDb()` takes a Postgres advisory
      lock on its own connection before touching the journal, so the several
      instances of a rolling deploy serialize instead of racing. The loser waits,
      then finds the schema applied and no-ops.
- [x] **`/health` depth** — `/health` also pings the DB (a real `SELECT 1`
      through the pool, 503 + `database_unreachable` on failure) so platform
      health checks catch a dead database, not just a listening socket.
- [ ] **Demo janitor** — demo identity rows now persist (that's intentional);
      add a scheduled job to delete stale demo users + their textbooks so they
      don't accumulate.
- [ ] **`/sessions` N+1** — replace the per-row `resultSummary` loop in
      `GET /sessions` with one grouped query.
- [ ] **Request IDs + structured logs** — tag each request with an id and log
      JSON so support can trace a single failing study session.
- [ ] **Surface the no-voice reason** — `NoopVoiceClient` used to collect a
      "speech isn't supported" string and drop it. It's now honestly silent;
      wiring it to `onError` on tap is a product call (it would also change
      when the study loop falls back to text), not a plumbing one.

**Resolved in the hardening pass (no action needed):** centralized JSON error
middleware with friendly 413/500 copy; Gemini 20s timeout → deterministic
fallback; DB pool connect/query/idle timeouts; graceful shutdown on SIGTERM;
client fetch timeout (30s) + friendly offline copy; PDF worker cleaned up in
`finally`; demo identity made DB-backed (survives restarts) and `/demo/start`
IP-throttled; quotas shown live from `GET /api/ai/budget` instead of
hardcoded UI numbers.

**Resolved in the craft pass (no action needed):** the 10-item motion +
feedback pass landed — idle voice ring breathes (~3s), spinners became
ink-settling strokes (`InkSettling`), the "Gap closed." mark draws in and
settles to sage (`BrandMark closing`), concept-graph empty states, paper grain
on dark rooms, "Bring your own book" list brightness, a single one-shot
listening ripple, a breathing demo border, and an ink-page upload animation.
Retest questions now mirror the student's own recall wording, and feedback
colours are fixed (Sage `#5C7A5E`, Rust `#B54A2C`) instead of following the
room candle. All plain CSS keyframes behind utilities in `index.css`, collapsed
by `prefers-reduced-motion`. See [`STRATEGY.md`](../STRATEGY.md) for the five
product bets that steer the next phases.

> **The voice seam, honestly.** The SDK owns the orb + its word-by-word
> caption (no hide flag in `VoxideAppearance`). We never bet the platform on
> that: grading runs on the **joined transcript of every user chunk** — partial
> and final alike — because a long recall streams in as many pieces and
> filtering to "final" alone would silently drop most of what the student said
> (`transcriptOf` in `study.$sessionId.tsx`). The calm replies + read-back come
> from the browser natively — `speechSynthesis` for reading our reply aloud,
> no vendor TTS-commit. Voice = the seam; Gemini + text = load-bearing.

The rule that runs this branch: **build one phase, test it, fix it, write the
testing guide, only then start the next.** Nobody ever fires all phases at once —
each phase is a checkpoint.

---

