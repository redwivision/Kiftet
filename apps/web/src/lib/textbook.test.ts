import { expect, test } from "bun:test";
import {
  auditPageText,
  chaptersFromContents,
  type ImportSource,
  PdfUnreadableError,
  planChunks,
  segmentsForOcrBook,
  stripUndecodableGlyphs,
  tocPageOffset,
  withPartSplits,
} from "./textbook";

// A page of prose, close to what the extractor pulls off a real textbook.
function prosePage(words: number, seed = 0): string {
  const base =
    "The respiratory and circulatory systems work together to provide oxygen to the body and remove carbon dioxide from the body while the student studies the chapter carefully before the examination begins. ";
  const out: string[] = [];
  for (let i = 0; i < words; i += 1) {
    out.push(base.trim().split(" ")[(i + seed) % 24]);
  }
  return out.join(" ");
}

// The running header that survived extraction from the Grade 10 Biology
// textbook, plus a page number — six words where prose has hundreds.
const headerOnly = "Unit 5: Human Biology";

test("control characters are stripped, but line breaks survive", () => {
  // U+0014–U+001E is what a font with no Unicode map decodes to instead of
  // letters. Left in, they are what made a broken book look like a full one.
  const decoded = `\u0014\u0015\u0016${headerOnly}\u0017\u0018 47\u001a`;
  const cleaned = stripUndecodableGlyphs(decoded);
  expect(cleaned).toBe(`${headerOnly} 47`);
  expect(cleaned).not.toMatch(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the control codes are gone
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/,
  );
  // Text items are joined with newlines; dropping those would weld every
  // page into one line and break the heading detection downstream.
  expect(stripUndecodableGlyphs("a\nb\tc\rd")).toBe("a\nb\tc\rd");
});

test("a page of real prose passes", () => {
  const pages = Array.from({ length: 12 }, (_, i) => prosePage(300, i));
  const audit = auditPageText(pages);
  expect(audit.problem).toBeNull();
  expect(audit.medianWords).toBeGreaterThanOrEqual(40);
});

test("a book that is nothing but headers is rejected, however long it is", () => {
  // This is the Grade 10 Biology textbook, faithfully: 182 pages of a running
  // header. The old guard counted readable characters and asked for 1,000 —
  // this clears that with 30,000+ characters of nothing. Length cannot tell a
  // book from a book-shaped shell; density can.
  const pages = Array.from({ length: 182 }, () => `${headerOnly}\n47`);
  const audit = auditPageText(pages);
  expect(audit.readableChars).toBeGreaterThan(1_000);
  expect(audit.problem).toBe("header-only");
  expect(audit.medianWords).toBeLessThan(40);
});

test("the real textbook's numbers, as measured", () => {
  // Guard against the threshold drifting off the evidence. These are the
  // figures from the calibration run: median 27 words/page for the unreadable
  // MoE textbook, 58 for the sparsest genuinely readable PDF on hand.
  const moe = auditPageText(
    Array.from({ length: 182 }, () => `${headerOnly}\nGrade 10 Biology\n47`),
  );
  expect(moe.medianWords).toBeLessThan(40);
  const sparsestReal = auditPageText(
    Array.from({ length: 22 }, (_, i) => prosePage(58, i)),
  );
  expect(sparsestReal.problem).toBeNull();
});

test("a scanned book with no text at all says so", () => {
  expect(auditPageText(Array.from({ length: 40 }, () => "")).problem).toBe(
    "no-text",
  );
});

test("a book with a little text is too thin to study", () => {
  expect(auditPageText(["a little text", "and a little more"]).problem).toBe(
    "too-thin",
  );
});

test("an empty extraction is rejected rather than passed on", async () => {
  expect(auditPageText([]).problem).toBe("no-text");
  // A PDF that yields nothing must not reach the user as an empty chapter.
  const source: ImportSource = { kind: "text", name: "p", text: "   \n  " };
  const chunks = await planChunks(source);
  expect(chunks.length).toBeLessThanOrEqual(1);
});

test("the error carries the measurement, not just a sentence", () => {
  const audit = auditPageText(Array.from({ length: 182 }, () => headerOnly));
  const err = new PdfUnreadableError(audit);
  expect(err.reason).toBe("header-only");
  expect(err.audit.readableChars).toBe(audit.readableChars);
  expect(err.audit.medianWords).toBe(audit.medianWords);
  expect(err).toBeInstanceOf(Error);
});

