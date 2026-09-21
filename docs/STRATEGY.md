# Strategy — Kiftet

**Tagline:** Close the gap.
**Status:** Draft v1 — the five bets that turn a working study loop into a product nobody else can copy by pasting in a question bank.
**Read with:** `PRD.md` (why), `DESIGN_BRIEF.md` (how it should feel), `HOW_IT_WORKS.md` §13 (where we are, phase-by-phase).

---

## 0. The thesis

The loop already works end to end: **Recall → Diagnose → Relearn → Retest**, with a
real before/after score. That proves the mechanism. It does **not** yet prove a
moat — anyone can wire an LLM to a textbook. These five bets are what make
Kiftet hard to copy and *specifically* built for an Ethiopian student under exam
pressure, rather than a generic study tool that was localized after the fact.

Each bet is independent (any one ships value on its own) but compounding (each
makes the next cheaper). The rule from `HOW_IT_WORKS.md` still holds: **one phase
at a time — build, test, write the guide, then the next.**

| # | Bet | One line | Status |
|---|---|---|---|
| 1 | **EHEEE syllabus anchoring** | Study against the exam's own unit map, not just one book | Planned |
| 2 | **Misconception hunting + the national map** | Turn per-student misconceptions into a data moat | Partly built (per-chapter extraction) |
| 3 | **Offline-first study loop** | The loop works in a classroom with no signal | Planned (PWA shell exists) |
| 4 | **Ethiopian texture** | Feels made *for* an Ethiopian student, not translated | In progress (brand + Ethiopic type) |
| 5 | **Consolidate strategy into docs** | Every phase traces to a bet | This doc |

---

## 1. EHEEE syllabus anchoring

**The bet.** No student studies "a textbook"; they study a syllabus that ends in
one exam. Anchor every concept checklist to the official **EHEEE** syllabus
(subject → unit → topic), so Kiftet can say *"here is exactly what the exam asks,
and here is your gap in it"* — not merely "here is your gap in this PDF."

**Why it's ours.** Existing tools (Ethio Matric, TikuretEntrance) are static
question banks: they test, but they don't tell a student their personal gap
*against the official unit structure*. Anchoring also fixes the cold-start
problem — a student can pick a syllabus unit and study it before they ever
upload a book, and a book becomes a way to *cover* a unit, not the unit itself.

**What it takes.**
- Data model: `syllabus`, `syllabus_unit` (subject/grade/unit/topic), with each
  `chapter` and `concept_node` mapped to a unit.
- Two entry points: browse-by-syllabus (choose subject → unit → study) and
  upload-a-book (AI proposes the unit mapping; the student confirms/corrects).
- Coverage at unit level: *"Unit 3 — 60% solid, 2 open gaps"* across chapters,
  which is the view that actually matters before an exam.

**Depends on / risks.** A trustworthy syllabus source (curated seed vs. scraped —
accuracy is non-negotiable) and human-correctable AI mapping. Scope creep across
too many subjects at once.

**Scope — decided (smallest proof first).** One grade, one subject the demo
already covers (e.g. Biology 12), a small **curated** unit seed
(teacher-verified, not scraped — accuracy is non-negotiable) mapped onto the
existing demo chapters, with **browse-by-syllabus** as the first new surface.
Only after that slice proves the unit-coverage view is worth it do we expand to
more subjects/grades. Blueprint taken as grades 9–12 until evidence says
otherwise.

**Status — seed verified, list live.** `syllabus` + `syllabus_unit` tables
(migrations `0001`, `0003`), an idempotent boot seed holding the **verified**
Biology 12 unit list — the full six units of the MoE New-Curriculum Grade 12
Biology student textbook (2023, ISBN 978-99990-0-011-6): Application of Biology,
Microorganisms, Energy Transformation, Evolution, Human Body System, Climate
Change — with provenance recorded in `syllabus.sourceNote` and the `source`
flag flipped to `verified`. `GET /syllabus`, `GET /syllabus/:subject/:grade`
(units + mapped chapters + latest-session coverage), `PATCH /chapters/:id/unit`,
and the `/syllabus` browse UI (unit cards, coverage pills, chapter mapping). The
seed self-upgrades: a pre-existing `provisional` row is reconciled to the
verified list on boot (unit ids stable so chapter mappings survive, obsolete
units dropped). A second human pass (a classroom teacher confirming the list
against the textbook) remains on the go-live checklist.

