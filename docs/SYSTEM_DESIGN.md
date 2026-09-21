# System Design — Kiftet

Companion doc to PRD.md. Describes architecture, data model, and pipeline. This is a design sketch to build from, not a locked spec — adjust as you build.

---

## 1. Architecture overview

```
[ Browser / PWA (React) ]
          |
          v
[ Backend API (Node/Express or similar) ]
     |         |           |
     v         v           v
[ LLM API ] [ Voxide ]  [ Postgres/DB ]
(concept        (STT/TTS)   (chapters, concepts,
extraction,                  sessions, attempts,
grading,                     institutions)
micro-lesson
generation)
          |
          v
[ Links.et ]  <-- institutional licensing/payment
          |
[ Hosted on EthioDeploy ]
```

Keep the AI-calling layer behind a **provider fallback chain** (multiple LLM providers, fall back in order, fail gracefully to a cached/offline response if all are down) — this is a pattern you already know works from prior projects, worth reapplying here given Ethiopia's connectivity variability and the real risk of hitting a single provider's rate limit mid-demo.

## 2. Data model (core entities)

- **Textbook** — id, title, subject, language, owner_id
- **Chapter** — id, textbook_id, unit_id → syllabus_unit (nullable), title, raw_text
- **ConceptNode** — id, chapter_id, concept_text, is_misconception (bool), weight
- **User** — id, name, role (student/institution_admin)
- **Session** — id, user_id, chapter_id, started_at, status
- **Attempt** — id, session_id, stage (recall / retest), transcript_text, gaps_identified (array of ConceptNode ids), score
- **Syllabus** (bet 1) — id, subject, grade, source (`provisional` until teacher-verified)
- **SyllabusUnit** (bet 1) — id, syllabus_id, unit_number, title, description, sort_order
- **MisconceptionHit** (bet 2) — id, concept_node_id, session_id, user_id; unique (session_id, concept_node_id); **aggregate-only, k-anonymity floor 5 on reads**
- **Institution** — id, name, license_status, links_et_customer_ref

Full current schema (12 tables): `packages/db/src/schema/` and `HOW_IT_WORKS.md` §6.

## 3. Core pipeline, step by step

1. **Chapter ingestion** — chapter text goes to the LLM with a prompt asking it to output a structured list of: (a) core testable concepts, (b) common misconceptions specific to that concept. Store as `ConceptNode` rows tied to the chapter. Do this once per chapter, cache the result — don't re-run extraction on every session. **For a student's own textbook (Phase 6):** the file (PDF up to 15 MB / pasted text) is opened on the device, the PDF's outline/TOC is read (pdf.js `getOutline()`), and the book is sliced into **chunks** — one TOC section per extraction call. Only cleaned raw text is POSTed to `/api/chapters/ingest`. File bytes never leave the phone.
2. **Recall capture** — student speaks into the mic. Voxide handles speech-to-text, producing a transcript.
3. **Gap grading** — transcript + the chapter's ConceptNode list go to the LLM with a grading prompt: which concepts were covered correctly, which were missing, which misconceptions showed up. Output: a gap list + a numeric coverage score.
4. **Micro-lesson generation** — LLM generates a short, targeted explanation covering *only* the gap concepts (use local analogies where natural). Voxide converts this to speech and plays it back.
5. **Retest** — LLM generates 2–4 questions per gap concept, deliberately phrased differently from the micro-lesson wording (near-transfer, not recall-of-wording). Student answers by voice or text; grade the same way as step 3.
6. **Result** — compute before/after coverage delta, display it.

## 4. High-level API sketch

```
POST /chapters/ingest          — submit chapter text, triggers concept extraction
GET  /chapters/:id/concepts    — fetch extracted concept/misconception list
POST /sessions/start           — { user_id, chapter_id } -> session_id
POST /sessions/:id/recall      — upload audio, returns transcript + gaps
POST /sessions/:id/microlesson — returns generated audio for the gaps
POST /sessions/:id/retest      — returns generated question set
POST /sessions/:id/retest/answer — submit answer(s), returns updated score
GET  /sessions/:id/result      — before/after delta
GET  /syllabus                 — the seeded syllabus list (bet 1)
GET  /syllabus/:subject/:grade — units + your chapters + coverage
PATCH /chapters/:id/unit       — map/unmap a chapter to a syllabus unit
GET  /misconceptions           — aggregate misconception counts (k-floor 5, bet 2)
```

## 5. Sponsor integration — technical specifics

- **Voxide** — wire into both the recall-capture step (STT) and micro-lesson playback (TTS). This should be the first integration you get working end-to-end, since it's the spine of the whole product — everything else can be stubbed with text temporarily while you build it, but voice needs to be real early so you're not scrambling to bolt it on at the end.
- **EthioDeploy** — deploy the full web app here once you have a working local build; don't wait until the last day to test deployment, deploy early and often so you're not debugging infra at 2am before the demo.
- **Scholarxiv** — use it while building the misconception lists, to check your AI-generated misconceptions against real pedagogical research where available, and to log your reasoning trail per the manifest's ideation requirement.
- **Links.et** — a simple institutional checkout flow (institution enters details, pays a license fee, gets an access code for their students). Doesn't need to be elaborate — a working, honest transaction beats a polished fake one.

## 6. Reliability / practical notes

- **Fallback chain for AI calls** — don't let a single provider outage kill your live demo.
- **Cache concept extraction per chapter** — never re-run it live during a demo; pre-process your demo chapters in advance so nothing depends on a slow API call in front of judges.
- **Test on a real, throttled connection** before demo day — Ethiopia's mobile connectivity is inconsistent, and "works on my fast office wifi" is not the same as "works on stage."
- **Have a recorded backup** of at least one full successful run, in case live voice input fails in the room (background noise, mic issues) — don't let your whole demo depend on one live voice capture working perfectly under pressure.
- **Textbook import is device-first for weak wifi.** PDFs stay on the phone; the extraction library is lazy-loaded (never in the base bundle); chapters ingest one at a time with small text payloads + progress/resume, not one giant upload. Scanned/image-only PDFs (no text layer) and OCR are out of scope for the first cut — the paste-text path covers those.

## 7. Open technical risk to test early, not late

Grading a conceptual explanation ("what is thermal equilibrium") and grading a numerical/formula answer ("solve for final temperature given these values") likely need different grading logic. Test both on a real topic pair early in the build — don't discover this the night before the demo.
