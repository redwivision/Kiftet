# PRD — Kiftet

**Tagline:** Close the gap. Turn any textbook chapter into a spoken, adaptive review that closes exactly the gaps you have — not the ones you don't.

**Hackathon:** STARK Hackathon 2026
**Status:** Draft v2 — adds the subject boundary (conceptual subjects, explicitly) and the syllabus-anchored prioritisation.
**Read with:** [`STRATEGY.md`](STRATEGY.md) (positioning + go-to-market), [`SYLLABUS.md`](SYLLABUS.md) (the core asset), the [roadmap](howItWorks/roadmap.md) (status).

---

## 1. Problem

Ethiopia's national exam pass rate has climbed from 3.2% (2023) to 5.4% (2024) to 8.4% (2025) to **12.8% in 2026** — real, government-celebrated improvement. But even that "success" means **87.2% of the roughly 563,500 students who sat the 2026 exam were still failed by the system**, and 565 schools still had zero students pass. The reform is working at the system level and still isn't reaching most individual students. Students aren't failing from zero exposure — they sat through the classes. They fail because there's no efficient way, before the exam, to find out exactly which specific concepts didn't stick. Existing tools (Ethio Matric, TikuretEntrance) address this with static practice-question banks; given the pass rate has only moved with system-level reform, not with more practice content, we're betting on arming the individual student directly rather than waiting on the system to keep improving.

## 2. Target users

- **Primary (end user):** Ethiopian students preparing for the national exam, reviewing content across multiple textbook chapters/subjects.
- **Secondary (buyer):** Schools and private tutoring centers — the actual paying customer (see business model, §7).

## 3. Goals / success metrics

- Concept-coverage delta per session (before vs. after score) — this is the core demo metric.
- Median time per topic review session under 20 minutes.
- Session completion rate (recall → micro-lesson → retest) for the demo dataset.

## 4. Core user flow (per topic/chapter)

The loop is **Recall → Diagnose → Relearn → Re-test**, and it works end to end
today. The current study flow includes per-concept diagnosis and an ordered,
cached guide. Phase 11's remaining scope is student-chosen multi-chapter/topic
study and making re-test *optional* before or after studying.

1. Student picks a **unit** from the official syllabus structure, or their own
chapter. Choosing broader multi-chapter/topic scope remains planned Phase 11
work.
2. Student speaks a cold explanation of what they remember — no notes, no
   prompting.
3. System transcribes and grades the explanation against that chapter's
   concept-and-misconception checklist, identifying specific gaps **per
   concept**, weighted by importance.
4. System delivers a targeted, structured study guide addressing the
   identified gaps — ordered by how much they matter, and cached so it's cheap
   and instant after the first generation.
5. **Optional:** student re-tests with differently-phrased questions on the same
   gap concepts — a real check of understanding, not parroting. Usable *before*
   studying (diagnose) or *after* (verify), graded against the same per-concept
   rubric so the two are comparable.
6. Before/after gap-coverage is shown, per concept and overall.

**Anchoring:** concepts map to official MoE syllabus units, and prioritisation
uses the **period allocations** from the official document, not a model's guess
about what seems important. This is the product's core promise — *which parts
of the syllabus can't you actually answer* — and its full design is in
[`SYLLABUS.md`](SYLLABUS.md).

**Scope — subject boundary (a commitment, not a delay).** Kiftet assesses
**conceptual** subjects well (Biology, History, Geography, Civics, languages)
and **computational** subjects not at all yet (Mathematics, Physics, Chemistry).
The instrument is spoken explanatory recall; for calculation-heavy subjects
that's the wrong instrument — speech mangles notation and "I explained it" is
not evidence of "I can compute it." We don't claim those subjects until the
assessment is method- and symbol-aware. See [`STRATEGY.md`](STRATEGY.md) §3 and
[`SYLLABUS.md`](SYLLABUS.md) §5 for the reasoning and the path to change it.

## 5. Feature scope

