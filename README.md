<div align="center">

<img src="assets/logo-mark.svg" width="88" height="88" alt="Kiftet — the open ring" />

# Kiftet — Close the gap

**ክፍተት** · the Amharic word for "gap"

Turn any textbook chapter into a **spoken, adaptive review** that closes exactly the gaps/misunderstandings you have.

**Live preview** → [kiftet.ethiodeploy.com](https://kiftet.ethiodeploy.com)

`Bun` · `TypeScript` · `React 19` · `React Router 8` · `Tailwind v4` · `Express` · `Better Auth` · `Drizzle` · `Neon Postgres` · `Google Gemini` · `Voxide`

</div>

---

## The problem

Ethiopia's national exam pass rate climbed to **12.8% in 2026** — the best result in years. That also means **87.2% of the roughly 563,500 students** who sat the exam were still failed by the system, and **565 schools had zero students pass**.

They didn't sit in empty classrooms. They sat in class, took notes, memorized — and still, before the exam, nobody could efficiently tell them *which specific concepts didn't stick*. So they studied everything again, or nothing.

## The idea

> A student speaks out loud what they remember about a topic. The app listens, figures out which specific concepts they did **not** explain — their "gaps" — teaches a short lesson covering **only** those gaps, then re-tests them to confirm the gaps closed.

```
        ┌────────────┐     ┌────────────┐     ┌────────────┐     ┌───────────┐
  ▶      │  Recall    │────▶│  Diagnose  │────▶│  Relearn   │────▶│  Retest   │
  talk   │ name what  │     │ find the   │     │ teach only  │     │ confirm    │
  out    │ you know   │     │ exact gaps │     │ the gaps    │     │ it closed  │
         └────────────┘     └────────────┘     └────────────┘     └───────────┘
```

Before/after coverage is shown directly — a student *sees* the gaps close.

## Why voice

Explaining something out loud is not a feature bolted on to satisfy a requirement — **it is the mechanism**. The underlying teaching technique ("protégé effect") works by forcing you to reconstruct and articulate what you know. Kiftet captures that spoken explanation, diagnoses it, and talks back. On weak connections everything degrades gracefully to typing and browser speech — the product was built mobile-first for Ethiopian school wi-fi.

## Features

- **Concept-level diagnosis, not a grade.** Instead of "76% correct", Kiftet maps your explanation against the chapter's concept checklist and tells you *which concepts* didn't stick — including pre-warned common misconceptions.
- **Targeted micro-lessons.** After diagnosis, a short spoken lesson covers only the missing and mistaken concepts. No re-reading the whole chapter.
- **Retest with differently-phrased questions.** Reconfirmation uses different wording, so a memorized one-liner can't fake a real understanding.
- **Resume anywhere.** The study loop persists across sessions and devices; sign out and back in and you're exactly where you left off.
- **Calm, inked motion.** Loading is ink settling into place; the idle voice ring breathes; "Gap closed." has the mark draw itself in and settle to sage. Plain CSS keyframes only — no animation library, nothing gamified, and `prefers-reduced-motion` stills it all.
- **Feedback colours that mean the same everywhere.** Sage `#5C7A5E` = solid/covered, Rust `#B54A2C` = gap/needs work (including what you stated wrong) — the same two fixed colours in diagnosis and retest, every room.
- **PWA, offline-first.** Installable, service-worker cached, a branded offline page, and work queued on the phone when the signal drops. Connectivity is judged **against our own platform, never the browser's `navigator.onLine`** — the app probes the server's `/health` (a real Postgres ping), so a "No connection" message is always literally true, and the signed work re-flushes the moment the platform answers again.
- **Your own textbook, on the device.** Upload your book (PDF up to 15 MB or pasted text); the browser reads the book's table of contents and slices it into chunks — file bytes never leave the phone — and each chunk is ingested into the study flow one at a time, weak-wifi friendly.
- **Ownership & isolation.** Every textbook, chapter, and session is scoped to its owner; no request ever lists all rows.
- **Guardrails built in.** AI rate limiting, idempotent submissions, per-user AI budgets, typed environment variables with dev-safe placeholders.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime & package manager | **Bun** | runs TS directly, fast installs, one tool for everything |
| Frontend | **React 19** + **React Router 8** + **Tailwind v4** + shadcn-style UI | SSR + client, installable PWA, styled system matching the design brief |
| Backend | **Express** (mounted with the web app as one production process) | one service, same origin, no CORS/cookie headaches |
| Auth | **Better Auth** — email & password, sessions, rate limiting | batteries included; typed via the schema |
| Database | **Neon** — serverless Postgres via **Drizzle ORM** | persistent, survives redeploys, pooled + direct connection strings |
| AI | **Google Gemini** (one seam: `apps/server/src/ai/gemini.ts`) | concept extraction, gap diagnosis, lesson + retest generation |
| Voice | **Voxide** (optional) | speech-to-text + text-to-speech; typed/browser-speech fallback |

## Repository layout

```
kiftet/
├── apps/
│   ├── web/        ← React Router app (SSR + PWA)
│   └── server/     ← Express: API + serves the built web app in production
├── packages/
│   ├── db/         ← Drizzle schema, migrations, Neon connection
│   ├── auth/       ← Better Auth configuration
│   ├── ui/         ← shared components
│   └── config/     ← shared TypeScript/Biome settings
├── docs/           ← PRD, system design, design brief, how-it-works, testing guide
└── RUNBOOK.md      ← ops: deploying, envs, verification, incident playbook
```
The data model is **12 tables** in two families — study domain (textbook,
chapter, concept, session, attempt, syllabus, syllabus_unit, misconception_hit)
and auth (user, session, account, verification). See
[`docs/howItWorks/database.md`](docs/howItWorks/database.md).

## Getting started

Prereqs: **Node ≥ 22.22** (`.nvmrc` pins 22.23.2) and **Bun ≥ 1.4.2**.

```bash
bun install                # installs everything + regenerates typed envs
bun run dev:server         # terminal 1 — API on http://localhost:3000
bun run dev:web            # terminal 2 — web app on http://localhost:5173
```

No `.env` files are needed to start developing — the `.env.schema` files ship
dev-safe placeholders and generate typed `env.ts` modules on install. Point
`apps/server/.env` at your real **Neon** strings (`DATABASE_URL` pooled,
`DATABASE_URL_DIRECT` unpooled) and a `GEMINI_API_KEY` to run the full AI loop.

### Useful scripts

| Script | What it does |
|---|---|
| `bun run dev` | run both dev servers via Turbo |
| `bun run build` | typecheck + build web and server |
| `bun run serve` / `bun run start` | run the built combined service (prod) |
| `bun run check` | Biome format/lint |
| `bun run db:generate` | next Drizzle migration from schema changes |
| `bun run db:migrate` | apply pending migrations |
| `bun run db:studio` | browse/edit the database visually |
| `bun run env:generate` | regenerate typed env modules after editing `.env.schema` |

## Deploying

One process runs everything — the Express server serves the API **and** the
built web app (SSR + static), so there is a single origin and a single host.

1. **Database (Neon):** grab `DATABASE_URL` (pooled, `-pooler`) and
   `DATABASE_URL_DIRECT` from the Neon console.
2. **Host (EthioDeploy or any Bun/Node PaaS):** build `bun install && bun run build`, start `bun run start`, expose `PORT`.
3. **Env vars:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN` (must include the public site origin), `DATABASE_URL` (pooled, `-pooler`), `DATABASE_URL_DIRECT` (unpooled), `GEMINI_API_KEY`. `NODE_ENV` is optional — `serve.js` forces production mode at boot.
4. Migrations apply automatically at boot over the direct connection — redeploys are safe and stateless.

Full checklist, verification steps, and the incident playbook: see **[`RUNBOOK.md`](RUNBOOK.md)**.

## Docs

- **[`docs/howItWorks/`](docs/howItWorks/README.md)** — the single source of truth, split by concern: product, stack, data flow, database, API, auth, security, env, decisions, roadmap, running, inventory, glossary.
- **[`STRATEGY.md`](docs/STRATEGY.md)** — the five bets that make Kiftet hard to copy: EHEEE syllabus anchoring, the national misconception map, the offline-first loop, Ethiopian texture, and this doc trail.
- **[`PRD.md`](docs/PRD.md)** — product requirements, the market case, sponsor integrations.
- **[`SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)** — architecture and data model.
- **[`DESIGN_BRIEF.md`](docs/DESIGN_BRIEF.md)** — the visual identity: monochrome — ivory `#F2EFE9` on black `#0A0B0D`, the open-ring mark, type and UI principles.
- **[`TESTING_GUIDE.md`](docs/TESTING_GUIDE.md)** — end-to-end verification of every phase.

