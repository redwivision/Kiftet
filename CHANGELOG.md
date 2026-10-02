# Kiftet — major milestone log

Chronological record of the major product, architecture, UI, and quality
milestones from the repository's first commits onward. Times are Git author
timestamps in **Africa/Addis Ababa (UTC+03:00)**, except the latest working-tree
entry, which is marked with the time this task began. Small fixes and follow-up
commits are intentionally consolidated; the complete record is `git log`.
Current implementation details live in [`docs/howItWorks/`](docs/howItWorks/README.md)
and the [roadmap](docs/howItWorks/roadmap.md).

## 2026-10-02

- **17:00+03:00 — Make the production auth path operable, and trust one origin
  list everywhere.** Split `CORS_ORIGIN` on commas when building Better Auth's
  `trustedOrigins`, matching what the CORS layer and the auth middleware already
  did — a multi-origin split deploy was otherwise let through by the edge and
  then refused by Better Auth's own origin check, which reaches the student as a
  login that fails for no stated reason. Add an operator guide for turning auth
  on in production: both provider consoles step by step, derived redirect URIs,
  the Google consent-screen and Meta Development-mode traps, a failure table, and
  the deliberate state of the two settings that are off. Update the runbook's env
  table, verification checklist and incident playbook.
- **Offer a second way in, with Google and Facebook beside the password**
  (`29bfbb7`). Add optional social sign-in that appears only when a provider's
  credentials are fully present, with Facebook held to a lower bar because Meta
  omits the email address for phone-only accounts — ordinary in this market.
  Pin Better Auth exactly and let Dependabot propose the bump weekly, with
  resolved-config tests so a renamed option fails at boot rather than silently
  disappearing.
- **Stop the header from lying on top of the nav, and let text yield**
  (`6b771fe`). With a long signed-in name the header overlapped its own
  navigation by up to 112px at 320px. Replace the cramped nav and account
  controls with an icon rail below `sm`, truncate the name above it, and let
  long titles, syllabus rows and auth spacing yield rather than push.

## 2026-09-30

- **23:33+03:00 — Save textbooks as books; choose chapters from the TOC tree.**
  Replace the flat processing-chunk review with a nested, selectable contents
  tree. Save the owner-scoped textbook and outline before import, keep original
  source files only in device-local IndexedDB, group long-chapter splits behind
  their visible chapter, and retain imported-chapter status in the account
  library. Add the `textbook` metadata/TOC migration and update the API,
  privacy, product, and testing docs.
- **Work began 21:57+03:00 — OCR contents become the source of textbook hierarchy.** Parse
  real contents-page OCR into units and nested numbered topics, validate
  printed-page offsets against detected chapter starts, show topics in the
  import review, and seed the concept checklist in book order. Model extraction
  still adds detail and misconceptions. If OCR/alignment is unreliable, fall
  back to heading-based chapters. Verified against the Grade 10 Biology book:
  six units and 53 numbered topics.
- **20:32+03:00 — Open textbook import and expose usage budgets** (`bc13243`).
  Make the previously gated import reachable; support local OCR for unreadable
  PDFs, visible AI/book limits and clearer error states.
- **19:50+03:00 — Read unreadable PDFs on-device** (`298f5a1`). Use browser
  canvas and Tesseract WASM to recognize chapter text without uploading the
  textbook; cache recognized pages locally and import a chapter at a time.

## 2026-09-29

- **21:04+03:00 — Refuse unreadable text rather than create a false checklist**
  (`9f6ae6f`). Detect text-layer failures by per-page text density and explain
  recovery instead of mistaking repeated headers for readable textbook prose.
- **18:59+03:00 — Make AI degradation observable and recoverable** (`9bee524`).
  Move to a model that answers, add a model fallback ladder, retry transient
  failures, and report fallbacks rather than silently presenting them as normal
  AI output.

## 2026-09-28

- **19:36+03:00 — Order study from the mastery map** (`a0632b9`). Add structured
  `what`/`why`/`recall` guide sections cached per chapter, concept and language;
  compute deterministic source anchors and mastery-based triage without
  spending AI calls on ordering.
- **18:34+03:00 — Finish the actionable diagnosis UI** (`9c0edc3`). Replace
  flat lists with weighted concept-level mastery bars, make the partial state
  visible, and ensure the headline score matches the weighted diagnosis.
- **17:43+03:00 — Grade mastery per concept** (`2e88453`). Persist a 0–3
  mastery level per concept, derive the score and gap lists from that map, and
  label deterministic estimates honestly.

## 2026-09-27

- **23:13+03:00 — Reframe the product around diagnosis** (`097c008`). The
  study guide becomes delivery, not the moat; syllabus grounding, longitudinal
  mastery and aggregate misconception data become the strategic core. Set an
  explicit boundary against claiming computation-heavy subjects.
- **22:49+03:00 — Stop silently degrading on rate limits** (`55a71dc`,
  `339ef02`). Retry transient provider failures, record degraded responses, and
  design the cached, mastery-ordered study guide before building it.
