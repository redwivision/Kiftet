import { expect, test } from "bun:test";
import { TOC_CORPUS } from "./__fixtures__/toc-corpus";
import { contentsFromPages } from "./toc";

// The whole point of the corpus: "works on every book that has a contents" is a
// claim checked against real books, not one hand-written happy path. Each case
// replays the front-matter page text a real textbook extracts to through the
// exact reader the app runs.
for (const book of TOC_CORPUS) {
  test(`contents corpus · ${book.id}`, () => {
    const read = contentsFromPages(book.pages);
    if (book.expected === null) {
      expect(read).toBeNull();
      return;
    }
    expect(read?.chapters).toEqual(book.expected.chapters);
  });
}

test("citizenship's three-page contents is read to the end", () => {
  // The bug this corpus was built to catch: the contents run to three pages and
  // the third lists only units 7 and 8. A "stop once a page adds fewer than
  // three units" rule cut them off and the tree looked complete. Assert the
  // units and their topic counts directly, so a future stop rule cannot quietly
  // shorten the walk again.
  const citizenship = TOC_CORPUS.find((b) => b.id === "citizenship");
  if (!citizenship) throw new Error("citizenship missing from corpus");
  const read = contentsFromPages(citizenship.pages);
  expect(read?.chapters.map((c) => c.unit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(read?.chapters.map((c) => c.topics.length)).toEqual([
    6, 4, 6, 5, 5, 2, 5, 4,
  ]);
  // Unit 6 loses a topic too when the walk stops a page early ("6.2 Citizens
  // and state obligations in realizing human rights" is on the third page).
  expect(read?.chapters[5].topics.map((t) => t.title)).toContain(
    "Citizens and state obligations in realizing human rights",
  );
});

test("a scanned book declines rather than inventing a contents", () => {
  const biology = TOC_CORPUS.find((b) => b.id === "biology");
  if (!biology) throw new Error("biology missing from corpus");
  expect(contentsFromPages(biology.pages)).toBeNull();
});
