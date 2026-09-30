# System Design — Kiftet

Companion doc to [PRD.md](PRD.md). This describes the current architecture;
shipped behavior is distinguished from planned product work.

## 1. Architecture

```
[ Browser / PWA: React + React Router ]
          | same-origin JSON
          v
[ Express API + React Router production server ]
       |                 |
       v                 v
[ Gemini API ]     [ Drizzle database ]
       |             Neon Postgres in production;
       |             SQLite is available for local development
       v
[ model fallback ladder, deterministic degradation, cached guide sections ]

Browser-only: PDF text/bookmark reading and Tesseract WASM OCR;
the PDF file itself is never uploaded.
Voice capture: Voxide SDK. App read-aloud: browser speechSynthesis.
```

The web app and API run as one production service. Gemini calls pass through a
single server-side seam with model fallback selection, retries, telemetry, and
deterministic degradation. This is a model ladder within Gemini, not a
multi-provider LLM integration. See [the stack](howItWorks/stack.md) and
[running/deploying](howItWorks/running.md).

## 2. Data model

- **Textbook** — owner, title, subject, language.
- **Chapter** — textbook, optional syllabus unit, title, raw text.
- **ConceptNode** — checklist item, misconception flag, importance weight,
  display order. Numbered topics from a scanned contents page can seed it.
- **StudySession** — user, chapter, progress state and retest state.
- **Attempt** — recall or retest transcript, persisted per-concept mastery,
  derived gap lists, score and estimate flag.
- **GuideSection** — cached `what` / `why` / `recall` teaching for a
  `(chapter, concept, language)` and a deterministic source anchor.
- **Syllabus / SyllabusUnit** — curriculum structure, provenance and optional
  official period allocations.
- **MisconceptionHit** — aggregate event used for the misconception map; reads
  enforce a k-anonymity floor.
- **Auth tables** — user, session, account and verification records.

The schema has **13 tables**: nine study-domain tables and four auth tables.
The authoritative schema and migration history are in
[`packages/db/src/schema/`](../packages/db/src/schema/) and
[`docs/howItWorks/database.md`](howItWorks/database.md).

## 3. Current study and import pipeline

1. **Import a chapter.** A student pastes text or selects a PDF (maximum
   15 MB). PDF text and bookmarks are read in the browser. If its text layer
   is unreadable, Tesseract WASM recognizes contents pages and chapter text on
   the device. When OCR yields a usable contents hierarchy, printed unit and
   numbered topic entries are preserved, and printed page numbers are aligned
   against detected unit starts before defining chapter ranges. If contents
   OCR/alignment is not reliable, the importer falls back to detected headings.
   Only chapter text and optional topic labels are sent to the server; the PDF
   itself never uploads.
2. **Build the checklist.** The API merges contents-page topics, in book
   order, with concepts and misconceptions extracted from chapter prose.
   Duplicate ideas are reconciled, and the result is stored once per chapter.
3. **Capture recall.** The student speaks through Voxide or types. The client
   submits the transcript to the API.
4. **Diagnose per concept.** Gemini evaluates the transcript against the
   checklist and assigns mastery levels from 0 to 3. The API derives the
   covered/missing/misconception lists and weighted score from that map.
   Deterministic fallback grades are marked as estimates.
5. **Study.** The guide orders wrong beliefs first, then partially understood
   and untouched concepts, with already-solid items last. Teaching sections
   are cached per chapter/concept/language and linked to deterministic source
   quotes and offsets in the chapter text.
6. **Retest and compare.** The current loop offers retest after study and shows
   per-concept/overall change. Optional pre/post retesting and broader
   multi-chapter/topic scope remain planned.

## 4. API surface

All application endpoints are under `/api`; the exact request/response
contracts are documented in [the API reference](howItWorks/api-surface.md).
Core routes include:

```
POST /chapters/ingest             — chapter text + optional numbered topics
GET  /chapters/:id/concepts       — chapter checklist
POST /sessions/:id/recall         — transcript → per-concept diagnosis
GET  /chapters/:id/guide          — mastery-ordered, cached guide sections
POST /sessions/:id/microlesson    — legacy/current short-lesson flow
POST /sessions/:id/retest         — generate retest questions
POST /sessions/:id/retest/answer  — grade a retest response
GET  /sessions/:id/result         — before/after result
GET  /textbooks                   — owned textbook library
GET  /ai/budget                   — current AI window and daily book allowance
```

The service also exposes syllabus, misconception aggregation, authentication,
health and telemetry routes; see the API reference and
[security model](howItWorks/security.md).

## 5. Integrations and boundaries

- **Voxide** provides browser voice capture/agent interaction. Typed input is
  available, and app read-aloud uses native browser speech synthesis.
- **Google Gemini** provides concept extraction, grading, guide sections and
  retest generation. The deterministic fallbacks are explicit and surfaced
  where their output is only an estimate.
- **Neon Postgres** is the production database. SQLite can be used for local
  development. Drizzle owns the shared schema and migrations.
- **EthioDeploy** hosts the live combined web/API service.
- **Scholarxiv** research tooling and **Links.et** payments have no current
  product-code integration.

## 6. Reliability and known limits

- Import reads PDF files locally; OCR runs in the browser and sends only
  extracted chapter text to the API.
- OCR hierarchy parsing has a real Grade 10 Biology fixture and tests for
  wrapped titles, OCR-split numbering, decoration, page offsets and fallback.
  Other textbooks and Amharic-dense scanned PDFs still need direct quality
  verification; behavior should not be assumed universal.
- AI request windows/telemetry are in-memory and are not a persistent,
  cross-instance usage ledger. Current budget UI should not be mistaken for
  long-term request history.
- The syllabus has one seeded Biology 12 structure. Official unit-period
  figures remain unset until transcribed from an authoritative source.
- Spoken explanatory recall is not a validated assessment method for
  computation-heavy subjects; the product does not claim those subjects.
