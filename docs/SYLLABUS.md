# The syllabus layer — our real asset

**Status:** Working document. One subject/grade verified (Biology 12); the
expansion plan and the grading-boundary analysis below are the design of record.
**Read with:** [`STRATEGY.md`](STRATEGY.md) (why this is the moat),
[`PRD.md`](PRD.md) (product), the [roadmap](howItWorks/roadmap.md) (status).

---

## 1. Why this document exists

Everything else in Kiftet is either **replicable** (a study guide, a quiz, a
chatbot, a voice loop) or **commodity** (the model, the OCR, the host). The
syllabus layer is the one asset that is neither, and this document exists to
make it one deliberately rather than by accident.

The blunt version, stated once so it stops being argued:

> **An LLM can write a study guide from your textbook in about four seconds.
> It cannot tell you what the Ethiopian Grade 12 Biology exam actually asks,
> how many periods the MoE allocates to each unit, or which four of your own
> gaps will cost you the most marks. Those are facts about the world, and
> facts about the world are what we are paid for.**

So the syllabus is not a nice-to-have dataset. It is the product's spine, and
every other bet is downstream of it.

---

## 2. The honest ladder: what is actually defensible

Most products' "moats" evaporate under one question: *could a well-funded
competitor do this in a quarter?* Answered honestly, tier by tier:

| Layer | Example | Replicable? | Our position |
|---|---|---|---|
| **A** — generated content | Chapter guide, quiz questions, summaries | **Trivially.** Any model. | **Delivery only.** Build it cheap, don't compete here. |
| **B** — product mechanics | Voice recall → gap analysis → retest | **Yes, in a sprint.** It's ~20 prompts. | **Necessary, not sufficient.** |
| **C** — national curriculum structure | Subject → unit → topic, verified against the official MoE document | **Slowly, and only with the documents in hand.** Requires obtaining, parsing, and *verifying* official syllabi. | **Real.** Bounded, finite, and it degrades gracefully if we're slow. |
| **D** — exam-grounded weighting | Which units/sub-topics carry the most periods and marks | **No** — this is *in the official documents*, not in any model. | **Real and defensible.** Nobody can guess it; they must do the work. |
| **E** — longitudinal per-student mastery | "This student has been weak in Energy Transformation across 4 sessions, and it improved" | **Impossible.** Requires the data and the trust to collect it. | **The real moat.** Compounds with usage. |
| **F** — aggregate misconception map | Which wrong ideas are most common nationally, above a k-anon floor | **Impossible.** Empirical, not generative. | **The real moat.** See [`STRATEGY.md`](STRATEGY.md) bet 2. |

**The strategic consequence:** tiers A and B are the *cost of entry* and should
be engineered for cheapness and reliability — never gold-plated, because
someone will ship them for free next quarter. Tiers C–F are where we spend.
If we ever find ourselves polishing a generated guide while a syllabus is
unverified, we have the priorities backwards.

---

## 3. The curriculum, accurately

Ethiopia's MoE framework runs KG–Grade 12: primary 1–8, general secondary 9–10,
preparatory 11–12. **Kiftet targets secondary (9–12).** Sciences are offered as:

- **Grades 7–8:** Biology, Chemistry, Physics as separate subjects.
- **Grades 9–10:** separate Biology, Chemistry, Physics, plus Mathematics,
  English, Civics & Ethical Education, Geography, History, IT, PE, Mother Tongue.
- **Grades 11–12:** two streams; the **Natural Sciences** stream carries
  specialised Biology, Chemistry, Physics, Technical Drawing, with English,
  Civics and PE common across streams.

**Two distinct sources, never to be conflated:**

1. **The examination** — the Ethiopian national exit exam for Grade 12
   (EUEE/EHEEE), sat at the end of preparatory. **Grade 12 only.** This is
   what makes the problem urgent, and it is a *deadline*, not a curriculum.
2. **The syllabus** — the MoE curriculum framework and its per-subject syllabi,
   which exist for **every grade 9–12 subject**. This is the *asset*, and it is
   not Grade-12-only.

**The distinction is the single most important thing in this document.** The
exam gives us urgency and a marketing hook; the syllabus gives us depth and
retention. Building only for the exam is a seasonal, Grade-12-only business that
dies in July. Building the syllabus properly is a year-round 9–12 business. We
need both — but they are different investments, and we should be explicit that
the exam is the *entry* and the syllabus is the *stay*.

