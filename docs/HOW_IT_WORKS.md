# How Kiftet Works — a guide for everyone

This document explains what this project is, how the code is organized, how a
request flows through the system, and **why** the team made the choices we made.
It's written to be read by anyone — including people who are still learning
software engineering. Terms get explained the first time they appear.

---

## 1. The product — what Kiftet does

Kiftet (ክፍተት, "gap") is a studying tool for Ethiopian Grade 11–12 STEM students
preparing for the national exam. The idea is simple:

> A student speaks out loud what they remember about a topic. The app listens,
> figures out which specific concepts they **did not** explain (their "gaps"),
> teaches a short lesson covering **only** those gaps, then re-tests them to
> confirm the gaps closed.

The core loop is: **Recall → Diagnose → Relearn → Retest**.

The bet behind the product: the national exam pass rate rose to 12.8% in 2026,
which means 87.2% of students still failed. Students aren't failing from lack of
exposure — they sat in class. They fail because before the exam, nobody can
efficiently tell them *which* specific concepts didn't stick. Kiftet tries to
close exactly that gap, per student, per concept.

---

## 2. Software engineering basics — the mental model

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

## 3. Why a monorepo? (and what a monorepo is)

A **monorepo** = one git repository containing multiple separate programs that
share code. Ours has this layout:

```
kiftet/
├── apps/
│   ├── web/      ← the browser app (React)
│   └── server/   ← the backend API (Express)
├── packages/
│   ├── db/       ← database schema + connection helper
│   ├── auth/     ← login/signup/session handling
│   ├── ui/       ← reusable design components (buttons, cards, …)
│   └── config/   ← shared TypeScript settings
├── docs/         ← the documents you are reading
```

**Why we put them in one repo instead of several:**

1. **They change together.** A new database table almost always comes with server
   code that reads it and UI code that shows it. One repo means one commit can
   contain the whole change.
2. **Shared code is easy.** The server imports the database package directly
   (`@kiftet/db`), the web app imports the UI package (`@kiftet/ui`). No copying,
   no "download this and sync it" ceremony.
3. **One command, one place.** `bun run build` builds everything.

The cost: you must keep the packages compatible, because they're all in the same
workspace. We accept that trade-off — it's a hackathon project, not a 200-engineer
company.

---

## 4. The tech stack and why we chose each piece

| Concern | Choice | Why |
|---|---|---|
| Language everywhere | **TypeScript** | One language front-to-back; types catch whole classes of bugs before the code even runs. |
| Package manager | **Bun** | Extremely fast installs, runs TypeScript directly, and is the poster-child for hackathon speed. |
| Task runner | **Turborepo** | Runs the "build" of all packages, caches results, only rebuilds what changed. |
| UI app | **React + React Router** | Industry-standard component model; router turns URLs into screens; PWA support for offline. |
| Backend | **Express** | Tiny, boring, universal Node web framework — perfect for a small API. |
| Database | **SQLite (prototype) → PostgreSQL (main)** | The prototype branch uses SQLite because it's a single file — zero setup, works offline. Postgres is the "real" production database and stays on `main`. (More in §6.) |
| Database toolkit | **Drizzle ORM** | Lets us write the schema in TypeScript. "Migrations" (change history of the schema) are generated, not hand-written. |
| Auth | **Better Auth** | Login, signup, password hashing, session cookies — the hard, security-critical parts are battle-tested and we don't reinvent them. |
| AI | **Google Gemini** | Chosen by the team lead for cost + speed. Encapsulated in one service so we can swap providers later. |
| Voice | **Voxide** | The sponsor product — the signature mechanic (STT + TTS). We'll integrate it in Phase 1. |

**Key principle:** we use libraries for the hard, generic problems (auth,
database, HTTP) and write ourselves the few things that make us special (the gap
diagnosis loop).

---

## 5. Data flow — how every feature works

This section traces every feature end-to-end: what the student does, what the
browser sends, what the server does, and what comes back. Each subsection has an
ASCII diagram showing the exact path of data through the system.

### The components (a quick reminder)

```
┌──────────────┐      ┌──────────────┐      ┌────────────┐
│  Browser UI  │─────▶│  Backend API │─────▶│  Database  │
│  (React)     │◀─────│  (Express)   │◀─────│  (SQLite)  │
└──────┬───────┘      └──────┬───────┘      └────────────┘
       │                     │
       │  audio + text       │  prompts + answers
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│    Voxide    │─────▶│  Google      │
│  (voice)     │◀─────│  Gemini (AI) │
└──────────────┘      └──────────────┘
```

---

### 5.1 The complete study loop (overview)

The student's journey through one study session follows a fixed loop:

