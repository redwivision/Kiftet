# How Kiftet Works — where we are (roadmap)

> Part of the [how-it-works index](README.md). Phase-by-phase status and the go-live checklist.

## The current thread

**Read this first when picking the work back up.** The table below tracks
*phases*; this tracks *what was actually in flight*, which is the thing a phase
table can't tell you.

| When | What landed | Notes |
|---|---|---|
| 2026-10-20 | **The syllabus surface is parked while focus is the uploaded book** | `/syllabus` still exists and works, but it is hidden behind `SYLLABUS_ENABLED` (`apps/web/src/lib/feature-flags.ts`): the dashboard's "Study by unit" button is gone and a direct URL hit redirects to the chapters. Rationale is the one already recorded — its `syllabus_unit.periods` figures are untranscribed (`NULL` on purpose), so browsing by unit shows structure the student cannot yet act on, and it competes for attention with the textbook they actually have. The route, the server endpoints and the components stay intact; flipping one flag re-opens it. Phase 12 (transcribing the real period numbers) is on hold for the same reason: no verified source, and it is not the priority. |
| 2026-10-20 | **Launch hardening 1: the funnel could see one client, and two hot queries had no index** | Two launch blockers fixed. **(1) `trust proxy` was never set**, so behind the PaaS edge `req.ip` was the *proxy's* address and every per-IP limiter keyed on one bucket — demo starts would collapse to 2/min for the entire world and waitlist signups to 60/hour for the entire world, the day traffic arrived. The server now sets `trust proxy` from `TRUST_PROXY` at boot (`lib/trust-proxy.ts`, default `1` in production / `loopback` in dev), logs the resolved setting, and the behaviour is proven by a real Express integration test (trusting one hop honours the forwarded address; disabling trust does not). Also removed two dead debug endpoints that echoed credential prefixes unauthenticated. **(2) Two hottest predicates had no index** (migration `0019`): `textbook.ownerId` — scanned by nearly every ownership check and list endpoint — and `waitlist_signup.telegramChatId`, scanned per Telegram webhook message over a launch-sized JSONB table. An FK does not create an index; both now have one. |
| 2026-10-20 | **The AI quota moved into the database (go-live hardening)** | The per-user AI allowance used to live in a process-local `Map` — correct for the decision, wrong for everything around it: it zeroed on restart (exactly when a burst is likeliest to slip through), couldn't be shared between instances, and grew a key per owner on the study loop's heap. It is now the `ai_usage` table (migration `0018`): one row per owner per **clock-minute**, and a call is a **single conditional upsert** (`… DO UPDATE SET count = count + 1 WHERE count < limit`). Because Postgres evaluates the `WHERE` against the locked row, two concurrent requests for the last slot cannot both win — the loser updates zero rows and is refused, so a refused call also consumes nothing. The window is a clock-minute identity every instance agrees on, not a sliding 60s of per-hit timestamps. Expired rows are scratch, swept opportunistically on the owner's next call and by a 5-minute timer (`lib/ai-quota-store.ts`); the dashboard's `GET /api/ai/budget` shape and the 429 + `Retry-After` behaviour are unchanged. Verified against real Postgres: a limit of 3 allowed 3 then refused with an honest count, 20 concurrent calls at a full bucket allowed 0, and the next minute started fresh; the pure arithmetic is covered by `ai-quota.test.ts` (10 tests). |
| 2026-10-20 | **The scope is shown, and can't be tapped once it's locked (phase 11, step 5)** | The scope picker only renders on the recall screen and disappears the moment questions exist, so a student who reloaded into a narrowed session (or arrived via a queue) had no way to tell what their score actually covered. Every study screen now carries a read-only scope line under the header — "Whole chapter", "Section 2.3 only", or "{n} topics" — from a pure `scopeSummary` helper (`apps/web/src/lib/scope-status.ts`, 6 tests). The picker itself now knows when the server has locked the scope (`hasPretest`, prepared questions, or a recorded answer) and says why ("a test is already prepared, so the topic choice is locked for this round") with the taps disabled, instead of offering a tap that would come back a 409. |
| 2026-10-20 | **A study queue — several chapters, planned once (phase 11, step 4c)** | The one-chapter session boundary stays, but a session can now be *planned* as part of a set. `POST /sessions/queue { chapterIds }` creates a `study_queue` row plus **one ordinary one-chapter session per chapter** (migration `0017`: `study_session.queue_id`, `queue_position`, and a `pending` status), in the order the student picked them; the first is `in_progress` and the rest `pending`, so the plan survives a reload, a restart and a closed tab. `GET /sessions/queue` returns the newest plan that still has something unfinished (with `done`), `DELETE /sessions/:id/queue` drops a chapter that was never opened, and completing a session promotes the next pending one and returns it as `next` — which the result screen turns into a one-tap "Next: {chapter}" handoff. `GET /sessions/:id` carries a read-only `queueNext`, history (`GET /sessions`) omits `pending` rows, and a queued chapter that has not come up yet says so instead of offering an answer the server would refuse. The dashboard grids become multi-select in "Plan a study queue" mode (tap order = study order) with a queue card to resume or drop. Verified live: 31/31 checks in `smoke:phase11`, including plan order, `queueNext`, promotion, drop guards (409 once opened) and duplicate-dedupe. |
| 2026-10-19 | **Optional baseline and post-study test (phase 11, step 5)** | A student can take an exam-style baseline before recall or skip it. The generated questions and progress persist; after studying, the post-test reuses the exact same questions for a fair before/after comparison. The result prefers the baseline mean as `before`, otherwise the recall mean; a skipped post-test leaves `after`/`delta` null and withholds the readiness verdict. Attempt retries return the saved grade instead of advancing twice or failing as out of order. Migration `0016` adds `pretest_questions` and `pretest_index`. |
| 2026-10-19 | **Topic scope — a session can cover part of a chapter (phase 11, step 4)** | The existing chapter chooser picks the one chapter per session; the scope picker sits on the recall screen, under the recall-mode chooser. `GET /chapters/:id/units` returns the chapter's sections (the same coverage units the recall sweep and verdict use, so `2.3` means one thing everywhere; an unnumbered book shows `Part n`), and `PATCH /sessions/:id/scope` stores the chosen keys on nullable `study_session.scope_keys` (migration `0015`; `null` = whole chapter, including sessions created before the picker). Scope applies server-side to recall, the study plan, guide, retest, unprobed gaps and verdict. Keys are validated; scope locks after questions are prepared or answers recorded; stale/empty selections never produce an empty session. |
| 2026-10-19 | **The guide was built but unreachable — the lesson phase now reads it** | `GET /chapters/:id/guide` (cached sections, per-student order, source anchors) was fully implemented while no client ever called it: `GUIDE` was never dispatched, `masteryQuery` was unused, and both `GuideView` branches in the lesson phase were dead code. The provider now fetches the guide in parallel with the plan (`fetchGuide`, deliberately outside `run` so a throttled or offline guide can never surface as an error over a lesson that already loaded), `RECALL`/`RECALL_FULL` clear the stale guide from the last cycle, and the lesson phase renders **plan on top, guide underneath** (falling back to the lesson panel only when neither exists). |
| 2026-10-19 | **Exam readiness is a chapter-wide verdict, and the retest is grounded in the book** | The result screen now answers "would this pass?", not only "did the score move?". Two pieces. **(1) A server-derived verdict.** New `apps/server/src/ai/retest-verdict.ts` merges mastery from every attempt (a retest answer overrides the recall reading for the same idea), groups the chapter by its own sections (`buildCoverageUnits`), and weights each idea by concept weight — mastered full, partial half, misconception or unjudged zero. Unprobed ideas stay in the denominator, and a pass requires **≥70% weighted** *and* **no section unprobed**. `GET /sessions/:id/result` returns `verdict` with the per-section breakdown; the result UI shows solid/weak/unchecked sections and en/am copy was added. The dashboard list omits the verdict on purpose (one checklist read per card is too much). **(2) A retest that can carry it.** `generateRetestQuestions` now writes **6–10** questions (was 3–5; `extractQuestions` limit raised to match), receives the chapter's raw text and the recall sweep's `unprobed` ideas, asks for **exactly one** beyond-textbook scenario (`enforceSingleBeyondText` clears extras), and gets **one corrective pass** when `retestIsSoft` still sees fewer than three levels or no beyond-text question. `questionUserPrompt` gained optional `chapterText`/`unprobed` blocks, and `POST /retest` resolves `unprobed` itself via `mergeRecallGaps`. Recall's own quality signal is now mirrored at its gentler bar: `recallIsFlat` (every question at one cognitive level) increments `flatRecall` and logs, so "mostly knowledge" cannot quietly become "nothing but knowledge". |
| 2026-10-18 | **Structure first, and the model read is lazy — import stops burning the quota** | Four changes that make a real Ministry-of-Education PDF import well *and* cheaply. **(1) Tables from geometry.** `reconstructPageLines` now rebuilds a page from pdf.js text-item positions instead of the naive string concatenation: `detectTableSegments` clusters runs into rows by baseline (`ROW_BASELINE_TOLERANCE`), `mapToAnchors` aligns each row's cells to the page's column anchors (a row it cannot align is not a table), and the segment renders as markdown with missed cells keeping their column — verified against Economics Table 1.1 (page 12), whose per-cell numbers pdf.js emits as separate runs. **(2) Running furniture stripped.** `stripRunningFurniture` votes the normalized keys of each page's top and bottom lines across the whole book and removes the ones that repeat (running headers, footers, bare folios), leaving real body text — verified on the Economics, Citizenship and Biology PDFs, whose folios sit inline, leading, or on their own line depending on the book. `openPdf` returns a `bodyPages` alongside `pages`, and chapter bodies are joined from it while boundaries still come from the raw pages. **(3) Chunked chapter read.** `ai.extractChapter` no longer sends a whole (up to 200k-char) chapter in one prompt and silently fall back when that overflows: `extractionWindows` splits it into ≤8 windows of ~24k chars on line boundaries, each read prefers Groq (whose limits are looser) and merges/dedupes concepts and objectives, and a window that fails is skipped rather than sinking the read. **(4) The read is deferred.** `POST /chapters/ingest` no longer calls the model — it stores the book's own `topics` and seeds the checklist from them — and `ensureChapterExtraction` does the one model read at first use (`/sessions/start`, `GET /chapters/:id/concepts`, `GET /chapters/:id/objectives`), guarded by `chapter.extractedAt` and stamped only on a *real* read (a deterministic fallback stays un-stamped so a calmer moment retries). `topics` on the wire are now `{path,title,page}` objects (they were bare labels). Importing a 20-chapter book now spends zero AI calls until a chapter is opened. |
| 2026-10-17 | **Recall sweeps the whole chapter — one question per lesson, ≥10 total, split across Gemini and Groq** | Targeted recall was capped at a flat eight questions drawn from the gap list, so `targeted`/`both` students got a short quiz that could miss most of the chapter, and Gemini would answer for a few concepts and drop the rest. New `apps/server/src/ai/recall-coverage.ts` groups concepts by the book's own numbering (one unit per section; equal windows when a book has none), and a plan asks **at least one question per unit**, scaling the total to a floor of 10 (`RECALL_MIN_QUESTIONS`) up to a ceiling of 16 (`RECALL_MAX_QUESTIONS`) with each question's format fixed server-side so the mix holds however the work is split. `generateRecallQuestions` now chunks the plan and **alternates providers** (Gemini leads one chunk, Groq the next; `buildProviderAttempts` gains `preferProvider`, which reorders the ladder without dropping the other), tags each question with the `lesson` and `origin` (`gap` for a section the student's own blurting flagged, `coverage` for the wider sweep), and tops up any section a chunk still misses with one small reask then a deterministic question. `StoredQuestion`/client `SessionQuestion` gain `lesson`/`origin` (inside the existing jsonb — no migration), `orderRecallSet` puts flagged gaps first in `both` mode, and the UI labels the section and whether the question is a gap or a wider check. The copy now calls it a chapter sweep, not "a few questions". User budget is still charged once per route. |
| 2026-10-17 | **Recall is gentle, retest is hard — and the mix is enforced** | Two writers had shared one difficulty standard, so a diagnostic built to be a low-pressure check was held to exam hardness (and a run of dropped closed answers became a wall of "explain…" prompts). Now `recallLevelDirective` tells the recall writer that an easy, quick factual prompt is exactly right, and `retestLevelDirective` keeps the exam-hard wording. The format mix is enforced three ways: a provider JSON schema (`questionSetSchema`) guarantees `format`/`options`/`answer` (with an automatic schema-less retry if the provider rejects it, so it can't become a hard dependency); `enforceRecallMix` re-spaces the spoken answers so two never sit in a row; and the no-model fallback now builds closed questions from the chapter's own text — it finds a sentence naming a concept, blanks the concept out, and offers other chapter concepts as the wrong options. `generateRecallQuestions` also stopped borrowing the retest's subject directives (`getPhaseDirectives(family, "recall")`). A retest that comes back too soft (fewer than three levels, or no beyond-text question) is counted and logged via `retestIsSoft`. Hotfix: the repeated-targeted-question "stuck" bug was a client `VoiceCapture` reconciler that keyed its reset on the phase (constant per question in the targeted phase); every answer control is now keyed by the question index, so a second spoken question can no longer be left unsubmittable. |
| 2026-10-17 | **Recall question formats — MCQ, fill-in-the-blank, short answer** | Targeted-recall questions now carry a format (`apps/server/src/ai/questions.ts`, `RecallFormat`): `multiple_choice`, `fill_blank`, or `short_answer`, in a deterministic 5/2/1 mix — 3/4/1 for blank-heavy subjects (maths, the sciences, CS/ICT). `recallFormatCounts` (largest-remainder) keeps the writer's instruction, the parser's validation, and the no-model fallback on one shape; `recallFormatDirective(family)` injects the mix into the recall writer, and `extractQuestions` downgrades any unanswerable closed question to `short_answer`. The answer route grades multiple choice and fill-in-the-blank deterministically via `judgeClosedAnswer` (case/space/punctuation-insensitive) against a server-stored answer the client never sees — no AI call and no request budget; only `short_answer` reaches the model. `StoredQuestion` gains `format`/`options`/`answer` (inside the existing `recall_questions` jsonb — no migration); the client `TargetedAnswerInput` renders tap options, a typed blank, or the voice ring. Client also stopped refetching the session on tab focus (`refetchOnWindowFocus: false`) and gates the study loader to the first resolution, fixing a spurious "Opening…" on window switch. |
| 2026-10-16 | **The 5-level question taxonomy, and recall ≠ retest** | New `apps/server/src/ai/questions.ts` defines one shared taxonomy (`knowledge`, `comprehension`, `application`, `critical_thinking`, `compare_contrast`) that both writers tag every question with, plus `fallbackLevels(kind, count)` so even the no-AI path is level-tagged. `generateRecallQuestions` is the *diagnostic* writer (expose gaps and wrong beliefs); `generateRetestQuestions` is the *exam-readiness* writer — never easy, precise detail, climbs all five levels, and includes at least one `beyondText` scenario. The old "retest echoes the student's recall wording" path and `retestUserPrompt` are gone; both writers now receive the chapter's stated objectives (decision 18), and `reconcileQuestions` tolerantly matches each question's `targetConcept`/`targetObjective` back to real rows. |
| 2026-10-16 | **Recall modes — blurting, targeted, or both, chosen upfront** | `study_session.recall_mode` (migration `0013`) stores `blurting` (the original free spoken recall), `targeted` (skip free recall, answer diagnostic questions over the whole chapter — concepts + objectives — since with no prior signal everything is worth diagnosing), or `both` (blur, then quiz the gaps). New routes `POST /sessions/:id/recall-questions` (+ `/answer`), `GET /sessions/:id/recall-gaps`, `PATCH /sessions/:id/recall-mode`; `mergeRecallGaps` unions every recall attempt into one analysis and the session's *before* score is the mean of those attempts, mirroring how the retest's *after* is computed. New client `RecallModeChooser` + `TargetedRecallPhase`, with a `targeted` phase in the tab chrome and en/am copy. |
| 2026-10-16 | **Chapter learning objectives — the book's own outcomes, read in the same call as concepts** | New `chapter_objective` table (migration `0012`) stores the objectives a textbook states for a chapter, anchored to `chapter.rawText` (`source_offset`/`source_quote`) and marked `estimated` when found by the deterministic scan. `ai.extractConcepts` became `ai.extractChapter`, returning `{concepts, objectives, estimated}` in ONE model call — the free tier is per project, so a second pass would double the cost of the most quota-sensitive path. The deterministic fallback (`apps/server/src/ai/objectives.ts`) finds an objectives heading ("Objectives", "Learning Outcomes", "After studying this chapter, you will be able to…") and takes the contiguous list that follows; it invents nothing when the book states none. Ingest returns `objectivesExtracted`; `GET /chapters/:id/objectives` reads them. This is the spine the targeted-recall and retest work builds on. |
| 2026-10-16 | **Subject-family strategy — family-aware AI prompts + non-beta English/CS** | New `subject-strategy.ts` (server + mirrored client) defines 11 `SubjectFamily` values and `getPhaseDirectives(family, phase)` returning terse system-prompt bullets + client hints per phase. `gemini.ts` gains `getSubjectContext(subject, concept)` → `{family, archetype}` (keeps existing `planArchetype`); `gradeRecall`, `generateMicroLesson`, `generatePlanWhyFirst`, `generateGuideSection`, `generateRetestQuestions` all accept optional `subject` and inject family directives into the system prompt. `study.ts` resolves the chapter's subject via new `chapterSubject(chapterId)` helper and passes it to every AI call. Web picker adds **English** and **Computer Science / ICT** (both non-beta); beta set (Physics/Chem/Math) unchanged. `RecallPhase` and `RetestPhase` in `study.$sessionId.tsx` show subject-specific hints via client `subject-strategy.ts`. i18n (en + am) added for new subjects. |
| 2026-09-30 | **Save the textbook first; import chosen chapters from its TOC tree** | Persist owner-scoped book metadata and a nested outline before any chapter ingest. Replace the flat internal-chunk review with a selectable hierarchy, keep long-chapter splits behind one visible chapter, store the original source only in device-local IndexedDB, and mark imported chapters from account-backed rows. Migration `0006` adds source metadata + TOC JSON; other-device imports require reselecting the local PDF. |
| 2026-09-30 | **The contents page now supplies textbook hierarchy** | Scanned PDFs can have OCR'd contents pages parsed into numbered topics and units. Printed page numbers are checked against the detected unit starts before they define chapter ranges; untrusted OCR/alignment falls back to heading detection. The review screen shows the parsed topics, and ingest seeds the chapter checklist with them in book order while retaining model-discovered concepts and misconceptions. Verified against the real Grade 10 Biology contents: six units and 53 numbered topics. |
| 2026-09-30 | **Textbook import opened, with visible budgets** | Import is reachable in the UI. OCR runs on-device for unreadable text layers; the library and current AI/book limits are visible rather than gated behind a demo-only screen. |
| 2026-09-27 | **Official period allocations — the schema, and the discipline around it** | `syllabus_unit.periods` + `periods_source` (migration `0004`), surfaced by the syllabus API and rendered on `/syllabus` only when a figure exists. Two deliberate refusals: the column lives on the **unit**, not the concept (MoE allocates per unit/sub-unit; there is no official per-concept number, and a number there would manufacture authority we don't have), and all six Biology 12 units ship as `NULL` because the verified source — the textbook's table of contents — does not state allocations. Guessing them would be exactly the fabricated ground truth the bet exists to prevent. The seed writes a figure only when a unit declares one and omits the columns from its `ON CONFLICT` SET, so an instructor's transcription can't be blanked by a boot — verified on a scratch Postgres (declared written, undeclared `NULL`, stored `24` survived a seed replay that overwrote the title). **Remaining: transcribe the real numbers from the official MoE Grade 12 Biology syllabus.** See [`SYLLABUS.md`](../SYLLABUS.md) §4. |
| 2026-09-27 | **Fixed: we were serving fallbacks to rate-limited students and never saying so** | Our per-user AI allowance (30/min) was 3× the Gemini free tier's *per-project* ceiling (~10/min), so 429s were being manufactured by our own limit. Each one hit `catch { return fallback(); }` with **no log and no counter** — a student on a fallback was indistinguishable from a successful student. Now: allowance lowered to 8/min (demo 3), `askJson` retries 429/5xx with jittered backoff inside one 24s budget (under the 30s client timeout), 400/404 fail fast instead of burning quota, and every degraded path logs a reason to `[ai]` plus a counter, exposed at `GET /api/ai/telemetry`. Retrying also means fewer fallbacks overall. Verified the retry/classification branches with a throwaway harness (13 cases) before deleting it — it is not a lasting test, because it duplicates the private logic. |
| 2026-09-27 | **The smart study guide was designed** (not built) | Agreed on scope: the student picks the chapter(s) and/or topic(s), the guide prioritises weak concepts, and retest becomes an *optional* tool usable **before** studying to diagnose and **after** to verify. Kiftet was explicitly reframed as one instrument in a larger kit that routes the student out to the textbook, NotebookLM, FutureX etc. — that dissolved the "walled garden" objection to a written guide, and it is why the guide needs real **source anchors**. Hard constraint recorded: the Gemini free tier is per _project_ and shared by all users, so the guide **must** be cached per concept, not generated per session. Full design, free-tier budget and sequencing in [Phase 11 below](#phase-11--the-smart-study-guide); two forks still need a decision. |
| 2026-09-27 | `09bd00d` — rebuilt the control layer, failure states and PWA caching | `error-screen.tsx`, `navigation-progress.tsx`, the typed `messages.ts` corpus, the rebuilt `root.tsx`/auth shell, and a PWA caching pass. Shipped **without** being recorded here, which is why this section now exists. |
| 2026-09-27 | The repo's quality baseline, settled | The formatting debt is gone and `bun run lint` exits 0 for the first time. See [the gates](../RUNBOOK.md#4-the-quality-gates). Two real bugs fell out of it — see below. |
| 2026-09-27 | `migrateDb()` takes a Postgres advisory lock | Was an unchecked go-live item; two instances of a rolling deploy could race the migration journal. |
| 2026-09-27 | CI: `.github/workflows/ci.yml`, blocking `main` | Lint + typecheck + build on every push and PR to `main`; the test gate was added with diagnosis tests on 2026-09-28 and now runs alongside the other checks. CI proves far more than it used to, not everything. |

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
| 1 | Voice spine — browser Web Speech capture/read-back + voice-state UI | ✅ Done |
| 2 | AI loop — real Gemini: extraction, grading, micro-lessons, retest | ✅ Done |
| 3 | Web flow — Web recall→gap→lesson→retest screens | ✅ Done |
| 4 | Demo dataset + polish | ✅ Done (live demo) |
| 5 | Deploy (EthioDeploy) + Postgres (Neon) switch | ✅ Done |
| 6 | Your own textbook — save the book + TOC, select chapters from the hierarchy, import → study | ✅ Shipped (nested selectable TOC, account-backed book/chapter records, internal processing splits hidden from students, device-only source storage, OCR, demo quotas, visible budgets) |
| 7 | Syllabus anchoring (bet 1) — browse the national syllabus unit by unit, map your chapters to units, watch unit coverage grow | ✅ First slice shipped (tables/migrations, Biology 12 seed with provenance, `/syllabus`, chapter→unit mapping and coverage; additional grades and verified period data remain) |
| 8 | Misconception events + first aggregate map (bet 2) — count each known misconception surfaced in a session, show only clusters above the k-anonymity floor | ✅ First slice shipped (writes on recall grading, aggregate endpoint with K=5 floor, dashboard panel; useful population-level signal still depends on real student volume) |
| 9 | Offline-first loop (bet 3) — cached checklists/chapters, a submission outbox with an honest "saved — will be graded when you're back online" state, reconnect sync through the existing attempt idempotency | ✅ First slice shipped (IndexedDB caches/outbox, original `attemptId` replay, connectivity probe, offline banner, queued states, lesson/question cache and offline reads) |
| 10 | Amharic everywhere (bet 4) — bilingual EN/🇪🇹 both-script chrome, generated content in both scripts, Ethiopic type verified | ✅ Done (slices A–D shipped: `Language` pref at `kiftet-language` + persisted through the `LanguageProvider`, pre-hydration `lang` script, `LanguageSwitcher` in the header, typed `messages.ts` corpus where `am` must cover every key, and the study loop's load-bearing chrome wired → `t()`: the four step pills, phase headings/bodies, every primary CTA, session/error/queued/result/voice-guide copy, and the offline banner), plus the landing page and the dashboard, syllabus, textbooks, and voice-test routes. Slice C makes generated content follow the pref: the loop sends `language: "am"`, gemini.ts writes lessons/retest questions in Amharic (Ge'ez) via the `AMHARIC_OUTPUT` instruction with concept names kept verbatim as data, offline fallback content is Amharic too, cached reads honestly flag their language, and a "በአማርኛ / In Amharic" badge marks generated text. Slice D verified the SVG/icon set (same `OPEN_ARC` geometry as the brand mark) and the Ethiopic type stack (Noto Sans Ethiopic loaded at 400–700, Ethiopic-first font stacks, pre-hydration `lang`), and closed the doc gaps — including this doc being split into `docs/howItWorks/` |

| 11 | The smart study guide — chapter/topic scope, per-concept mastery, a structured guide cached per concept, optional pre/post retest | ✅ Done (one selected chapter per session with topic-level scope; cached, anchored guide; optional baseline and post-test using the same questions; a study queue that plans several chapters as an ordered list of one-chapter sessions). Automated checks are green, including a live smoke run of scope, baseline and queue; manual browser/real-textbook coverage remains in the testing guide. |
| 12 | Syllabus depth — official `periods` per unit, then Biology 9/10/11 | ⏸️ Paused (schema landed — migration `0004`: nullable `periods` + `periods_source` on `syllabus_unit`, exposed via the syllabus API; the seed writes figures only when a unit declares one and never blanks an instructor's transcription). **Blocked on a verified source** (no trustworthy document to transcribe from) and deprioritised in favour of the given textbook, so the whole `/syllabus` surface is parked behind `SYLLABUS_ENABLED` for now ([`SYLLABUS.md`](../SYLLABUS.md) §4, §6) |

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

**Read this second when picking the work back up.** The guide is implemented
and now actually used: per-concept mastery drives diagnosis and guide order,
guide sections are cached per chapter/concept/language, each section points to a
deterministic source anchor, and the lesson phase fetches and renders it.
Students choose a chapter from the library and can narrow the session to its
topics. Pre/post testing is optional and reuses the exact same question set when
a baseline is taken. A student who has several chapters to get through can plan
them as a **queue**: an ordered list of one-chapter sessions, walked one at a
time, where finishing one hands over to the next. The existing micro-lesson
endpoint remains for compatibility and its existing UI paths.

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

The old loop compounded this: retest was a *mandatory* phase 4 asking 2–3
questions immediately after study. Phase 11 makes the baseline and post-study
test optional.

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

**Basic usage is observable; durable per-user accounting is not.** The server
counts AI calls and degraded outcomes in process memory and exposes the current
telemetry endpoint. Those counters reset on restart and do not provide a
cross-instance or per-user cost history. Before making a cost decision, retain
the actual per-user call/fallback rates in a persistent store; until then,
provider pricing and request quotas should be treated as operational limits,
not measured student cost.

### Two things in the data that make the "plan" real

- `chapter.rawText` is already stored, so a chapter-wide guide is possible at
  all. The source is there; the prompt just never asks for it.
- `conceptNode` has **no source anchor** — no page, offset, or heading. For a
  plan that deliberately hands the student *out* to NotebookLM, their textbook,
  or FutureX, each concept needs a deterministic anchor into `rawText`. That is
  free to compute, and it is what turns a guide into a plan that routes.

### The spine: per-concept mastery

`focusScore` already loops over every concept and then throws away everything
but one weighted scalar. Extending grading to a 0–3 estimate per concept makes
the rest of the phase fall out of it: guide ordering, retest targeting,
per-concept before/after on the result screen, and a misconception map that is
genuinely per-concept.

**Landed (phase 11, step 2).** `GapAnalysis` now carries
`mastery: Record<string, MasteryLevel>` — `0` not addressed, `1` raised but not
explained, `2` explained wrong, `3` explained correctly — and the three flat
lists derive *from* that map, so the per-concept and scalar views can never
disagree. `score` is recomputed from the levels (a level-1 idea earns half
credit) and is still never asked of the model. The model is asked for levels
only; unusable ones are dropped and fall back to the flat lists, so a sloppy
response degrades to the old behaviour instead of throwing. The fallback path
caps at level 1 by construction — it can hear a word but not an explanation.

Two consequences worth keeping:

- **A misconception is no longer credited as mastered.** Previously a model that
  listed a concept in both `covered` and `misconceptions` still scored it as
  mastered. That hid exactly the signal this product exists to surface.
- **A degraded grade is labelled, not silently halved.** Half credit for a
  level-1 mention is the honest reading, but applying it to a *rate-limited*
  request would punish the student for our quota. So the fallback sets
  `estimated: true`, it is persisted on the attempt, and the gaps screen says
  the number is an estimate (`gaps-estimated`).

Persisted in `attempt.gapsIdentified.mastery` (+ `estimated`). Both are optional
in the type, so attempts written before this change still read back.

**Landed (phase 11, step 3) — the diagnosis reads the map.** The gaps screen
(`components/gap-list.tsx`) now renders the four levels instead of three lists.
Each bar carries two readings at once: its **height** is the concept's
importance weight, and its **fill** is the mastery (0, 45%, or 100%). Level 1
gets its own state — a half-filled gold bar and a gold panel titled "So close —
you raised it" — because filing it under "covered" is the exact flattening the
product exists to undo. The headline number is now the *weighted* score the
server stored, drawn as a ring that closes; it used to be a flat count of list
lengths sitting above bars whose heights came from weights, so the number, the
picture, and the stored score all disagreed.

**Landed (phase 11, step 3b) — the guide.** `guide_section` is keyed
`(chapter, concept, language)` with a unique constraint, and that constraint
*is* the cache: the second student on a chapter generates nothing. `GET
/chapters/:id/guide` returns sections **in this student's order**, computed from
the mastery map with `triageConcepts` — no AI call for ordering, so it cannot
disagree between two students with the same diagnosis, and it costs nothing.
Order is `L2 → L1 → L0 → L3`: wrong belief first, then the cheapest win, then
untouched by weight, then what they already have as a confirmation. A section is
`what` / `why` / `recall` rather than one string, and each carries a
**deterministic anchor** (`sourceOffset` + `sourceQuote`) into `chapter.rawText`
so the guide can hand the student back to their own book. The anchor is
computed from lexical overlap, never asked of a model.

Measured on a real chapter against a real database: **first guide 4 AI calls,
second guide 0.** Two bugs surfaced only by running it: the anchor split on
newlines and returned mid-sentence fragments in hard-wrapped textbook text, and
the deterministic fallback copied the English book sentence into a guide that had
already claimed `language: "am"`.

**Phase 11 landed.** Scope is one chosen chapter with an optional section
subset; pre/post retest is optional and comparable; several chapters can be
planned as a queue and walked in order. Remaining launch work is hands-on
testing across real textbooks, Amharic-dense PDFs, offline behavior, retest and
voice.

**One thing 3b deliberately did not do:** the offline `CachedLessonRow` is still
keyed by `sessionId` (`apps/web/src/lib/store.ts:175`), so the *phone* copy
still cannot dedupe across students even though the server can. The server cache
is the one that costs money; the local one is a convenience. Re-keying it is
still open and is noted rather than silently forgotten.

**One trap in pre/post comparison.** Different question sets would make the
before/after delta unreliable. When a baseline exists, its exact saved
questions are reused after study and both attempts are graded against the same
stored focus. Without a baseline, the post-test stays gap-focused and no
pre/post delta is claimed.

**Landed (step 3b, follow-up) — a model that answers.** The long-standing
default `gemini-3.6-flash` started returning `503 high demand` on every call,
which silently turns the whole AI layer into its offline fallback. Measured the
model family: `gemini-2.5-flash` answers everything; the rest of the 3.x flash
line is capacity-limited; the `2.5-lite` / `2.0` / `1.5` models are **retired**
(404). The default is now `gemini-2.5-flash` behind a fallback list that the
attempt loop walks, with the leader first and backoff reserved for a retry of
the model we know works. `apps/server/src/ai/model.test.ts` holds the claim.

The number that matters for planning: **the free tier allows 5 requests a
minute**, not the ~1,500/day it advertises. A cold ten-concept guide wants ten,
so a first guide degrades honestly (measured 8 written / 2 estimated) and every
later student costs zero. **If guide quality at real-textbook scale is the goal,
the 5/min ceiling is the constraint to design against** — not the daily quota,
and not the model.

### Sequencing

1. **Instrument first.** Per-user AI call / 429 / fallback counters, plus a
   429-aware `askJson`. *(Landed: counters, the 429-aware retry, and
   `GET /api/ai/telemetry`.)*
2. **Per-concept mastery.** Replace the scalar with the 0–3 map; stop
   hardcoding `covered: []`. *(Landed — persisted on attempts, used by the
   diagnosis UI and guide ordering, with lists and weighted score derived from
   the same map.)*
3. **Guide sections + cache.** New table keyed by (chapter, concept, language);
   the three-step ladder; Amharic parity; source anchors. **Landed** — the guide
   is the ordered section list, cached and shared, and cost is measured (cold 10
   calls, warm 0).
4. **Scope selection** — the existing library chooses the chapter; the student
   can narrow the session to topics inside it. *(Landed; migration `0015`.)*
   **4c. The study queue** — several chapters planned at once as an ordered list
   of one-chapter sessions, each handing over to the next. *(Landed; migration
   `0017`.)*
5. **Retest as an optional tool**, pre- and post-, with the before/after view.
   *(Landed; migration `0016`; exact baseline questions are reused for the
   post-test.)*
6. **Tests.** Automated coverage includes diagnosis, guide ordering/fallbacks,
   model selection, OCR TOC parsing/page alignment, and the study loop. `bun
   test` runs in CI alongside lint, typecheck and build. Browser OCR quality on
   other textbooks, Amharic-dense PDFs, offline behavior, retest and voice still
   need hands-on coverage.

**Cheap and high-leverage, done:** `syllabus_unit.periods` (migration `0004`)
carries the official period allocation from the MoE document, with
`periods_source` provenance, and `/syllabus` shows it when present. This turns
prioritisation from the model's 1–5 guess into a fact from the state — but
**only once the figures are transcribed**; all six Biology 12 units are `NULL`
on purpose, because inventing them would be the fabricated authority this
exists to prevent. Still to do: transcribe the real numbers, and let a unit's
allocation drive concept ordering in the Phase 11 guide. Details in
[`SYLLABUS.md`](../SYLLABUS.md) §4.

### Scope boundary

- **Plan scope is one chapter per study session.** The chapter is chosen from
  the library; the topic picker narrows work inside it. A queue is *several*
  such sessions in an order, never a single session spanning chapters — so
  nothing downstream (scope, baseline, retest, verdict) has to learn about it.
- **Keep guide content typed.** The shipped guide flow uses structured
  `GuideSection` values; the legacy microlesson still uses `lessonText`. Do not
  serialize the guide into that string field when adding scope selection or
  more offline behavior.
- **When to pay** is not a step here. Revisit only against real counters.

## Go-live checklist — Phase 6
- [x] **DB-backed quotas** — the in-memory AI window is replaced by the
      `ai_usage` per-user table (migration `0018`): a clock-minute counter whose
      check-and-increment is a single conditional upsert, so caps survive
      restarts and are shared across instances, and a refused call consumes
      nothing. Signed-in users still run at 8/min because the constraint is the
      shared free-tier *provider* ceiling, not our own counter — the number
      rises only when/if we move to a paid tier (see decision 28).
- [ ] **Idempotency keys on chunk import** — the server `reused` check already
      prevents double-spend; add a client `chunkKey` (from the TOC path) so a
      retry is provably the same chunk even across re-planning.
- [ ] **Optional server-side Docling pass** — Docling (IBM, MIT) or Marker 2.0
      (Apache-2.0) are free, on-device/server-side converters that produce
      layout-aware markdown (tables, formulas, reading order) and are a strict
      upgrade for scanned or layout-mangled PDFs. Keep the pdf.js-outline path
      for the school-wifi case; offer Docling as the "high quality" route.
- [x] **Usage visibility** — current-minute AI and daily textbook budgets are
      shown in the app; long-term per-user request history and DB-persisted AI
      windows remain separate work.
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
- [x] **Demo janitor** — demo identity rows persist on purpose (a visitor
      survives a restart), so an in-process sweep (`lib/demo-cleanup.ts`) now
      deletes demo users older than `DEMO_TTL_HOURS` (24h) hourly; the FK
      cascade takes their textbooks, chapters, concepts, sessions, attempts and
      misconception hits with them. `user.kind` marks a row `demo`, and the
      national misconception map filters on `student`, so demos no longer leak
      into real-user data either.
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
Feedback colours are fixed (Sage `#5C7A5E`, Rust `#B54A2C`) instead of following
the room candle. (The retest used to mirror the student's own recall wording;
that was reversed in the 2026-10-16 taxonomy work — see the current thread.) All plain CSS keyframes behind utilities in `index.css`, collapsed
by `prefers-reduced-motion`. See [`STRATEGY.md`](../STRATEGY.md) for the five
product bets that steer the next phases.

> **The voice seam, honestly.** Voice = the push-to-talk ring plus read-back,
> both riding the browser's own speech services behind one `lib/voice.ts`
> `VoiceClient` seam — no vendor SDK, no key, no quota. We never bet the
> platform on vendor chrome: grading runs on the **consolidated final
> transcript** of the turn (`onend` emits it once in
> `WebSpeechVoiceClient`), and the read-back comes from `speechSynthesis`
> sentence by sentence with a read-along. Voice capture is for signed-in
> students; the demo and unsupported browsers get a clear label and the typed
> path. Voice = the seam; Gemini + text = load-bearing.

The rule that runs this branch: **build one phase, test it, fix it, write the
testing guide, only then start the next.** Nobody ever fires all phases at once —
each phase is a checkpoint.

---
