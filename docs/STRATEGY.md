# Strategy — Kiftet

**Tagline:** Close the gap.
**Status:** v2 — positioning, the defensibility ladder, subject boundaries, and
go-to-market. Phase 11 (the smart study guide) is the current build.
**Read with:** [`SYLLABUS.md`](SYLLABUS.md) (the core asset, in depth),
[`PRD.md`](PRD.md) (the product), [`DESIGN_BRIEF.md`](DESIGN_BRIEF.md) (how it
should feel), the [roadmap](howItWorks/roadmap.md) (where we are).

---

## 0. The thesis, in one paragraph

**A Grade 12 student cannot find out which parts of the syllabus they actually
cannot answer.** They sat in the classes, they read the book, they still don't
know where they stand, and there is no efficient way to find out before the
exam. Content is abundant and free — NotebookLM, ChatGPT, the textbook itself.
**Diagnosis is the scarce thing**, and diagnosis requires three facts nobody has:
what the exam asks, what this specific student got wrong, and how the two
connect. Kiftet builds those three. The study guide is how we deliver the
answer; it is deliberately *not* the product.

**Our framing, stated once:** Kiftet is a **diagnostic** that happens to ship
study material, not a content generator that happens to give a score. Every
decision below follows from that.

---

## 1. Why "a study guide" is not a company

Let's be blunt, because this is the failure mode most likely to kill us: a
student can get a chapter summary from a free chatbot in four seconds. If
Kiftet's promise is *"we generate a study guide from your textbook,"* we are a
feature request to a model we can't afford, and we will lose on price,
quality, and distribution simultaneously. ChatGPT is not a competitor we can
out-execute; it is a *floor* we will never be below.

So, the rule for the whole product:

> **Content is delivery. Diagnosis is the product. Never build the delivery
> like it's the product.**

This has teeth, and they show up in engineering decisions:

- The guide must be **cheap** — cached per concept, deterministic where
  possible. Not because it's cheap in effort, but because **a guide is not
  where defensibility lives**, so gold-plating it is misallocated effort.
- If a feature can be added by prompting a bigger model, **it is not a bet.**
  It's table stakes.
- A roadmap item is only a real bet if a funded competitor **could not** ship it
  in a quarter. Most features fail this test, and that's fine and normal.

### The defensibility ladder

| Tier | What it is | Could a funded competitor ship it in a quarter? |
|---|---|---|
| Generated content | Guides, quizzes, summaries | **Yes, trivially.** → delivery only |
| Product mechanics | Voice recall → gap analysis → retest | **Yes.** → necessary, not sufficient |
| **Verified curriculum** | Official subject→unit→topic, with provenance | **Slowly, and only with the documents.** → real |
| **Exam-grounded weighting** | Which units carry the most periods/marks | **No — it's in the documents.** → real |
| **Per-student longitudinal mastery** | What *this* student is weak at, over time | **No — needs the data and the trust.** → **the moat** |
| **Aggregate misconception map** | Most common wrong ideas, k-anon | **No — empirical.** → **the moat** |

The full analysis, including the subject boundary, is in
[`SYLLABUS.md`](SYLLABUS.md) §2. The short version: **spend engineering time on
tiers 4–6; keep tiers 1–2 cheap and reliable.**

---

## 2. The wedge: one instrument in a student's kit

A student preparing for the exam assembles a kit: a textbook, a question bank,
a video channel, a study group, maybe NotebookLM, maybe a tutoring center.
**None of them tell you your personal gap.** That gap is where we sit, and it's
the one job none of them can do, because none of them has a per-concept model
of one student over time.

This framing is load-bearing, and it has three consequences:

1. **We route students *out*, not in.** The guide hands a student to the right
   pages of their textbook, to NotebookLM, to FutureX. Being the thing that
   tells them *where to go next* is more defensible than being one more place
   to read. It also means we're not competing with free content on its own
   ground.
2. **It kills the walled-garden objection.** "You just wrote a guide" is a fair
   criticism of a product that tries to contain the student. It's not a fair
   criticism of a diagnostic that points at the exam.
