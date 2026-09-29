# Changelog

The major updates, in order. Written to be **accurate as of each entry** — a
feature is listed when it works, and where something is partial, gated, or
deliberately not built, it says so. Full commit history is in `git log`; phase
detail is in the [roadmap](docs/howItWorks/roadmap.md).

---

## Unreleased — per-concept mastery

**What changed.** Grading now returns a **per-concept level** for every idea in
the checklist instead of one weighted number: `0` not addressed, `1` raised but
not explained, `2` explained wrong, `3` explained correctly. The covered /
missing / misconception lists are now *derived* from that map, so the
per-concept view and the single score can never disagree. Stored with every
attempt.

**Why it matters.** One strong answer used to read as "that student knows the
chapter". The product is a diagnostic, and a diagnostic that throws away
per-concept detail is a score wearing a diagnosis's clothes.

Two things it fixed along the way:

- **A misconception can no longer be scored as mastered.** A grading response
  that listed a concept as both covered *and* a misconception used to have it
  counted as mastered — hiding exactly the wrong belief this product exists to
  surface. The misconception now wins.
- **A rate-limited grade says so.** The offline fallback can hear *which* ideas
  a student mentioned but not whether they explained them correctly, so its
  levels are capped well below "mastered". Because that could quietly halve a
  student's score for *our* quota problem, such grades are now labelled as
  estimates on the screen.

> **Not yet true:** nothing consumes the map yet. The gaps screen still draws
> the three lists, and the "right length, right order" study guide is still
> **not built** — that is the next step.

### Then: the diagnosis you can act on

**What changed.** The gaps screen now reads those per-concept levels instead of
three flat lists. Each bar carries two readings at once: **how tall it stands is
how much the concept matters**, and **how much of it is filled is how much the
student can actually answer**. The headline number became the weighted score,
drawn as a ring that closes — the brand's own open ring turned into a readout,
so progress is something you watch happen rather than a number you are told.

**The honest new state.** *"You raised it, but didn't say what it means"* now
has its own look — a half-filled gold bar, and a gold panel that calls it the
cheapest win on the page. It used to be filed as *covered* and drawn in the
same solid green as a correct answer, which is the one lie this product cannot
tell.

**Two real bugs fixed on the way:**

- The headline number was a **flat count of list lengths** sitting directly
  above bars whose heights came from importance weights. The number, the
  picture, and the score stored in the database could all disagree. On the
  worked example that is 40% against a real 56%.
- A concept at level 1 appears in **none** of the three lists — it is neither
  covered nor missing — so the first draft of the new screen dropped it
  entirely. Caught by a test that fails when the bug is put back.

**Landing page.** A new section shows what Kiftet actually sees: one Biology 12
unit, all four levels, and the difference between a wrong belief and an
unfinished one. The old hero card quietly demoed **Physics**, which the product
does not claim to assess — it is Biology now.

**First automated tests.** `bun test` runs in CI as a fourth gate, covering the
two things we got wrong by hand: a level disappearing from the diagnosis, and a
headline number drifting from the weighted score.

> **Not yet true:** the study guide is still the old single micro-lesson.
> Nothing orders study by the mastery map yet — the map is measured, stored and
> displayed, but the next chapter is the one that acts on it.

### Then: the guide, in the order you actually need it

**What changed.** The map now decides what you read and in what order. A
**wrong belief comes first** — re-reading cannot fix the one thing you have
actually got backwards. Then the ideas you raised but did not finish, which are
the cheapest wins on the page. Then what you have not touched yet, by how much
it matters. What you already have goes last, as a line of confirmation rather
than something to read twice.

**The economics.** The Gemini free tier is a budget for the whole *project*,
not for one key: roughly 1,500 calls a day shared by every user. Generating a
guide per session spends twelve of them to show one page. So a section is now
written **once per chapter, per concept, per language** and stored. Measured on
a real chapter: **first guide 4 AI calls, second guide 0.** The second student
on a chapter costs nothing.

**"The right length" is now structure, not a vibe.** A section is `what` / `why`
/ `recall` instead of one blob, and each is readable on its own — `recall` is
the prompt a voice UI can hand straight to a microphone.

**Every section points back at your book.** Each concept is anchored to a real
sentence in your own textbook by computing where the words overlap. It is
computed, never asked of a model, because a model asked for a page number
invents one, and an invented page number is worse than none.

**Two honesty bugs, both found by running the thing end to end:**

- The anchor split on newlines. Textbook text is hard-wrapped, so "go to this
  place" was landing on *"Inside, the cytoplasm is a watery fluid that holds
  the"* — a mid-sentence fragment that is useless as both a link and a lesson.
- The offline fallback copied the book's sentence into a guide that had already
  claimed to be **Amharic**. The fallback cannot translate, so it must not
  pretend to: the scaffolding is now in your language and your book is quoted
  verbatim underneath, labelled as a quotation.

**Then: a model that actually answers.** The default model was returning
`503 high demand` on *every* call, which in production looks identical to a
dead AI feature — the screen would quietly show the offline fallback, forever,
and nothing in the logs would say the model was the reason. Probing the whole
family found the split: every 3.x flash alias is capacity-limited, and the
older `2.5-flash-lite` / `2.0-flash` / `1.5-flash` are **retired** — the API
returns 404, so they were never options. `gemini-2.5-flash` answered everything.

**A busy model is no longer a student without a guide.** The model list is now
walked on a 429/503/timeout rather than retried in place, so a model that is
merely *busy* is answered by a different one instead of by waiting out a budget
the student does not have. Backoff is kept for the case that genuinely needs
it — retrying the model we already know works.

