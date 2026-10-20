# How Kiftet Works — design decisions

> Part of the [how-it-works index](README.md).


1. **Voice is the core, not a bolt-on.** Capturing the student's spoken
   explanation and speaking the lesson is the mechanic. So we build the voice
   spine early (Phase 1), even though the AI brains come later (Phase 2).
   Voice rides the browser's own speech services (Web Speech) behind one seam;
   the typed path is always available, and voice is enabled for signed-in
   students only.

2. **AI sits behind one seam.** Only `apps/server/src/ai/gemini.ts` knows the
   vendor. If we need a fallback chain (OpenAI, Anthropic) or if costs change,
   we change one file. The system design explicitly calls for a fallback chain
   so a provider outage can't kill a live demo.

3. **Concept extraction is cached per chapter — and paid for lazily.** We
   AI-extract concepts once, store them in `concept_node`, and never re-run the
   expensive call for that chapter again (`chapter.extractedAt` is the guard).
   The change from the original design is *when* that once happens: at ingest it
   spent a free-tier call on every chapter of an imported book, including the
   ones the student never opens, which is what drained the shared per-project
   quota before a student reached the chapter they came for. So the read is
   deferred to the first time the chapter is actually used (session start or a
   checklist/objectives open). It is still once, still cached, and it still keeps
   a slow API call out of the *middle* of a session — but it is best-effort: a
   busy or throttled model leaves the chapter on its book-seeded checklist and
   the request succeeds, and a deterministic fallback is never stamped as a real
   read, so a later visit retries the model.

4. **Mobile-first, calm design.** True black `#0A0B0D` + Ivory `#F2EFE9`
   is the monochrome identity. The voice state ("Listening…", "Thinking…") is a first-class
   UI element — a student has to trust the app is hearing them. The one place we
   spend visual boldness is the gap visualization: show *which* concepts are
   covered vs missing, not just "62%". Grading returns a per-concept level
   (0–3) for every checklist idea, and that map is the source the three lists
   derive from — the number never exists without the per-concept detail
   underneath it. A grade we had to estimate is labelled as an estimate; a grade
   we did not measure is never shown.

5. **Institutional licensing, not per-student fees** (B2B2C). Schools and
   tutoring centers pay; students get it free. Real deal with Links.et sponsor.

6. **Two explicitly-risky things are tested early, not discovered late:**
   grading a *conceptual* explanation vs. grading a *numerical* answer likely
   need different prompts/logic — we test both on real chapter types (Phase 4).

7. **Restraint is the motion system.** Loading is ink settling into place
   (`component: ink-settling.tsx`), the idle voice ring breathes on a slow ~3s
   heartbeat, "start listening" earns a single one-shot ripple (never a loop),
   the "Gap closed." mark draws itself in and settles to sage, and dark rooms
   carry a faint paper grain. All of it is plain CSS keyframes behind utilities
   in `index.css` — no animation library — and `prefers-reduced-motion`
   collapses it to the finished frame. Feedback colours are fixed values
   (Rust `#B54A2C`, Sage `#5C7A5E`), not per-room, so "gap / solid" means the
   same thing in every room.

---

8. **The control layer is ours, and it is big enough to touch.** The brand
   surfaces (warm, rounded, animated) were fighting square 24–32px stock
   controls, so the buttons, inputs, textareas, menus, skeletons and toasts
   were rebuilt to match the rest of the app: pill buttons at a 44px default
   (WCAG 2.5.5 target size) and a single `loading` prop that shows a spinner,
   sets `aria-busy` and blocks re-entry, replacing three different hand-rolled
   async patterns. Focus was the sharper problem — in every dark room `--ring`
   was set equal to `--primary`, so keyboard focus on a primary CTA rendered an
   accent ring on an accent button, i.e. the one thing a focus ring must never
   be. `--focus` is now a separate per-room token, light-shifted and drawn
   outside the control via `outline-offset`, with a global `:focus-visible`
   outline as a backstop. In the paper room the two tokens are legitimately
   equal (dark ink on a light control is maximum contrast); they diverge as
   soon as the room goes dark, which is where the collision was.

