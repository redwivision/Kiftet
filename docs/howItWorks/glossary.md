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
- **Learning objective** — one outcome the book *itself* states for a chapter
  ("describe photosynthesis", "balance a chemical equation"), read out of a list
  under a heading like Objectives or Learning Outcomes. Distinct from a
  concept: the bonus a chapter is about vs. what the book says the student must
  be able to do with it. Stored in `chapter_objective`, anchored to the text,
  and `estimated` when found by the deterministic heading scan rather than the
  model.
- **Guide section** — one concept's study content: `what` (the idea), `why`
  (why it matters), `recall` (the say-it-back prompt). Generated once per
  `(chapter, concept, language)` and shared by every student; the *order* of the
  sections is per-student.
- **Cognitive level** — the taxonomy every question is tagged with, shared by
  recall and retest (`apps/server/src/ai/questions.ts`): `knowledge`,
  `comprehension`, `application`, `critical_thinking`, `compare_contrast`. A
  question set is expected to spread across the levels, and none of them is ever
  easy. An unrecognised level from the model degrades to `comprehension`, never
  a mislabel.
- **Recall mode** — how a student chooses to remember, stored on
  `study_session.recall_mode`: `blurting` (free spoken recall, the original
  loop), `targeted` (skip free recall, answer diagnostic questions over the
  whole chapter), or `both` (blur, then quiz the gaps). Chosen upfront and
  persisted so a reload keeps the same flow.
- **Targeted recall question** — a *diagnostic* question (writer:
  `generateRecallQuestions`) whose job is to expose gaps and wrong beliefs, not
  to grade at exam standard. Its answers are stored as `recall` attempts and
  merge into the same gap analysis the blurting path produces.
- **Recall format** — how a targeted-recall question is answered
  (`apps/server/src/ai/questions.ts`, `RecallFormat`): `multiple_choice` (tap one
  of four options), `fill_blank` (type the missing word), or `short_answer`
  (speak or type an explanation). A set holds a deterministic 5/2/1 mix (3/4/1
  for blank-heavy subjects). Multiple choice and fill-in-the-blank are graded by
  exact match server-side with no AI call; only `short_answer` reaches the
  model. Retest has no format and stays free-form.
- **Beyond-textbook question** — a retest question (`beyondText: true`) that
  describes a scenario the chapter does not cover and asks the student to reason
  it out using the chapter's ideas. Part of what makes the retest a full
  exam-readiness check rather than a re-quiz.
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
- **Subject family** — the coarse classification a subject maps to via
  `getFamily(subject)`: `mathematics`, `physics`, `chemistry`, `biology`,
  `english_languages`, `history_social`, `geography`, `economics_business`,
  `cs_ict`, `general_science`, or `other`. Defined once in
  `apps/server/src/ai/subject-strategy.ts` (server) and mirrored in
  `apps/web/src/lib/subject-strategy.ts` (client hints). The family drives which
  AI-prompt directives apply, not the subject string itself.
- **Phase directives** — terse system-prompt bullets returned by
  `getPhaseDirectives(family, phase)` for a given subject family and study phase
  (`recall`, `plan`/`lesson`, `retest`). They tell the model what to emphasize
  (e.g. Mathematics → "focus on method/reasoning steps"; CS/ICT → "trace
  control flow; don't penalize syntax"; English → "assess usage in context").
  Injected into the system prompt of `gradeRecall`, `generateMicroLesson`,
  `generatePlanWhyFirst`, `generateGuideSection`, and
  `generateRetestQuestions`.
- **Plan archetype** — a coarse label (`PROCESS`, `CAUSAL`, `PLACE_SYSTEM`,
  `PRINCIPLE`, `LANGUAGE`, `GENERIC`) derived from the subject family (plus a
  concept-text check for chemistry computation). It shapes the deterministic
  search-query suffix on plan cards. `getSubjectContext(subject, concept)` in
  `apps/server/src/ai/gemini.ts` returns it; `planArchetype` is the thin wrapper
  kept for existing callers.
