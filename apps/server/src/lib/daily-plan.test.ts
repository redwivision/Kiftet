import { expect, test } from "bun:test";
import {
  desiredReviewCount,
  isReviewDue,
  nextSection,
  reviewCandidates,
  reviewCapacity,
  reviewCount,
} from "./daily-plan";
import type { ConceptHistory } from "./mastery-history";

const day = (n: number) => new Date(Date.UTC(2026, 0, n, 9, 0, 0));

function entry(
  concept: string,
  level: number,
  lastCheckedAt: Date,
): ConceptHistory {
  return {
    chapterId: "ch-1",
    concept,
    level: level as ConceptHistory["level"],
    lastCheckedAt,
    checks: 1,
  };
}

test("'none' means none, until there is an exam date", () => {
  // The student's instruction is honoured: without a deadline, forgetting has
  // no consequence, so the past stays out of the day.
  expect(desiredReviewCount("none", false)).toBe(0);
  expect(reviewCount("none", false, 60)).toBe(0);
  // With a date, review comes back — at the light level, and no more than they
  // asked for.
  expect(desiredReviewCount("none", true)).toBe(1);
  expect(reviewCount("none", true, 60)).toBe(1);
});

test("'light' is one item and 'heavy' is a block", () => {
  expect(desiredReviewCount("light", false)).toBe(1);
  expect(desiredReviewCount("heavy", false)).toBe(3);
});

test("the day's length holds the review to what fits", () => {
  expect(reviewCapacity(20)).toBe(1);
  expect(reviewCapacity(45)).toBe(2);
  expect(reviewCapacity(90)).toBe(3);
  // A student who asked for heavy and has twenty minutes gets one, not three:
  // their own number wins over their appetite.
  expect(reviewCount("heavy", false, 20)).toBe(1);
  expect(reviewCount("heavy", false, 90)).toBe(3);
  // But a review they asked for is never silently dropped.
  expect(reviewCount("light", false, 10)).toBe(1);
});

test("a concept nobody covered is not due for review", () => {
  // Nothing was learned, so nothing can be forgotten. Including it would put
  // the same concept at the top of the queue forever, because a review can
  // never turn a level 0 into a level 3.
  expect(isReviewDue(0, day(1), day(20))).toBe(false);
});

test("a shaky idea is checked tomorrow, a wrong one in two days, a solid one in a week", () => {
  expect(isReviewDue(1, day(1), day(1))).toBe(false);
  expect(isReviewDue(1, day(1), day(2))).toBe(true);
  expect(isReviewDue(2, day(1), day(2))).toBe(false);
  expect(isReviewDue(2, day(1), day(3))).toBe(true);
  expect(isReviewDue(3, day(1), day(7))).toBe(false);
  expect(isReviewDue(3, day(1), day(8))).toBe(true);
});

test("the wrong belief comes first, then the shaky one, then the solid one", () => {
  // The product's established triage, so the plan and the guide agree about
  // what matters.
  const candidates = reviewCandidates(
    [
      entry("Solid", 3, day(1)),
      entry("Shaky", 1, day(1)),
      entry("Wrong", 2, day(1)),
    ],
    day(20),
  );
  expect(candidates.map((c) => c.concept)).toEqual(["Wrong", "Shaky", "Solid"]);
});

test("of two equally weak ideas, the one not looked at for longest comes first", () => {
  const candidates = reviewCandidates(
    [entry("Recent", 2, day(18)), entry("Stale", 2, day(2))],
    day(20),
  );
  expect(candidates.map((c) => c.concept)).toEqual(["Stale", "Recent"]);
});

test("equally urgent ideas have a stable order", () => {
  const candidates = reviewCandidates(
    [entry("Zinc", 2, day(1)), entry("Algae", 2, day(1))],
    day(20),
  );
  expect(candidates.map((c) => c.concept)).toEqual(["Algae", "Zinc"]);
});

test("nothing that is not due is offered", () => {
  const candidates = reviewCandidates(
    [entry("JustChecked", 1, day(20)), entry("NeverCovered", 0, day(1))],
    day(20),
  );
  expect(candidates).toEqual([]);
});

test("the book being worked on comes first among equals", () => {
  // A student in Biology is better served by Biology's due concept than by
  // one from a book they are not touching today.
  const history: ConceptHistory[] = [
    { ...entry("Other book", 2, day(2)), chapterId: "ch-2" },
    { ...entry("This book", 2, day(5)), chapterId: "ch-1" },
  ];
  const candidates = reviewCandidates(history, day(20), new Set(["ch-1"]));
  expect(candidates.map((c) => c.concept)).toEqual(["This book", "Other book"]);
});

test("the book being worked on does not outrank a more urgent gap", () => {
  // Coherence is a tie-break, not a promotion: a wrong belief in another book
  // still beats a shaky one in this one.
  const history: ConceptHistory[] = [
    { ...entry("This book, shaky", 1, day(2)), chapterId: "ch-1" },
    { ...entry("Other book, wrong", 2, day(5)), chapterId: "ch-2" },
  ];
  const candidates = reviewCandidates(history, day(20), new Set(["ch-1"]));
  expect(candidates.map((c) => c.concept)).toEqual([
    "Other book, wrong",
    "This book, shaky",
  ]);
});

test("a student with no section picked gets the whole chapter", () => {
  const target = nextSection(
    [
      { path: "1.1", title: "Cell structure" },
      { path: "1.2", title: "Cell division" },
    ],
    null,
  );
  expect(target.path).toBeNull();
  expect(target.remaining).toBe(2);
});

test("a chapter without printed sections is still a learnable target", () => {
  const target = nextSection([], null);
  expect(target).toEqual({ path: null, title: null, remaining: 1 });
});

test("the next line in the book's own contents is what comes next", () => {
  const target = nextSection(
    [
      { path: "1.1", title: "Cell structure" },
      { path: "1.2", title: "Cell division" },
      { path: "1.3", title: "Transport in cells" },
    ],
    "1.1",
  );
  expect(target.path).toBe("1.2");
  expect(target.title).toBe("Cell division");
  expect(target.remaining).toBe(2);
});

test("at the last section there is nothing left in the chapter", () => {
  // An answer the plan states, not a gap it hides.
  const target = nextSection(
    [
      { path: "1.1", title: "Cell structure" },
      { path: "1.2", title: "Cell division" },
    ],
    "1.2",
  );
  expect(target.path).toBeNull();
  expect(target.remaining).toBe(0);
});

test("a section the book does not have falls back to the whole chapter", () => {
  // A book renumbered between editions must not point the plan at nothing.
  const target = nextSection(
    [
      { path: "1.1", title: "Cell structure" },
      { path: "1.2", title: "Cell division" },
    ],
    "9.9",
  );
  expect(target.path).toBeNull();
  expect(target.remaining).toBe(2);
});