9. **A broken page is an unclosed gap.** The route error boundary was the last
   place a user could meet a framework's default ("Oops!", a raw stack), and it
   was the one moment they are already frustrated. It now speaks the product's
   own language — the open ring, the mark, an honest sentence about what
   actually happened (404 / offline / server), retry and home — with technical
   detail behind a disclosure and folded away entirely in production. It omits
   the `Header` on purpose: the header pulls in auth and the `/health` probe,
   and an error screen that can itself throw is worse than a bare one. Related:
   `ThemeProvider` and `LanguageProvider` moved into `Layout` so a crash is
   still themed and still in the student's language. Navigation feedback is a
   `useNavigation` ink sweep rather than a Suspense skeleton, because the
   routes are code-split and a skeleton would flash on every single nav.

10. **Offline, the brand has to survive too.** The Workbox config cached the
    app shell but nothing cached the webfonts, so offline — the exact scenario
    a PWA exists for — every headline silently fell back to system-ui. Font
    sheets now `StaleWhileRevalidate` and font files `CacheFirst` (Google's
    unicode-range means only the used subsets are ever fetched, so this stays
    small). `woff2` is in `globPatterns` even though nothing self-hosts a font
    today: if one moves into the bundle, that glob is the only thing that would
    precache it, and a missing extension fails silently. Navigations stay
    `NetworkOnly` with an `offline.html` precache fallback, because a cached
    document from an earlier deploy is worse than an honest "you are offline".

11. **One language key, one type-enforced promise.** `messages.ts` types `am`
    as `Record<MessageKey, string>` where `MessageKey = keyof typeof en`, so
    every user-visible string — including validator messages, toasts and the
    study ring's own push-to-talk captions — cannot silently fall back to
    English. The ring's captions are deliberately distinct from the `vt-*`
    dev-harness strings: those describe states on the voice-test page, this
    one describes a recording you finish, and reusing them would tell the
    student the wrong thing about the control they are touching.

12. **A formatter the repo doesn't agree with is a trap.** `biome.json` sets
    `indentStyle: "tab"`, but `packages/ui` had been committed at 2-space, so
    `bun run check` (`biome check --write .`) wanted to rewrite 94 files —
    package manifests, `turbo.json`, migration snapshots — before it touched
    any real work. The package is now uniformly tab-indented to match the
    config, and config-file reformatting noise was reverted so the diff stays
    honest about what actually changed.


13. **The unique constraint is the cache.** `guide_section` is keyed
    `(chapter, concept, language)` and nothing else — no user, no session — for
    one reason: a per-project Gemini quota is shared by every user, so the second
    student on a chapter has to be free. The alternative designs were rejected
    concretely, not on taste:

    - *Key by session* (what `CachedLessonRow` still does) — cannot dedupe
      across students even in principle. It was the existing precedent, which is
      exactly why it is worth writing down that it is the wrong shape for
      server-side content.
    - *Regenerate when a section looks wrong* — a bad generation is sticky
      forever. There is deliberately no regeneration path; delete the row.
    - *Ask the model to order the guide* — ordering is the product's answer to
      "what should I study", and it must not contradict the diagnosis screen the
      student just looked at. It is computed from the same map, deterministically,
      at zero cost.

    Measured on a real chapter against a real database: first guide 4 AI calls,
    second guide 0.

14. **A fallback must not fake a capability it does not have.** The deterministic
    path cannot translate. An early version copied the chapter's sentence into
    `what`, which produced an English "section" inside a guide that had already
    returned `language: "am"` — found end-to-end, not by reading the code. The
    rule now: the fallback writes target-language scaffolding and carries the
    book's own words in `sourceQuote`, where the UI labels them as a quotation.
    The same instinct applies to the anchor: never ask a model for a page number,
    compute it, and return nothing when there is nothing to point at.

15. **Student-independent content lives in the server cache; the phone copy
    still does not.** `CachedLessonRow` remains keyed by `sessionId`
    (`apps/web/src/lib/store.ts:175`) and was deliberately left alone in 3b. It
    costs nothing to be wrong about — the server cache is what spends the quota —
    so fixing it was deferred rather than bundled into a change about the study
    order. It is written down in the roadmap so it is not forgotten.