### Where we actually are

One subject/grade is verified: **Biology, Grade 12** — the six units of the
MoE New-Curriculum Grade 12 Biology student textbook (2023, ISBN
978-99990-0-011-6): Application of Biology, Microorganisms, Energy
Transformation, Evolution, Human Body System, Climate Change. Provenance is
recorded in `syllabus.sourceNote` and the `source` flag is `verified`.

A single human verification pass by a classroom teacher (confirming the list
against the physical textbook) is on the go-live checklist. **Until that
happens, "verified" means "we transcribed the official list carefully," not
"a teacher has signed off."** We don't ship it to students as gospel before
then.

---

## 4. The asset we're underrating: period allocations

This is the most concrete and most copy-resistant thing available to us, and
the current model throws it away.

MoE syllabi don't just list units — they **allot periods per unit and per
sub-unit.** The Grade 9–10 Biology syllabus, for example, allocates 3 periods
to Unit 1, 16 to Heredity, 11 to Human Biology and Health. The Physics syllabus
tabulates each grade's units against its period count. Chemistry units carry
their own allocations too.

Why this is a moat and not trivia:

- **It's the exam's weighting, from the source.** Not a model's guess about
  what seems important — the actual number of teaching hours the state assigns.
- **It's the difference between "review everything" and "review this first."**
  A student with 40 concepts and 3 weeks cannot do all 40. The periods tell
  them which 12 carry the syllabus. That is the *entire* product promise.
- **Nobody can guess it.** An LLM asked "which Biology 12 units are most
  examined" will produce a confident, plausible, **wrong** answer. We'd be
  guessing, and a student acting on a bad guess is worse off than a student
  with no prioritisation at all.
- **It's bounded, finite, checkable work.** Not an arms race.

**Concretely, this changes the data model.** Right now `conceptNode.weight` is
an LLM's 1–5 guess (`clampWeight` in `gemini.ts`) — the honest name for it is
`ai_estimated_importance`. We should add a separate, authoritative
`periods_allocation` sourced from the official document, with provenance, and
let it **override** the guess when present. Then prioritisation stops being a
model opinion and becomes a fact from the state.

This is a small schema change with an outsized effect on the one thing users
actually judge us by: *did this tell me what to study first?*

---

## 5. The subject boundary — what we are deliberately not claiming

**This is a design decision, not a gap. Write it down so nobody "fixes" it by
accident.**

Kiftet's assessment instrument is **spoken, explanatory recall.** The student
speaks, we transcribe, and we grade whether the explanation *covers* the
concept. That is a valid instrument for a genuinely conceptual subject, and an
**invalid** one for a computational subject.

| Works well today | Doesn't work today — and why |
|---|---|
| Biology (esp. 12) | **Mathematics** — recall ≠ procedure |
| History, Geography | **Physics** — vectors, motion, circuits |
| Civics & Ethical Education | **Chemistry** — stoichiometry, equations, moles |
| English, and language subjects | Anything where *the answer is a number* |

Three distinct reasons, and they compound:

1. **Wrong competence measured.** "Explain the cell membrane" is a fair proxy
   for understanding. "Explain Newton's second law" is a fair proxy for
   *nothing* about whether a student can resolve a vector problem. Spoken
   recall proves *description*, not *competence* — and the exam tests
   competence. We'd be handing students a green light on a skill they don't
   have.
2. **Speech is lossy for notation.** Voice capture degrades exactly where
   computational subjects live: superscripts, subscripts, fractions, matrices,
   integrals, chemical formulae, units. A spoken "two x squared plus three x"
   round-trips ambiguously. We'd be grading transcription noise.
3. **A wrong grade is worse than no grade.** A student told they're solid in
   Chemistry because they described it well, then failing the exam, is
   *actively harmed* — and they'd blame us. The honest failure (we don't assess
   this) is strictly better than the confident wrong one.

**Therefore: we do not claim computational subjects until the instrument
changes.** No "we'll get to it" marketing, no quietly shipping a worse
experience for Math because the model technically accepts input.

### What a real solution would require (for later, not now)

Not a prompt tweak — a different instrument:

- Typed/keyboard or handwriting input as a first-class path (voice optional,
  not mandatory).
- A **symbolic** representation: parsed LaTeX/KaTeX, not plain text.
- **Step-wise, method-aware grading** — partial credit for correct setup with a
  wrong arithmetic result is the normal case in these subjects, and a single
  right/wrong verdict throws that away.
