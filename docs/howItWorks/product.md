# How Kiftet Works — the product

> Part of the [how-it-works index](README.md). If you are looking for one specific feature, start at the [feature index](inventory.md). This file covers the "what" and the mental model: what the app is and the vocabulary we use to talk about the four cooperating programs.

---

Kiftet (ክፍተት, "gap") is a studying tool for Ethiopian students
preparing for the national exam. The idea is simple:

> A student speaks or types what they remember about a topic. The app grades
> each checklist concept, shows which ideas are unfinished or explained wrong,
> teaches from an ordered guide linked back to the student's book, then
> re-tests to check whether the gaps closed.

The core loop is: **Recall → Diagnose → Relearn → Retest**. Diagnosis stores a
0–3 mastery level per concept; the guide prioritizes wrong beliefs before
unfinished and untouched concepts.

The bet behind the product: the national exam pass rate rose to 12.8% in 2026,
which means 87.2% of students still failed. Students aren't failing from lack of
exposure — they sat in class. They fail because before the exam, nobody can
efficiently tell them *which* specific concepts didn't stick. Kiftet tries to
close exactly that gap, per student, per concept.

---

## The mental model — four cooperating programs

People often talk about an app as if it's one thing. In reality a modern web app
is at least **three or four programs cooperating**:

```
┌─────────────┐   requests    ┌──────────────┐    SQL    ┌────────────┐
│  Browser UI │ ─────────────▶ │  Backend API │ ─────────▶ │  Database  │
│  (the app   │    JSON        │  (the brain) │            │ (memory)   │
│  you see)   │ ◀───────────── │              │ ◀───────── │            │
└─────────────┘   responses    └──────────────┘            └────────────┘
       │                                │
       │  audio in / voice out          │  prompts in / answers out
       ▼                                ▼
   Voice provider (Voxide)          AI model (Google Gemini)
```

- **Browser UI** — the part on the student's phone/laptop. It shows screens,
  captures the microphone, plays back the lesson. In this project it lives in
  [`apps/web`](../apps/web).
- **Backend API** — a program on a server that receives requests from the UI,
  does the thinking (calls the AI), saves and reads data, and sends answers back.
  Lives in [`apps/server`](../apps/server).
- **Database** — permanent storage. When the student closes their phone, data
  must survive. Lives in [`packages/db`](../packages/db).
- **Voice provider** — the product's signature feature: speech-to-text (hears
  the student) and text-to-speech (talks back). The sponsor product **Voxide**.
- **AI model** — Google Gemini does the reasoning: understanding the student's
  spoken explanation, spotting gaps, writing the micro-lesson, and generating
  retest questions.

**"API"** = Application Programming Interface. It's just the list of things one
program publicly lets other programs do. Think of a waiter: the kitchen (server)
cooks, but you communicate through the waiter (API).

---