3. **It's honest about our size.** We're one tool in a kit that a student
   assembles. We don't need to beat NotebookLM; we need to be the reason they
   come back before the next exam.

### Generalising: the strategic answer

**We should not generalise the product surface. Not yet. Not for a long time.**

Generalization is bought with exactly the resource we're short of — attention
per surface, support, and marketing. Google can ship five products; we cannot
ship one and a half. A narrow, deep, genuinely excellent product in a
well-defined market beats a mediocre one everywhere, and that's especially true
of a small team.

**But we should generalise internally, aggressively.** One mastery model, many
ways in: voice, Amharic, offline, exam mode, university entrance. Shared
infrastructure, **one** promise. That's cheap, it's how you get depth without
spreading out, and it's how a dominant core grows into an ecosystem later.

**Ecosystems grow from a dominant node, never from breadth.** The "smart study
ecosystem" is a 2027+ outcome of being excellent at one thing, not a 2026
starting strategy. Building for breadth now would be optimizing for the demo
and starving the thing that actually compounds.

---

## 3. The subject boundary

**We assess conceptual subjects well and computational subjects not at all, and
we say so out loud.**

Kiftet measures **spoken, explanatory recall.** That is a valid instrument for
Biology, History, Geography, Civics, and language subjects, and an **invalid**
one for Mathematics, Physics, and Chemistry — where understanding is
procedural, speech mangles notation, and "I explained it well" is worthless as
evidence of "I can do the problem." We would be handing students a false green
light on a skill they don't have, which is *worse* than not offering the subject.

**So we do not claim computational subjects until the instrument genuinely
changes** — typed/symbolic input, method-aware step grading, numeric tolerance.
The analysis, and why deferring is also the growth strategy, is
[`SYLLABUS.md`](SYLLABUS.md) §5.

**Marketing consequence, and it's a strict rule: never say "all subjects."** A
specific, defensible claim beats a broad false one, and the expansion to
computational subjects should be a *surprise*, not a broken promise we shipped
against. This is also why the boundary is written down — so nobody quietly
"fixes" it by adding Math to the demo because it looked empty without it.

---

## 4. Go-to-market

### Who we're for

**Primary: the Grade 12 student in the last 90 days before the national exam.**
Not "students" — *these* students. They have a deadline, they have a syllabus,
and they have no idea which parts of it they can't do. The urgency is real and
the pain is specific, which is exactly what you want in a first customer.

That window is a feature, not a constraint: it makes the product's value
obvious in one sentence, and it makes a demo land.

**Secondary (the buyer): schools and private tutoring centers.** B2B2C — see
[`PRD.md`](PRD.md) §7. Families pay for tutoring centers ahead of the exam
already; we sell the center a way to make its existing tutoring more effective,
through Links.et. Never pay-per-student — the students least able to pay are
exactly the ones we're for.

### What we say

One sentence, no hedging:

> **"Kiftet doesn't give you more to read. It tells you which parts of the
> syllabus you actually can't answer yet — and the shortest way to fix them."**

Why this beats the alternatives in the student's actual consideration set:

- vs. **the textbook:** "read it again" — doesn't prioritise, doesn't verify.
- vs. **a question bank (Ethio Matric, TikuretEntrance):** they test, they
  don't diagnose. Passing a random practice set tells you almost nothing about
  your actual gaps.
- vs. **a chatbot:** it has no memory of you, no official unit list, no record
  of your last four sessions. It answers whatever you ask; we tell you what to
  ask.
- vs. **a tutoring center:** expensive, and we don't replace them — we tell
  *them* what to focus on.

**Marketing guardrails:** never claim a score we can't back; never imply we
assess computational subjects; never compare to NotebookLM on content
(“better summaries”) — we lose that and it's not the fight. We compete on
**prioritisation, provenance, and proof of progress.**

### Where students actually are

Ethiopia, 2026: **WhatsApp and Telegram for study coordination**, TikTok for
reach, Facebook where the cohort already gathers, and a strong word-of-mouth
tutor/cohort layer. Telegram channels are how exam-season study groups
actually form; that's the realistic distribution surface, not SEO or app-store
discovery.

