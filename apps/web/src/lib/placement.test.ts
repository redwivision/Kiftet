import { expect, test } from "bun:test";
import {
  hasPosition,
  type PlacementState,
  shouldAskPlacement,
} from "./placement";

function state(overrides: {
  books?: PlacementState["books"];
  dismissed?: boolean;
}): PlacementState {
  return {
    preferences: {
      reviewPreference: "light",
      examDate: null,
      dailyMinutes: 20,
      placementDismissed: overrides.dismissed ?? false,
    },
    books: overrides.books ?? [],
  };
}

const bookWithChapter: PlacementState["books"][number] = {
  id: "book-1",
  title: "Biology Grade 12",
  subject: "Biology",
  currentChapterId: null,
  currentTopicPath: null,
  chapters: [{ id: "ch-1", title: "Unit 1: Cells", topics: [] }],
};

const bookWithoutChapter: PlacementState["books"][number] = {
  ...bookWithChapter,
  chapters: [],
};

test("the question is asked when there is somewhere to be placed", () => {
  expect(shouldAskPlacement(state({ books: [bookWithChapter] }))).toBe(true);
});

test("the question is not asked twice", () => {
  // The student has already said where they are.
  expect(
    shouldAskPlacement(
      state({
        books: [{ ...bookWithChapter, currentChapterId: "ch-1" }],
      }),
    ),
  ).toBe(false);
});

test("'not now' is an answer, and it is honoured", () => {
  // A nag is worse than a wrong default, so a dismissal is recorded and kept.
  expect(
    shouldAskPlacement(state({ books: [bookWithChapter], dismissed: true })),
  ).toBe(false);
});

test("a book with no chapters yet is not a place to be placed in", () => {
  // The book has been imported but not ingested. There is no chapter to point
  // at, so the question stays away until there is one.
  expect(shouldAskPlacement(state({ books: [bookWithoutChapter] }))).toBe(
    false,
  );
  // But one book with chapters is enough, even if another has none.
  expect(
    shouldAskPlacement(state({ books: [bookWithoutChapter, bookWithChapter] })),
  ).toBe(true);
});

test("a student with no book has no position, and no prompt", () => {
  expect(hasPosition(state({ books: [] }))).toBe(false);
  expect(shouldAskPlacement(state({ books: [] }))).toBe(false);
  // Nothing loaded yet is not an answer either way.
  expect(shouldAskPlacement(null)).toBe(false);
});
