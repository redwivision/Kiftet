# How Kiftet Works — design decisions

> Part of the [how-it-works index](README.md).


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

4. **Mobile-first, calm design.** True black `#0A0B0D` + Ivory `#F2EFE9`
   is the monochrome identity. The voice state ("Listening…", "Thinking…") is a first-class
   UI element — a student has to trust the app is hearing them. The one place we
   spend visual boldness is the gap visualization: show *which* concepts are
   covered vs missing, not just "62%".

5. **Institutional licensing, not per-student fees** (B2B2C). Schools and
   tutoring centers pay; students get it free. Real deal with Links.et sponsor.

6. **Two explicitly-risky things are tested early, not discovered late:**
   grading a *conceptual* explanation vs. grading a *numerical* answer likely
   need different prompts/logic — we test both on real chapter types (Phase 4).

7. **Restraint is the motion system.** Loading is ink settling into place
   (`component: ink-settling.tsx`), the idle voice ring breathes on a slow ~3s
   heartbeat, "start listening" earns a single one-shot ripple (never a loop),
   the "Gap closed." mark draws itself in and settles to sage, and dark rooms
   carry a faint paper grain. All of it is plain CSS keyframes behind utilities
   in `index.css` — no animation library — and `prefers-reduced-motion`
   collapses it to the finished frame. Feedback colours are fixed values
   (Rust `#B54A2C`, Sage `#5C7A5E`), not per-room, so "gap / solid" means the
   same thing in every room.

---

8. **The control layer is ours, and it is big enough to touch.** The brand
   surfaces (warm, rounded, animated) were fighting square 24–32px stock
   controls, so the buttons, inputs, textareas, menus, skeletons and toasts
   were rebuilt to match the rest of the app: pill buttons at a 44px default
   (WCAG 2.5.5 target size) and a single `loading` prop that shows a spinner,
   sets `aria-busy` and blocks re-entry, replacing three different hand-rolled
   async patterns. Focus was the sharper problem — in every dark room `--ring`
   was set equal to `--primary`, so keyboard focus on a primary CTA rendered an
   accent ring on an accent button, i.e. the one thing a focus ring must never
   be. `--focus` is now a separate per-room token, light-shifted and drawn
   outside the control via `outline-offset`, with a global `:focus-visible`
   outline as a backstop. In the paper room the two tokens are legitimately
   equal (dark ink on a light control is maximum contrast); they diverge as
   soon as the room goes dark, which is where the collision was.

9. **A broken page is an unclosed gap.** The route error boundary was the last
   place a user could meet a framework's default ("Oops!", a raw stack), and it
   was the one moment they are already frustrated. It now speaks the product's
   own language — the open ring, the mark, an honest sentence about what
   actually happened (404 / offline / server), retry and home — with technical
   detail behind a disclosure and folded away entirely in production. It omits
   the `Header` on purpose: the header pulls in auth and the `/health` probe,
   and an error screen that can itself throw is worse than a bare one. Related:
   `ThemeProvider` and `LanguageProvider` moved into `Layout` so a crash is
   still themed and still in the student's language. Navigation feedback is a
   `useNavigation` ink sweep rather than a Suspense skeleton, because the
   routes are code-split and a skeleton would flash on every single nav.

10. **Offline, the brand has to survive too.** The Workbox config cached the
    app shell but nothing cached the webfonts, so offline — the exact scenario
    a PWA exists for — every headline silently fell back to system-ui. Font
    sheets now `StaleWhileRevalidate` and font files `CacheFirst` (Google's
    unicode-range means only the used subsets are ever fetched, so this stays
    small). `woff2` is in `globPatterns` even though nothing self-hosts a font
    today: if one moves into the bundle, that glob is the only thing that would
    precache it, and a missing extension fails silently. Navigations stay
    `NetworkOnly` with an `offline.html` precache fallback, because a cached
    document from an earlier deploy is worse than an honest "you are offline".

11. **One language key, one type-enforced promise.** `messages.ts` types `am`
    as `Record<MessageKey, string>` where `MessageKey = keyof typeof en`, so
    every user-visible string — including validator messages, toasts and the
    study ring's own push-to-talk captions — cannot silently fall back to
    English. The ring's captions are deliberately *not* the Voxide `vt-*`
    strings: those describe an always-on agent you interrupt, this one
    describes a recording you finish, and reusing them would tell the student
    the wrong thing about the control they are touching.

12. **A formatter the repo doesn't agree with is a trap.** `biome.json` sets
    `indentStyle: "tab"`, but `packages/ui` had been committed at 2-space, so
    `bun run check` (`biome check --write .`) wanted to rewrite 94 files —
    package manifests, `turbo.json`, migration snapshots — before it touched
    any real work. The package is now uniformly tab-indented to match the
    config, and config-file reformatting noise was reverted so the diff stays
    honest about what actually changed.

