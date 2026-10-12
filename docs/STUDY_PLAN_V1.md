# Relearn as a study plan — v1

> Notes from a product discussion, updated to record the decisions that shipped.
> The reasoning is kept so it survives the conversation.

## What the plan is

The **relearn** step is a **roadmap**, not a lesson and not a quiz. It tells the
student the shortest route over exactly what they are missing — nothing they
already know — one card per gap concept, in leverage order, time-boxed to the
budget they pick.

Each card carries:

- the failed concept and its diagnosed failure mode,
- a one-line *why this is yours* (the diagnosis handed back, not a fact),
- an action verb (*Learn it* / *Complete it* / *Tell them apart*),
- a deterministic search query with **YouTube** and **Google** exits,
- the exact place in **their own book** (chapter, page, excerpt),
- a *mark done* tick that persists for the session.

It does not teach and it does not ask the student to answer a gap they have just
been told they have. That was the v0 mistake: the planning screen felt like a
retest because it quizzed the student on the very thing the diagnosis had
already concluded they do not know.

The screen ends with **Ready to be tested**, which leads into the retest — the
only graded step in the loop. The plan is formative; the retest is the proof.

## Why this is the right call

The generated micro-lesson is the weakest and most attackable part of the
product. The diagnosis is genuinely differentiated. The loop logic is sound. But
"AI speaks a 90-second lesson" is what a PhD in education pokes at, because short
AI-generated explanations are usually *shallow* rather than wrong — and shallow
is easy to expose.

A study plan is the opposite: easy to make obviously useful, hard to hallucinate,
and it matches what students actually do — their textbook, YouTube, and practice.

## The one thing that decides product vs. toy

**The plan is generated from the diagnosis, not from the topic.**

If the input is `Economics → Consumer Behavior`, this is a wrapper around a
search box and the moat evaporates. What only Kiftet can produce is the sentence
that names the failure mode and chooses the move:

> You defined demand correctly but you confused the substitution and income
> effects. That is not a coverage gap — you have seen both, you cannot tell them
> apart. So: tell them apart first, then re-speak the topic.

The diagnosis already says **which failure mode** the student is in: missing
entirely, half-remembered, or mixed up with a neighbour. Those three need three
different moves, and choosing between them is the whole value.

## Decisions

**1. Search exits, not curated links.** The plan never invents a URL. It builds a
**deterministic** query — concept + subject + a subject-shaped suffix — and the
client turns it into a YouTube or Google search link. For 250 users this avoids
dead links and US-curriculum content, and it keeps the "what do I search"
decision in the student's hands. A hand-vetted list per chapter is the eventual
upgrade; not v1.

**2. The book is the anchor.** Every step points at the real character offset in
the student's own chapter text, computed (not asked of the model), so a page
number is never hallucinated. The book is the one resource we can vouch for.

**3. The *why* is model-written, with a deterministic fallback.** One batched
provider call writes an orienting line per step so the plan reads as *yours*. If
the model is unavailable, the line falls back to the deterministic diagnosis
("Not in your recall — start here.") and the plan is still usable. `estimated`
marks when any line fell back.

**4. Progress is a tick-through checklist**, not a re-test. Cards mark done for
the session; `plan-progress` shows *n of m done*.

**5. The retest survives** as the only graded step. The plan routes the student
to it; the retest proves the gaps closed. ✅ *resolved*

**6. The site already stopped promising the old loop.** ✅ *resolved* — the
landing page leads with the plan; `hero-sub` ends *"Not another question bank. A
plan."*, `l-relearn-title` is *"Get the shortest route"*. Nothing student-facing
claims to instruct.

## Shape of v1

```
ONE CARD PER GAP      concept + why + action
                      deterministic search query → YouTube / Google
                      the exact place in your book
                      mark done
                      ↓
READY TO BE TESTED    → the retest (the only graded step)
```

Structure and search query are deterministic and free; only the *why* line is
generated, in the student's own language.
