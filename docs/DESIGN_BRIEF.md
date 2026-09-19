# Design Brief — Brand & UI/UX Direction

## 1. Who this is for, and what the design has to do

**Audience:** Ethiopian students under real, immediate pressure — the national exam pass rate is 12.8% even in its best year. They are not casual app browsers; they are stressed, time-pressed, and have likely already tried other tools (Ethio Matric, TikuretEntrance) that didn't fully work for them.

**The design's job:** Make the product feel calm, competent, and honest about the stakes — not panicked, not childish, not a generic imported SaaS tool. It needs to feel like it was built *for* an Ethiopian student specifically, not localized after the fact. Voice is the core interaction, so the interface has real work to do making a mostly-invisible interaction (talking) feel present and trustworthy on screen.

**Explicitly avoid:** generic "African tech" clichés (stock patterns, flag-color gradients used decoratively), a look that reads as an imported Silicon Valley SaaS product with a translated label slapped on, and anything that makes the exam crisis feel like a game rather than something real.

---

## 2. Name & logo — finalized

**Name: Kiftet** (ክፍተት — "gap"), confirmed by native-speaker check. Tagline: **"Close the gap."** The name maps directly onto the core mechanic — find what's missing, close it.

**Logo mark:** a gold open ring — a circle with a 72° segment missing at the top-right — on a Night Indigo field. The ring is a whole that isn't whole, with the missing piece being the gap (ክፍተት) the product exists to close. Same geometry as the `BrandMark` component in `apps/web/src/components/brand-mark.tsx`, so the file, favicon, PWA icons, and on-screen mark never drift. Two versions, both provided as real SVG assets and kept identical to the app's:
- `/assets/logo-mark.svg` — circular version, for favicons and small contexts
- `/assets/app-icon.svg` — rounded-square version, for the PWA home-screen icon

Deliberately gold-on-indigo, not gold-on-light — the two colors are meant to sit together as one combined identity, not appear as separate, independent swatches. See the color system below for why.

Log this decision (name, logo direction, and the reasoning above) as a dated entry in your Scholarxiv collection — you're doing the thinking anyway, this makes it visible proof of ideation for free.

---

## 3. Visual identity — token system

### Color (named, tested together, not generic defaults)

**Core identity — Black and Ivory, a deliberate monochrome.** The app is a near-black room lit by flat ivory — one colour axis, no rainbow. Each **room** keeps the same black architecture and swaps a single muted "candle" hue (Ember, Jade, Violet, Ochre, Midnight, Meadow, Copper) plus its own ground tint, so switching rooms recolours the field itself, not just buttons. Accent utilities (`gold` tokens) resolve to the adaptive candle/ink value so the same classes read correctly in every room. Confirmed by mockup: ivory reads cleanly against true black, both in the small logo mark and as a full app surface.

- **Ink black** `#0A0B0D` — **primary surface**, not just an accent. Used as the main dark background across the app, not only reserved for "focus mode." Study happens under real pressure, often at night — this is the app's default register, not a special state.
- **Ivory** `#F2EFE9` — **primary accent**, always read against black. Candlelight on a dark room: used for the logo, key actions, and "gap closed" moments. On light surfaces it flips to ink (`#201D18`) so the same mark stays legible on paper.
- **Manuscript** `#F2EFE9` — secondary **light** surface, reserved for screens with dense reading content (a full chapter of text is harder to read light-on-dark for long stretches than a short review screen is).
- **Ink** `#16151A` — text on Manuscript/light surfaces. On the dark room, text uses Ivory instead of Ink.
- **Oxide Rust** `#C2464C` — one meaning, used consistently: something needs attention. Covers both "gap identified" in the diagnostic screen and "incorrect" in retest feedback — the single functional colour allowed in the monochrome identity, muted and mineral rather than generic red.
- **Fog** `#8B8F98` — one meaning, used consistently: muted secondary text on dark surfaces. Keeps hierarchies calm without adding a second tint.

Rust and Sage double as the correct/incorrect feedback convention deliberately — using the same two colors for both the diagnostic gap-finding and the retest scoring keeps the whole app speaking one consistent visual language, rather than introducing a separate "quiz app" color system on top of the brand.

### Type
Bilingual EN/Amharic support is a real technical constraint, not just an aesthetic one — your typeface choice must have solid Ethiopic (Ge'ez script) glyph coverage, or Amharic text will render in a fallback font that breaks the whole visual identity. Options like Noto Sans Ethiopic (clean, modern, reliable coverage) or Abyssinica SIL (more traditional, manuscript-adjacent feel) are safe technical choices — test actual Amharic rendering early, don't assume a nice-looking Latin font "just works" for Amharic too.

Pair one distinctive Latin display face for headlines with a highly legible Latin body face — don't just use the Ethiopic-compatible font for everything if it's not also great at small sizes in English.

### Layout
- **Mobile-first, single column.** Given real connectivity constraints, don't design a dashboard that assumes a big screen and fast wifi as the default case.
- **Voice state is a primary UI element, not a small mic icon.** The listening/thinking/speaking states need clear, calm visual presence — a student needs to trust the app is actually hearing them, especially the first time they use it.
- **The gap, visualized, not just scored.** Don't just show "62%" — show which specific concepts are covered vs. missing, so the diagnosis itself is legible at a glance.

```
[ Wireframe concept — recall screen ]
+------------------------------+
|  Chapter: Thermal Equilibrium |
|                                |
|        (voice state ring)     |
|      "Listening..."           |
|                                |
|  [ tap to stop speaking ]     |
+------------------------------+

[ Wireframe concept — gap result ]
+------------------------------+
|  You covered:                 |
|  ● Heat direction              |
|  ● Definition                  |
|                                |
|  Let's cover:                  |
|  ○ Equilibrium condition       |
|  ○ Rate-affecting factors      |
|                                |
|  [ Hear the short version ]   |
+------------------------------+
```

### Principles
- **Calm urgency, not panic.** The stakes are real (use the 12.8%/87.2% framing in copy where it earns its place) — but no countdown timers, no alarm-red as a dominant color, no gamified point-scoring that trivializes what's actually at stake.
- **Spend your boldness on one thing:** the gap-visualization moment. Keep navigation, buttons, and everything else quiet and disciplined around it.
- **Write like a calm, direct tutor, not a chatbot.** Buttons say exactly what happens ("Hear the short version," not "Submit"). No filler, no fake enthusiasm.

---

## 4. What NOT to do (common AI-generated design tells — avoid these specifically)
- The warm-cream-plus-terracotta combo, or near-black-plus-acid-green — both read as generic AI defaults now, which is part of why the palette above deliberately goes elsewhere.
- All-caps labels, tracked-out eyebrow text above headings, or middle-dot-joined meta strings.
- Identical rounded cards with the same soft grey shadow on everything, regardless of what the content actually is.
- An arrow "→" tacked onto every button and link.
- Numbered 01/02/03 markers unless the content is a genuine sequence (your recall→diagnose→relearn→retest loop actually *is* one, so that's a legitimate place to use this pattern — just not decoratively elsewhere).