- **Numeric tolerance** and unit handling (a correct answer in cm vs. m is a
  unit error, not a wrong answer).
- Where safe, a deterministic **answer checker** rather than a model judge.

That's a substantial subsystem and a different product surface. It is real
roadmap work, and it is **deferred on purpose** — see
[`STRATEGY.md`](STRATEGY.md) §6 for the sequencing rule that keeps it deferred.

### Why deferring is also the *growth* strategy

A computational track would be a genuinely large market, but it is a
multi-year build. The conceptual track is a *complete* product for a real
student today, and it's the one we can be excellent at. Excellence in a
narrow, real, underserved slice beats adequate in everything — especially for
a small team that cannot afford to be mediocre at scale. So the boundary
doubles as the go-to-market boundary.

**One consequence for marketing: never claim "all subjects."** Claim a
specific, defensible wedge, name it precisely, and let the expansion be a
*surprise* rather than a broken promise.

---

## 6. Expansion plan — 9–12, one subject at a time

The schema already supports it: `syllabus.grade` is a plain `integer`, and
`syllabus_unit` is generic over subject. Nothing structural blocks 9–11 or
other subjects. The cost is entirely **data verification**, and that is the
right kind of cost: it's finite, it's checkable, and it produces a durable
asset.

**Order, and why:**

1. **Biology 12 (now — verified).** Highest exam urgency, and the demo
   textbook already covers it.
2. **Biology 9, 10, 11.** Same subject, adjacent grades. Cheapest expansion:
   the extraction and UI are already built and tested, so this is *pure data
   work* — the most reliable kind of growth. Grade 9–10 Biology is
   particularly well-served by the older published MoE syllabus, which is
   unusually detailed.
3. **Geography / History / Civics 9–12.** Concept-first subjects where our
   instrument is already a good fit, and where the unit structure is
   text-centric enough to verify quickly.
4. **Mathematics / Physics / Chemistry.** Blocked on the instrument work in §5,
   not on data. Syllabus data for these *can* be added early (it makes the
   subject list honest and the roadmap credible), but the assessment loop
   stays off until the instrument is real.

**How to build each one honestly:**

- **Curated, not scraped.** Accuracy is non-negotiable — a wrong syllabus is
  worse than none, because students will trust it and act on it. Transcribe
  from the official document, record the source and page, and keep
  `sourceNote` as the audit trail.
- **Provenance is a product feature.** Every unit should be traceable to a page
  in an official document. A student or a teacher should be able to check us.
  That's also how we defend a `verified` claim later.
- **Period allocations captured as first-class data** from the start (§4).
- **A teacher verification pass** before anything ships as `verified` to
  students.
- **Never infer structure from the model.** The model can *propose* a mapping;
  a human confirms it. An LLM hallucinating a syllabus unit is a trust-ending
  event.

---

## 7. How the syllabus makes users excel and come back

The retention question deserves a real answer, because "they'll come back
because it's useful" is not one.

**Coming back is driven by progress against a fixed target.** A student returns
to a progress bar, not to a tool. The syllabus is what makes the bar *real*:
without it, "coverage" means coverage of whatever PDF was uploaded, which is
arbitrary and gives the student no reason to care. Anchored to the official
unit list, it means coverage of **the exam** — which is the only target the
student actually has.

The loop that makes this work:

1. **Pick a unit** from the official structure (not a random chapter).
2. **Recall** what's stuck — diagnostic, no penalty.
3. **See your gap in that unit**, weighted by the periods that unit carries.
4. **Study the minimum path** to close it, routed to the right pages/tool.
5. **Re-test and watch the number move** — same rubric, before vs. after.
6. **Come back when the term resumes**, with a record of what they closed and
   what's still open, and a new chapter in the exam's shadow.

Step 6 is the compounding one, and it's exactly what tier E (longitudinal
mastery) buys us. NotebookLM can do step 4 beautifully. It cannot do steps 3,
5, or 6, because it has no per-concept mastery, no official unit list, and no
record of this specific student. **That's the whole retention thesis, and it's
built on the syllabus, not on the guide.**

---

## 8. What this document is not

Not scraped data yet, not multi-subject yet, and explicitly not a claim to
assess computational subjects. The honest current state: **one verified
subject, a proven expansion path, and a clear line around what we refuse to
do.** Everything here is either verified, planned, or explicitly deferred —
nothing aspirational is written as if it's shipped.