```
┌─────────────────────────────────────────────────────────────────┐
│                        STUDY LOOP                               │
│                                                                 │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│   │  RECALL  │───▶│  GAPS    │───▶│  LESSON  │───▶│  RETEST  │ │
│   │          │    │          │    │          │    │          │ │
│   │ "What do │    │ "Here's  │    │ "Learn   │    │ "Prove   │ │
│   │  you     │    │  what's  │    │  what    │    │  you     │ │
│   │ remember"│    │  missing"│    │  you     │    │  learned"│ │
│   └──────────┘    └──────────┘    │  missed" │    └──────────┘ │
│        ▲                           └──────────┘          │      │
│        │                                                 │      │
│        │              ┌──────────┐                       │      │
│        └──────────────│  RESULT  │◀──────────────────────┘      │
│                       │          │                              │
│                       │ "Score   │                              │
│                       │  before  │                              │
│                       │  vs after│                              │
│                       └──────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

Each phase is a screen in the UI. The browser decides when to advance; the
server never pushes — it only answers requests. This keeps the API simple and
the student in control.

---

### 5.2 Chapter ingest — putting content into the system

Before any studying can happen, chapters must be loaded in. A chapter is raw
text from a textbook, and the system AI-extracts a "concept checklist" — the
specific ideas the student should understand.

```
TEXTBOOK (PDF/text)
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  POST /api/chapters/ingest                               │
│                                                          │
│  body: { textbookTitle, subject, title, rawText }        │
│                                                          │
│  1. Insert textbook row                                  │
│  2. Insert chapter row                                   │
│  3. Call AI: extractConcepts(rawText)                    │
│     ┌──────────────────────────────────────────────┐     │
│     │  AI prompt:                                  │     │
│     │  "Extract core concepts + common             │     │
│     │   misconceptions from this chapter text.     │     │
│     │   Return JSON: {items:[{conceptText,         │     │
│     │   weight, isMisconception}]}                 │     │
│     └──────────────────────────────────────────────┘     │
│  4. Insert concept_node rows (5-12 concepts)             │
│                                                          │
│  response: { textbookId, chapterId, conceptsExtracted }  │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────┐     ┌──────────┐     ┌─────────────────┐
│textbook  │────▶│ chapter  │────▶│  concept_node   │
│(1 row)   │     │ (1 row)  │     │  (5-12 rows)    │
└──────────┘     └──────────┘     │  each with:      │
                                  │  - conceptText   │
                                  │  - isMisconception│
                                  │  - weight (1-5)  │
                                  └─────────────────┘
