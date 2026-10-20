# How Kiftet Works — the database

> Part of the [how-it-works index](README.md).


A database's design is basically: *what facts do we need to remember, and how do
they relate?* Kiftet has **fifteen tables** in two families: the eleven **study-domain**
tables (the product) and the four **auth tables** (who is signed in).

### 6.1 The study domain (12 tables)

| Table | What one row means | Key fields |
|---|---|---|
| `textbook` | A real school textbook (e.g. Physics) that a **user owns**, including its saved table of contents before any chapters are imported | `ownerId` → user, `title`, `subject`, `language`, `sourceName`, `sourceSize`, `toc` (nested JSON outline) |
| `chapter` | One chapter in that textbook, with its text | `textbookId`, `unitId` → syllabus_unit (nullable, the chapter-to-syllabus map), `title`, `rawText` |
| `concept_node` | One object in the chapter's concept checklist — a concept OR a known common misconception | `chapterId`, `conceptText`, `isMisconception`, `weight` (1–5) |
| `chapter_objective` | One learning objective the *book itself* states for a chapter | `chapterId`, `objectiveText`, `sortOrder`, `sourceOffset`/`sourceQuote` (anchor into `rawText`), `estimated` (found by the deterministic scan, not the model) |
| `guide_section` | Cached guide content for one chapter concept and language | `chapterId`, `conceptText`, `language`, structured guide content and source anchor; unique `(chapterId, conceptText, language)` |
| `plan_content` | **Unused since v1.** Grounded per-step content cache from the pre-roadmap plan | `chapterId`, `conceptText`, `stepType`, `language`, `planVersion`; unique across all five fields |
| `plan_step_check` | **Unused since v1.** The v0 plan's per-concept check (the plan is a roadmap now, not a quiz) | `sessionId`, `conceptText`, `responseText`; unique `(sessionId, conceptText)` |
| `study_queue` | A planned set of chapters to walk in order (phase 11, step 4c) | `userId`, `createdAt`; its sessions point back through `study_session.queueId` |
| `study_session` | One study attempt: "student reviews chapter X" | `chapterId`, `userId`, `status` (`pending`/`in_progress`/`completed`), `startedAt`/`completedAt`, `recallMode` (`blurting`/`targeted`/`both`), nullable `scopeKeys` (section keys; null = whole chapter), nullable `queueId` + `queuePosition` (the planned order when the session came from a queue), `pretestQuestions` + `pretestIndex`, `recallQuestions` + `recallIndex`, `retestQuestions` + `retestIndex` |
| `attempt` | One measurement inside a session: baseline, recall, or post-test answer | `id` (client `attemptId`, dedup scoped to session), `sessionId`, `stage` (`pretest`/`recall`/`retest`), `transcriptText`, `gapsIdentified` (mastery map, derived lists, optional matched evidence and estimate flag), `score` (int 0–100) |
| `syllabus` | One reference syllabus, e.g. "Biology, Grade 12" (bet 1) | `subject`, `grade`, `source` (`provisional` \| `verified`), `sourceNote` (the audit trail behind `source` — which textbook/syllabus the units were compiled from) |
| `syllabus_unit` | One unit in a syllabus, e.g. "Unit 3 — Genetics" | `syllabusId`, `unitNumber`, `title`, `description`, `sortOrder` |
| `misconception_hit` | One time a grader saw a known misconception surface in a real session (bet 2) | `conceptNodeId` → concept_node, `sessionId`, `userId`; unique `(sessionId, conceptNodeId)` so retries never double-count |

A chapter maps to **one** unit in exactly one syllabus via `syllabus_unit` —
this is the current shape of bet 1 (a chapter is part of a unit). When textbooks
gain a `grade` column, the syllabus join narrows from subject-only to
subject + grade.

**Aggregate-only by construction (bet 2):** `misconception_hit` rows are written
when recall grading flags a known misconception (matched back to the chapter's
`is_misconception` concept rows). Reads (`GET /misconceptions`) are **count
group-by only** — no user ids, no transcripts — and a cluster must clear a
**k-anonymity floor of 5 students** before it's shown. See [policies and guards](security.md).

The `concept_node.isMisconception` flag is the interesting one: the product's
whole trick is that we don't just grade "right/wrong," we grade *which specific
concepts didn't stick* — and we pre-warn about the common mistakes students make.

The original PDF is **not** stored in Postgres or sent to the server. The
browser may retain it in IndexedDB on the current device to support later
chapter selection; the saved TOC and imported chapter records are account data.
If local browser storage is cleared or a student opens the account elsewhere,
the PDF must be selected again.

