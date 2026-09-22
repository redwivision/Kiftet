# How Kiftet Works — the stack

> Part of the [how-it-works index](README.md).


## Why a monorepo? (and what a monorepo is)

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

## The tech stack and why we chose each piece

This is the full stack in one table. The **exact** package list — every
dependency and dev-dependency, audited line-by-line — is in [the inventory](inventory.md).

| Concern | Choice | Why |
|---|---|---|
| Language everywhere | **TypeScript** | One language front-to-back; types catch whole classes of bugs before the code even runs. |
| Runtime + package manager | **Bun** | Extremely fast installs, runs TypeScript directly, and is the poster-child for hackathon speed. Also runs our server and *is* the database driver (`bun:sqlite`). |
| Task runner | **Turborepo** | Runs the "build" of all packages, caches results, only rebuilds what changed. |
| UI app | **React + React Router** | Industry-standard component model; router turns URLs into screens; PWA support for offline. |
| Web bundler | **Vite** | React Router's recommended build tool: instant dev server, fast HMR. |
| Styling | **Tailwind CSS v4** | Utility-first CSS, compiled by Vite (`@tailwindcss/vite`). |
| UI kit | **shadcn/ui on Base UI** | Copy-in components we own (not a black-box dependency) on React-19-compatible primitives (`@shadcn/react`, `@base-ui/react`). |
| Forms | **TanStack React Form** | Typed, framework-native form state for sign-in / sign-up. |
| Icons / toasts / themes | **lucide-react, sonner, next-themes** | Icons, notifications, and dark/light theming with animated transitions. |
| Backend | **Express** | Tiny, boring, universal Node web framework — perfect for a small API. |
| Validation | **Zod** | One schema language, shared across web, server, db, and auth packages. |
| Database | **SQLite (prototype) → PostgreSQL (main)** | The prototype branch uses SQLite via the Bun driver — a single file, zero setup, works offline. Postgres is the "real" production database and stays on `main`. ([More in the database sector](database.md).) |
| Database toolkit | **Drizzle ORM** | Lets us write the schema in TypeScript. "Migrations" (change history of the schema) are generated with drizzle-kit, not hand-written. |
| Auth | **Better Auth** | Login, signup, password hashing, session cookies — the hard, security-critical parts are battle-tested and we don't reinvent them. |
| AI | **Google Gemini** (`@google/genai`) | Chosen for cost + speed. Encapsulated in one service so we can swap providers later. |
| Voice | **Voxide** (`@voxide/react`) | The sponsor product — the signature mechanic (STT + TTS). The official React SDK drives the voice session in the browser and is integrated now. |
| Env / secrets | **Varlock** | Typesafe `.env` values, generated TS bindings, and plugin integration for Vite. |
| PWA / offline | **vite-plugin-pwa** | Makes the app installable and usable offline (exam halls have no signal). |
| Lint + format | **Biome** | One fast tool for both; replaces ESLint + Prettier. |
| Bundling the server | **tsdown** | Compiles `apps/server` to a standalone `dist` for `bun start`. |

**Key principle:** we use libraries for the hard, generic problems (auth,
database, HTTP) and write ourselves the few things that make us special (the gap
diagnosis loop).

---