### MVP (must work for the demo)
- Textbook chapter ingestion → automatic concept + common-misconception extraction (AI-generated, not hand-authored — this is what lets "every topic in the book" work without manually writing a checklist per topic).
- Voice capture of student's cold explanation (Voxide).
- Gap analysis against the extracted checklist.
- Targeted study-guide generation (structured, Voxide-capable for playback).
- Retest with varied-phrasing questions on gap concepts only.
- Before/after score display.
- Works end-to-end on at least 2–3 chapters across different topic types to prove generalization, not a single cherry-picked demo path — **choosing conceptual subjects**, per the subject boundary above.

### Explicitly out of scope for the hackathon
- Native mobile app (building a **web app / PWA** instead — see §8).
- Location-based or push notification reminders (mention as roadmap only).
- Full gamification, 3D models, avatar/character layer.
- Spaced-repetition scheduling across sessions/days.

> The demo seed is still limited, but Phase 6 is shipped: students save a
> textbook and its nested contents to their account, then choose chapters from
> the tree to import into their study library. PDF text, contents parsing and
> OCR run on-device; the original PDF remains in local browser storage, while
> only selected chapter text and optional numbered topics are sent to ingest.

## 6. Non-functional requirements

- Amharic support across **every** feature (see [`STRATEGY.md`](STRATEGY.md) bet 4). The goal is to be able to state, confidently, that all surfaces and generated content work in Amharic — bilingual EN/Amharic is a hard requirement, not a "nice if time allows" extra; the English MVP path still ships first, Amharic is never an afterthought.
- Must be usable on low-bandwidth connections where reasonably possible (Ethiopia's mobile connectivity is inconsistent — design UI to degrade gracefully, not require constant high-speed streaming). The offline-first loop (STRATEGY.md bet 3) is added only where it improves the loop rather than weakens it.
- Student voice/response data should be handled with the same care implied by Ethiopia's Personal Data Protection Proclamation (No. 1321/2024) — minimize storage, be able to explain what's kept and why if asked.

## 7. Business model

**B2B2C — licensed to schools and tutoring centers, not charged per student.** Ethiopian families already pay for private tutorial centers ahead of the national exam; sell the tool *to* those centers (and to schools with budget) as something that makes their existing tutoring more effective, rather than gating access behind a fee for individual students who are often the least able to pay. Payment/licensing flows through **Links.et**.

## 8. Sponsor integration map

| Sponsor | Role in the product |
|---|---|
| **Voxide** | The core mechanic, both directions — capturing the spoken explanation and delivering the spoken micro-lesson. Not a bolt-on feature. |
| **EthioDeploy** | Hosts the full web app (frontend + backend). Built as a web app specifically so this applies cleanly. |
| **Scholarxiv** | Used to ground the misconception-detection logic in real pedagogical research on common student errors per topic, and to log the team's ideation trail. |
| **Links.et** | Institutional licensing payments from schools/tutoring centers. |

## 9. Known risks (said honestly, not hidden)

- **Computational subjects need a different assessment instrument, and we're not
  claiming them until they have one.** Checking "did you explain the idea
  correctly" is a different problem from "did you set the problem up correctly
  and get the right value with the right units." Spoken recall also degrades
  exactly where these subjects live — superscripts, fractions, matrices, chemical
  formulae. A confident wrong grade is *worse* than an honest "we don't assess
  this yet," so the boundary is drawn deliberately and stated in our marketing
  ([`STRATEGY.md`](STRATEGY.md) §3). Path to changing it:
  [`SYLLABUS.md`](SYLLABUS.md) §5.
- **"Answer accurately on any question" is scoped, not literal** — the goal is
  strong coverage of the realistic question types for a topic (via the concept +
  misconception checklist), not a guarantee against every conceivable question.
- **Links.et is the least natural sponsor fit.** Institutional licensing is the
  most honest way to include it — don't force a fake per-student payment moment
  into the demo.
- **A generated study guide is not a moat** — a free chatbot produces one in
  four seconds. Our defensibility is the syllabus layer, per-concept mastery,
  and the misconception map, all of which require data we don't have yet. See
  the defensibility ladder in [`STRATEGY.md`](STRATEGY.md) §1.
- **Syllabus accuracy is a trust dependency.** If our unit list or period
  allocations are wrong, students act on them and we lose the one thing we
  can't get back. Mitigated by curated (not scraped) sources, recorded
  provenance, and an instructor verification pass before anything ships as
  "verified" to students ([`SYLLABUS.md`](SYLLABUS.md) §6).