**Ownership / tenant isolation (added with real auth):** every textbook belongs
to the user who ingested it (`textbook.owner_id`). Every server query that lists
or reads chapters, concepts, or sessions filters by the signed-in user, and the
owners are checked when a session starts (`POST /sessions/start` refuses chapters
that aren't yours). Two students can never see each other's material — there's
no "list all rows" anywhere in the API anymore. See the [authentication sector](auth.md).

### 6.2 The auth tables (4 tables)

*These tables exist because Better Auth created them (`packages/db/src/schema/auth.ts`). You should never need to touch them, but it helps to know what they hold:*

| Table | One row = | Key fields |
|---|---|---|
| `user` | One account | `id`, `name`, `email` (unique), `emailVerified`, `createdAt` |
| `session` | One logged-in browser | `token` (the hashed session cookie value), `expiresAt`, `userId`, `ipAddress`, `userAgent` |
| `account` | One credential set / provider link | `userId`, `providerId`, `password` (hashed), `accessToken`, `refreshToken` |
| `verification` | One short-lived verification code | `identifier`, `value`, `expiresAt` |

The password is stored **hashed** (never in plain text) inside `account.password`.
"Deleting an account cascades": because `user.id` is referenced with
`ON DELETE CASCADE`, removing a user automatically removes their sessions,
accounts, textbooks, chapters, study sessions, and attempts.

### Relationships (the arrows between tables)

```
textbook 1 ──── n chapter 1 ──── n concept_node
     │                   │  └─── n chapter_objective
     └─── owner ── n     └─── n study_session 1 ──── n attempt
     user 1 ──── n session
     user 1 ──── n account
```

- One textbook has many chapters; one chapter has many concepts (and, when it
  states them, many learning objectives).
- One chapter can appear in many study sessions; one session has one recall
  attempt and one score per retest answer.
- One user owns many textbooks and can have many open sessions.

These "1-to-many" links are stored by a foreign key: a column holding another
table's row id, e.g. `concept_node.chapter_id`. A **foreign key** is just a
promise: "this value must exist in that other table."

### Why the dev branch used SQLite and production uses Postgres
- **SQLite** = one file (`kiftet-dev.db`). No server to install, no credentials,
  works offline, impossible to break. Perfect for iterating fast on the
  prototype.
- **PostgreSQL** = a real database server with users, network access, concurrent
  write safety. That's what production needs when many students hit it at once.

Drizzle lets us switch by changing the driver (the bit that actually talks to the
database). The schema language is ~90% identical, so the swap is cheap.
**Production today runs Postgres on Neon** (`DATABASE_URL` pooled + 
`DATABASE_URL_DIRECT`); local dev can still point at SQLite (or Neon) freely —
the app itself doesn't care.

### Migrations — the schema's change history
When the schema changes, Drizzle **generates** a SQL file describing the exact
change (`packages/db/src/migrations/*.sql`). Running them upgrades a real
database safely. This is like a version history for your tables — teammates don't
have to manually recreate columns; they just run a migration.

**How migrations actually run here:** there is no "run migrations" step to
remember. `packages/db/src/index.ts` applies every pending `.sql` migration
**automatically on server startup**, so booting the API is the same as migrating
the database. (`PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON` are
also set on boot — WAL for concurrent reads, foreign keys so the cascade
deletes above actually work.)

**How to look at the database yourself:**
```bash
sqlite3 apps/server/kiftet-dev.db ".tables"
sqlite3 apps/server/kiftet-dev.db "select * from study_session order by started_at desc limit 5;"
```
(On `main` with Postgres, use your database console / a Postgres client instead —
the tables are the same names.)

### The current migration history
| Migration | What it changes |
|---|---|
| `0000_init` | Base schema: all domain + auth tables |
| `0001_living_firebrand` | Bet 1: `syllabus` + `syllabus_unit`, `chapter.unit_id` |
| `0002_outstanding_firedrake` | Bet 2: `misconception_hit` |
| `0003_white_otto_octavius` | Bet 1: `syllabus.source_note` (provenance behind `source`) |
| `0004_quiet_heron` | Phase 12: `syllabus_unit.periods` + `periods_source` (official period allocation, nullable by design) |
| `0005_keen_lantern` | Phase 11 step 3b: `guide_section` (cached per chapter/concept/language, source anchor) |
| `0006_long_siren` | Phase 6: `textbook.source_name`, `source_size`, `toc` (saved outline) |
| `0007_freezing_tiger_shark` | `waitlist_signup` table (phone, activation token, promise snapshot, testimonial) |
| `0008_slimy_ego` | `waitlist_signup.channel_verified_at`; re-index eligibility |
| `0009_stormy_the_call` | `waitlist_signup.testimonial_sent_at` |
| `0010_grounded_study_plan` | `plan_content` (versioned base-content cache) + `plan_step_check` |
| `0011_glamorous_bulldozer` | `user.kind` (`student`/`demo`) so demo identities can be swept |
| `0012_milky_sugar_man` | `chapter_objective` — the book's own stated learning objectives, source-anchored |
| `0013_special_salo` | `study_session.recall_mode` (`blurting`/`targeted`/`both`), `recall_questions` (JSON), `recall_index` |
| `0014_familiar_landau` | `chapter.topics` (saved textbook outline entries) and `chapter.extracted_at` (lazy model-read marker) |
| `0015_plain_sinister_six` | `study_session.scope_keys` — nullable section scope; null means the whole chapter |
| `0016_stale_raza` | `study_session.pretest_questions` and `pretest_index` — persistent optional baseline test and progress |
| `0017_low_genesis` | `study_queue`, plus `study_session.queue_id` / `queue_position` — a planned set of one-chapter sessions walked in order |

---
