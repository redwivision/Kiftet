import { expect, test } from "bun:test";
import {
  type MasterySample,
  masteryHistory,
  studiedChapterIds,
} from "./mastery-history";

const day = (n: number) => new Date(Date.UTC(2026, 0, n, 9, 0, 0));

test("the latest reading of a concept wins", () => {
  const history = masteryHistory([
    {
      chapterId: "ch-1",
      createdAt: day(1),
      mastery: { "Cell structure": 1 },
    },
    {
      chapterId: "ch-1",
      createdAt: day(3),
      mastery: { "Cell structure": 3 },
    },
  ]);
  expect(history).toHaveLength(1);
  expect(history[0]?.level).toBe(3);
  expect(history[0]?.lastCheckedAt).toEqual(day(3));
  expect(history[0]?.checks).toBe(2);
});

test("the order the samples arrive in does not matter", () => {
  // The database hands them back newest-first; a policy that depended on
  // that would quietly change when a query changed.
  const samples: MasterySample[] = [
    { chapterId: "ch-1", createdAt: day(1), mastery: { A: 1 } },
    { chapterId: "ch-1", createdAt: day(2), mastery: { A: 2, B: 3 } },
  ];
  const forward = masteryHistory(samples);
  const backward = masteryHistory([...samples].reverse());
  expect(forward.map((h) => [h.concept, h.level])).toEqual(
    backward.map((h) => [h.concept, h.level]),
  );
});

test("a retest that did not probe a concept does not erase it", () => {
  // A retest grades only what it asked about. Taking the latest attempt
  // wholesale would wipe every concept the retest stayed quiet about, and the
  // plan would think the student knows nothing.
  const history = masteryHistory([
    {
      chapterId: "ch-1",
      createdAt: day(1),
      mastery: { A: 3, B: 2, C: 3 },
    },
    // The retest: only A was probed, and A went wrong again.
    { chapterId: "ch-1", createdAt: day(5), mastery: { A: 2 } },
  ]);
  const byConcept = new Map(history.map((h) => [h.concept, h.level]));
  expect(byConcept.get("A")).toBe(2);
  expect(byConcept.get("B")).toBe(2);
  expect(byConcept.get("C")).toBe(3);
});

test("a concept name is the same concept however it is written", () => {
  const history = masteryHistory([
    { chapterId: "ch-1", createdAt: day(1), mastery: { "Cell Structure": 1 } },
    {
      chapterId: "ch-1",
      createdAt: day(2),
      mastery: { " cell structure ": 3 },
    },
  ]);
  expect(history).toHaveLength(1);
  expect(history[0]?.checks).toBe(2);
  expect(history[0]?.level).toBe(3);
});

test("the same concept in two chapters is two concepts", () => {
  // Biology and Economics can both have a "Introduction". The plan works per
  // chapter, because the chapter is what the student studies.
  const history = masteryHistory([
    { chapterId: "ch-1", createdAt: day(1), mastery: { Introduction: 3 } },
    { chapterId: "ch-2", createdAt: day(1), mastery: { Introduction: 1 } },
  ]);
  expect(history).toHaveLength(2);
  expect(studiedChapterIds(history)).toEqual(["ch-1", "ch-2"]);
});

test("an unusable level is dropped, not guessed at", () => {
  const history = masteryHistory([
    {
      chapterId: "ch-1",
      createdAt: day(1),
      mastery: {
        Good: 2,
        TooHigh: 9,
        Negative: -1,
        NotANumber: Number.NaN,
        "   ": 1,
      },
    },
  ]);
  expect(history.map((h) => h.concept)).toEqual(["Good"]);
});

test("a level is rounded to a whole one", () => {
  const history = masteryHistory([
    { chapterId: "ch-1", createdAt: day(1), mastery: { A: 2.4, B: 0.6 } },
  ]);
  const byConcept = new Map(history.map((h) => [h.concept, h.level]));
  expect(byConcept.get("A")).toBe(2);
  expect(byConcept.get("B")).toBe(1);
});

test("an attempt with no map is simply nothing", () => {
  const history = masteryHistory([
    { chapterId: "ch-1", createdAt: day(1), mastery: null },
    { chapterId: "ch-1", createdAt: day(2), mastery: undefined },
  ]);
  expect(history).toEqual([]);
});
