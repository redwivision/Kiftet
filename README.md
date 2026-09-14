<img src="assets/logo-mark.svg" width="72" height="72" alt="Kiftet logo" />

# Kiftet — Close the gap

**Turn any textbook chapter into a spoken, adaptive review that closes exactly the gaps you have — not the ones you don't.**

Name confirmed (ክፍተት — "gap") by native-speaker check. Brand: gold `#E8A33D` on indigo `#1B2340`, deliberately clashed together — see `/docs/DESIGN_BRIEF.md` for the full system and reasoning.

## The problem

Ethiopia's national exam pass rate climbed to 12.8% in 2026 — the best result in years. That also means **87.2% of the roughly 563,500 students who sat the exam were still failed by the system**, and 565 schools had zero students pass. Students aren't failing from zero exposure — they sat through the classes. They fail because there's no efficient way, before the exam, to find out exactly which specific concepts didn't stick.

## The idea

A student picks any chapter from their textbook and speaks a cold explanation of what they remember — no notes. The system identifies exactly which concepts are missing or wrong, delivers a short spoken micro-lesson targeting only those gaps, and retests with differently-phrased questions to confirm real understanding. Before/after coverage is shown directly.

Full detail: see `/docs/PRD.md`.

## Why voice, why now

Explaining something out loud is how the underlying learning technique is actually supposed to work — this isn't voice added to satisfy a requirement, it's the mechanism itself. Full sponsor integration detail: see `/docs/PRD.md`, section 8.

## Tech

Web app (PWA), hosted on EthioDeploy. Voice capture and playback via Voxide throughout. Institutional licensing via Links.et. Ideation and research trail documented via Scholarxiv.

Architecture and data model: see `/docs/SYSTEM_DESIGN.md`.

## Design direction

See `/docs/DESIGN_BRIEF.md` for the full visual identity, color/type system, and UI principles.

## Team

_(add names/roles here)_

## Status

Built from scratch starting at the official STARK Hackathon 2026 kickoff. Progress tracked via commit history and STARK Changelogs.
