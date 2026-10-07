# Relearn as a study plan — v1 direction

> Notes from a product discussion, kept here so the reasoning survives the
> conversation. Decision still to be confirmed: see **Open questions** at the end.

## What was proposed

Short focused lessons are good, but they are not what a student who is actually
trying to study needs. Kiftet will not try to cover the whole loop in the first
version.

The **relearn** step becomes a place where a student gets a smart study plan
built from the subject and that specific topic. Studying Economics and currently
on Consumer Behavior, the plan decides whether the right move is practice or
memory techniques backed by real understanding — and might say *use NotebookLM to
generate 20 questions*, then *watch this video for real understanding*, with
recommended YouTube videos and articles for that topic.

## Why this is the right call

The generated micro-lesson is the weakest and most attackable part of the
product.

Everything else is defensible. The diagnosis is genuinely differentiated. The
loop logic is sound. But "AI speaks a 90-second lesson" is exactly what a PhD in
education will poke at, because short AI-generated explanations are usually
*shallow* rather than wrong — and shallow is easy to expose. Staking the
evaluation on the weakest asset is the wrong trade.

A study plan is the opposite: far easier to make obviously useful, far less to
hallucinate, and it matches what students actually do — YouTube, a textbook, and
practice questions.

## The one thing that decides product vs. toy

**The plan must be generated from the diagnosis, not from the topic.**

If the input is `Economics → Consumer Behavior`, this is a wrapper around a
search box. The evaluator types the same thing into ChatGPT, gets a similar
answer, and the moat evaporates in the room.

What only Kiftet can produce:

> You defined demand correctly but you confused the substitution and income
> effects. That is not a coverage gap — you have seen both, you cannot tell them
> apart. So: 6 comparison questions first (not 20 — more will not fix it), then
> the 4-minute indifference-curve video, then re-speak the topic.

The diagnosis already says **which failure mode** the student is in: missing
entirely, half-remembered, or mixed up with a neighbour. Those three need three
different study strategies, and choosing between them is the whole value. That
is a sentence the evaluator cannot get anywhere else.

## Three risks to design around now

**1. Curated links vs. generated links.**
Live YouTube search from the model will serve wrong videos, dead links, and
US-curriculum content that does not match the MoE syllabus. For 250 users,
ship a hand-vetted resource list per chapter and let the model choose *which*
entry and write *why* — never let it invent a URL. A wrong link destroys trust
instantly.

**2. Data cost.**
A plan saying "watch this 12-minute video" can be unaffordable. Flag duration
and size, prefer short, always give a text fallback. Plans get screenshotted and
shared — design for that literally.

**3. The site must stop promising the old loop.** ✅ *resolved*

The landing page now leads with the plan, not the lesson: `hero-sub` ends
*"Not another question bank. A plan."*, `l-relearn-title` is *"Get the
shortest route"*, and `demo-text` promises the shortest plan rather than a
lesson. Nothing in student-facing copy, the page metadata, or this repo's
product docs claims to instruct — the read-aloud step is described only as
what the plan covers. Lessons are deliberately *not* named
on the first screen: they are a discovery the student makes inside the
product, which is where the surprise belongs.

The landing page also answers the eight questions a visitor actually arrives
with (what it is, cost, install, data, phone number, instructor, waitlist reward,
syllabus) immediately before the final call to action.

## Shape of v1

```
UNDERSTAND   1 vetted video/reading, chosen for YOUR gap      (~4 min)
PRACTICE     N questions, count set by the failure mode       (~10 min)
CHECK        re-speak the topic, compared against last time   (~2 min)
```

Structure from the model, links from the vetted list, in the student's own
language — three things already built.

## Open questions

1. **Does the retest survive?** It is the difference between "diagnose → plan"
   (two steps, clean story) and a real loop. It also decides whether `CHECK` can
   verify anything at all.
2. **Where do resources come from** — hand-curated per chapter, model-chosen
   from a vetted list, or live search? Strong recommendation: the middle one.
3. **Which subject and chapter first?** Better to fully vet one than partially
   vet three.
4. **Is the spoken lesson gone, or demoted?** If gone, `hero-sub`, `loop-title`
   and the whole `LOOP` section need rewriting *before* the evaluator sees them,
   and that should happen in the same pass rather than after.