- **Telegram channel** per region/subject for exam-season study groups —
  where the loop gets shared.
- **Tutors and centers** as the multiplier: a tutor who uses it with 20
  students sends us 20, and the cohort dashboard (bet 2) is what makes it
  stick for them.
- **Schools** for the same reason, once there's a cohort story to show.
- **The demo is the pitch.** This loop is hard to explain and easy to feel. A
  3-minute before/after of a real gap closing sells better than any copy.

### What we do *not* do

- **No paid acquisition.** Wrong for a pre-revenue team, wrong for this
  market, and we'd be optimising for a signal we don't have yet.
- **No "10x your score" promises.** Ethically wrong, legally risky, and it
  invites the exact over-claim §3 forbids. We promise *prioritisation and
  proof*, not outcomes we don't control.
- **No content-marketing treadmill.** We don't win by publishing study material
  — that's a losing race with free. We win by being the diagnostic.

---

## 5. The bets

Each bet is independent (any one ships value alone) but compounding (each makes
the next cheaper). One phase at a time — build, test, write the guide, then the
next.

| # | Bet | One line | Status |
|---|---|---|---|
| 1 | **Syllabus anchoring** | Study against the official unit map, not just one book | **The core asset.** Schema + browse UI + unit coverage shipped; Biology 12 verified. Expansion plan in [`SYLLABUS.md`](SYLLABUS.md) |
| 2 | **Misconception map** | Per-student errors → a data moat | Partly built: `misconception_hit`, k-anon aggregate, dashboard panel |
| 3 | **Offline-first loop** | The loop works in a classroom with no signal | Offline slice shipped (outbox + banner + checklist cache) |
| 4 | **Amharic everywhere** | Feels made *for* an Ethiopian student, not translated | ✅ Done (phase 10) |
| 5 | **Docs as the spine** | Every decision, bet, and phase traces to a bet | This doc + [`SYLLABUS.md`](SYLLABUS.md) |

### 1. Syllabus anchoring — **the core asset**

**The bet.** Anchor every concept to the official MoE subject → unit → topic
structure, with **period allocations** from the official document, so Kiftet can
say *"this unit carries 16 periods and here is your gap in it."*

**Why it's ours.** Existing tools (Ethio Matric, TikuretEntrance) are static
question banks: they test, they don't diagnose against the official structure.
Anchoring also fixes cold start — a student can pick a unit and study it
before ever uploading a book, and a book becomes a way to *cover* a unit rather
than the unit itself. It is also the **retention engine**: progress is
measured against the exam, not against whatever PDF was uploaded, which is the
only target the student actually cares about.

**What it takes** — full detail, expansion order, and the period-allocation
schema change are in [`SYLLABUS.md`](SYLLABUS.md).

**Risks.** A trustworthy source (curated, not scraped — a wrong syllabus is
worse than none, because students will trust it), and a teacher verification
pass before anything ships as `verified`.

**Status.** `syllabus` + `syllabus_unit` tables, an idempotent boot seed with
the **verified** Biology 12 unit list (six units, MoE New-Curriculum 2023
textbook, ISBN 978-99990-0-011-6), provenance in `sourceNote`, `GET /syllabus`,
chapter→unit mapping, and the `/syllabus` browse UI. One human teacher pass
remains on the go-live checklist.

### 2. Misconception hunting + the national map

**The bet.** Extract misconceptions per chapter, record every hit, and
aggregate above a k-anonymity floor into a live map of **which wrong ideas are
most common**, by concept/unit/subject. The individual value ("fix mine") and
the institutional value ("fix the cohort's") are the same data — and neither is
generatable by any model.

**Status.** `misconception_hit` rows on recall grading, `GET /misconceptions`
with a **k=5** floor, unit info, subject filter, dashboard panel. The
school/tutoring-center cohort view is deliberately deferred until the student
side has volume.

**Privacy.** Aggregate-only, k-anonymity, no raw transcripts or voice shared —
Ethiopia PDPL 1321/2024. Never ship a map that leaks an individual.

### 3. Offline-first loop