- **21:49+03:00 — Establish the initial CI quality gate** (`18578b8`,
  `ce8bec9`). Add lint, type checks and builds on changes to `main`; record
  the current product thread and fix lint-discovered study-loop defects.
- **18:34+03:00 — Add diagnosis regression tests to CI** (`9c0edc3`). Begin
  automated coverage for the per-concept UI and score behavior; later guide and
  OCR tests extend the same test gate.
- **15:31+03:00 — Complete a major control-layer and PWA reliability pass**
  (`09bd00d`). Rebuild the shared form controls, route failures, navigation
  feedback and offline cache behavior.

## 2026-09-23

- **21:59+03:00 — Make connectivity status reflect the platform** (`e5e2a89`).
  Probe the app's own health endpoint instead of trusting `navigator.onLine`,
  so offline messaging describes whether Kiftet can actually be reached.
- **19:41+03:00 — Stabilize production boot and health checks** (`304791d`,
  `3c793f9`). Correct production-mode startup and common platform probe
  handling for the combined service.

## 2026-09-22

- **13:47+03:00 — Make the study loop bilingual and document the system by
  concern** (`8007a93`). Complete EN/Amharic shell and generated-content
  coverage, Ethiopic typography, and split the how-it-works reference into
  focused files.
- **10:21+03:00 — Keep the study loop usable through network loss** (`4d85727`,
  `c6ee10e`). Add IndexedDB caches, a submission outbox with idempotent replay,
  reconnect sync, and honest offline states for lessons and retest questions.

## 2026-09-21

- **20:43+03:00 — Verify the Biology 12 curriculum seed** (`953cae1`). Record
  the six-unit MoE source and provenance; keep the seed auditable.
- **19:53+03:00 — Start the aggregate misconception map** (`165d727`). Record
  misconception hits during grading and expose only aggregates above the
  k-anonymity floor.
- **19:24+03:00 — Anchor study in the national syllabus** (`71dfc2e`). Add
  syllabus browsing, chapter-to-unit mapping and unit coverage.
- **18:45+03:00 — Settle the craft system** (`7794734`). Refine motion and
  feedback colors across the study experience.

## 2026-09-20

- **00:27+03:00 — Harden errors, timeouts and demo identity** (`21f0fb5`).
  Add user-readable JSON failures, bounded Gemini/database/client waits and
  persistent demo identity.

## 2026-09-19

- **21:38+03:00 — Add chunk ingestion, quotas and budget UI** (`6cc7c90`).
  Bound textbook uploads and AI requests, introduce demo book limits and show
  the current budget.
- **21:07+03:00 — Build the first bring-your-own-textbook flow** (`fa699ce`).
  Add an on-device PDF/text import and chapter review path; it initially
  shipped behind a feature gate and was opened on September 30.
- **13:31+03:00 — Add anonymous demo access** (`3e54c23`). Let visitors try the
  study loop without creating an account.
- **10:48+03:00 — Deploy the combined web/API service and finish the open-ring
  brand** (`f1eeaece`, `0efb32e`).

## 2026-09-18

- **20:41+03:00 — Move production storage to Neon Postgres** (`798c59b`).
- **17:38+03:00 — Finish the mobile-first UI/UX and how-it-works docs**
  (`da857c5`). Establish a documented design system and app-wide interaction
  patterns.
- **17:11+03:00 — Add real authentication and owner-scoped study data**
  (`84ce298`). Require sessions on study routes and persist study progress
  across reloads.

## 2026-09-17

- **20:25+03:00 — Ground the voice agent in the active chapter** (`74519b0`).
  Make the how-it-works documentation the source of truth, with dataflow and
  dependency inventory.
- **18:47+03:00 — Audit the end-to-end study loop** (`25311d3`). Run a broad
  product and failure-state review before polishing the core experience.

## 2026-09-16

- **20:08+03:00 — Add themed visual rooms** (`8853e16`). Expand the interface's
  theme system and add a user-facing theme switcher.
- **16:50+03:00 — Complete the editorial UI/UX overhaul** (`ec9d3a6`). Replace
  early scaffolding with a coherent brand, problem-first landing page, and
  open-ring progress language.

## 2026-09-15

- **18:24+03:00 — Finish the first complete study loop** (`d1425b2`). Grade
  finalized voice turns, add a calm typed escape hatch and keep read-aloud
  vendor-independent.
- **10:06+03:00 — Verify the four Gemini study endpoints live** (`7cd8674`).
  Complete concept extraction, recall grading, lesson generation and retest
  question generation with deterministic fallbacks.

## 2026-09-14

- **18:29+03:00 — Build the first AI study loop** (`741499a`). Connect
  extraction, grading, targeted lessons and retests; fix ingest so extracted
  concepts are actually stored.
- **18:24+03:00 — Land the voice spine** (`45f302c`). Add the voice interface,
  browser adapter, state ring and dedicated voice test route.
- **18:00+03:00 — Create the working application skeleton** (`0c7e9e8`).
  Establish the domain model, SQLite-backed API shell, AI seam and initial
  project guides.
- **11:49+03:00 — Start the repository** (`9b4134b`). Set up the initial
  TypeScript monorepo and technical stack.
