import { describe, expect, test } from "bun:test";
import {
  UNIVERSAL_CONTENTS_CASES,
  UNIVERSAL_DETECTION_CASES,
} from "./__fixtures__/toc-universal";
import { contentsFromPages, looksLikeTocPage } from "./toc";

// The universal corpus: one contents page per shape a real textbook uses, run
// through the same reader the app runs. Where the generated corpus proves the
// three books in `docs/`, this proves the shapes they do not have — and each
// expectation was hand-checked against the page, not recorded from the parser.

describe("universal contents corpus", () => {
  for (const book of UNIVERSAL_CONTENTS_CASES) {
    test(`${book.id} · ${book.note}`, () => {
      const read = contentsFromPages(book.pages);
      if (book.expect === null) {
        expect(read).toBeNull();
        return;
      }
      expect(
        read?.chapters.map((c) => ({
          unit: c.unit,
          title: c.title,
          page: c.page,
          topics: c.topics.map((t) => ({
            path: t.path.join("."),
            title: t.title,
            page: t.page,
          })),
        })),
      ).toEqual(book.expect);
    });
  }
});

describe("universal detection corpus", () => {
  for (const page of UNIVERSAL_DETECTION_CASES) {
    test(`${page.id} · ${page.note}`, () => {
      expect(looksLikeTocPage(page.text)).toBe(page.expect);
    });
  }
});
