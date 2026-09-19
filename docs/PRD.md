# PRD — Kiftet

**Tagline:** Close the gap. Turn any textbook chapter into a spoken, adaptive review that closes exactly the gaps you have — not the ones you don't.

**Hackathon:** STARK Hackathon 2026
**Status:** Draft v1

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

1. Student picks a chapter (from a pre-ingested textbook).
2. Student speaks a cold explanation of what they remember — no notes, no prompting.
3. System transcribes and grades the explanation against that chapter's concept-and-misconception checklist, identifying specific gaps.
4. System delivers a short, spoken, targeted micro-lesson addressing only the identified gaps.
5. Student is retested with differently-phrased questions on the same gap concepts (not a repeat of the micro-lesson wording — tests real understanding, not parroting).
6. Before/after gap-coverage score is shown.

## 5. Feature scope

### MVP (must work for the demo)
- Textbook chapter ingestion → automatic concept + common-misconception extraction (AI-generated, not hand-authored — this is what lets "every topic in the book" work without manually writing a checklist per topic).
- Voice capture of student's cold explanation (Voxide).
- Gap analysis against the extracted checklist.
- Spoken, targeted micro-lesson generation (Voxide, text-to-speech).
- Retest with varied-phrasing questions on gap concepts only.
- Before/after score display.
- Works end-to-end on at least 2–3 chapters across different topic types (at least one conceptual topic, at least one numerical/formula topic) to prove generalization, not a single cherry-picked demo path.

### Explicitly out of scope for the hackathon
- Native mobile app (building a **web app / PWA** instead — see §8).
- Location-based or push notification reminders (mention as roadmap only).
- Full gamification, 3D models, avatar/character layer.
- Spaced-repetition scheduling across sessions/days.

> The one lonely book in the demo is a **post-hackathon** gap. The next phase
> (Phase 6) is "bring your own book": the student uploads their textbook (PDF or
> pasted text), the device extracts per-chapter text locally, and each chapter
> flows through the existing ingest pipeline into a study. The server API already
> supports it — the work is the on-device extraction flow and the import UI.

## 6. Non-functional requirements

- Bilingual EN/Amharic voice support — attempt if time allows; do not let this block the English MVP path.
- Must be usable on low-bandwidth connections where reasonably possible (Ethiopia's mobile connectivity is inconsistent — design UI to degrade gracefully, not require constant high-speed streaming).
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

- **Numerical/formula-based topics need different grading logic than conceptual topics.** Checking "did you explain the idea correctly" is a different problem from "did you get the right numeric answer via the right method." Test both types before assuming one grading approach generalizes.
- **"Answer accurately on any question" is scoped, not literal** — the goal is strong coverage of the realistic question types for a topic (via the concept + misconception checklist), not a guarantee against every conceivable question.
- **Links.et is the least natural sponsor fit.** Institutional licensing is the most honest way to include it — don't force a fake per-student payment moment into the demo.