---

## 2. Misconception hunting + the national misconception map

**The bet.** Kiftet already extracts **common misconceptions** per chapter
(`concept_node.isMisconception`, `PRD.md` §5). Aggregate those hits — anonymized —
across students and you get something no one has: a live map of **which wrong
ideas are most common**, by concept / unit / subject. The individual value ("fix
mine") and the institutional value ("fix the cohort's") are the same data.

**Why it's ours.** It doubles the product: the student gets sharper diagnosis, and
a school or tutoring center (§7, the actual buyer) gets a cohort dashboard. It's a
data moat that compounds with usage, and it grounds the grader in real
pedagogical research (Scholarxiv) instead of a generic "is this correct?" prompt.

**What it takes.**
- A `misconception_hit` event (conceptNodeId + sessionId + anonymized attributes)
  written when grading flags a misconception.
- Aggregate reads: national/cohort "top misconceptions in this unit," student-
  facing "students most often get this wrong," teacher-facing cohort view.
- Privacy by construction: **aggregate only, k-anonymity threshold, no raw
  transcripts shared** (`PRD.md` §6, Ethiopia PDPL 1321/2024).

**Depends on / risks.** Volume (a map needs data), an explicit aggregation/consent
policy, and k-anonymity so a small school can't be de-anonymized. Do **not** ship
a map that leaks individual transcripts or voice.

**Status — first slice shipped.** `misconception_hit` rows are written on recall
grading (free text matched back to the chapter's `is_misconception` concept rows,
deduped per session), and `GET /misconceptions` returns aggregate counts with a
**k-anonymity floor of 5**, unit info attached, subject filterable. The dashboard
shows a "national misconception map" panel once a cluster clears the floor.
The school/teacher cohort view and richer anonymized attributes are deliberately
deferred until the student side has volume (decision 2 — exercise the floor).

**Audience — decided.** Both at launch, but **students ship first**. Students are
the primary target (this includes our own founders studying with it) and the
source of the data, so aggregate student insights come first. The
school/tutoring-center dashboard — the actual B2B buyer (`PRD.md` §7) — is
designed later, in detail, once the student side is solid enough to genuinely pay.
Privacy default: aggregate-only, k-anonymity with a minimum group size exercised
at build time, no raw transcripts ever shared.

---

## 3. Offline-first study loop

**The bet.** Exam prep happens on flaky mobile connections and in exam halls with
no signal. The app is already an installable PWA with an offline page and
network-first navigation — but the **loop** still assumes the network. Make the
loop itself survive a dead connection: pre-cache the chosen chapters' checklists,
keep a local lesson/question cache, and **queue submissions to sync when online.**

**Why it's ours.** `PRD.md` §6 requires graceful degradation on weak connections;
a working offline loop is the difference between "works on my desk" and "works in
a classroom in Bahir Dar." It also pairs naturally with the deterministic
fallback chain (`HOW_IT_WORKS.md` §4): the product already degrades without the
model, so an offline path is an extension of a seam we already trust.

**What it takes.**
- Cache layer: service-worker caching of `/chapters`, `/textbooks`, and concept
  checklists; a small lesson/question cache.
- An **IndexedDB outbox** for recalls/answers, with optimistic UI and a clear
  "saved — will grade when you're back online" state.
- Sync that reuses the existing idempotency (`attemptId`, `insertAttemptOnce`) so
  a replay after reconnect lands exactly once.

**Depends on / risks.** Conflict/idempotency (already solved for attempts), cache
invalidation when a chapter changes, and honest UI — never imply a score is final
while it's still queued.

**Depth — decided (add it only where it doesn't make things worse).** The offline
path ships as: cached checklists/chapters + lesson/question cache, an IndexedDB
outbox with optimistic UI and an honest **"saved — will grade when you're back
online"** state, syncing through the existing idempotency. Grading stays **online**
(accuracy first); offline heuristic grading is only added later if a prototype
proves it doesn't degrade results or UX. Pre-cache conservatively on a metered
connection — default to the current chapter, not the whole library.

---

## 4. Ethiopian texture

**The bet.** It must feel **built for** an Ethiopian student, not localized after
the fact (`DESIGN_BRIEF.md`). Go past a font swap: Ethiopic type pairing,
bilingual EN/Amharic surfaces, and visual texture drawn from Ethiopian material
culture — kept inside the existing monochrome-ink language so it reads as
craft, not costume.

**Why it's ours.** Trust is the product. A student under exam pressure decides in
seconds whether a tool is for them; visual and linguistic specificity is how that
decision is won. It's also the bet competitors can't cheaply copy, because it's
taste, not a feature flag.

**What it takes.**
- Type: pair a distinctive Latin display face with a highly legible body face,
  and a real Ethiopic face (Noto Sans Ethiopic or Abyssinica SIL) — **test actual
  Amharic rendering early** (`DESIGN_BRIEF.md` §type).
- Motifs: a *small* set of culturally-grounded textures — tibeb borders, mesob
  weave, manuscript ink — used sparingly, in the ink language already established.
- Language: **Amharic is a full feature, everywhere** — chrome, the loop, error
  states, and generated content alike (see below).

**Amharic — decided: in literally everything.** Amharic support is a hard product
requirement across **all features**, not a "localized after the fact" extra or
"nice to have (PRD §6)". The bar is being able to state, confidently, that every
feature works in Amharic. The app ships bilingual (EN/Amharic, pref toggle) across
surfaces from the start, and generated content (lessons, retest questions,
diagnoses) gains Amharic output as part of this bet — not a bolt-on. Ethiopic
glyph coverage must be verified before any Amharic surface ships (a fallback font
breaks the whole identity; `DESIGN_BRIEF.md` §type).

**Depends on / risks.** The guardrail is **restraint**: texture stays monochrome
and quiet; never kitsch, never a rainbow. Language is the opposite of a guardrail —
it is load-bearing, and it must be tested in both scripts, not assumed.

---

## 5. Consolidate strategy into docs

**The bet.** The five bets and the phases live in one place, so every decision and
every test traces back to a bet. Documentation is a product surface here — the
repo is part of the pitch.

**What it takes.**
- This `docs/STRATEGY.md`, linked from `README.md` and the `HOW_IT_WORKS.md` §13
  roadmap.
- A mapping from phase → bet (below), so "next up" always names the bet it advances.

**Depends on / risks.** Keeping it honest as things change — a stale strategy doc
is worse than none. Same rule as the inventory in §15: if a row stops being true,
fix the row.

---

## 6. How the bets sequence

| Phase | Ships | Advances bet |
|---|---|---|
| 6 (now) | Bring your own textbook — on-device TOC → chunks → ingest | 1 (a book covers a unit), 3 (on-device, weak-wifi) |
| 7 | EHEEE syllabus anchoring — data model + browse-by-syllabus + unit coverage | **1** |
| 8 | Misconception events + first aggregate map | **2** |
| 9 | Offline outbox + cached checklists | **3** |
| 10 | Amharic everywhere — both-script chrome + generated content, Ethiopic type verified | **4** |

Ethiopian texture (#4) is cross-cutting and lands *inside* each phase rather than
only at the end — a bit of it ships every time. Bet 5 is continuous.

---

## 7. What we deliberately won't do

- **No generic question bank.** More practice content didn't move the pass rate
  (`PRD.md` §1); we're betting on diagnosis, not volume.
- **No gamification, 3D, or avatars** (`PRD.md` §5).
- **No leaked individual data.** The misconception map is aggregate-only.
- **No native app** — the PWA is the offline story.
- **No firehose.** The loop stays a calm, under-20-minute session.

---

## 8. Decisions handed back

1. **Syllabus (bet 1)** — smallest proof first: one grade, one subject the demo
   already covers, a curated (teacher-verified) seed, browse-by-syllabus as the
   first new surface. Expand only after it proves out. *(At build: pin the exact
   subject/grade and gather the seed units.)*
2. **Map audience (bet 2)** — both at launch, **students ship first** (they are
   the primary target and the data source); the school dashboard is designed in
   detail later, once the student side is solid enough to pay. *(At build:
   exercise the k-anonymity floor.)*
3. **Offline depth (bet 3)** — add it only where it doesn't make the loop worse:
   cached checklists + IndexedDB outbox, honest "will grade when back online"
   UI, grading stays online. *(At build: only revisit offline grading if a
   prototype proves it helps.)*
4. **Amharic (bet 4)** — in literally everything. All features support Amharic;
   bilingual chrome from the start, generated content in both scripts as part of
   this bet. The bar is confidently claiming full Amharic support.