**The bet.** Exam prep happens on flaky mobile and in halls with no signal. The
loop itself should survive a dead connection: pre-cached checklists, a local
lesson/question cache, and **submissions queued to sync when online**.

**Status.** `lib/store.ts` (IndexedDB, SSR-safe), `lib/outbox.ts` (replays with
the **original `attemptId`** so the existing idempotency lands each retry
exactly once), online hook, an honest three-state offline banner, and the loop
wired end to end — a submission that can't reach the server parks in the
outbox with "saved — will be graded when you're back online," and reconnect
flushes it onto its graded position. Grading stays online; a queued item never
shows a score it doesn't have.

### 4. Amharic everywhere

**The bet.** It must feel **built for** an Ethiopian student, not localized
after the fact. Ethiopic type, bilingual surfaces, texture drawn from Ethiopian
material culture — restrained, monochrome, craft not costume.

**Amharic is a hard requirement across every feature**, not an extra —
including *generated* content (lessons, retest questions, diagnoses), which
follow the language pref. Concept names stay verbatim in the source's script as
data. Ethiopic glyph coverage is verified, not assumed.

**Status.** ✅ Phase 10 complete: language pref + toggle, the loop's
load-bearing chrome and every shell route wired, generated content in the
student's language, Ethiopic type and icon geometry verified.

### 5. Docs as the spine

**The bet.** Every decision, bet, and phase traces to a bet, in one place — so
the next session (or the next person) doesn't reconstruct the thread. The repo
is part of the pitch, and a stale strategy doc is worse than none.

---

## 6. How the bets sequence

| Phase | Ships | Advances bet |
|---|---|---|
| 6 | Bring your own textbook — on-device TOC → chunks → ingest | 1 (a book covers a unit), 3 |
| 7 | Syllabus anchoring — data model, browse-by-syllabus, unit coverage | **1** |
| 8 | Misconception events + first aggregate map | **2** |
| 9 | Offline outbox + cached checklists | **3** |
| 10 | Amharic everywhere | **4** — done |
| **11** | **The smart study guide** — per-concept mastery, cached sections, optional pre/post retest | **1 + 2** — the mastery model is what finally makes the misconception map *per-concept* |

**The sequencing rule that keeps us narrow:** finish the current version — the
subjects we're honest about, producing real, defensible results — *before*
extending the subject surface. Breadth is earned by depth, never traded for it.
Computational subjects (§3) wait on the instrument, not on ambition.

---

## 7. What we deliberately won't do

- **No generic question bank.** More practice content hasn't moved the pass
  rate; we're betting on diagnosis, not volume.
- **No "all subjects" claim** until the assessment instrument earns it (§3).
- **No gamification, 3D, or avatars.**
- **No leaked individual data.** The map is aggregate-only, above the k floor.
- **No native app** — the PWA is the offline story.
- **No firehose.** The loop stays a calm, sub-20-minute session.
- **No ecosystem yet.** Internal generalization yes; external breadth no (§2).

---

## 8. Decisions handed back

1. **Syllabus (bet 1)** — curated, teacher-verified, one subject/grade at a
   time, Biology 12 first. **Add `periods_allocation` from the official
   document and let it override the model's weight guess** — this is the
   highest-leverage small change in the roadmap, because prioritisation is the
   promise. *(Full order and rules: [`SYLLABUS.md`](SYLLABUS.md) §6.)*
2. **Map audience (bet 2)** — both at launch, **students ship first** (they're
   the data source); the school/tutoring dashboard is designed in detail later,
   once the student side can pay. K-anonymity floor exercised at build time.
3. **Offline depth (bet 3)** — add only where it doesn't make the loop worse.
   Grading stays online; revisit only if a prototype proves it helps.
4. **Amharic (bet 4)** — in literally everything, including generated content.
   The bar is confidently claiming full Amharic support.
5. **Subject surface** — conceptual subjects only, explicitly, until the
   instrument supports computation (§3). This is a commitment, not a delay.
6. **Generalization** — internal only for now; no product breadth until the
   current version demonstrably works for the subjects it claims (§2, §6).
