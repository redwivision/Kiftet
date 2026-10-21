# The daily planner — what we are building

> The planner is the thing a student is actually buying. This is the spec we
> are building against, and the record of the decisions that shaped it.

## The product, in one sentence

> A student says where they are in their book and how much they want their
> past brought back, and the app turns that into **today's** plan — one review
> and one new concept, twenty minutes by default — with a countdown to the
> exam that gives the review a reason.

## The one input the app did not have

Everything else in the app was built on an assumption: a student opens a
chapter and studies it. That is fine for a study session and useless for a
planner, because a planner is about *time passing* — and by the time a student
installs the app, school has already started. They are not at Unit 1. They
might be halfway through Unit 3, and they might be three weeks from an exam.

So the planner asks two things, once:

1. **Where are you?** — which book, which chapter, which section.
2. **How much of the past do you want brought back?** — none, light, or heavy.

And it asks a third, optional, because it is what makes the plan urgent:

3. **When is your exam?** — a date, not a guess.

## The decisions, and why

**The position is per book, not per student.** A student with a biology book
and an economics book is in two places at once. One "current chapter" on the
user row would have to lie about one of them. A book is also the same thing as
a subject here — the grain the per-subject agent will work at — so the
position is already stored where that agent will want it.

**The position is its own table.** A book is a thing; where the student is in
it is the student's state, and the two have different lifetimes. And a
`textbook` column pointing at a `chapter` makes the two tables reference each
other — a circle the schema cannot type and the database need not have.

**The section is stored as the book's own printed path** ("3.2"), not as a
reference to a concept row. The book's contents line never changes; a concept
row does, because the deferred model read replaces it.

**Review is a question, not a default to impose.** A student who wants to
press on new material should not be handed yesterday's gaps every morning. If
they say **none**, we do not mention review at all — until they give us an exam
date, at which point forgetting something has a consequence and the plan says
so. The default for a student who has said nothing is **light**, because a
student who has not answered is more likely to want a little review than none,
and because the plan can turn it off the moment they say so.

**Twenty minutes is a default, not a rule.** It is the shape of a day that
almost anybody can keep. The student changes it, and the Today screen can
change it for one day without changing the habit.

**A day is one review and one new concept.** Not a backlog. The point of a
daily plan is that it ends, and that tomorrow's is not a debt.

**Priority starts with weakness, not with the table of contents.** The order
the planner reaches for past material is the order the student is weakest in.
Until a trusted exam-period allocation exists, the *new* material is ordered by
the book's own sequence — which is a proxy, and is treated as one. No exam
weights are invented, because an invented weight is a claim the app cannot
defend.

**No exam date means no countdown, and no exam date plus "none" means no
review.** Both are the student's instruction, and both are honoured until the
student changes them.

**The question is asked once.** `placementDismissed` records that the student
said "not now", so the app never asks twice. A nag is worse than a wrong
default.

## What is deliberately not here yet

- **A dedicated agent per subject.** This is the shape the product ends in, and
  it comes after the planner — the planner is what tells an agent what to do
  that day, so the planner has to work first.
- **Exam-period weighting.** `syllabus_unit.periods` is still null, and it
  stays null until a trusted source exists. The planner uses the book's own
  order and says so.
- **A spaced-repetition engine.** The old `/review-due` is a flat two-day
  rule. A real schedule is a later step, and it will be built on the same
  mastery history the planner reads.
- **Anything that spends AI to decide what to study.** The plan is
  deterministic. The only model-written line is the *why this is yours* one,
  which already has a deterministic fallback.

## The build order

| Step | What it is | Status |
|---|---|---|
| 0 | The contents reader is measured, reaches roman front matter, and never strands the student | ✅ shipped |
| 1 | Placement: the app asks where the student is, and remembers the answer | ✅ shipped (server) · UI in progress |
| 2 | The mastery history and the scheduling policies, as pure functions | next |
| 3 | `GET /api/plan/today` — the plan itself | next |
| 4 | The exam date, and the countdown that goes with it | next |
| 5 | The Today surface on the dashboard, with the manual queue kept as the fallback | next |

## Where this lives in the repo

- The decisions: [how it works → decisions](howItWorks/decisions.md) (#40).
- The tables: [how it works → database](howItWorks/database.md).
- The flow: [how it works → dataflow](howItWorks/dataflow.md) (5.2b).
- The endpoints: `apps/server/src/routes/placement.ts`.
