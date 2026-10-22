<div align="center">

<img src="assets/logo-mark.svg" width="80" height="80" alt="Kiftet logo" />

# Kiftet — Close the gap

**A calmer, more focused way to study.**

[Try Kiftet](https://kiftet.ethiodeploy.com)

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

1. Choose a chapter and explain what you remember, by voice or text.
2. Kiftet compares your explanation with the chapter and points out concepts
   that need more work.
3. Review a short lesson focused on those concepts.
4. Try a new set of questions to check what has improved.

The goal is to spend less time repeating what you already know and more time
on what still needs practice.

## What you can do

- Study chapters from your textbook or the available syllabus.
- Get feedback about specific concepts, rather than only a score.
- Review a short, focused lesson and check your progress with a retest.
- Use voice or switch to typing when speaking isn’t convenient.
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

Kiftet is under active development. Try the [live version](https://kiftet.ethiodeploy.com)
and share feedback with the project maintainer.
