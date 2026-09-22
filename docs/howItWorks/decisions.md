# How Kiftet Works — design decisions

> Part of the [how-it-works index](README.md).


1. **Voice is the core, not a bolt-on.** The PRD says Voxide is the mechanic —
   capture the student's explanation, speak the lesson. So we build the voice
   spine early (Phase 1), even though the AI brains come later (Phase 2).

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
   covered vs missing, not just "62%".

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

