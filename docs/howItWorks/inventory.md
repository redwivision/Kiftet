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
| Retest (questions + per-focus grading) | [dataflow §5.7](dataflow.md) | `study.$sessionId.tsx` (RetestPhase) | `POST /sessions/:id/retest`, `POST /sessions/:id/retest/answer` |
| Retest echoes the student's recall | [dataflow §5.7](dataflow.md) | `apps/server/src/routes/study.ts` (reads latest recall attempt), `apps/server/src/ai/gemini.ts` (`retestUserPrompt`) | (server-side, part of `/retest`) |
| Result (before/after/delta) | [dataflow §5.8](dataflow.md) | `study.$sessionId.tsx` (ResultPhase) | `GET /sessions/:id/result` |
| End session (button + voice) | [dataflow §5.9](dataflow.md) | `components/assistant.tsx` (the `completeSession` capability) | `POST /sessions/:id/complete` |
| Voice chat with the agent | [dataflow §5.10](dataflow.md) | `components/assistant.tsx` | WebSocket via `@voxide/react` |
| Natural read-back (read-along) | [dataflow §5.11](dataflow.md) | `lib/voice.ts`, `components/assistant.tsx` | — |
| Auto end-of-speech detection | [dataflow §5.12](dataflow.md) | `lib/intent.ts`, `lib/voice.ts` | — |
| Auth (sign in / sign up / session cookie) | [auth](auth.md) | `packages/auth`, `lib/auth-client.ts`, `components/sign-in-form.tsx`, `sign-up-form.tsx` | Better Auth `/api/auth/*` |
| CORS / CSRF origin guard | [security](security.md) | `apps/server/src/index.ts` (cors), `apps/server/src/auth-middleware.ts` | — |
| Ownership / tenant isolation | [security §10.1](security.md) | `apps/server/src/routes/study.ts` (every query filtered by userId) | — |
| AI rate limiting + demo quotas | [security §10.2](security.md) | `apps/server/src/routes/study.ts` (`allowAiRequest`, `/ai/budget`) | `GET /ai/budget` |
| Unified JSON error handling + process guards | [security §10.2](security.md) | `apps/server/src/error-handler.ts`, `apps/server/src/index.ts` (error middleware, SIGTERM drain) | — |
| Idempotent submissions | [security §10.4](security.md) | `apps/server/src/routes/study.ts` (`insertAttemptOnce`) | — |
| Retest resume on reload | [database §5.13](database.md) | `study.$sessionId.tsx`, `study-provider.tsx`, server `/sessions/:id` | — |
| Chunk ingest — putting content in (TOC-sliced) | [dataflow §5.2](dataflow.md) | `apps/server/src/routes/study.ts` (`/chapters/ingest`), `apps/web/src/lib/textbook.ts` | `POST /chapters/ingest` |
| Your own textbook (import → library, gated) | [dataflow §5.2](dataflow.md), [roadmap phase 6](roadmap.md) | `apps/web/src/routes/textbooks.tsx`, `apps/web/src/lib/textbook.ts` | `GET /textbooks`, `POST /chapters/ingest` |
| Themes (9 rooms: 8 dark + Sunlight) | [stack](stack.md) | `components/theme-provider.tsx`, `components/theme-switcher.tsx` | — |
| Ink motion system — one-shot ripple, breathing idle ring, ink-settling loaders, gap-closed settle, paper grain | [dataflow §5.10](dataflow.md), [decisions](decisions.md) | `components/voxide-ring.tsx`, `components/ink-settling.tsx`, `components/brand-mark.tsx` (`closing`), `index.css` keyframes | — |
| Concept-graph empty states | [dataflow §5.3/5.2](dataflow.md) | `components/concept-graph.tsx` (dashboard, textbook "No chunks yet.") | — |
| Book-ingestion animation (ink page) | [dataflow §5.2](dataflow.md) | `components/ink-page.tsx` (textbook planning state) | — |
| Feedback colours (fixed sage/rust) | [stack](stack.md), [decisions](decisions.md) | `index.css` (`--color-sage`, `--color-rust`), `components/gap-list.tsx` | — |
| Syllabus anchoring — browse by unit, map chapters, unit coverage (bet 1) | [STRATEGY bet 1](../STRATEGY.md) | `apps/server/src/routes/syllabus.ts` (new router), `apps/web/src/routes/syllabus.tsx`, `packages/db/src/schema/study.ts` (`syllabus`, `syllabus_unit`, `chapter.unit_id`), `packages/db/src/seed.ts` | `GET /syllabus`, `GET /syllabus/:subject/:grade`, `PATCH /chapters/:id/unit` |
| National misconception map (bet 2) — misconception-hit writes + aggregate read | [STRATEGY bet 2](../STRATEGY.md), [security §10.2](security.md) | `apps/server/src/routes/study.ts` (`recordMisconceptionHits`, `GET /misconceptions`), `apps/web/src/routes/dashboard.tsx`, `packages/db/src/schema/study.ts` (`misconception_hit`, k-floor K=5) | `GET /misconceptions?subject=` |
| Offline-first loop (bet 3) — failure-parked submissions + reconnect sync | [STRATEGY bet 3](../STRATEGY.md), [security](security.md) | `apps/web/src/lib/store.ts` (IndexedDB: `chapters`, `checklist`, `outbox`, `lesson`, `questions`), `apps/web/src/lib/outbox.ts` (reuses the original `attemptId` so `insertAttemptOnce` lands a replay exactly once), `apps/web/src/hooks/use-online.ts`, `apps/web/src/components/offline-banner.tsx`, `components/study-provider.tsx` (queued on status 0, lesson/question cache fallback reads, flush + reload on reconnect), `study.$sessionId.tsx` / `dashboard.tsx` (queued panels, checklist cache, offline fallbacks) | `POST /sessions/:id/recall`, `POST /sessions/:id/retest/answer` (replayed), `GET /chapters/:id/concepts` (cached), `POST /sessions/:id/microlesson` + `POST /sessions/:id/retest` (cached per session) |
| Offline / installable (PWA) | [stack](stack.md) | `apps/web/vite.config.ts`, `public/offline.html` | — |
| Both-script language pref (bet 4) — persistent EN/አማ toggle, `lang` attribute, every shell route and generated content in both scripts | [STRATEGY bet 4](../STRATEGY.md) | `apps/web/src/components/language-provider.tsx` (`kiftet-language` pref + `<html lang>` sync), `apps/web/src/lib/messages.ts` (typed corpus; `am` must cover every key), `apps/web/src/components/language-switcher.tsx` (header), `root.tsx` (pre-hydration `lang` script), `components/study-provider.tsx` (loop sends `language`, `t()`-driven session/queued/cached notices), `routes/study.$sessionId.tsx` (steps, headings, CTAs, result copy, Fluency badge), `components/offline-banner.tsx`, `routes/_index.tsx`, `routes/dashboard.tsx`, `routes/syllabus.tsx`, `routes/textbooks.tsx`, `routes/voice-test.tsx` | "fluency"/badge + cached-language honesty (client-side; generated-content language via `apps/server/src/ai/gemini.ts`) |
| Ethiopic type (bet 4) — Noto Sans Ethiopic + `<html lang>` pre-hydration | [STRATEGY bet 4](../STRATEGY.md) | `apps/web/src/root.tsx` (Google Fonts sheet, `lang` script), `apps/web/src/index.css` (Ethiopic-first font stacks over every family) | — |
| Brand mark + icon parity (bet 4) — single source of geometry | [STRATEGY bet 4](../STRATEGY.md), [decisions](decisions.md) | `apps/web/public/logo-mark.svg` (same `OPEN_ARC` path as `components/brand-mark.tsx`), `logo-mark.png`, `logo.png`, `favicon.ico`, `apple-touch-icon-180x180.png`, `maskable-icon-512x512.png`, `pwa-64/192/512.png` (all generated from the same mark) | — |
| AI grading, lessons, questions | [dataflow §5.4–5.8](dataflow.md) | `apps/server/src/routes/study.ts` (optional `language` on microlesson/retest), `apps/server/src/ai/gemini.ts` (`ContentLanguage`, `AMHARIC_OUTPUT`, Amharic fallbacks) | (server-side) |

### 15.2 Dependency inventory

**Runtime deps** — shipped with the product:

| Package | Lives in | What it's literally used for |
|---|---|---|
| `react`, `react-dom` (19) | apps/web, packages/ui | The UI framework. |
| `react-router` + `@react-router/fs-routes` + `@react-router/node` + `@react-router/serve` | apps/web | URL → screen routing, file-based routes, SSR server, static serving. |
| `@tanstack/react-form` | apps/web | Typed forms for sign-in and sign-up. |
| `@voxide/react` | apps/web | The voice session: speech-to-text (hears the student) and the agent's natural text-to-speech. |
| `pdfjs-dist` | apps/web | On-device PDF reading for the textbook import flow: text extraction **and** the outline/TOC tree (via `getOutline()`), which is how chunks are cut. Lazy-loaded (dynamic `import()`) so it never ships in the base bundle. |
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