test("pasted text still chunks by heading", async () => {
  const text = [
    "Unit 1 Introduction",
    prosePage(200),
    "Unit 2 Cell Structure",
    prosePage(200),
  ].join("\n");
  const chunks = await planChunks({ kind: "text", name: "pasted", text });
  expect(chunks.map((c) => c.title)).toEqual([
    "Unit 1 Introduction",
    "Unit 2 Cell Structure",
  ]);
});

// ── Finding chapters in a book whose body text cannot be extracted ──
//
// These mirror the measured structure of the Grade 10 Biology textbook, where
// 90% of characters sit in a font with no Unicode map and the readable 10% is
// unit headers plus captions. The chapter list has to come from that 10%.

test("a running header starts one chapter, not one per page", () => {
  // The real book prints "Unit One: Sub-fields of Biology" on all 15 pages of
  // Unit One. Cutting on every occurrence gives 175 one-page chunks.
  const pages = [
    "Grade 10 Biology\n47",
    ...Array.from(
      { length: 15 },
      () => "Grade 10 Biology\nUnit One: Sub-fields of Biology\n48",
    ),
    ...Array.from(
      { length: 12 },
      () => "Grade 10 Biology\nUnit Two: Plants\n63",
    ),
  ];
  const segments = segmentsForOcrBook(pages);
  expect(segments).toHaveLength(2);
  expect(segments[0].title).toBe("Unit One: Sub-fields of Biology");
  expect(segments[0].start).toBe(1);
  expect(segments[0].end).toBe(16);
  expect(segments[1].title).toBe("Unit Two: Plants");
});

test("a one-page stub is folded into the chapter it introduces", () => {
  // Pages 7 and 23 of the real book carry a truncated variant of the unit name
  // ("Unit 1: S") immediately before the full one. Cutting on both leaves a
  // chunk that is only a title page, which is not study material.
  const pages = [
    "Grade 10 Biology\n47",
    "Table of Contents\nUnit 1: S",
    "Grade 10 Biology\nUnit One: Sub-fields of Biology\n48",
    "Grade 10 Biology\nUnit One: Sub-fields of Biology\n49",
    "Grade 10 Biology\nUnit One: Sub-fields of Biology\n50",
  ];
  const segments = segmentsForOcrBook(pages);
  expect(segments).toHaveLength(1);
  // The longer of the two names is the real one.
  expect(segments[0].title).toBe("Unit One: Sub-fields of Biology");
  expect(segments[0].start).toBe(1);
  expect(segments[0].end).toBe(5);
});

test("the cover and contents before the first heading are not a chapter", () => {
  const pages = [
    "Grade 10 Biology\n1",
    "Grade 10 Biology\n2",
    "Grade 10 Biology\nUnit One: Sub-fields of Biology\n3",
    "Grade 10 Biology\nUnit One: Sub-fields of Biology\n4",
  ];
  const segments = segmentsForOcrBook(pages);
  expect(segments).toHaveLength(1);
  expect(segments[0].start).toBe(2);
});

test("a scanned book with no headings at all yields nothing to segment", () => {
  // Nothing readable means nothing to cut on — the caller falls back to even
  // page runs rather than inventing chapters.
  expect(segmentsForOcrBook(Array.from({ length: 30 }, () => ""))).toEqual([]);
});

// A recognised chapter arrives as one string that nothing has bounded yet — a
// 59-page unit of dense biology is comfortably past both the 200k character cap
// and the 256kb request body the server accepts. These are the tests that keep
// the import from dying on the biggest chapters in a real book.
test("a chapter under the cap is one part, titled as the chapter", () => {
  const parts = withPartSplits("Unit Two: Plants", "short enough");
  expect(parts).toHaveLength(1);
  expect(parts[0].title).toBe("Unit Two: Plants");
  expect(parts[0].rawText).toBe("short enough");
});

test("an oversized chapter splits into numbered parts", () => {
  const big = "word ".repeat(60_000); // ~300k chars, over the 190k cap
  const parts = withPartSplits("Unit Five: Human Biology", big);
  expect(parts.length).toBeGreaterThan(1);
  for (const [i, part] of parts.entries()) {
    expect(part.title).toBe(`Unit Five: Human Biology (part ${i + 1})`);
    expect(part.rawText.length).toBeLessThanOrEqual(190_000);
  }
});