## Status

**What Kiftet is actually building:** a spoken study *diagnosis* for Ethiopian
students — not another question bank. A student picks a chapter and explains
out loud what they remember; Kiftet compares that explanation against the
chapter's concept checklist (anchored to the national syllabus), surfaces
exactly which concepts didn't stick, teaches a short lesson that covers *only*
those gaps, then retests with differently-worded questions and shows a
before/after picture. It is deliberately sparse, calm, night-study-friendly,
and built to work on a school phone's connection: when Kiftet's platform is
unreachable, work queues on the device and is graded when the platform answers
again.

What is shipped and live right now:

- **Live at [kiftet.ethiodeploy.com](https://kiftet.ethiodeploy.com)** — one
  production process serves the web app and the API from a single origin;
  `serve.js` boots it in production mode so the built site is actually served.
- **Phase 10 — Amharic everywhere — done.** Every user-facing string ships in
  both scripts (TypeScript enforces that no key is left untranslated), and
  generated lessons, retests and misconception summaries follow the student's
  language preference.
- **Phase 7 — study by syllabus — done.** Browse the Biology-12 unit list
  compiled and verified against the MoE new-curriculum textbook, map chapters,
  and see per-unit coverage.
- **Phase 8 — the misconception map — done.** Wrong turns are recorded on
  grading and surfaced in the aggregate (never individual, k-anonymity floor)
  on the dashboard.
- **Phase 6 — bring your own textbook — in preview.** The on-device PDF/text
  chapter split works end-to-end on the phone (file bytes never leave the
  device); the live import gate into the study flow is the next step.
- **Connectivity is platform-measured.** Offline detection probes the server's
  `/health`, never `navigator.onLine`; demo quotas (5 AI calls/min,
  3 textbooks/day) are live.

Full roadmap and phase tracking: [`docs/howItWorks/roadmap.md`](docs/howItWorks/roadmap.md); the five product bets that steer it: [`STRATEGY.md`](docs/STRATEGY.md). Built from scratch for the **STARK Hackathon 2026** kickoff.

> Kiftet — *close the gap*. 🇪🇹