```

The concept checklist is the foundation of everything that follows. It tells
the AI what to grade against, what to teach, and what to retest.

---

### 5.3 Starting a study session

The student picks a chapter from the dashboard. This creates a session record
that ties everything together.

```
┌──────────────┐         ┌──────────────┐         ┌──────────┐
│  Dashboard   │────────▶│  POST /api/  │────────▶│  SQLite  │
│              │         │  sessions/   │         │          │
│  "Pick a     │  body:  │  start       │  INSERT │study_    │
│   chapter,   │ {chapter│              │────────▶│session   │
│   then       │  Id}    │  generates   │         │(1 row)   │
│   speak"     │         │  sessionId   │         └──────────┘
│              │◀────────│              │
│  navigates   │ {session│  201 Created │
│  to /study/  │  Id}    │              │
│  {sessionId} │         └──────────────┘
└──────────────┘
```

**Data written:** `study_session` row with `chapterId`, `status: "in_progress"`.
No AI call — this is just bookkeeping.

The browser also sets `activeSessionId` and `activeChapterId` in the voice
agent module, so the Voxide client knows which session it's working with.

---

### 5.4 Recall — "what do you remember?"

This is the heart of the product. The student speaks out loud; the system
grades their explanation against the concept checklist.

```
┌──────────────────────────────────────────────────────────────┐
│                     RECALL FLOW                              │
│                                                              │
│  ┌──────────┐    audio    ┌─────────┐    text    ┌────────┐ │
│  │ Student  │────────────▶│ Voxide  │───────────▶│ Gemini │ │
│  │ speaks   │             │ (STT)   │            │ (AI)   │ │
│  │ into mic │◀────────────│         │◀───────────│        │ │
│  └──────────┘   voice     └────┬────┘  transcript └────────┘ │
│                                │                             │
│                                ▼                             │
│                       ┌────────────────┐                     │
│                       │  Browser UI    │                     │
│                       │                │                     │
│                       │  VoiceCapture  │                     │
│                       │  collects all  │                     │
│                       │  user message  │                     │
│                       │  chunks into   │                     │
│                       │  one transcript│                     │
│                       └───────┬────────┘                     │
│                               │                              │
│              ┌────────────────┤                              │
│              │                │                              │
│              ▼                ▼                              │
│    ┌──────────────┐  ┌──────────────┐                       │
│    │ Auto-end     │  │ Manual tap   │                       │
│    │ "that's all  │  │ on the ring  │                       │
│    │  I remember" │  │ to stop      │                       │
│    └──────┬───────┘  └──────┬───────┘                       │
│           │                  │                               │
│           └────────┬─────────┘                               │
│                    ▼                                         │
│         ┌──────────────────────┐                             │
│         │  POST /sessions/     │                             │
│         │  {id}/recall         │                             │
│         │                      │                             │
│         │  body: { transcript  │                             │
│         │    Text }            │                             │
│         └──────────┬───────────┘                             │
│                    │                                         │
│                    ▼                                         │
│         ┌──────────────────────┐                             │
│         │  Server              │                             │
│         │                      │                             │
│         │  1. Load concept     │                             │
│         │     checklist from   │                             │
│         │     concept_node     │                             │
│         │                      │                             │
│         │  2. Call AI:         │                             │
│         │     gradeRecall(     │                             │
│         │       transcript,    │                             │
│         │       concepts)      │                             │
│         │                      │                             │
│         │  3. Save attempt     │                             │
│         │     (stage=recall,   │                             │
│         │      score, gaps)    │                             │
│         └──────────┬───────────┘                             │
│                    │                                         │
│                    ▼                                         │
│         ┌──────────────────────┐                             │
│         │  Response:           │                             │
│         │  { gaps: {           │                             │
│         │    covered: [...],   │                             │
│         │    missing: [...],   │                             │
│         │    misconceptions:[] │                             │
│         │    score: 60         │                             │
│         │  }}                  │                             │
│         └──────────────────────┘                             │
└──────────────────────────────────────────────────────────────┘
```

**What the AI grades:** The model receives the concept checklist and the
student's transcript, then returns four lists:
- `covered` — concepts the student correctly explained
- `missing` — concepts not addressed
- `misconceptions` — concepts the student got wrong
- `score` — percentage of non-misconception concepts covered, weighted by each
  concept's importance (`weight` 1–5) and corrected for stated misconceptions.
  The score returned to the browser is always an **integer 0–100** — the AI's
  float is re-computed deterministically server-side, never trusted raw.

**What's saved:** An `attempt` row with `stage: "recall"`, the full transcript,
the gap analysis stored as JSON `{covered: [], missing: [], misconceptions: []}`,
and the integer score.

**Idempotency:** the browser sends a random `attemptId` with every submission.
The server inserts the row only once per (session, attemptId), so retries,
replays, or a voice race can never double-count an attempt. The dedup is scoped
to the session, so the same `attemptId` can be reused safely across sessions.

**Auto-end detection:** While the student speaks, the browser watches for
boundary phrases like "that's all I remember" or "I'm done". When detected, it
auto-submits the recall without waiting for a tap. The phrases are defined in
[`apps/web/src/lib/intent.ts`](../apps/web/src/lib/intent.ts).

---

### 5.5 Diagnose — "here's what's missing"

No server call needed — the gaps were already computed during recall. The
browser just displays them.

```
┌──────────────────────────────────────────────────────┐
│  Phase: GAPS                                         │
│                                                      │
│  The browser already has the gap analysis from the   │
│  recall response. It renders:                        │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Coverage: 60%  ████████████░░░░░░░░          │  │
│  │                                                │  │
│  │  ✓ Covered:                                  │  │
│  │    • Ohm's law (V = IR)                       │  │
│  │    • Series circuits                          │  │
│  │                                                │  │
│  │  ✗ Missing:                                   │  │
│  │    • Parallel circuits                        │  │
│  │    • Kirchhoff's voltage law                  │  │
│  │                                                │  │
│  │  ⚠ Misconceptions:                           │  │
│  │    • "Current is used up in a resistor"       │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Two paths:                                          │
│  "Hear the short version" ──▶ Lesson phase           │
│  "Skip the lesson" ────────▶ Retest phase            │
└──────────────────────────────────────────────────────┘
```

The coverage bars are **weighted**: each bar's height scales with the concept's
`weight` (1–5) and the missing segments are proportioned by weight, so the
visual emphasizes the high-value concepts. Misconceptions get their own
"stated wrong" band so the student sees the mistake they made, not just an
omission.

---

### 5.6 Microlesson — "learn what you missed"

The student asks for a short lesson targeting exactly their gaps. The server
generates it with AI.

```
┌──────────────────────────────────────────────────────┐
│                  MICROLESSON FLOW                    │
│                                                      │
│  Browser                    Server                   │
│     │                          │                     │
│     │  POST /sessions/         │                     │
│     │  {id}/microlesson        │                     │
│     │  body: { missing: [...], │                     │
│     │         misconceptions:[] │                     │
│     │  }                       │                     │
│     │─────────────────────────▶│                     │
│     │                          │                     │
│     │                    1. Load concept checklist    │
│     │                       from concept_node        │
│     │                          │                     │
│     │                    2. Call AI:                  │
│     │                       generateMicroLesson(     │
│     │                         gapAnalysis, concepts) │
│     │                          │                     │
│     │                       AI prompt:               │
│     │                       "Write a short           │
│     │                        pronunciation-friendly  │
│     │                        lesson that fixes       │
│     │                        exactly these gaps.     │
│     │                        4-8 sentences, no       │
│     │                        markdown, read aloud    │
│     │                        friendly."              │
│     │                          │                     │
│     │◀─────────────────────────│                     │
│     │  { text: "When current   │                     │
│     │    flows through two      │                     │
│     │    paths..." }            │                     │
│     │                          │                     │
│  Browser renders the lesson text.                    │
│  If a voice session is live, the agent reads it     │
│  aloud in its natural voice. Otherwise, the         │
│  student can tap "Read it to me" for browser TTS.   │
└──────────────────────────────────────────────────────┘
```

**No database write.** This is a pure read+AI operation. The lesson text is
generated on the fly and never stored — it's always fresh for the specific gaps.

---

### 5.7 Retest — "prove you learned it"

The retest has two parts: generating questions, then grading the student's
spoken answers. The key design goal: **each question is graded in isolation
against exactly one concept**, so a right answer on one question can't inflate
the others.

**Part A: Generate questions**

```
┌──────────────────────────────────────────────────────┐
│  Browser                    Server                   │
│     │                          │                     │
│     │  POST /sessions/         │                     │
│     │  {id}/retest             │                     │
│     │  body: { missing: [...], │                     │
│     │         misconceptions:[] │                     │
│     │  }                       │                     │
│     │─────────────────────────▶│                     │
│     │                          │                     │
│     │                    Call AI:                    │
│     │                    generateRetestQuestions(    │
│     │                      gapAnalysis, concepts)   │
│     │                          │                     │
│     │                    AI prompt:                 │
│     │                    "Write 2-3 spoken check     │
│     │                     questions that re-test     │
│     │                     the missing concepts.      │
│     │                     Each must ask the          │
│     │                     student to speak aloud     │
│     │                     an explanation and         │
│     │                     return per question the    │
│     │                     targetConcept it tests."   │
│     │                          │                     │
│     │                    Server reconciles each      │
│     │                    targetConcept against the   │
│     │                    stored checklist            │
│     │                    (case/whitespace tolerant); │
│     │                    unverifiable ones fall back │
│     │                    to the gap list in order.   │
│     │                          │                     │
│     │◀─────────────────────────│                     │
│     │  { questions: [          │                     │
│     │    {question:"Explain    │                     │
│     │     parallel circuits",  │                     │
│     │     focus:["Parallel     │                     │
│     │       circuits..."],     │                     │
│     │     ...}                 │                     │
│     │  ]}                      │                     │
└──────────────────────────────────────────────────────┘
```

Each question's `focus` is the **canonical conceptText** it grades against —
pulled from `concept_node`, not from whatever the question writer happened to
type.

**Part B: Answer each question**

For each question, the student speaks their answer and the browser sends the
question's `focus` along with the transcript. The server grades **only that
focus subset** of the checklist, not the whole chapter:

```
┌──────────────────────────────────────────────────────┐
│  Student speaks answer                               │
│     │                                                │
│     ▼                                                │
│  POST /sessions/{id}/retest/answer                   │
│  body: { transcriptText, focus: [canonicalText],     │
│          missing, misconceptions, attemptId }        │
│     │                                                │
│     ▼                                                │
│  Server:                                             │
│    1. Load concept checklist                         │
│    2. Match focus against it (tolerant); a focus     │
│       string with no stored counterpart is used as   │
│       a standalone concept so the answer still gets  │
│       graded against that idea alone                 │
│    3. Call AI: gradeRecall(transcript, subset)       │
│    4. Per-question verdict via focusScore():         │
│       • misconception → handled if the student did   │
│         NOT restate the wrong belief                 │
│       • real concept → covered only if described     │
│    5. Save attempt (stage="retest", attemptId)       │
│     │                                                │
│     ▼                                                │
│  Response: { score: 100, gaps: {covered,missing,     │
│              misconceptions, score} }                │
│     │                                                │
│     ▼                                                │
│  Browser: appends to answered[] (with "You said:"    │
│  transcript + open/got chips), shows next question   │
│  When all questions answered: "See your result"      │
└──────────────────────────────────────────────────────┘
```

---

### 5.8 Result — "see your improvement"

The server computes one canonical metric for the session. The browser fetches
it and renders the outcome.

```
┌──────────────────────────────────────────────────────┐
│  Browser                    Server                   │
│     │                          │                     │
│     │  GET /sessions/          │                     │
│     │  {id}/result             │                     │
│     │─────────────────────────▶│                     │
│     │                          │                     │
│     │                    SELECT stage, score         │
│     │                    FROM attempt                │
│     │                    WHERE sessionId = :id       │
│     │                          │                     │
│     │                    before = first recall score │
│     │                    after  = AVERAGE of every   │
│     │                            retest answer (not  │
│     │                            just the last)      │
│     │                    durationMs = live running   │
│     │                            time; locked in on  │
│     │                            completion          │
│     │                          │                     │
│     │◀─────────────────────────│                     │
│     │  { before: 60,           │                     │
│     │    after: 85,            │                     │
│     │    delta: 25,            │                     │
│     │    durationMs: 124000 }  │                     │
│     │                          │                     │
│  Three outcomes:                                     │
│                                                      │
│  delta > 0  → "Gap closed!" (gold) → Done           │
│  delta ≤ 0  → "Gap still open" (rust)               │
│                  • "Retest the gaps" again          │
│                  • "Relearn the short version"      │
│                  • "Start over with a cold recall"  │
│  allCovered → "Nothing missing" (sage) → Done       │
└──────────────────────────────────────────────────────┘
```

If the student didn't improve, the result screen shows a **Still-open** list
(the missing concepts + misconceptions that remain) and targeted actions for
closing exactly those. After 2 consecutive no-improvement rounds, the app
suggests coming back later.

**Refreshing the page mid-session:** the study screen restores itself from the
attempt history — if retest answers already exist it re-fetches the result;
otherwise it replays the recall from the stored gaps (never forcing a second
cold recall).

---

### 5.9 Session end — "I'm done"

The session can end two ways: the student taps "Done for now" on the result
screen, or says a farewell phrase into the voice mic.

**Path A: Button tap**

```
┌──────────────────────────────────────────────────────┐
│  "Done for now" button                               │
│     │                                                │
│     ▼                                                │
│  completeSession()                                   │
│     │                                                │
│     ├─▶ POST /sessions/{id}/complete                 │
│     │   Server: UPDATE study_session                 │
│     │   SET status='completed', completedAt=now      │
│     │   Returns { ok, durationMs }                   │
│     │                                                │
│     └─▶ navigate("/dashboard")                       │
└──────────────────────────────────────────────────────┘
```

**Path B: Voice farewell**

```
┌──────────────────────────────────────────────────────┐
│  Student says: "bye", "I'm done studying", "close"   │
│     │                                                │
│     ▼                                                │
│  Voxide transcribes the speech                       │
│     │                                                │
│     ▼                                                │
│  maybeAutoEndSession() fires on "message" event      │
│     │                                                │
│     ├─ Skipped if captureActive = true               │
│     │  (mid-recall "I'm done" finalizes the answer   │
│     │   instead of closing the session)              │
│     │                                                │
│     ├─ detectSessionEnd(text) checks against         │
│     │  SESSION_END_PATTERNS in intent.ts             │
│     │                                                │
│     └─ If match: endVoiceSession()                   │
│          │                                           │
│          ├─ POST /sessions/{id}/complete             │
│          ├─ clientCache.disconnect()                 │
│          └─ window.location.assign("/dashboard")     │
└──────────────────────────────────────────────────────┘
```

The `captureActive` guard is critical: during a recall capture, saying "I'm
done" should finalize the answer, not close the whole session. The guard ensures
only the on-screen `VoiceCapture` owns end-of-speech detection while the mic is
recording an answer.

`/complete` 404s unknown session ids, and `endVoiceSession(delayMs)` defers the
disconnect + navigation long enough for a voice-tool close to deliver its
spoken farewell before the page unloads.

---

### 5.10 Voice agent — a single-job assistant

The voice agent (the Voxide client) is **not** a second driver of the study
loop. The on-screen `StudyProvider` is the single master of the loop (recall →
diagnose → learn → retest → result). The agent has exactly one background job:
**end the session when the student says goodbye**, using a tool call
("capability"). A capability is a registered function the AI can choose to
invoke; the handler calls the same API endpoints as the browser.

```
┌──────────────────────────────────────────────────────────────┐
│                    VOICE AGENT (1 CAPABILITY)                 │
│                                                              │
│  ┌──────────┐    audio    ┌─────────┐    text    ┌────────┐ │
│  │ Student  │────────────▶│ Voxide  │───────────▶│ Gemini │ │
│  │ speaks   │             │ WS      │            │ (AI)   │ │
│  │          │◀────────────│ connect │◀───────────│        │ │
│  └──────────┘   voice     └────┬────┘  transcript └────────┘ │
│                                │                             │
│                                ▼                             │
│                           Says "I'm done for now"           │
│                                │                             │
│                                ▼                             │
│                        ┌──────────────┐                     │
│                        │  Tool call:  │                     │
│                        │  complete-   │                     │
│                        │  Session()   │                     │
│                        └──────┬───────┘                     │
│                               ▼                             │
│                        ┌──────────────┐                     │
│                        │  POST /      │                     │
│                        │  sessions/   │                     │
│                        │  {id}/       │                     │
│                        │  complete    │                     │
│                        └──────┬───────┘                     │
│                               ▼                             │
│                        endVoiceSession(150ms)               │
│                        speaks farewell, THEN disconnects    │
│                        + navigates to /dashboard            │
└──────────────────────────────────────────────────────────────┘
```

**The registered capability:**

| Capability | What it does | API call |
|---|---|---|
| `completeSession` | Ends the session, speaks a farewell, closes | `POST /sessions/{id}/complete` |

The agent is deliberately **not** given recall/retest/lesson capabilities:
those phases are the UI's job, driven by the on-screen ring button and
end-of-speech cues. Keeping them out of the agent's hands means there is one
source of truth for the loop — no voice race can produce a phantom attempt, and
the grading no-ops (double-submit, "I'm done" mid-answer) all live in one place.

**State grounding:** On every tool call, the agent receives the current study
context (chapter title, subject, phase, attempt count) via `bindState` and
`registerState`, so it talks about the right chapter and never re-asks which
one is in progress.

---

### 5.11 Natural voice read-back — replacing robotic TTS

When a lesson arrives, the system prefers the agent's natural voice over
browser text-to-speech. The lesson speaks itself on enter (no tap needed) and
connects Voxide on demand even if no session was live yet:

```
┌──────────────────────────────────────────────────────┐
│  Lesson text arrives in browser                      │
│     │                                                │
│     ▼                                                │
│  speakViaVoxide(text) — connects the voice session   │
│  on demand, then:                                    │
│     │                                                │
│     ├─ client.sendText(                              │
│     │   "Please read this aloud to the student...")  │
│     │                                                │
│     └─ Agent reads it in its natural voice,          │
│        sentence by sentence, highlighted on screen   │
│        as the agent goes (read-along)                │
│     │                                                │
│  If Voxide is unavailable, the student taps          │
│  "Read it to me" for browser TTS with the same       │
│  sentence-by-sentence read-along; a Stop button      │
│  cancels it                                          │
└──────────────────────────────────────────────────────┘
```

**Browser TTS fallback** (`speakAloud` in `voice.ts`): Used only from explicit
buttons ("Read it back", "Read it to me"). Picks the most natural English voice
available (Google UK English Female → Samantha → Karen → etc.), chunks text into
sentences via `splitSentences`, and reads at 0.97× speed.

---

### 5.12 End-of-speech detection — auto-submit without a tap

While the student speaks, the browser watches their transcript for boundary
phrases. This lets them say "that's all I remember" instead of tapping the ring.

```
┌──────────────────────────────────────────────────────┐
│  VoiceCapture is listening                           │
│     │                                                │
│     ▼                                                │
│  Every time voice.messages updates:                  │
│     │                                                │
│     ├─ Join all user messages since capture started  │
│     │  into one transcript string                    │
│     │                                                │
│     ├─ findBoundaryEnd(transcript)                   │
│     │  Checks against 16 phrases:                    │
│     │  "that's all I remember", "I'm done",          │
│     │  "nothing else", "next question", ...          │
│     │                                                │
│     ├─ If found AND fewer than 6 words follow:       │
│     │  │                                             │
│     │  ├─ Extract text before the cue                │
│     │  ├─ Call submit(leadingText)                   │
│     │  └─ Call voice.disconnect()                    │
│     │                                                │
│     └─ If not found: keep listening                  │
│                                                      │
│  The submitted text is the student's answer.         │
│  The cue phrase itself ("I'm done") is stripped.     │
└──────────────────────────────────────────────────────┘
```

The 6-word trailing check prevents false positives: "I'm done with the electron
carriers" is not an ending — the student is mid-sentence.

---

### 5.13 The database — what gets saved

```
┌──────────────────────────────────────────────────────────────┐
│  TEXTBOOK                                                    │
│  ┌────┬─────────────┬──────────┬──────────┐                 │
│  │ id │ title       │ subject  │ language │                 │
│  └────┴─────────────┴──────────┴──────────┘                 │
│       │ 1                                                       │
│       │                                                         │
│       │ N                                                       │
│  CHAPTER                                                        │
│  ┌────┬─────────────┬────────────────────────────┐           │
│  │ id │ textbookId  │ title, rawText              │           │
│  └────┴─────────────┴────────────────────────────┘           │
│       │ 1                                                       │
│       │                                                         │
│       │ N                                                       │
│  CONCEPT_NODE                                                   │
│  ┌────┬─────────────┬──────────────────────┬────────┬───────┐ │
│  │ id │ chapterId   │ conceptText          │ isMis- │ weight│ │
│  │    │             │                      │ concept│       │ │
│  └────┴─────────────┴──────────────────────┴────────┴───────┘ │
│       │                                                         │
│       │ (chapter also has N study_sessions)                      │
│       │                                                         │
│  STUDY_SESSION                                                  │
│  ┌────┬───────────┬──────────┬──────────┬────────────┐        │
│  │ id │ chapterId │ userId   │ status   │ startedAt  │        │
│  └────┴───────────┴──────────┴──────────┴────────────┘        │
│       │ 1                                                       │
│       │                                                         │
│       │ N                                                       │
│  ATTEMPT                                                        │
│  ┌────┬───────────┬────────┬───────────────┐                  │
│  │ id │ sessionId │ stage  │ transcriptText│ gapped           │
│  │(client │        │(recall │               │                 │
│  │attemptId)│      │/retest)│               │ gapsIdentified  │
│  │    │           │        │               │ score (0-100)   │
│  └────┴───────────┴────────┴───────────────┴─────────────────┘ │
└────────────────────────────────────────────────────────────────┘

What each write looks like:

  Chapter ingest  →  textbook (1) + chapter (1) + concept_node (5-12)
  Start session   →  study_session (1)
  Recall          →  attempt (1, stage="recall")
  Retest answer   →  attempt (1, stage="retest")
  Complete        →  study_session UPDATE (status, completedAt)
  Microlesson     →  (no write — pure AI generation)
  Retest questions→  (no write — pure AI generation)
  Result          →  (no write — reads existing attempts)
  History         →  (no write — reads last session per chapter)
```

---

### 5.14 AI prompts — what gets sent to Gemini

Every AI call uses the same pattern: a system prompt + the student data, sent
as a single user message with `temperature: 0.4` and `responseMimeType:
"application/json"`.

```
┌──────────────────────────────────────────────────────────────┐
│  AI CALL PATTERN                                             │
│                                                              │
│  Gemini receives:                                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  role: "user"                                          │  │
│  │  parts: [{ text:                                      │  │
│  │    "{SYSTEM PROMPT}\n\n---\n{STUDENT DATA}"            │  │
│  │  }]                                                    │  │
│  │  config: { responseMimeType: "application/json",       │  │
│  │            temperature: 0.4 }                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  The 4 prompts:                                              │
│                                                              │
│  1. EXTRACT  (chapter ingest)                                │
│     "Extract core concepts + common misconceptions from      │
│      this chapter. Return JSON:                              │
│      {items:[{conceptText, weight, isMisconception}]}"      │
│                                                              │
│  2. GRADE    (recall + retest)                               │
│     "Judge how well the student's recall covers the          │
│      concept checklist. Return JSON:                         │
│      {covered:[], missing:[], misconceptions:[], score}"    │
│                                                              │
│  3. LESSON   (microlesson)                                   │
│     "Write a short pronunciation-friendly lesson that        │
│      fixes exactly these gaps. 4-8 sentences,                │
│      read-aloud friendly. Return JSON: {text}"              │
│                                                              │
│  4. RETEST   (retest questions)                              │
│     "Write 2-3 spoken check questions that re-test           │
│      the missing concepts. For each question return          │
│      the targetConcept it tests. Return JSON:                │
│      {questions:[{question, targetConcept}]}"                │
│                                                              │
│  5. FOCUS    (per-question verdict)                          │
│     Deterministic focusScore(): a misconception is           │
│     handled when NOT restated; a real concept counts         │
│     when covered. Applied to the question's focus            │
│     subset only.                                             │
│                                                              │
│  Every prompt has a fallback: if Gemini fails or the key     │
│  is a placeholder, deterministic heuristics take over        │
│  (weighted token overlap for grading, sentence extraction    │
│  for concepts, templates for lessons/questions). All scores  │
│  are recomputed deterministically server-side with weights   │
│  — the AI's float is never stored raw.                       │
└──────────────────────────────────────────────────────────────┘
```

---

### 5.15 Complete data flow map — every request

For reference, here is every API endpoint, who calls it, and what happens:

```
┌──────────────────────────────────────────────────────────────────┐
│  ENDPOINT                  │ CALLED BY        │ AI? │ DB WRITE? │
├────────────────────────────┼──────────────────┼─────┼───────────┤
│ GET  /chapters             │ Dashboard        │ no  │ no        │
│ GET  /chapters/:id/concepts│ (view only)      │ no  │ no        │
│ POST /chapters/ingest      │ Admin/seed       │ YES │ YES       │
│                            │                  │     │           │
│ POST /sessions/start       │ Dashboard        │ no  │ YES       │
│ GET  /sessions             │ Dashboard        │ no  │ no        │
│                            │ (history)        │     │           │
│ GET  /sessions/:id         │ StudyProvider    │ no  │ no        │
│ POST /sessions/:id/recall  │ StudyProvider    │ YES │ YES       │
│ POST /sessions/:id/microl. │ StudyProvider    │ YES │ no        │
│ POST /sessions/:id/retest  │ StudyProvider    │ YES │ no        │
│ POST /sessions/:id/retest/ │ StudyProvider    │ YES │ YES       │
│   answer                   │                  │     │           │
│ GET  /sessions/:id/result  │ StudyProvider    │ no  │ no        │
│ POST /sessions/:id/complete│ UI + voice agent │ no  │ YES (upd) │
└────────────────────────────┴──────────────────┴─────┴───────────┘
```

The key insight: **the browser UI owns the whole study loop.** The only thing
the voice agent can do is `completeSession` — one endpoint, one job. The
server doesn't care who sent the request.

---

## 6. The database — our data model

A database's design is basically: *what facts do we need to remember, and how do
they relate?* Our bill of facts came directly from the PRD and system design:

| Table | What one row means | Key fields |
|---|---|---|
| `textbook` | A real school textbook (e.g. Physics Grade 12) | `title`, `subject`, `language` |
| `chapter` | One chapter in that textbook, with its text | `textbookId`, `title`, `rawText` |
| `concept_node` | One object in the chapter's concept checklist — a concept OR a known common misconception | `chapterId`, `conceptText`, `isMisconception`, `weight` |
| `study_session` | One study attempt: "student reviews chapter X" | `chapterId`, `userId`, `status`, `startedAt`/`completedAt` |
| `attempt` | One measurement inside a session: the recall, or a retest answer | `id` (client attemptId, dedup scoped to session), `sessionId`, `stage` (`recall`/`retest`), `transcriptText`, `gapsIdentified` (JSON `{covered,missing,misconceptions}`), `score` (int 0–100) |

The `concept_node.isMisconception` flag is the interesting one: the product's
whole trick is that we don't just grade "right/wrong," we grade *which specific
concepts didn't stick* — and we pre-warn about the common mistakes students make.

### Relationships (the arrows between tables)
```
textbook 1 ──── n chapter 1 ──── n concept_node
                        │
                        └─── n study_session 1 ──── n attempt
```
- One textbook has many chapters; one chapter has many concepts.
- One chapter can appear in many study sessions; one session has one recall
  attempt and one score per retest answer.

These "1-to-many" links are stored by a foreign key: a column holding another
table's row id, e.g. `concept_node.chapter_id`. A **foreign key** is just a
promise: "this value must exist in that other table."

### Why SQLite on this branch and Postgres on main
- **SQLite** = one file (`kiftet-dev.db`). No server to install, no credentials,
  works offline, impossible to break. Perfect for iterating fast on the
  prototype.
- **PostgreSQL** = a real database server with users, network access, concurrent
  write safety. That's what production needs when many students hit it at once.

Drizzle lets us switch by changing the driver (the bit that actually talks to the
database). The schema language is ~90% identical, so the swap is cheap. We test
against Postgres on `main` before merge, since main is the "real" app.

### Migrations — the schema's change history
When the schema changes, Drizzle **generates** a SQL file describing the exact
change (`packages/db/src/migrations/*.sql`). Running them upgrades a real
database safely. This is like a version history for your tables — teammates don't
have to manually recreate columns; they just run the migration.

---

## 7. The API surface (what the server can do)

All routes live behind `/api`:

| Method & path | What it does | Phase |
|---|---|---|
| `POST /api/chapters/ingest` | Store a textbook chapter, ready for AI concept extraction | 0 (skeleton) |
| `GET /api/chapters` | List all chapters | 0 |
| `GET /api/chapters/:id/concepts` | View a chapter's concept checklist | 0 |
| `POST /api/sessions/start` | Begin a study session on a chapter | 0 |
| `GET /api/sessions/:id` | Session details + its attempts | 0 |
| `POST /api/sessions/:id/recall` | Submit the student's spoken recall transcript → get gaps | 0/2 (AI in 2) |
| `POST /api/sessions/:id/microlesson` | Get the "teach the gaps" lesson text | 0/2 (AI in 2) |
| `POST /api/sessions/:id/retest` | Get new, differently-phrased questions for the gaps | 0/2 (AI in 2) |
| `POST /api/sessions/:id/retest/answer` | Submit retest answers → updated score | 0/2 (AI in 2) |
| `GET /api/sessions/:id/result` | The before/after coverage delta | 0 |
| `POST /api/sessions/:id/complete` | Mark the session finished | 0 |

In Phase 0, the AI-graded endpoints return **empty placeholders** (empty gaps,
empty questions). The *shape* of the contract is real — the *brains* arrive in
Phase 2.

---

## 8. Design decisions worth remembering

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

4. **Mobile-first, calm design.** Night Indigo `#1B2340` + Meskel Gold `#E8A33D`
   is the identity. The voice state ("Listening…", "Thinking…") is a first-class
   UI element — a student has to trust the app is hearing them. The one place we
   spend visual boldness is the gap visualization: show *which* concepts are
   covered vs missing, not just "62%".

5. **Institutional licensing, not per-student fees** (B2B2C). Schools and
   tutoring centers pay; students get it free. Real deal with Links.et sponsor.

6. **Two explicitly-risky things are tested early, not discovered late:**
   grading a *conceptual* explanation vs. grading a *numerical* answer likely
   need different prompts/logic — we test both on real chapter types (Phase 4).

---

## 9. Where we are (roadmap)

| Phase | Name | Status |
|---|---|---|
| 0 | Skeleton — SQLite domain, API shell, AI seam | ✅ Done |
| 1 | Voice spine — Voxide capture/playback + voice-state UI | ⏭️ Next |
| 2 | AI loop — real Gemini: extraction, grading, micro-lessons, retest | ⛔ |
| 3 | Web flow — Web recall→gap→lesson→retest screens | ✅ |
| 4 | Demo dataset + polish | ⛔ |
| 5 | Deploy (EthioDeploy) + Postgres switch | ⛔ |

> **The voice seam, honestly.** The SDK owns the orb + its word-by-word
> caption (no hide flag in `VoxideAppearance`). We never bet the platform on
> that: real grading reads only **finalized** turns (the same `!m.partial`
> gate as the captions' own bubbles), and the calm replies + read-back come
> from the browser natively — `speechSynthesis` for reading our reply aloud,
> no vendor TTS-commit. Voice = the seam; Gemini + text = load-bearing.

The rule that runs this branch: **build one phase, test it, fix it, write the
testing guide, only then start the next.** Nobody ever fires all phases at once —
each phase is a checkpoint.

---

## 10. How to run everything yourself

```bash
# 1. Install dependencies
bun install

# 2. Regenerate env types (varlock reads .env.schema → TS)
bun run env:generate

# 3. Start the backend
bun run --cwd apps/server dev        # → http://localhost:3000

# 4. Start the web app (different terminal)
bun run --cwd apps/web dev           # → http://localhost:5173
```

The server creates `kiftet-dev.db` on first run (that's the whole SQLite
"database") and applies migrations automatically.

---

## Glossary (plain-English cheat sheet)

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