test("split parts keep every character, so no page is silently dropped", () => {
  const big = "word ".repeat(60_000);
  const parts = withPartSplits("Unit", big);
  const rejoined = parts
    .map((p) => p.rawText)
    .join(" ")
    .replace(/\s+/g, " ");
  expect(rejoined.split(" ").filter(Boolean)).toHaveLength(
    big.split(" ").filter(Boolean).length,
  );
});

test("the split lands on a sentence boundary when one is near enough", () => {
  // A sentence end well past the 70% mark is preferred to a hard cut.
  const head = "x".repeat(140_000);
  const big = `${head}. ${"y".repeat(200_000)}`;
  const parts = withPartSplits("Unit", big);
  expect(parts.length).toBeGreaterThan(1);
  expect(parts[0].rawText.endsWith(".")).toBe(true);
});

// ────────────────────────────────────────────────────────────────
// The contents page decides the hierarchy; these tests decide the pages.
// ────────────────────────────────────────────────────────────────

test("printed page numbers are aligned to PDF pages by cross-checking headers", () => {
  // The Grade 10 Biology book: contents say the units start at printed pages
  // 1, 17, 50, 81, 94, 153; the running headers put them at 0-based PDF pages
  // 6, 22, 55, 86, 99, 158. Every pair agrees on an offset of 5.
  const chapters = [
    { unit: 1, title: "Sub-fields of Biology", page: 1, topics: [] },
    { unit: 2, title: "Plants", page: 17, topics: [] },
    { unit: 3, title: "Biochemical Molecules", page: 50, topics: [] },
    { unit: 4, title: "Cell Reproduction", page: 81, topics: [] },
    { unit: 5, title: "Human Biology", page: 94, topics: [] },
    { unit: 6, title: "Ecological Interaction", page: 153, topics: [] },
  ];
  const segments = [
    { title: "Unit One: Sub-fields of Biology", start: 6, end: 22 },
    { title: "Unit Two: Plants", start: 22, end: 55 },
    { title: "Unit 3: Biochemical Molecules", start: 55, end: 86 },
    { title: "Unit 4: Cell Reproduction", start: 86, end: 99 },
    { title: "Unit 5: Human Biology", start: 99, end: 158 },
    { title: "Unit 6: Ecological Interactions", start: 158, end: 182 },
  ];
  expect(tocPageOffset(chapters, segments)).toBe(5);
  const out = chaptersFromContents(
    chapters.map((c) => ({
      ...c,
      topics: [
        {
          kind: "section" as const,
          path: ["2", "1"],
          title: "Characteristics of plants",
          page: 17,
        },
      ],
    })),
    5,
    182,
  );
  // Derived from the contents alone — and identical to the ranges the running
  // headers produced, which is the cross-check the offset exists to make.
  expect(out?.map((c) => [c.title, c.start, c.end])).toEqual([
    ["Unit 1: Sub-fields of Biology", 6, 22],
    ["Unit 2: Plants", 22, 55],
    ["Unit 3: Biochemical Molecules", 55, 86],
    ["Unit 4: Cell Reproduction", 86, 99],
    ["Unit 5: Human Biology", 99, 158],
    ["Unit 6: Ecological Interaction", 158, 182],
  ]);
  expect(out?.[1].topics).toEqual(["2.1 Characteristics of plants"]);
});

test("an offset only two coincidences support is refused, not guessed", () => {
  const chapters = [
    { unit: 1, title: "A", page: 1, topics: [] },
    { unit: 2, title: "B", page: 2, topics: [] },
  ];
  // Both pairs point somewhere different, so no majority exists.
  expect(
    tocPageOffset(chapters, [
      { title: "x", start: 6, end: 9 },
      { title: "y", start: 20, end: 30 },
    ]),
  ).toBeNull();
  // A single agreeing pair is not a pattern either.
  expect(
    tocPageOffset(chapters, [
      { title: "x", start: 6, end: 9 },
      { title: "y", start: 30, end: 40 },
    ]),
  ).toBeNull();
});

test("a page range that runs off the book is refused rather than imported", () => {
  const chapters = [{ unit: 1, title: "A", page: 1, topics: [] }];
  expect(chaptersFromContents(chapters, 500, 182)).toBeNull();
  expect(chaptersFromContents(chapters, 5, 182)).not.toBeNull();
});

test("contents topics are attached only to the first part of a split chapter", () => {
  const parts = withPartSplits("Unit 2: Plants", "a".repeat(190_001), [
    "2.1 Characteristics of plants",
  ]);
  expect(parts.map((part) => part.topics)).toEqual([
    ["2.1 Characteristics of plants"],
    undefined,
  ]);
});
