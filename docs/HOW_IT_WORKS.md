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

## 5. Follow one request through the system

The most realistic thing to understand is a single request, end to end. Let's
follow **"student records their recall of chapter X."**

### Step 1 — The UI calls the API
The web app sends an HTTP request to the server:
```
POST http://localhost:3000/api/sessions/<sessionId>/recall
Body: { "transcriptText": "Thermal equilibrium is when two things become the same temperature…" }
```
The text is wrapped in **JSON** (a plain-text format for structured data).

A small but important detail: the **URL** is a *convention* both sides agree on.
`POST /api/sessions/:id/recall` reads like a sentence: "create something under
`/api/sessions/<id>/recall`." REST APIs (Representational State Transfer) use
URLs as nouns and HTTP methods as verbs:
- `GET` = "read this"
- `POST` = "create this" or "do this action"

### Step 2 — The server receives it
Code in [`apps/server/src/routes/study.ts`](../apps/server/src/routes/study.ts)
`use()`s an Express **router**. The router matches the URL to a handler function.

### Step 3 — Validation
The handler first checks the body against a **Zod** schema:
```ts
const recallSchema = z.object({ transcriptText: z.string().min(1) });
```
Zod is a validation library. If the body is missing or malformed, the request is
rejected with a clear error *before* touching the database or the AI. This is
cheap insurance — bad input is the most common bug source. It also documents the
contract: the shape a request *must* have is written right there in the code.

### Step 4 — Read the chapter's concept checklist
The handler looks up which chapter the session belongs to, then loads that
chapter's "concept checklist" from the database. (The concepts are AI-extracted
during ingestion — Phase 2. In Phase 0 they're a placeholder/empty.)

### Step 5 — Call the AI
The transcript + the concept list are handed to the AI service layer
([`apps/server/src/ai/gemini.ts`](../apps/server/src/ai/gemini.ts)). Gemini
grades the recall: which concepts were covered, which were missing, did the
student show a known misconception — and computes a coverage score.

> Notice the shape of this step: `ai.gradeRecall(transcript, concepts)`.
> The route doesn't care *which* AI answers — it only knows the **interface**
> (the agreed function signature). Phase 2 will implement the real Gemini
> calling logic inside the seam that already exists. This is called
> **separation of concerns**: "what the server must do" is separate from
> "which vendor does it."

### Step 6 — Save the result
The handler writes a row into the `attempt` table: stage `recall`, the
transcript, the gaps found, and the score. Now it's permanent memory — the
"before" half of the before/after score.

### Step 7 — Respond
The handler sends JSON back to the browser:
```json
{
  "transcriptText": "…",
  "gaps": { "covered": ["…"], "missing": ["…"], "misconceptions": [], "score": 0.6 }
}
```

The whole journey is **synchronous and stateless per request**: the server
doesn't open a room and wait; it just answers. The browser decides when to ask
again. This keeps the API simple and predictable.

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
| `attempt` | One measurement inside a session: the recall, or the retest | `sessionId`, `stage` (`recall`/`retest`), `transcriptText`, `gapsIdentified`, `score` |

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
- One chapter can appear in many study sessions; one session has two attempts
  (recall before the lesson, retest after).

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
| 3 | Web flow — recall → gap viz → lesson → retest screens | ⛔ |
| 4 | Demo dataset + polish | ⛔ |
| 5 | Deploy (EthioDeploy) + Postgres switch | ⛔ |

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