16. **The model is chosen by measurement, and a busy model is not retried in
    place.** The default for most of the project was `gemini-3.6-flash`, which
    began returning `503 high demand` on every call. This is the worst kind of
    AI failure: the UI still renders, the offline fallback still answers, and
    nothing says the model was the reason. So the default is now
    `gemini-2.5-flash` — the one that answered every probe — with
    `MODEL_FALLBACKS` behind it, and the attempt loop walks that list on
    429/503/timeout.

    Two rules come out of it. **Model choice is a tested claim**, not a constant:
    `apps/server/src/ai/model.test.ts` asserts the leader is the model that
    measured working and that no retired (404) model is listed, so the list
    cannot silently rot into a ladder of guaranteed failures. And **backoff is
    reserved for retrying a model we know works** — a 503 is not a rate limit on
    us, so waiting it out spends the student's 24s budget to no end. The
    measured ceiling underneath all of it is 5 requests/minute on the free tier,
    which is why the shared cache is load-bearing rather than an optimisation.

17. **Subjects are families, not a binary boundary.** The old model was a
    client-only Beta label on three subjects (Math/Physics/Chemistry) with no
    behavioural difference. The new model maps every subject to a `SubjectFamily`
    (11 values) via `getFamily(subject)` in
    `apps/server/src/ai/subject-strategy.ts`, and the family drives
    `getPhaseDirectives(family, phase)` — terse bullets injected into the
    system prompt of `gradeRecall`, `generateMicroLesson`,
    `generatePlanWhyFirst`, `generateGuideSection`, and
    `generateRetestQuestions`. This makes the loop *fit* each subject (method
    awareness for math, usage-in-context for languages, control-flow tracing for
    CS) without pretending the instrument changed. Beta remains an honest label
    for the three computational subjects, not a wall; non-beta subjects gain
    the same directives without the caveat. The web client mirrors the family
    detection (small duplication, deliberately not a shared package — the
    server's copy is canonical and the client's is only for two hint strings)
    so `RecallPhase` and `RetestPhase` can show subject-specific guidance at
    zero server cost.
