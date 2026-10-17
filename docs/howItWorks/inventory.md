# How Kiftet Works — the inventory

> Part of the [how-it-works index](README.md). Source of truth for every feature and every dependency.


This section is the audit trail for the whole repo. Every feature and every
package (dependency **and** dev-dependency) is listed here, cross-checked
against the `package.json` files and source. **Rule of repo:** if you add a
package or a feature, add a row here; if a row stops being true, fix the row.

### 15.1 Feature index

| Feature | Section | Where it lives (key files) | API |
|---|---|---|---|
| Study loop (the master state) | [dataflow §5.1](dataflow.md) | `apps/web/src/components/study-provider.tsx` | — |
| Dashboard + last-session history | [dataflow §5.3](dataflow.md) | `apps/web/src/routes/dashboard.tsx` | `GET /chapters`, `GET /sessions` |
| Recall ("what do you remember?") | [dataflow §5.4](dataflow.md) | `apps/web/src/routes/study.$sessionId.tsx` (RecallPhase) | `POST /sessions/:id/recall` |
| Diagnose (gap chips + bars) | [dataflow §5.5](dataflow.md) | `study.$sessionId.tsx` (DiagnosePhase) | — |
| Microlesson + read-aloud | [dataflow §5.6](dataflow.md) | `study.$sessionId.tsx` (LessonPhase), `lib/voice.ts` | `POST /sessions/:id/microlesson` |
| Gap roadmap — one card per gap, deterministic search exits + book anchor | [dataflow §5.6c](dataflow.md) | `study.$sessionId.tsx` (PlanView), `components/study-provider.tsx`, `apps/server/src/ai/gemini.ts` (`buildStudyPlan`, `generatePlanWhyFirst`), `apps/server/src/routes/study.ts` | `POST /sessions/:id/plan` |
| Ordered guide — cached per concept/language, source anchored | [dataflow §5.6](dataflow.md) | `apps/web/src/components/guide-view.tsx`, `apps/server/src/routes/study.ts`, `apps/server/src/ai/gemini.ts`, `packages/db/src/schema/study.ts` | `GET /chapters/:id/guide` |
| Retest (exam-readiness questions + per-focus grading) | [dataflow §5.7](dataflow.md) | `study.$sessionId.tsx` (RetestPhase, `LevelBadge`, `AnswerResults`) | `POST /sessions/:id/retest`, `POST /sessions/:id/retest/answer` |
| Question taxonomy — 5 cognitive levels, gentle recall vs hard retest, enforced per writer | [dataflow §5.14](dataflow.md), [decisions #19](decisions.md), [decisions #22](decisions.md) | `apps/server/src/ai/questions.ts` (`CognitiveLevel`, `COGNITIVE_LEVELS`, `recallLevelDirective`/`retestLevelDirective`, `retestIsSoft`, `fallbackLevels`), `apps/server/src/ai/gemini.ts` (`GeneratedQuestion`, `RECALL_QUESTION_SYSTEM`/`RETEST_SYSTEM`, `questionSetSchema`, `questionUserPrompt`, `extractQuestions`, `fallbackQuestions`) | (server-side, part of recall/retest) |
| Recall modes — blurting / targeted / both, chosen upfront | [dataflow §5.7](dataflow.md), [decisions #20](decisions.md) | `study.$sessionId.tsx` (`RecallModeChooser`, `TargetedRecallPhase`), `components/study-provider.tsx` (`recallMode`, `recallGaps`, `startRecallQuestions`, `submitRecallAnswer`), `apps/server/src/routes/study.ts` (`mergeRecallGaps`, `reconcileQuestions`, `focusSubset`, `spreadByFocus`, `enforceRecallMix`), `packages/db/src/schema/study.ts` (`recallMode`/`recallQuestions`/`recallIndex`) | `POST /sessions/:id/recall-questions`, `POST /sessions/:id/recall-questions/answer`, `PATCH /sessions/:id/recall-mode`, `GET /sessions/:id/recall-gaps` |
| Recall question formats — MCQ / fill-in-the-blank / short answer, deterministic grading, offline mix | [dataflow §5.7](dataflow.md), [decisions #21](decisions.md), [decisions #22](decisions.md) | `apps/server/src/ai/questions.ts` (`RecallFormat`, `RECALL_FORMATS`, `RECALL_SET_SIZE`, `recallFormatCounts`, `recallFormatPlan`, `enforceRecallMix`, `judgeClosedAnswer`), `apps/server/src/ai/gemini.ts` (`recallFormatDirective`, `questionSetSchema`, `GeneratedQuestion.format`/`options`/`answer`, `extractQuestions`, `fallbackQuestions`), `apps/server/src/routes/study.ts` (answer route closed-format grading), `study.$sessionId.tsx` (`TargetedAnswerInput`, per-question `key`), `packages/db/src/schema/study.ts` (`StoredQuestion.format`/`options`/`answer`) | `POST /sessions/:id/recall-questions/answer` |
| Result (before/after/delta) | [dataflow §5.8](dataflow.md) | `study.$sessionId.tsx` (ResultPhase) | `GET /sessions/:id/result` |
| End session (button + voice) | [dataflow §5.9](dataflow.md) | `study.$sessionId.tsx` (loop CTA) | `POST /sessions/:id/complete` |
| Voice capture (push-to-talk ring) | [dataflow §5.10](dataflow.md) | `hooks/use-voice-session.ts`, `components/voice-ring.tsx` | browser `SpeechRecognition` via `lib/voice.ts` |
| Natural read-back (read-along) | [dataflow §5.11](dataflow.md) | `lib/voice.ts` | browser `speechSynthesis` |
| Auto end-of-speech detection | [dataflow §5.12](dataflow.md) | `lib/intent.ts`, `lib/voice.ts` | — |
| Auth (sign in / sign up / session cookie) | [auth](auth.md) | `packages/auth`, `lib/auth-client.ts`, `components/sign-in-form.tsx`, `sign-up-form.tsx` | Better Auth `/api/auth/*` |
| CORS / CSRF origin guard | [security](security.md) | `apps/server/src/index.ts` (cors), `apps/server/src/auth-middleware.ts` | — |
| Ownership / tenant isolation | [security §10.1](security.md) | `apps/server/src/routes/study.ts` (every query filtered by userId) | — |
| AI rate limiting + demo quotas | [security §10.2](security.md) | `apps/server/src/routes/study.ts` (`allowAiRequest`, `/ai/budget`) | `GET /ai/budget` |
| Unified JSON error handling + process guards | [security §10.2](security.md) | `apps/server/src/error-handler.ts`, `apps/server/src/index.ts` (error middleware, SIGTERM drain) | — |
| Idempotent submissions | [security §10.4](security.md) | `apps/server/src/routes/study.ts` (`insertAttemptOnce`) | — |
| Retest resume on reload | [database §5.13](database.md) | `study.$sessionId.tsx`, `study-provider.tsx`, server `/sessions/:id` | — |
| Textbook TOC picker — save book metadata and nested contents first; select visible chapters while internal ingest splits stay hidden | [dataflow §5.2](dataflow.md) | `apps/web/src/routes/textbooks.tsx`, `apps/web/src/lib/textbook.ts`, `apps/web/src/lib/store.ts`, `apps/server/src/routes/study.ts`, `packages/db/src/schema/study.ts` | `POST /textbooks`, `GET /textbooks` |
| Chapter ingest — selected TOC/heading-derived chapters, book topics seed concepts | [dataflow §5.2](dataflow.md) | `apps/server/src/routes/study.ts` (`/chapters/ingest`), `apps/server/src/ai/concepts.ts`, `apps/web/src/lib/textbook.ts`, `apps/web/src/lib/toc.ts` | `POST /chapters/ingest` |
| Chapter learning objectives — the book's own stated outcomes, extracted in the same call as concepts, anchored to the text | [dataflow §5.14](dataflow.md) | `apps/server/src/routes/study.ts` (`/chapters/ingest`, `/chapters/:id/objectives`), `apps/server/src/ai/objectives.ts`, `apps/server/src/ai/gemini.ts` (`extractChapter`), `packages/db/src/schema/study.ts` (`chapter_objective`) | `POST /chapters/ingest`, `GET /chapters/:id/objectives` |
| Your own textbook (PDF/text import, on-device OCR, library) | [dataflow §5.2](dataflow.md), [roadmap phase 6](roadmap.md) | `apps/web/src/routes/textbooks.tsx`, `apps/web/src/lib/textbook.ts`, `apps/web/src/lib/toc-model.ts` (model contents read, injected into `planImport`), `apps/web/src/lib/ocr.ts`, `apps/web/src/lib/store.ts` (device-only source storage) | `POST /textbooks`, `GET /textbooks`, `POST /textbooks/contents`, `POST /chapters/ingest` |
| Themes (9 rooms: 8 dark + Sunlight) | [stack](stack.md) | `components/theme-provider.tsx`, `components/theme-switcher.tsx` | — |
| Ink motion system — one-shot ripple, breathing idle ring, ink-settling loaders, gap-closed settle, paper grain | [dataflow §5.10](dataflow.md), [decisions](decisions.md) | `components/voice-ring.tsx`, `components/ink-settling.tsx`, `components/brand-mark.tsx` (`closing`), `index.css` keyframes | — |
| Concept-graph empty states | [dataflow §5.3/5.2](dataflow.md) | `components/concept-graph.tsx` (dashboard, textbook "No chunks yet.") | — |
| Book-ingestion animation (ink page) | [dataflow §5.2](dataflow.md) | `components/ink-page.tsx` (textbook planning state) | — |
| Feedback colours (fixed sage/rust) | [stack](stack.md), [decisions](decisions.md) | `index.css` (`--color-sage`, `--color-rust`), `components/gap-list.tsx` | — |
| Syllabus anchoring — browse by unit, map chapters, unit coverage (bet 1) | [STRATEGY bet 1](../STRATEGY.md) | `apps/server/src/routes/syllabus.ts` (new router), `apps/web/src/routes/syllabus.tsx`, `packages/db/src/schema/study.ts` (`syllabus`, `syllabus_unit`, `chapter.unit_id`), `packages/db/src/seed.ts` | `GET /syllabus`, `GET /syllabus/:subject/:grade`, `PATCH /chapters/:id/unit` |
| National misconception map (bet 2) — misconception-hit writes + aggregate read | [STRATEGY bet 2](../STRATEGY.md), [security §10.2](security.md) | `apps/server/src/routes/study.ts` (`recordMisconceptionHits`, `GET /misconceptions`), `apps/web/src/routes/dashboard.tsx`, `packages/db/src/schema/study.ts` (`misconception_hit`, k-floor K=5) | `GET /misconceptions?subject=` |
| Offline-first loop (bet 3) — failure-parked submissions + reconnect sync | [STRATEGY bet 3](../STRATEGY.md), [security](security.md) | `apps/web/src/lib/store.ts` (IndexedDB: `chapters`, `checklist`, `outbox`, `lesson`, `questions`, `plans`), `apps/web/src/lib/outbox.ts` (reuses attempt IDs for replay), `apps/web/src/hooks/use-online.ts`, `apps/web/src/components/offline-banner.tsx`, `components/study-provider.tsx` (queued recall/answers and cached plans), `study.$sessionId.tsx` / `dashboard.tsx` (offline fallbacks) | `POST /sessions/:id/recall`, `POST /sessions/:id/retest/answer` (replayed); `GET /chapters/:id/concepts` and plan cache |
| Offline / installable (PWA) | [stack](stack.md) | `apps/web/vite.config.ts` (Workbox: navigations are `NetworkOnly` with an `offline.html` precache fallback, so an offline cold load never gets a stale document; Google font sheets `StaleWhileRevalidate` + font files `CacheFirst`, both `maxAgeSeconds: 1y`, and `woff2` is in `globPatterns` so a self-hosted font would still precache), `public/offline.html` (brand-consistent, auto-reloads on the `online` event) | — |
| Control layer (brand-consistent, WCAG-sized) | [decisions §7](decisions.md), [stack](stack.md) | `packages/ui/src/components/button.tsx` (pill, 44px default, single `loading` prop that also sets `aria-busy` and blocks re-entry), `input.tsx`, `textarea.tsx`, `dropdown-menu.tsx`, `skeleton.tsx` (`animate-ink-rise`), `sonner.tsx` (room-token `k-toast`, 9 rooms mapped onto Sonner's light/dark), `apps/web/src/index.css` (`--focus` + room-aware `--panel` tokens; a global `:focus-visible` outline so focus is never invisible) | — |
| Branded route failure + transition | [decisions §7](decisions.md) | `apps/web/src/components/error-screen.tsx` (an unclosed gap: the open ring, an honest 404/offline/500 sentence, retry + home, technical detail folded away in production), `navigation-progress.tsx` (`useNavigation` ink sweep, chosen over a Suspense skeleton because routes are code-split and a skeleton flashes on every nav), `root.tsx` (`ThemeProvider`/`LanguageProvider` live in `Layout` so a crash is still themed and bilingual) | — |
| Both-script language pref (bet 4) — persistent EN/አማ toggle, `lang` attribute, every shell route and generated content in both scripts | [STRATEGY bet 4](../STRATEGY.md) | `apps/web/src/components/language-provider.tsx` (`kiftet-language` pref + `<html lang>` sync), `apps/web/src/lib/messages.ts` (typed corpus; `am` is `Record<MessageKey, string>`, so a missing or misspelled Amharic key is a **compile error**, never a silent English fallback), `apps/web/src/components/language-switcher.tsx` (header), `root.tsx` (pre-hydration `lang` script), `components/study-provider.tsx` (loop sends `language`, `t()`-driven session/queued/cached notices), `routes/study.$sessionId.tsx` (steps, headings, CTAs, result copy, Fluency badge; the ring's own `st-*` captions, paired with the `useVoiceSession` states), `components/sign-in-form.tsx` / `sign-up-form.tsx` (every label, validator message and submit state), `components/auth-shell.tsx`, `components/gap-list.tsx`, `components/voice-ring.tsx`, `components/user-menu.tsx`, `components/theme-switcher.tsx`, `components/offline-banner.tsx`, `routes/_index.tsx`, `routes/dashboard.tsx`, `routes/syllabus.tsx`, `routes/textbooks.tsx`, `routes/voice-test.tsx` | "fluency"/badge + cached-language honesty (client-side; generated-content language via `apps/server/src/ai/gemini.ts`) |
| Ethiopic type (bet 4) — Noto Sans Ethiopic + `<html lang>` pre-hydration | [STRATEGY bet 4](../STRATEGY.md) | `apps/web/src/root.tsx` (Google Fonts sheet, `lang` script), `apps/web/src/index.css` (Ethiopic-first font stacks over every family) | — |
| Brand mark + icon parity (bet 4) — single source of geometry | [STRATEGY bet 4](../STRATEGY.md), [decisions](decisions.md) | `apps/web/public/logo-mark.svg` (same `OPEN_ARC` path as `components/brand-mark.tsx`), `logo-mark.png`, `logo.png`, `favicon.ico`, `apple-touch-icon-180x180.png`, `maskable-icon-512x512.png`, `pwa-64/192/512.png` (all generated from the same mark) | — |
| AI grading, lessons, questions | [dataflow §5.4–5.8](dataflow.md) | `apps/server/src/routes/study.ts` (optional `language` on microlesson/retest), `apps/server/src/ai/gemini.ts` (`ContentLanguage`, `AMHARIC_OUTPUT`, Amharic fallbacks) | (server-side) |
| Subject-family strategy — family-aware AI prompts (recall/plan/lesson/retest) + phase hints | [dataflow §5.14](dataflow.md), [STRATEGY §3](../STRATEGY.md) | `apps/server/src/ai/subject-strategy.ts` (`SubjectFamily`, `getFamily`, `getPhaseDirectives`), `apps/server/src/ai/gemini.ts` (`getSubjectContext`, `planArchetype`), `apps/server/src/routes/study.ts` (`chapterSubject`), `apps/web/src/lib/subject-strategy.ts` (`getRecallHint`, `getRetestHint`), `apps/web/src/routes/study.$sessionId.tsx` (RecallPhase/RetestPhase hints) | (server-side, part of recall/plan/microlesson/guide/retest) |

### 15.2 Dependency inventory

**Runtime deps** — shipped with the product:

| Package | Lives in | What it's literally used for |
|---|---|---|
| `react`, `react-dom` (19) | apps/web, packages/ui | The UI framework. |
| `react-router` + `@react-router/fs-routes` + `@react-router/node` + `@react-router/serve` | apps/web | URL → screen routing, file-based routes, SSR server, static serving. |
| `@tanstack/react-form` | apps/web | Typed forms for sign-in and sign-up. |
| `pdfjs-dist` | apps/web | On-device PDF reading for textbook import: text extraction, outline/bookmarks, and page rendering for OCR. Lazy-loaded (dynamic `import()`) so it never ships in the base bundle. |
| `tesseract.js` + language/core assets | apps/web | On-device OCR for scanned or unreadable PDF text, including contents pages and chapter bodies; WASM assets are fetched on demand rather than precached. |
| `better-auth` | apps/web, apps/server, packages/auth | Authentication: credentials, sessions, cookies, and the client hooks. |
| `isbot` | apps/web | Bot detection for SSR. |
| `lucide-react` | apps/web, packages/ui | All the icons. |
| `next-themes` | apps/web, packages/ui | Dark/light theme state. |
| `sonner` | apps/web, packages/ui | Toast notifications. |
| `varlock` | apps/web, apps/server, packages/db | Typesafe environment variables (`.env` → generated TS). |
| `@varlock/vite-integration` | apps/web | Feeds the generated env types into Vite. |
| `zod` | every package | Runtime validation of API bodies, responses, and env. |
| `vite-plugin-pwa` | apps/web | Makes the app installable and offline-capable. |
| `express`, `cors` | apps/server | The HTTP API and cross-origin policy. |
| `@google/genai` | apps/server | The Gemini SDK — the only AI door in the system. |
| `drizzle-orm` | apps/server, packages/db | Typesafe SQL (schema, queries, and auto-migrations on startup via `drizzle-orm/bun-sqlite`). |
| `@neondatabase/serverless` | packages/db | Postgres driver for the production (`main`) branch's Lakebase/Neon database. |
| `@shadcn/react`, `@base-ui/react`, `class-variance-authority`, `cn`, `tw-animate-css` | packages/ui | The UI kit: shadcn/ui components built on Base UI primitives, style variants, and animated transitions. |
| `shadcn` | packages/ui | The component source-of-truth for scaffolding/copying UI components. |

**Dev / build deps** — only on our machines:

| Package | Lives in | What it's literally used for |
|---|---|---|
| `bun` (runtime) | root | Package manager + runtime; also *is* the SQLite driver (`bun:sqlite`). |
| `typescript` + `@types/*` (bun, node, react, react-dom, cors, express) | root + packages | The compiler for `check-types` and ambient types. |
| `turbo` | root | Runs builds/tasks across all packages with caching. |
| `@biomejs/biome` | root | Lint + format (replaces ESLint + Prettier). |
| `tsdown` | apps/server | Bundles the server into a standalone `dist`. |
| `vite`, `@tailwindcss/vite`, `tailwindcss`, `@tailwindcss/postcss` | apps/web, packages/ui | Dev server + build + CSS compilation (Tailwind v4). |
| `@react-router/dev` | apps/web | React Router's dev server and build pipeline. |
| `drizzle-kit` | packages/db | Schema → migration SQL generation. |
| `@vite-pwa/assets-generator` | apps/web | Generates the PWA icon set. |
| `@kiftet/config` | packages/config | Shared TypeScript project config used by the workspace. |
| `varlock` | root + packages/db | Env-schema codegen tooling. |

> **Reading note:** `bun run check-types` (TypeScript) and `bun run build`
> (Turborepo) are the gates that prove this inventory is wired together correctly.

---
