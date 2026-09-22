# How Kiftet Works — where we are (roadmap)

> Part of the [how-it-works index](README.md). Phase-by-phase status and the go-live checklist.


| Phase | Name | Status |
|---|---|---|
| 0 | Skeleton — domain, API shell, AI seam | ✅ Done |
| 1 | Voice spine — Voxide capture/playback + voice-state UI | ✅ Done |
| 2 | AI loop — real Gemini: extraction, grading, micro-lessons, retest | ✅ Done |
| 3 | Web flow — Web recall→gap→lesson→retest screens | ✅ Done |
| 4 | Demo dataset + polish | ✅ Done (live demo) |
| 5 | Deploy (EthioDeploy) + Postgres (Neon) switch | ✅ Done |
| 6 | Your own textbook — student uploads their book (PDF/paste), device reads the TOC and slices it into chunks, per-chunk ingest → study | ⏭️ Next (UI shipped, import gated; chunking + MB cap + demo quotas are in) |
| 7 | Syllabus anchoring (bet 1) — browse the national syllabus unit by unit, map your chapters to units, watch unit coverage grow | 🔨 In progress (slice shipped: `syllabus`/`syllabus_unit` tables + migrations, **verified** Biology 12 seed — the 6 MoE New-Curriculum units with provenance in `sourceNote`, `/syllabus` routes, chapter→unit mapping, `/syllabus` UI) |
| 8 | Misconception events + first aggregate map (bet 2) — count each known misconception surfaced in a session, show only clusters above the k-anonymity floor | 🔨 In progress (first slice shipped: `misconception_hit` table + migration, recorder on recall grading, `GET /misconceptions` with K=5 floor, dashboard panel) |
| 9 | Offline-first loop (bet 3) — cached checklists/chapters, a submission outbox with an honest "saved — will be graded when you're back online" state, reconnect sync through the existing attempt idempotency | 🔨 In progress (slice shipped: `lib/store.ts` IndexedDB stores, `lib/outbox.ts` replaying with the original `attemptId`, `use-online` hook, offline banner, queued-state panels on recall/retest, checklist + chapter caching with offline fallbacks, per-session lesson + retest-question cache with honest offline re-reads)
| 10 | Amharic everywhere (bet 4) — bilingual EN/🇪🇹 both-script chrome, generated content in both scripts, Ethiopic type verified | ✅ Done (slices A–D shipped: `Language` pref at `kiftet-language` + persisted through the `LanguageProvider`, pre-hydration `lang` script, `LanguageSwitcher` in the header, typed `messages.ts` corpus where `am` must cover every key, and the study loop's load-bearing chrome wired → `t()`: the four step pills, phase headings/bodies, every primary CTA, session/error/queued/result/voice-guide copy, and the offline banner), plus the landing page and the dashboard, syllabus, textbooks, and voice-test routes. Slice C makes generated content follow the pref: the loop sends `language: "am"`, gemini.ts writes lessons/retest questions in Amharic (Ge'ez) via the `AMHARIC_OUTPUT` instruction with concept names kept verbatim as data, offline fallback content is Amharic too, cached reads honestly flag their language, and a "በአማርኛ / In Amharic" badge marks generated text. Slice D verified the SVG/icon set (same `OPEN_ARC` geometry as the brand mark) and the Ethiopic type stack (Noto Sans Ethiopic loaded at 400–700, Ethiopic-first font stacks, pre-hydration `lang`), and closed the doc gaps — including this doc being split into `docs/howItWorks/` |

The five product bets that steer the phases after this — EHEEE syllabus
anchoring, the national misconception map, the offline-first study loop, Amharic
in everything, and Ethiopian texture — live in [`STRATEGY.md`](../STRATEGY.md);
each phase in this table names the bet it advances.

**Go-live checklist for Phase 6 (when we flip `TEXTBOOK_IMPORT_ENABLED`):**
- [ ] **DB-backed quotas** — replace the in-memory AI window with a per-user
      usage table (e.g. `ai_usage`) so caps survive restarts and multiple
      server instances, and signed-in users get a much larger budget than demo
      (30/min → generous).
- [ ] **Idempotency keys on chunk import** — the server `reused` check already
      prevents double-spend; add a client `chunkKey` (from the TOC path) so a
      retry is provably the same chunk even across re-planning.
- [ ] **Optional server-side Docling pass** — Docling (IBM, MIT) or Marker 2.0
      (Apache-2.0) are free, on-device/server-side converters that produce
      layout-aware markdown (tables, formulas, reading order) and are a strict
      upgrade for scanned or layout-mangled PDFs. Keep the pdf.js-outline path
      for the school-wifi case; offer Docling as the "high quality" route.
- [ ] **Usage visibility** — promote the demo budget pill to a real per-user
      quota screen once quotas are DB-backed.
- [ ] **Session lifetime** — configure Better Auth `expiresIn` (currently the
      default ~7 days) once product decides on a cadence.
- [ ] **Cookie hardening** — switch `sameSite: "none"` → `"lax"` if app and
      API stay same-origin; keep `"none"` only while the split dev/server
      origins need the cookie to cross.
- [ ] **DB TLS verification** — enable `rejectUnauthorized` for Neon now that
      the pooled-cert question is pinned down, so connections can't be
      intercepted.
- [ ] **Migration advisory lock** — a rolling deploy runs several instances;
      take a Postgres advisory lock around `migrate()` so two boots can't race
      the schema journal.
- [x] **`/health` depth** — `/health` also pings the DB (a real `SELECT 1`
      through the pool, 503 + `database_unreachable` on failure) so platform
      health checks catch a dead database, not just a listening socket.
- [ ] **Demo janitor** — demo identity rows now persist (that's intentional);
      add a scheduled job to delete stale demo users + their textbooks so they
      don't accumulate.
- [ ] **`/sessions` N+1** — replace the per-row `resultSummary` loop in
      `GET /sessions` with one grouped query.
- [ ] **Request IDs + structured logs** — tag each request with an id and log
      JSON so support can trace a single failing study session.

**Resolved in the hardening pass (no action needed):** centralized JSON error
middleware with friendly 413/500 copy; Gemini 20s timeout → deterministic
fallback; DB pool connect/query/idle timeouts; graceful shutdown on SIGTERM;
client fetch timeout (30s) + friendly offline copy; PDF worker cleaned up in
`finally`; demo identity made DB-backed (survives restarts) and `/demo/start`
IP-throttled; quotas shown live from `GET /api/ai/budget` instead of
hardcoded UI numbers.

**Resolved in the craft pass (no action needed):** the 10-item motion +
feedback pass landed — idle voice ring breathes (~3s), spinners became
ink-settling strokes (`InkSettling`), the "Gap closed." mark draws in and
settles to sage (`BrandMark closing`), concept-graph empty states, paper grain
on dark rooms, "Bring your own book" list brightness, a single one-shot
listening ripple, a breathing demo border, and an ink-page upload animation.
Retest questions now mirror the student's own recall wording, and feedback
colours are fixed (Sage `#5C7A5E`, Rust `#B54A2C`) instead of following the
room candle. All plain CSS keyframes behind utilities in `index.css`, collapsed
by `prefers-reduced-motion`. See [`STRATEGY.md`](../STRATEGY.md) for the five
product bets that steer the next phases.

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