18. **Concepts and objectives are one call, not two.** A chapter's learning
    objectives (the book's own stated outcomes) and its concept checklist are
    now read by a single `extractChapter` prompt, because the Gemini free tier
    is per *project*: a second pass over the same text would double the cost of
    the most quota-sensitive path in the app for no new information. When the
    book states no objectives, the model is told to return an empty list rather
    than invent them, and the deterministic fallback
    (`apps/server/src/ai/objectives.ts`) scans for an objectives heading instead
    of calling the model at all. Objectives exist because they are the author's
    own contract for the chapter — the honest yardstick for targeted questions
    and the retest, distinct from the concept checklist the diagnosis is built
    on.

19. **Recall and retest are different instruments, so they are different
    writers.** Both families tag every question with one of five shared
    cognitive levels — knowledge, comprehension, application, critical
    thinking, compare and contrast (`apps/server/src/ai/questions.ts`) — but the
    prompts are deliberately not the same shape. Recall questions are
    *diagnostic*: they exist to expose gaps and wrong beliefs, so they lean on
    explanation and reasoning, and their answers feed the same gap analysis the
    free-blurting path feeds. Retest questions are *exam-readiness*: they must
    never be easy, must carry precise detail, climb all five levels, and include
    at least one scenario beyond the textbook (`beyondText`). This reverses the
    earlier "retest mirrors the student's own wording" behaviour: mirroring makes
    the retest a quiz on their phrasing, not a measure of what they learned, and
    it collapses the before/after delta. Both writers are handed the chapter's
    stated objectives (decision 18) so a retest can hold the student to the
    author's contract, not only the extracted checklist.

20. **The recall mode is chosen upfront and the loop reshapes around it.**
    `study_session.recall_mode` stores one of `blurting`, `targeted`, or `both`.
    Blurting is the original free spoken recall. Targeted skips free recall and
    answers diagnostic questions covering the whole chapter (concepts +
    objectives), because with no prior signal the honest thing to diagnose is
    everything. Both blurs first, then quizzes the gaps that surfaced. In
    targeted mode each answer is stored as a `recall` attempt and the session's
    *before* score is the mean of those attempts, exactly as the retest's
    *after* is the mean of its answers — so the delta stays one comparable
    number whichever mode the student chose.

21. **Recall questions carry a format, and closed formats are graded without
    the model.** A targeted-recall question is one of three formats —
    `multiple_choice`, `fill_blank`, or `short_answer` (`apps/server/src/ai/questions.ts`,
    `RecallFormat`) — and the set targets a 5/2/1 mix: mostly taps, a couple of
    blanks, one spoken answer (the ratio scales to the set's size, capped at two
    spoken answers — see decision 23 for how the size is set).
    Subjects where a single missing word is the natural probe (mathematics,
    physics, chemistry, biology, CS/ICT) shift to 3/4/1 so fill-in-the-blank can
    be the largest share. `recallFormatCounts` computes the mix deterministically
    (largest-remainder rounding), so the writer's instruction, the parser's
    validation, and the no-model fallback all agree on one shape.
    Multiple choice and fill-in-the-blank are graded by exact match
    (`judgeClosedAnswer`, case/space/punctuation-insensitive) against a
    server-stored `answer` the client never receives, so those grades cost no AI
    call and no request budget. Only `short_answer` goes to the model, exactly as
    recall always did. A closed question that the writer failed to make
    answerable (options with no matching answer, a blank with no answer) is
    downgraded to `short_answer` at parse time rather than shipped ungradeable.
    Retest stays free-form and carries no format.

22. **Recall is easy on purpose; retest is hard on purpose — and both are
    enforced, not merely requested.** The two writers had shared one difficulty
    standard (and one closing line, *"never write an easy question"*), so a
    diagnostic meant to be a low-pressure check was held to exam hardness. They
    now take different tails from the same taxonomy: `recallLevelDirective`
    (`apps/server/src/ai/questions.ts`) tells the recall writer that an easy,
    quick factual prompt — a term, a definition, a filled blank — is exactly what
    it wants, while `retestLevelDirective` keeps the exam-hard wording. Because
    the mix was previously only a prose request, it could quietly collapse: a
    reply that dropped `options`/`answer` was downgraded to `short_answer`, and a
    run of those is a wall of "explain…" prompts. Three levers now make the shape
    real. (a) Both writers are handed a provider-enforced JSON schema
    (`questionSetSchema`), so `format` and its fields are guaranteed at the
    provider, not hoped for — with an automatic retry *without* the schema if the
    provider rejects it, so this stays a quality lever and never a hard
    dependency. (b) `enforceRecallMix` reorders the parsed set so the spoken short
    answers are spaced evenly among the closed questions and never two in a row,
    preserving the closed questions' relative order. (c) The no-model fallback
    now builds the same closed mix from the chapter's own text: it finds a
    sentence that names a concept, blanks the concept out of it, and offers other
    chapter concepts as the wrong options — so an offline student gets
    tap-and-type recall, not spoken essays. A retest that comes back too soft
    (fewer than three cognitive levels, or no beyond-textbook question) is counted
    and logged (`retestIsSoft`) rather than silently passed. Recall gets the
    mirror signal at its own gentler bar: a set where every question wears the
    same cognitive level (`recallIsFlat`) has stopped measuring understanding,
    so it is counted (`flatRecall`) and logged too — gentle is not the same as
    one-note. `generateRecallQuestions`
    also stopped borrowing the retest's subject directives (`getPhaseDirectives(family, "recall")`),
    and every answer control is keyed by question index so a repeated spoken
    question can never be left unsubmittable.
23. **A recall set is a sweep of the whole chapter — at least one question per
    lesson — not eight questions that happen to cluster.** Targeted recall was
    capped at a flat eight questions drawn from the gap list, so a student in
    `targeted` or `both` mode got a short quiz that could miss most of the
    chapter, and Gemini would routinely answer for a few concepts and drop the
    rest. Three changes fix that. (a) Kiftet has no lesson table, so the closest
    honest lesson is the book's own numbering carried onto each concept
    (`recall-coverage.ts`): concepts are grouped by their first two numbering
    segments, one unit per section, and a chapter with no numbering falls back to
    equal windows. (b) Before any call, a plan asks **at least one question per
    unit** and scales the total to a floor of 10 up to a ceiling of 16
    (`RECALL_MIN_QUESTIONS`/`RECALL_MAX_QUESTIONS`), fixing each question's
    format server-side so the mix holds however the work is split. (c) The work
    is **split across providers**: the slot list is chunked and alternate chunks
    lead with Gemini and Groq (`buildProviderAttempts` gains a `preferProvider`
    that reorders the ladder without dropping the other), so one model cannot
    skip a lesson for lack of attention. Whatever a chunk still misses is topped
    up by one small reask and then a deterministic question, and `origin`
    (`gap` vs `coverage`) plus `lesson` are stored on each question so the UI can
    say which section is being checked and, in `both` mode, order the student's
    flagged gaps first. The user's request budget is still charged once per route;
    the extra chunks spend provider rate limit, not the student's allowance.
24. **Exam readiness is a verdict, not a delta — and it cannot be passed by
    skipping half the chapter.** The result screen used to report only
    before/after and let "did the score go up?" stand in for "would this pass?".
    The server now derives a chapter-wide verdict (`retest-verdict.ts`) from the
    merged mastery of *every* attempt, grouped by the book's own sections
    (`buildCoverageUnits`). Each idea earns its concept weight when mastered and
    half when partial; a misconception or an idea nobody judged earns nothing.
    Two rules keep it honest: unprobed ideas stay in the denominator (so a set
    that quietly avoided a section cannot report a high score), and a pass
    requires **no section left unprobed** at a weighted **≥70%**. The result
    payload carries the verdict plus the per-section breakdown, and the UI shows
    which sections are solid, weak, or still unchecked. The retest itself was
    hardened to feed that verdict: 6–10 questions (up from 3–5), exactly one
    beyond-textbook scenario (extras cleared by `enforceSingleBeyondText`), the
    chapter's raw text and the recall sweep's `unprobed` ideas in the writer
    prompt, and one corrective pass when `retestIsSoft` still reports a set that
    never climbs or never leaves the book.
25. **A session is one chapter, but the student picks the topics inside it.**
    Phase 11 asks for "chapters and/or topics", and the recorded fork keeps a
    session to a single chapter — so the honest first half is section scope
    inside that chapter. The sections are the same coverage units the recall
    sweep and the exam verdict already use (`buildCoverageUnits`), which is what
    makes `2.3` mean one thing to the student, the question planner and the
    pass/fail breakdown; an unnumbered book scopes by `w1`/`w2` windows, shown as
    "Part n". One nullable jsonb column (`study_session.scope_keys`, migration
    `0015`) carries it, and `null` means the whole chapter — including every
    session written before the picker. Two rules keep a narrow scope honest and
    safe: the picker stores `null` when everything is selected (so a section
    added to the chapter later is not silently excluded), and the server's
    `scopedUnits`/`scopedConcepts` fall back to the whole chapter whenever a
    selection is empty or its keys no longer exist, so a scope can shrink a
    session but never empty it. The scope is enforced server-side at every
    reader — recall plan, study plan, guide, retest checklist, the recall
    sweep's `unprobed`, and the verdict — because a client-side filter would be
    a promise a reload could break.
26. **Optional before/after tests reuse one question set.** A fresh set on each
    side would make the score delta depend on question difficulty rather than
    learning. When a student chooses a baseline before recall, save its
    questions and focus tags, then reuse those exact questions after study.
    `before` prefers the mean baseline score; without one, it remains the mean
    recall score. `after` is the retest mean; if the student skips the post-test,
    `after` and `delta` are `null` and the exam-readiness verdict is withheld.
    A baseline question set and index live on `study_session` so a refresh
    resumes the test; attempt rows distinguish `pretest`, `recall`, and
    `retest`. One chapter remains the session boundary; several of them are
    walked as a queue instead (decision 27).
27. **A queue is an ordered list of one-chapter sessions, not a multi-chapter
    session.** Studying several chapters in one sitting is a real habit — the
    syllabus hands a student whole units — but making a session span chapters
    would force scope, the baseline, the retest and the verdict to all learn
    what "the chapter" means, and every one of them would get it subtly wrong
    (which chapter's guide? which retest score?). So a queue is **durable
    planning, not a new session shape**: `POST /sessions/queue` creates one
    ordinary session per chapter in a `study_queue`, the first `in_progress` and
    the rest `pending`, and "what comes next" is a row rather than client state.
    That buys resume-after-reload, a dashboard that can show the plan, and a
    handoff at the end of a session with no new study semantics at all. The
    costs are honest ones: `pending` is a third status every reader of
    `study_session` must not trip on (history lists omit it, the drop endpoint
    only touches it, writes refuse it), and promoting the next chapter is a
    status flip guarded by `status = 'pending'` so two concurrent completions
    cannot open two chapters. Plans are capped at 12 chapters — beyond that it
    is a to-do list, not a study plan — and duplicates are deduped rather than
    rejected, because the same chapter twice is a mis-tap, not an error.
28. **The AI request quota is a DB-backed clock-minute counter, not an
    in-memory window.** The per-user limit protecting the shared Gemini budget
    used to live in a process-local `Map` keyed by owner. That was correct for
    the decision and wrong for everything around it: it reset to zero on every
    restart (exactly when a burst is most likely to slip through), it could not
    be shared across instances, and it kept a growing set of keys on the same
    heap as the study loop. So a call is now one row per owner per minute in
    `ai_usage`, and the check-and-increment is a **single conditional upsert**
    (`… DO UPDATE SET count = count + 1 WHERE count < limit`) — the database
    evaluates the `WHERE` against the locked row, so two concurrent requests for
    the last slot cannot both win; the loser updates zero rows and is refused.
    The window is a **clock-minute**, not a sliding 60 seconds: the allowance
    snaps to the minute boundary, which is marginally more generous at the edge
    and, far more importantly, is an identity every instance can agree on
    without shared clock arithmetic. Two consequences worth naming: a refused
    call consumes nothing (the `WHERE` fails, so no increment), and the rows are
    pure scratch — swept opportunistically on the owner's next call and by a
    5-minute timer, never read after their minute has passed. The demo
    `/demo/start` gate and the waitlist limiter stay in-memory on purpose: they
    guard cheap, idempotent writes where surviving a restart buys nothing.
29. **The proxy is trusted explicitly, because `req.ip` is a lie otherwise.**
    Every per-IP limiter keys on `req.ip`, and Express leaves `req.ip` as the
    socket address until told to trust the forwarding chain. On a PaaS the
    socket peer is the edge, so without this setting every visitor shares one
    rate-limit bucket — demo starts collapse to a handful per minute *for the
    whole internet*, and the waitlist's per-IP generosity (sized for CGNAT) is
    spent on the first handful of users. The failure is invisible locally (no
    proxy) and only appears under a real launch, so the choice is: a configurable
    `TRUST_PROXY` (default `1` in production, `loopback` in dev) rather than a
    hardcoded value, a boot log of the resolved setting, and a test that asserts
    the *result* (`req.ip` from a forwarded header) rather than the parse. Dev
    defaults to `loopback` on purpose: a direct client cannot spoof its own IP,
    only a local proxy can.
30. **Liveness and readiness are separate endpoints, because they drive
    different actions.** A platform does two things with a health signal: it
    restarts a process that looks dead, and it routes traffic away from an
    instance that can't serve. Those want opposite answers to "is a dead
    database a failure?". For restart, no — restarting cannot un-pause Neon and
    a restart loop only amplifies the outage, so `/health` is dependency-free.
    For routing, yes — an instance that can't reach the DB should be skipped, so
    `/ready` fails on a `SELECT 1` and also the instant SIGTERM starts a drain.
    One endpoint cannot be both without getting one of them wrong, so the load
    balancer points at `/ready` and monitoring at `/health`.
31. **A chapter's model read is guarded by the database, not the process.**
    The replace of a chapter's concepts/objectives is a delete-then-insert, and
    the only guard was an in-memory `Map` — which coalesces callers within one
    instance and does nothing between two. So the guard moved to where the
    contention actually is: a `pg_advisory_xact_lock` on the chapter serializes
    writers, a re-check of `extractedAt` inside the lock makes the loser a
    no-op, and the delete/insert/stamp share one transaction so a crash cannot
    leave a chapter empty. The `Map` remains only as a fast-path that avoids a
    second provider call on the same instance. The model call stays *outside*
    the transaction on purpose: it can take twenty seconds, and holding a
    pooled connection (and the lock) across a network wait is how a five-connection
    pool becomes a queue. A duplicate model read across instances is wasteful but
    harmless — it costs one shared free-tier call, not correctness — which is the
    right trade against holding connections through slow calls.
32. **A disconnected client stops the work, not just the response.** A dead
    request is not the same as a cancelled one: Express finishes the handler
    even after the socket is gone, so a closed tab would still have the guide
    generate every remaining concept from the shared provider quota. The loop
    listens for `req.on("close")` and breaks at the next concept boundary — the
    in-flight call completes (its result is cached for the next student), only
    the *next* call is skipped. Breaking at a boundary rather than aborting the
    current call is deliberate: aborting mid-call wastes the tokens already
    spent, and the finished section is useful to someone else.