**The honest ceiling, measured rather than assumed.** The free tier allows
**5 requests a minute**, and a cold ten-concept guide wants ten. So the first
guide of a chapter now degrades *honestly*: **8 of 10 sections written, 2
labelled as estimates** after the quota ran out, instead of all ten pretending.
The cache is not a nicety here — it is what makes the second student cost zero
calls, which is the only reason a five-a-minute budget can serve a class.

## 2026-09-27 — Strategy reframe, and official period allocations

**What changed.** Reframed the product around one rule: *content is delivery,
diagnosis is the product.* A free chatbot can write a study guide in seconds, so
the guide is how we deliver an answer, not what we are. Added
[`docs/SYLLABUS.md`](docs/SYLLABUS.md) as the argument for the syllabus layer
being the real defensible asset, and drew an explicit **subject boundary**:
we assess conceptual subjects (Biology, History, Geography, Civics, languages)
and do **not** yet claim computational ones (Mathematics, Physics, Chemistry),
because spoken explanatory recall is the wrong instrument for calculation and a
confident wrong grade is worse than an honest gap.

**Reliability fix.** Our per-user AI allowance was 3× the Gemini free tier's
per-project ceiling, manufacturing 429s, and every one of them fell into a bare
`catch { return fallback(); }` with no log and no counter — so a rate-limited
student was indistinguishable from a successful one. Now: the allowance sits
under the provider ceiling, `429`/`5xx` retry with jittered backoff inside a
single wall-clock budget, `400`/`404` fail fast, and every fallback logs and
counts (`GET /api/ai/telemetry`).

**Schema.** Migration `0004` adds `syllabus_unit.periods` + `periods_source` for
the official MoE teaching-period allocation, surfaced on `/syllabus`.

> **Not yet true:** the Biology 12 period figures are **not** in the database.
> All six units are deliberately `NULL` until someone transcribes the official
> MoE syllabus with a page reference. The mechanism ships; the data does not.
> The smart study guide (Phase 11) is **designed, not built**.

## 2026-09-22 — Offline-first loop and Amharic everywhere

**Offline.** The study loop now survives a dead connection: an IndexedDB
submission outbox replays with the original `attemptId` so the existing
idempotency means a retry never double-grades, checklists and generated
lessons/questions are cached, and an honest three-state banner distinguishes
*offline* / *saved, will grade when you're back* / *syncing*. A queued item never
shows a score it doesn't have. Grading itself stays online.

**Amharic.** Bilingual EN/አማርኛ across every surface, with a pre-hydration
`lang` attribute, Ethiopic type verified (Noto Sans Ethiopic 400–700), and
**generated content following the language preference** — lessons, retest
questions and diagnoses are written in Ge'ez, with concept names kept verbatim
as data rather than translated. The offline fallback content is Amharic too, and
cached reads honestly flag which language they hold.

## 2026-09-21 — Syllabus anchoring and the first misconception map

**Syllabus.** The `syllabus` / `syllabus_unit` tables, seeded with the **verified
six-unit Biology Grade 12 structure** from the MoE New-Curriculum textbook
(2023, ISBN 978-99990-0-011-6), provenance recorded in `sourceNote`. Students
can browse by syllabus unit and see how much of each unit is covered, and
chapters can be mapped to units.

**Misconception map.** Recall grading records misconception hits, and
`GET /misconceptions` returns aggregate counts with a **k-anonymity floor of 5**,
shown as a panel on the dashboard. Privacy by construction: aggregate only, no
raw transcripts or voice.

> **Not yet true:** one subject/grade (Biology 12), and the seed is
> "carefully transcribed," **not** teacher-signed-off — that pass is still on the
> go-live checklist. The misconception map needs real student volume to mean
> anything.

## 2026-09-19 — Bring your own textbook, and demo mode

Students can upload **their own** PDF or paste text; the device reads the table
of contents and slices the book into chapters on-device, each flowing into the
existing ingest pipeline. Anonymous visitors can try the loop as a **demo**
without signing up, IP-throttled and rate-limited.

> **Not yet true:** import is **gated behind `TEXTBOOK_IMPORT_ENABLED`** and is
> not open to students yet — the Phase 6 go-live checklist (DB-backed quotas,
> chunk idempotency, cookie hardening) has to land first.

## 2026-09-18 — Craft, accessibility, and honest failure states

A full UI/UX pass: the open-ring mark (which closes in gold as gaps close),
ink-settling motion, fixed Sage/Rust feedback colours instead of theme-following,
and a rebuild of the control layer. Voice capture gathers **every** user
transcript chunk, partial and final, because a long recall streams in pieces and
filtering to "final" alone would drop most of what the student actually said.
A typed recall surface exists as an alternative to speaking.

## 2026-09-15 — The AI loop, live-verified

The real Gemini loop behind a deterministic fallback chain: concept and
misconception extraction from a chapter, grading spoken recall against that
checklist, a targeted lesson for the gaps, and retest questions on the same
concepts. All four endpoints live-verified against `gemini-3.6-flash`. The
product **works with or without a key** — without one it degrades to
deterministic heuristics rather than failing.

## 2026-09-14 — Foundation and the voice spine

Turborepo monorepo (Bun + React Router + Postgres), the domain model, the API
shell, and the AI seam. The voice spine landed first and stayed load-bearing:
Voxide for capture, native `speechSynthesis` for read-back, a voice-state ring,
and a `/voice-test` route. The seam rule from day one: **voice is the
interface, Gemini + text are load-bearing** — so the loop never bets on a
vendor's speech layer being correct.
