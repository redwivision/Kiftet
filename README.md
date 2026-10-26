<div align="center">

<img src="assets/logo-mark.svg" width="80" height="80" alt="Kiftet logo" />

# Kiftet — Close the gap

**A calmer, more focused way to study.**

[Try Kiftet](https://kiftet.com) (deploying to Cloudflare)

**Created by:** Lewi Kibru (CTC-6064-26)

**Role (solo):** Product lead / full-stack

</div>

Kiftet (ክፍተት, “gap”) helps students prepare for exams by finding what they
haven’t understood yet, then helping them focus their study on just that.

## Who it’s for

Kiftet is designed for students in Ethiopia preparing for national exams. It
supports textbook-based study, so learners can work from the material they
already use instead of starting with a generic question bank.

## How it works

Kiftet guides each study session through four steps:

1. **Recall what you know.** Choose open recall, targeted questions, or both.
   Depending on your choice, answer aloud or use multiple choice, fill-in-the-
   blank, or your own words.
2. **See what needs work.** Kiftet checks your answers concept by concept. Your
   results distinguish ideas you understand, partly understand, have mixed up,
   or have not covered—not just a single score.
3. **Get a roadmap for your gaps.** Your study plan puts the most important
   misunderstandings first, gives each gap a useful next action, and points to
   the matching passage in your own book. Mark steps as you work, and follow
   relevant YouTube or Google searches when you need another explanation. This
   step is a guided plan, not a generated lesson.
4. **Check what changed.** Retest with new questions focused on the gaps, then
   compare your understanding before and after.

An optional generated classic lesson is available as a **beta** feature; it is
separate from the main study plan.

## What you can do

- Study chapters from your textbook or the available syllabus.
- See your progress for individual concepts, including common misconceptions.
- Follow a personalized study plan with prioritized gaps, next actions, book
  references, useful search links, and steps you can mark complete.
- Retest with fresh questions and compare your understanding before and after.
- Import your own textbook; PDF reading and OCR happen on your device.
- Continue studying across sessions and devices with an account.
- See a daily study plan based on your progress and preferences.

## Run it locally

You’ll need [Bun](https://bun.sh/) 1.4.2 or later and Node.js 22.22 or later.

```bash
git clone https://github.com/redwivision/Kiftet.git
cd Kiftet
bun install
bun run dev
```

To use the full study flow locally, configure the database and AI service
credentials. See the [environment setup](docs/howItWorks/environment.md) and
[development guide](docs/howItWorks/running.md) for details.

## For contributors

Kiftet is built with TypeScript, React, and Bun. The repository contains the web
app, API server, and shared packages. Before opening a change, run the relevant
checks:

```bash
bun run test
bun run check-types
bun run lint
```

## Learn more

- [Product and system guide](docs/howItWorks/README.md) — what the app does and
  how its parts fit together.
- [Product requirements](docs/PRD.md) — goals and requirements.
- [Roadmap](docs/howItWorks/roadmap.md) — shipped work and what’s planned.
- [Deployment guide](RUNBOOK.md) — production setup and operations.

## Project status

Kiftet is under active development. Try the [live version](https://kiftet.com)
and share feedback with the project maintainer.
