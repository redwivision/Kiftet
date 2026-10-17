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

3. **Concept extraction is cached per chapter.** We AI-extract concepts once when
   a chapter is ingested, store them in `concept_node`, and **never re-run the
   expensive AI call during a live session**. The demo must not depend on a slow
   API call while judges watch.

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
    `RecallFormat`) — and the set targets a 5/2/1 mix out of
    `RECALL_SET_SIZE` (8): mostly taps, a couple of blanks, one spoken answer.
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
    and logged (`retestIsSoft`) rather than silently passed. `generateRecallQuestions`
    also stopped borrowing the retest's subject directives (`getPhaseDirectives(family, "recall")`),
    and every answer control is keyed by question index so a repeated spoken
    question can never be left unsubmittable.
