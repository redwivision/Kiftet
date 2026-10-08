/**
 * The contents read is only safe because two things hold: the model is told
 * which number it must quote back (the input's own page index, never the page
 * number printed on the line), and an answer that breaks ordering is thrown
 * away instead of fixed up. Both are pure functions, so both are locked down
 * here rather than by waiting on a live model.
 */
import { describe, expect, test } from "bun:test";

import {
  ai,
  type ContentsPage,
  contentsUserPrompt,
  parseContentsReply,
} from "./gemini";

describe("contentsUserPrompt", () => {
  const pages: ContentsPage[] = [
    { index: 3, text: "Grade 10 Biology" },
    { index: 4, text: "Contents\nUnit 1: Cells .... 6" },
  ];

  test("labels every page with the index the reply must quote back", () => {
    const prompt = contentsUserPrompt(pages);
    // The offset problem this path exists to remove: an answer quoting 4
    // means "the fifth page we sent", and the client maps it straight to a
    // PDF index with no subtraction.
    expect(prompt).toContain("[page 3]");
    expect(prompt).toContain("[page 4]");
    expect(prompt).toContain("0-based page index");
  });

  test("keeps the page text it was given", () => {
    const prompt = contentsUserPrompt(pages);
    expect(prompt).toContain("Grade 10 Biology");
    expect(prompt).toContain("Unit 1: Cells .... 6");
  });

  test("does not number the pages for the model", () => {
    // A printed page number beside a true index would be two answers to the
    // same question, and the wrong one is the one textbooks print.
    const prompt = contentsUserPrompt([{ index: 7, text: "Unit 1" }]);
    expect(prompt).not.toMatch(/\bPage 7\b/);
    expect(prompt).toContain("[page 7]");
  });
});

describe("parseContentsReply", () => {
  test("takes the book at its word when there is no contents", () => {
    expect(parseContentsReply('{"found":false,"units":[]}')).toEqual({
      found: false,
      units: [],
    });
  });

  test("reads a unit and the topics nested under it", () => {
    const out = parseContentsReply(
      JSON.stringify({
        found: true,
        units: [
          {
            number: "Unit 1",
            title: "Cells",
            pageIndex: 4,
            topics: [{ number: "1.1", title: "Cell structure", pageIndex: 5 }],
          },
        ],
      }),
    );
    expect(out?.found).toBe(true);
    expect(out?.units).toEqual([
      {
        number: "Unit 1",
        title: "Cells",
        pageIndex: 4,
        topics: [{ number: "1.1", title: "Cell structure", pageIndex: 5 }],
      },
    ]);
  });

  test("drops a unit whose page index runs backwards", () => {
    // Two units out of order means a misread line. Sorting them would invent
    // an order the book did not print; keeping them would give the client a
    // chapter whose range ends where it starts.
    const out = parseContentsReply(
      JSON.stringify({
        found: true,
        units: [
          { number: "Unit 2", title: "Plants", pageIndex: 40 },
          { number: "Unit 1", title: "Cells", pageIndex: 12 },
        ],
      }),
    );
    expect(out?.units).toHaveLength(1);
    expect(out?.units[0]?.number).toBe("Unit 2");
  });

  test("keeps two units that open on the same page", () => {
    // Real contents print a chapter that shares a page with the one above it;
    // only a strictly decreasing index is a misread.
    const out = parseContentsReply(
      JSON.stringify({
        found: true,
        units: [
          { number: "Unit 1", title: "Cells", pageIndex: 12 },
          { number: "Unit 2", title: "Plants", pageIndex: 12 },
        ],
      }),
    );
    expect(out?.units).toHaveLength(2);
  });

  test("rejects a page index that is not a whole number at or above zero", () => {
    for (const pageIndex of [-1, 3.5, Number.NaN, "6", null]) {
      const out = parseContentsReply(
        JSON.stringify({
          found: true,
          units: [{ number: "Unit 1", title: "Cells", pageIndex }],
        }),
      );
      expect(out?.units).toEqual([]);
    }
  });

  test("drops a topic that falls before its unit or out of reading order", () => {
    const out = parseContentsReply(
      JSON.stringify({
        found: true,
        units: [
          {
            number: "Unit 1",
            title: "Cells",
            pageIndex: 10,
            topics: [
              { number: "1.0", title: "Before the unit", pageIndex: 4 },
              { number: "1.1", title: "Cell structure", pageIndex: 12 },
              { number: "1.2", title: "Out of order", pageIndex: 11 },
              { number: "1.3", title: "Back inside", pageIndex: 15 },
            ],
          },
        ],
      }),
    );
    // One misread line early on costs everything after it in that unit: a
    // contents whose topics run backwards is not a contents, and rebuilding
    // the order would be inventing one. The client does its own check against
    // the next unit's page, which this side cannot see yet.
    expect(out?.units[0]?.topics.map((t) => t.title)).toEqual([
      "Cell structure",
      "Back inside",
    ]);
  });

  test("a topic may open on the same page as its unit", () => {
    const out = parseContentsReply(
      JSON.stringify({
        found: true,
        units: [
          {
            number: "Unit 1",
            title: "Cells",
            pageIndex: 10,
            topics: [{ number: "1.1", title: "Cell structure", pageIndex: 10 }],
          },
        ],
      }),
    );
    expect(out?.units[0]?.topics).toHaveLength(1);
  });

  test("keeps a long contents but not an endless one", () => {
    const units = Array.from({ length: 400 }, (_, i) => ({
      number: `Unit ${i + 1}`,
      title: `Unit ${i + 1}`,
      pageIndex: i,
    }));
    expect(
      parseContentsReply(JSON.stringify({ found: true, units }))?.units,
    ).toHaveLength(40);
  });

  test("does not invent a contents from a reply it cannot read", () => {
    expect(parseContentsReply("not json")).toBeNull();
    expect(parseContentsReply('{"units":[]}')).toBeNull();
    expect(parseContentsReply('{"found":"yes","units":[]}')).toBeNull();
    // `found: true` with a units field that is not a list is a broken shape,
    // not an empty contents — the caller should treat it as a failed read.
    expect(parseContentsReply('{"found":true,"units":"Unit 1"}')).toBeNull();
  });

  test("returns no units rather than a contents made of unusable lines", () => {
    const out = parseContentsReply(
      JSON.stringify({
        found: true,
        units: [
          { number: "Unit 1", title: "", pageIndex: 3 },
          { title: "", pageIndex: 4 },
        ],
      }),
    );
    expect(out).toEqual({ found: false, units: [] });
  });

  test("survives a reply wrapped in markdown fences", () => {
    const out = parseContentsReply('```json\n{"found":false,"units":[]}\n```');
    expect(out).toEqual({ found: false, units: [] });
  });
});

describe("ai.parseContents", () => {
  test("without a model key the answer says so, instead of blaming the book", async () => {
    // CI has no key, and this must not be a failure: the client still falls
    // back to the heading scan, but the reason travels with the refusal so the
    // screen can say the list is a guess because nothing was asked — not that
    // the book has no contents. It must also not reach the network.
    const out = await ai.parseContents([{ index: 0, text: "Contents" }]);
    expect(out.found).toBe(false);
    expect(out.units).toEqual([]);
    expect(out.refused).toMatch(/not configured/i);
  });

  test("nothing to read is not a call worth making", async () => {
    expect(await ai.parseContents([])).toEqual({
      found: false,
      units: [],
    });
  });
});
