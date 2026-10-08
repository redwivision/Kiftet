import { describe, expect, test } from "bun:test";
import {
  auditPageText,
  chaptersFromContents,
  chaptersFromOutline,
  contentsProbe,
  type ImportChunk,
  type ImportSource,
  importTocTree,
  indexToc,
  isSelectableTopic,
  type ModelReadOutcome,
  numberDepth,
  offsetByTitle,
  PdfUnreadableError,
  planChunks,
  segmentsForOcrBook,
  splitTocNumber,
  stripUndecodableGlyphs,
  TOC_PROBE_CHARS,
  TOC_PROBE_MAX_PAGES,
  TOC_PROBE_MIN_CHARS,
  TOC_PROBE_PAGE_CHARS,
  textLayerReader,
  tocJobs,
  tocPageOffset,
  transcribeModelContents,
  visibleChapterTitle,
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

// The book the user described: 6 units, topics, and sub-topics under those.
function sixUnitBook(): ImportChunk[] {
  return [
    {
      title: "Unit 1: Cells",
      rawText: "",
      pages: { start: 3, end: 20 },
      needsOcr: true,
      topics: [
        { path: "1.1 Cell structure", title: "Cell structure", page: 4 },
        {
          path: "1.1 · 1.1.1 The nucleus",
          title: "The nucleus",
          page: 6,
        },
        {
          path: "1.1 · 1.1.2 The cell membrane",
          title: "The cell membrane",
          page: 8,
        },
        { path: "1.2 Cell division", title: "Cell division", page: 12 },
      ],
    },
    {
      title: "Unit 2: Plants",
      rawText: "",
      pages: { start: 20, end: 55 },
      needsOcr: true,
      topics: [
        {
          path: "2.1 Characteristics of plants",
          title: "Characteristics of plants",
          page: 21,
        },
        {
          path: "2.2 Structure and function of plant parts",
          title: "Structure and function of plant parts",
          page: 30,
        },
      ],
    },
    {
      title: "Unit 3: Biochemical Molecules",
      rawText: "",
      pages: { start: 55, end: 86 },
      needsOcr: true,
    },
    {
      title: "Unit 4: Cell Reproduction",
      rawText: "",
      pages: { start: 86, end: 99 },
      needsOcr: true,
    },
    {
      title: "Unit 5: Human Biology",
      rawText: "",
      pages: { start: 99, end: 158 },
      needsOcr: true,
    },
    {
      title: "Unit 6: Ecological Interaction",
      rawText: "",
      pages: { start: 158, end: 182 },
      needsOcr: true,
    },
  ];
}

test("all 6 units of a 6-unit book are offered, and each keeps its own topics", () => {
  const toc = importTocTree(sixUnitBook());
  expect(toc).toHaveLength(6);
  expect(toc.map((unit) => splitTocNumber(unit.title).number)).toEqual([
    "Unit 1",
    "Unit 2",
    "Unit 3",
    "Unit 4",
    "Unit 5",
    "Unit 6",
  ]);
  // A unit the book listed no topics for is still a chapter worth studying, so it
  // must not be dropped from the tree the way an empty unit used to be.
  expect(toc[2]?.children).toEqual([]);
  const index = indexToc(toc);
  expect(index.total).toBe(6 + 4 + 2);
  expect(index.descendants.get(toc[0]?.id ?? "")).toBe(4);
});

test("a sub-topic's pages stop where the next sibling starts, not at its parent", () => {
  const toc = importTocTree(sixUnitBook());
  const cell = toc[0];
  const structure = cell?.children[0];
  const nucleus = structure?.children[0];
  const membrane = structure?.children[1];
  const division = cell?.children[1];

  // 1.1 Cell structure runs from its own page to the page of 1.2 — not to the
  // page of its own first child, which would end the unit at page 6.
  expect(structure?.start).toBe(4);
  expect(structure?.end).toBe(12);
  // Each sub-topic stops at the next sub-topic.
  expect(nucleus?.start).toBe(6);
  expect(nucleus?.end).toBe(8);
  expect(membrane?.start).toBe(8);
  // The last topic in a unit runs to the unit's last page.
  expect(division?.start).toBe(12);
  expect(division?.end).toBe(20);
});

test("the contents number is split out so titles line up like a contents page", () => {
  expect(splitTocNumber("Unit 2: Plants")).toEqual({
    number: "Unit 2",
    label: "Plants",
  });
  expect(splitTocNumber("2.3.1 The internal structure of a leaf")).toEqual({
    number: "2.3.1",
    label: "The internal structure of a leaf",
  });
  // A line the book never numbered keeps its whole text as the title.
  expect(splitTocNumber("Review questions")).toEqual({
    number: null,
    label: "Review questions",
  });
  // Depth comes from the number, which is what a contents page is read by.
  expect(numberDepth("Unit 2: Plants")).toBe(1);
  expect(numberDepth("2.3 Structure")).toBe(2);
  expect(numberDepth("2.3.1 The internal structure of a leaf")).toBe(3);
});

test("ticking a topic imports that topic's pages, under its unit's name", () => {
  const toc = importTocTree(sixUnitBook());
  const nucleus = toc[0]?.children[0]?.children[0];
  const jobs = tocJobs(toc, new Set([nucleus?.id ?? ""]));
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    kind: "topic",
    number: "1.1.1",
    pages: { start: 6, end: 8 },
  });
  // The job carries the unit as well as the topic. The chapter gets titled
  // "Unit 1: Cells · 1.1.1 The nucleus": a chapter called only "1.1.1 The
  // nucleus" would land on the shelf with no way to tell which of the six units
  // it came from.
  expect(jobs[0]?.kind === "topic" && jobs[0].unit).toBe("Unit 1: Cells");
  expect(jobs[0]?.title).toBe("1.1.1 The nucleus");
});

test("ticking a unit brings its topics with it rather than reading pages twice", () => {
  const toc = importTocTree(sixUnitBook());
  const unit = toc[0];
  const nucleus = unit?.children[0]?.children[0];
  // The whole unit is ticked, and so is one of its sub-topics.
  const jobs = tocJobs(toc, new Set([unit?.id ?? "", nucleus?.id ?? ""]));
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ kind: "unit", chunkIndexes: [0] });
});

test("several topics in one unit import as several chapters of their own", () => {
  const toc = importTocTree(sixUnitBook());
  const cell = toc[0];
  const structure = cell?.children[0];
  const nucleus = structure?.children[0];
  const division = cell?.children[1];
  const jobs = tocJobs(toc, new Set([nucleus?.id ?? "", division?.id ?? ""]));
  expect(jobs.map((job) => job.kind)).toEqual(["topic", "topic"]);
  expect(jobs[0]).toMatchObject({ pages: { start: 6, end: 8 } });
  expect(jobs[1]).toMatchObject({ pages: { start: 12, end: 20 } });
});

test("a topic with no page range cannot be ticked on its own", () => {
  const toc = importTocTree([
    {
      title: "Unit 1: Cells",
      rawText: "",
      pages: { start: 3, end: 20 },
      // A heading the book gave a number but no page for.
      topics: [
        { path: "1.1 Cell structure", title: "Cell structure", page: null },
      ],
    },
  ]);
  const topic = toc[0]?.children[0];
  expect(topic?.start).toBeNull();
  expect(isSelectableTopic(topic ?? ({} as never))).toBe(false);
  // Ticking it falls through to its children rather than silently importing
  // nothing, which is what a checkbox that appears to work but does not would do.
  expect(tocJobs(toc, new Set([topic?.id ?? ""]))).toEqual([]);
});

test("a tick inside a unit is read as that unit's chapters, in order", () => {
  const toc = importTocTree([
    { title: "Unit 1 (part 1)", parentTitle: "Unit 1", rawText: "one" },
    { title: "Unit 1 (part 2)", parentTitle: "Unit 1", rawText: "two" },
  ]);
  expect(tocJobs(toc, new Set([toc[0]?.id ?? ""]))[0]).toMatchObject({
    kind: "unit",
    chunkIndexes: [0, 1],
  });
});

test("the user-facing table of contents preserves nested topic hierarchy", () => {
  const toc = importTocTree([
    {
      title: "Unit 1: Cells",
      rawText: "",
      pages: { start: 3, end: 15 },
      topics: [
        { path: "1.1 Cell structure", title: "Cell structure", page: 4 },
        {
          path: "1.1 · 1.1.1 The nucleus",
          title: "The nucleus",
          page: 6,
        },
        { path: "1.2 Cell division", title: "Cell division", page: 10 },
      ],
    },
  ]);

  expect(toc).toHaveLength(1);
  expect(toc[0]?.title).toBe("Unit 1: Cells");
  expect(toc[0]?.start).toBe(3);
  expect(toc[0]?.end).toBe(15);
  expect(toc[0]?.children.map((node) => node.title)).toEqual([
    "1.1 Cell structure",
    "1.2 Cell division",
  ]);
  expect(toc[0]?.children[0]?.children[0]?.title).toBe("1.1.1 The nucleus");
});

test("internal text-size splits stay grouped under one visible chapter", () => {
  const toc = importTocTree([
    {
      title: "Unit 1 (part 1)",
      parentTitle: "Unit 1",
      rawText: "first part",
    },
    {
      title: "Unit 1 (part 2)",
      parentTitle: "Unit 1",
      rawText: "second part",
    },
  ]);

  expect(toc).toHaveLength(1);
  expect(toc[0]?.title).toBe("Unit 1");
  expect(toc[0]?.chunkIndexes).toEqual([0, 1]);
});

test("internal split titles are hidden from students", () => {
  expect(visibleChapterTitle("Unit 1 (part 2)")).toEqual({
    title: "Unit 1",
    section: 2,
  });
});

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
  // Starting on the contents page would read the contents as part of the unit,
  // and would shift this unit's range against the offset the topics are placed
  // by — so the chapter starts where the unit does.
  expect(segments[0].start).toBe(2);
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

test("a running header that carries its own page number is still one chapter", () => {
  // Plenty of textbooks set the unit name and the page number on one line, so
  // every page's header is a different string. Cutting on those differences
  // turned a two-unit book into eleven chapters, most of them the same unit
  // again — and, because that scan is what the contents page is checked
  // against, it also cost the book every topic it had.
  const page = (header: string, n: number) =>
    `${header} ${n}\n${prosePage(30, n)}`;
  const pages = [
    "Grade 11 Biology",
    "Student Book",
    "Contents\nUnit 3: Cell Reproduction ....... 3",
    ...Array.from({ length: 13 }, (_, i) =>
      page("Unit 3: Cell Reproduction", 3 + i),
    ),
    ...Array.from({ length: 9 }, (_, i) =>
      page("Unit 4: Human Biology", 16 + i),
    ),
  ];
  const segments = segmentsForOcrBook(pages);
  expect(segments).toHaveLength(2);
  // The page number is not part of the unit's name.
  expect(segments[0].title).toBe("Unit 3: Cell Reproduction");
  expect(segments[0].start).toBe(3);
  expect(segments[0].end).toBe(16);
  expect(segments[1].title).toBe("Unit 4: Human Biology");
  expect(segments[1].start).toBe(16);
});

test("a book whose first unit starts on page 1 still keeps that unit", () => {
  // Page 0 is treated as front matter, so this unit is found one page in. It
  // used to disappear entirely: the heading on page 0 was refused, but still
  // recorded as the header "in force", so every page that followed matched it
  // and was skipped as a repeat.
  const pages = [
    ...Array.from(
      { length: 6 },
      (_, i) => `Unit One: Sub-fields of Biology ${2 + i}\n${prosePage(30, i)}`,
    ),
  ];
  const segments = segmentsForOcrBook(pages);
  expect(segments).toHaveLength(1);
  expect(segments[0].title).toBe("Unit One: Sub-fields of Biology");
  expect(segments[0].start).toBe(1);
});

test("page-numbered headers no longer cost the book its topics", () => {
  // The whole point of the heading scan is to locate the units well enough to
  // translate the printed page numbers the contents states. Scan twice as many
  // chapters as the book has units and that translation fails, the contents is
  // discarded, and a student sees every unit with nothing under it.
  const page = (header: string, n: number) =>
    `${header} ${n}\n${prosePage(30, n)}`;
  // Three pages of front matter, then two units whose printed page numbers
  // equal their page indices — so the offset a correct scan finds is 0.
  const pages = [
    "Grade 11 Biology",
    "Student Book",
    "Contents\nUnit 3: Cell Reproduction ....... 3\n3.1 The cell cycle ....... 5",
    ...Array.from({ length: 13 }, (_, i) =>
      page("Unit 3: Cell Reproduction", 3 + i),
    ),
    ...Array.from({ length: 9 }, (_, i) =>
      page("Unit 4: Human Biology", 16 + i),
    ),
  ];
  const chapters = [
    {
      unit: 3,
      title: "Cell Reproduction",
      page: 3,
      topics: [
        {
          kind: "section" as const,
          path: ["3", "1"],
          title: "The cell cycle",
          page: 5,
        },
        {
          kind: "section" as const,
          path: ["3", "2"],
          title: "Meiosis",
          page: 9,
        },
      ],
    },
    {
      unit: 4,
      title: "Human Biology",
      page: 16,
      topics: [
        {
          kind: "section" as const,
          path: ["4", "1"],
          title: "The human body",
          page: 18,
        },
      ],
    },
  ];
  const segments = segmentsForOcrBook(pages);
  expect(segments).toHaveLength(2);
  const offset = tocPageOffset(chapters, segments);
  expect(offset).toBe(0);
  const built = chaptersFromContents(chapters, offset ?? -1, pages.length);
  expect(built).not.toBeNull();
  expect(built?.[0].start).toBe(3);
  expect(built?.[0].end).toBe(16);
  expect(built?.[0].topics).toHaveLength(2);
  expect(built?.[0].topics[0].path).toBe("3.1 The cell cycle");
});

test("a unit printed short and long on successive pages is still one chapter", () => {
  // Grade 10 Economics carries "Unit 5" at the top of a page and
  // "Unit 5: Banking and Finance" a page later, alternating for a dozen
  // pages. Keying headings on the bare number — not the running text — keeps
  // both spellings under one chapter instead of shredding the book into a
  // fragment per page.
  const page = (header: string, n: number) =>
    `${header} ${n}\n${prosePage(30, n)}`;
  const pages = [
    "Grade 10 Economics",
    "Contents\nUnit 5: Banking and Finance ....... 20",
    ...Array.from({ length: 8 }, (_, i) =>
      page("Unit 5: Banking and Finance", 20 + i),
    ),
    ...Array.from({ length: 6 }, (_, i) => page("Unit 5", 28 + i)),
    ...Array.from({ length: 4 }, (_, i) =>
      page("Unit 5: Banking and Finance", 34 + i),
    ),
  ];
  const segments = segmentsForOcrBook(pages);
  expect(segments).toHaveLength(1);
  expect(segments[0].title).toBe("Unit 5: Banking and Finance");
  expect(segments[0].start).toBe(2);
  expect(segments[0].end).toBe(pages.length);
});

test("a unit that opens on the book's first page keeps its place at the top", () => {
  // A book whose bookmarks point Unit 1 at page 0. Dropping that entry as
  // "front matter" leaves one top-level unit, one too few to trust the top
  // level, and the whole tree is then built from 1.1/1.2/2.1 — the units
  // vanish and the student's contents shows no units at all.
  const pages = Array.from({ length: 12 }, (_, i) => prosePage(120, i));
  const outline = [
    { title: "Unit 1: Cells", path: "Unit 1: Cells", pageIndex: 0 },
    {
      title: "1.1 Cell structure",
      path: "Unit 1: Cells · 1.1 Cell structure",
      pageIndex: 1,
    },
    {
      title: "1.1.1 The nucleus",
      path: "Unit 1: Cells · 1.1 Cell structure · 1.1.1 The nucleus",
      pageIndex: 2,
    },
    {
      title: "1.2 Cell division",
      path: "Unit 1: Cells · 1.2 Cell division",
      pageIndex: 7,
    },
    { title: "Unit 2: Plants", path: "Unit 2: Plants", pageIndex: 9 },
    {
      title: "2.1 Characteristics of plants",
      path: "Unit 2: Plants · 2.1 Characteristics of plants",
      pageIndex: 10,
    },
  ];
  const chunks = chaptersFromOutline(pages, outline);
  expect(chunks?.map((c) => c.title)).toEqual([
    "Unit 1: Cells",
    "Unit 2: Plants",
  ]);
  // Everything nested under a unit stays under it. The path carries the depth,
  // which is how a third-level idea is told from a first-level one.
  expect(chunks?.[0].topics?.map((t) => t.path)).toEqual([
    "1.1 Cell structure",
    "1.1 Cell structure · 1.1.1 The nucleus",
    "1.2 Cell division",
  ]);
  const tree = importTocTree(chunks ?? []);
  expect(tree.map((n) => n.title)).toEqual(["Unit 1: Cells", "Unit 2: Plants"]);
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
  // The page is carried through as a PDF page index — 17 printed + 5 offset.
  expect(out?.[1].topics).toEqual([
    {
      path: "2.1 Characteristics of plants",
      title: "Characteristics of plants",
      page: 22,
    },
  ]);
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
    { path: "2.1 Characteristics of plants", title: "2.1", page: 22 },
  ]);
  expect(parts.map((part) => part.topics?.map((topic) => topic.path))).toEqual([
    ["2.1 Characteristics of plants"],
    undefined,
  ]);
});

test("a chapter's page span survives the split, so a topic's range has an end", () => {
  // The span is what the contents tree stops a topic at. Without it the last
  // topic of a unit came out a page short of the unit's own last page.
  const topics = [
    { path: "1.2 Cell division", title: "1.2 Cell division", page: 8 },
  ];
  const [one] = withPartSplits("Unit 1: Cells", "a".repeat(1_000), topics, {
    start: 1,
    end: 10,
  });
  expect(one?.pages).toEqual({ start: 1, end: 10 });
  const tree = one ? importTocTree([one]) : [];
  expect(tree[0]?.start).toBe(1);
  expect(tree[0]?.end).toBe(10);
  expect(tree[0]?.children[0]?.end).toBe(10);
  // Every part of a split carries the chapter's span, so a part does not look
  // like it ends where the chapter does.
  const split = withPartSplits(
    "Unit 1: Cells",
    "a".repeat(380_001),
    undefined,
    {
      start: 1,
      end: 10,
    },
  );
  expect(split.length).toBeGreaterThan(1);
  expect(split.filter((part) => part.pages?.end === 10)).toHaveLength(
    split.length,
  );
});

test("a readable book still serves a topic's own pages, and nothing beside them", async () => {
  // The text layer was already read during planning, so there is no document
  // left to open — but "1.1.1 The nucleus" is pages 6 to 8 of a chapter that is,
  // and a student who ticks the sub-topic wants those three pages.
  const pages = Array.from({ length: 10 }, (_, i) => `page ${i}`);
  const reader = textLayerReader(pages);
  const slice = await reader.read({
    title: "Unit 1: Cells · 1.1.1 The nucleus",
    rawText: "",
    pages: { start: 6, end: 9 },
    needsOcr: true,
  });
  expect(slice).toBe("page 6\n\npage 7\n\npage 8");
  expect(
    reader.isComplete({
      title: "1.1.1 The nucleus",
      rawText: "",
      pages: { start: 6, end: 9 },
      needsOcr: true,
    }),
  ).toBe(true);
  // A chapter that already carries its own text is served from that text.
  expect(
    await reader.read({
      title: "Unit 1: Cells",
      rawText: "the whole unit",
      pages: { start: 3, end: 20 },
    }),
  ).toBe("the whole unit");
  // And a range past the last page is clipped, not padded with nothing.
  expect(
    await reader.read({
      title: "Unit 6: Ecological Interaction",
      rawText: "",
      pages: { start: 9, end: 40 },
    }),
  ).toBe("page 9");
});

// ─── Reading the contents with the model ────────────────────────────────
//
// The browser cannot be exercised end to end here — `planImport` opens a real
// PDF through the viewer — so these cover the pieces it is assembled from:
// what is worth sending, how a verbatim transcript is parsed by the same
// reader the deterministic path uses, and how the printed numbers it copies
// are measured against the book's own pages.

/** A chapter as parseToc groups one unit, for the anchor-vote fixtures. */
function chapterOf(unit: number, title: string, page: number) {
  return { unit, title, page, topics: [] };
}

describe("contentsProbe", () => {
  test("skips blank front matter instead of spending the budget on it", () => {
    const probe = contentsProbe(["", "   ", "real text ".repeat(300)]);
    expect(probe.pages).toHaveLength(1);
    expect(probe.pages[0]?.index).toBe(2);
  });

  test("stops looking once the probe budget runs out", () => {
    const pages = Array.from({ length: 100 }, () => "x".repeat(600));
    const probe = contentsProbe(pages);
    expect(probe.pages).toHaveLength(TOC_PROBE_MAX_PAGES);
    expect(probe.pages.at(-1)?.index).toBe(TOC_PROBE_MAX_PAGES - 1);
  });

  test("cuts one illustration-heavy page so it cannot eat the whole budget", () => {
    const probe = contentsProbe(["y".repeat(9000)]);
    expect(probe.pages).toHaveLength(1);
    expect(probe.pages[0]?.text).toHaveLength(TOC_PROBE_PAGE_CHARS);
  });

  test("never sends more text than the budget allows", () => {
    const pages = Array.from({ length: 100 }, () => "x".repeat(2000));
    const probe = contentsProbe(pages);
    const total = probe.pages.reduce((n, page) => n + page.text.length, 0);
    expect(total).toBeGreaterThan(0);
    // It may overshoot by the one page that put it over, and no further.
    expect(total).toBeLessThanOrEqual(TOC_PROBE_CHARS + TOC_PROBE_PAGE_CHARS);
    expect(probe.pages.length).toBeLessThan(pages.length);
  });

  test("a text layer too thin to hold a contents sends nothing", () => {
    expect(contentsProbe(["too short to be a contents page"]).pages).toEqual(
      [],
    );
    expect(contentsProbe(["", "", ""]).pages).toEqual([]);
    expect(contentsProbe([]).pages).toEqual([]);
    expect(TOC_PROBE_MIN_CHARS).toBeGreaterThan(0);
  });
});

describe("offsetByTitle", () => {
  /** A book whose pages are prose, with a header naming a unit at its start. */
  function bookWithHeaders(headers: Record<number, string>): string[] {
    return Array.from({ length: 30 }, (_, i) =>
      headers[i] ? `${headers[i]}\n${prosePage(60, i)}` : prosePage(60, i),
    );
  }

  test("measures the offset from the pages that name each unit", () => {
    const pages = bookWithHeaders({ 5: "Unit 1: Cells", 14: "Unit 2: Plants" });
    expect(
      offsetByTitle(
        [chapterOf(1, "Cells", 3), chapterOf(2, "Plants", 12)],
        pages,
      ),
    ).toBe(2);
  });

  test("one exact header naming a unit is enough to place the book", () => {
    const pages = bookWithHeaders({ 7: "Unit 1: Cells" });
    expect(offsetByTitle([chapterOf(1, "Cells", 5)], pages)).toBe(2);
  });

  test("a contents page does not vote for its own placement", () => {
    // The listing names every unit — on the contents page. Letting it vote
    // would always "confirm" an offset of roughly minus the front matter.
    const pages = bookWithHeaders({
      3: "Contents\nUnit 1: Cells .... 3\nUnit 2: Plants .... 12",
    });
    expect(
      offsetByTitle(
        [chapterOf(1, "Cells", 3), chapterOf(2, "Plants", 12)],
        pages,
      ),
    ).toBeNull();
  });

  test("a line ending in a page number is a listing, not a header", () => {
    const pages = bookWithHeaders({ 5: "Unit 1: Cells 3" });
    expect(offsetByTitle([chapterOf(1, "Cells", 3)], pages)).toBeNull();
  });

  test("wording that differs but names the same title still agrees", () => {
    // The Grade 10 Biology split: contents say "Cells", the running header
    // says "Unit 2: Plants" — the title is what both share.
    const pages = bookWithHeaders({ 14: "Unit Two: Plants" });
    expect(offsetByTitle([chapterOf(2, "Plants", 12)], pages)).toBe(2);
  });

  test("an Amharic header names its unit the same way", () => {
    const pages = bookWithHeaders({ 8: "ምዕራፍ ፪ እህል" });
    expect(offsetByTitle([chapterOf(2, "እህል", 5)], pages)).toBe(3);
  });

  test("a printed page ahead of the book it points into is refused", () => {
    // Header at physical 5, contents claiming the unit is printed on 20: the
    // only offset on offer is negative, which cannot be a placement.
    const pages = bookWithHeaders({ 5: "Unit 1: Cells" });
    expect(offsetByTitle([chapterOf(1, "Cells", 20)], pages)).toBeNull();
  });

  test("a book that never names its chapters outside the contents", () => {
    const pages = Array.from({ length: 30 }, (_, i) => prosePage(60, i));
    expect(
      offsetByTitle(
        [chapterOf(1, "Cells", 3), chapterOf(2, "Plants", 12)],
        pages,
      ),
    ).toBeNull();
  });

  test("the title merely mentioned inside another heading is not a placement", () => {
    // Weight 1 only — one stray "photosynthesis" inside an exercise heading
    // must not place a chapter by itself.
    const pages = bookWithHeaders({
      9: "Part I: Choose the best answer about plants",
    });
    expect(offsetByTitle([chapterOf(2, "plants", 12)], pages)).toBeNull();
  });
});

describe("transcribeModelContents", () => {
  const probe = { pages: [{ index: 0, text: "Contents" }] };
  // Printed 3 and 12, with the units' headers at physical pages 5 and 14 —
  // a two-page offset the anchor votes can measure.
  const pages = Array.from({ length: 30 }, (_, i) =>
    i === 5
      ? `Unit 1: Cells\n${prosePage(60, i)}`
      : i === 14
        ? `Unit 2: Plants\n${prosePage(60, i)}`
        : prosePage(60, i),
  );
  const transcript = "Unit 1: Cells .... 3\nUnit 2: Plants .... 12";

  test("does not spend a call when there is nothing worth sending", async () => {
    let called = false;
    const out = await transcribeModelContents(
      async () => {
        called = true;
        return { text: transcript };
      },
      { pages: [] },
      pages,
      30,
    );
    expect(out).toBeNull();
    expect(called).toBe(false);
  });

  test("keeps a reading the client can place in the book", async () => {
    const out = await transcribeModelContents(
      async () => ({ text: transcript }),
      probe,
      pages,
      30,
    );
    expect(out?.units).toEqual([
      { number: "1", title: "Cells", page: 3 },
      { number: "2", title: "Plants", page: 12 },
    ]);
    expect(out?.chapters.map((c) => c.title)).toEqual([
      "Unit 1: Cells",
      "Unit 2: Plants",
    ]);
    // The printed numbers land where the book names the units.
    expect(out?.chapters.map((c) => [c.start, c.end])).toEqual([
      [5, 14],
      [14, 30],
    ]);
  });

  test("topics under a unit are parsed by the same reader the book gets", async () => {
    const withTopics = [
      "Unit 1: Cells .... 3",
      "1.1 Cell structure .... 4",
      "1.2 Cell function .... 8",
      "Unit 2: Plants .... 12",
    ].join("\n");
    const out = await transcribeModelContents(
      async () => ({ text: withTopics }),
      probe,
      pages,
      30,
    );
    expect(out?.chapters[0]?.topics.map((t) => t.path)).toEqual([
      "1.1 Cell structure",
      "1.2 Cell function",
    ]);
    expect(out?.chapters[0]?.topics.map((t) => t.page)).toEqual([6, 10]);
  });

  test("a contents the model did not find falls back quietly", async () => {
    expect(
      await transcribeModelContents(
        async () => ({ text: "" }),
        probe,
        pages,
        30,
      ),
    ).toBeNull();
    expect(
      await transcribeModelContents(async () => null, probe, pages, 30),
    ).toBeNull();
  });

  test("a call that throws reaches the heading scan, not the screen", async () => {
    const outcome: ModelReadOutcome = { reason: null };
    const out = await transcribeModelContents(
      async () => {
        throw new Error("429 rate limited");
      },
      probe,
      pages,
      30,
      outcome,
    );
    expect(out).toBeNull();
    expect(outcome.reason).toMatch(/429/i);
  });

  test("records why a refused reading was not used", async () => {
    const outcome: ModelReadOutcome = { reason: null };
    const out = await transcribeModelContents(
      async () => ({
        text: "",
        refused: "the reader is out of requests for this minute",
      }),
      probe,
      pages,
      30,
      outcome,
    );
    expect(out).toBeNull();
    expect(outcome.reason).toBe(
      "the reader is out of requests for this minute",
    );
  });

  test("a reading the book's pages will not confirm is refused", async () => {
    // Printed 999 and 999: the headers at 5 and 14 name the units, but every
    // offset on offer is negative — the same circular trap the old check
    // sprang, now resolved against the pages themselves.
    const outcome: ModelReadOutcome = { reason: null };
    const out = await transcribeModelContents(
      async () => ({ text: "Unit 1: Cells .... 999\nUnit 2: Plants .... 999" }),
      probe,
      pages,
      30,
      outcome,
    );
    expect(out).toBeNull();
    expect(outcome.reason).toMatch(/printed page numbers/i);
  });

  test("a single unit does not earn the right to replace the heading scan", async () => {
    const outcome: ModelReadOutcome = { reason: null };
    const out = await transcribeModelContents(
      async () => ({ text: "Unit 1: Cells .... 3" }),
      probe,
      pages,
      30,
      outcome,
    );
    expect(out).toBeNull();
    expect(outcome.reason).toMatch(/fewer than two units/i);
  });

  test("chapters the book calls Chapter or Lesson are read, not discarded", async () => {
    const out = await transcribeModelContents(
      async () => ({
        text: "Chapter 1: Cells .... 3\nChapter 2: Plants .... 12",
      }),
      probe,
      pages,
      30,
    );
    expect(out?.chapters.map((c) => [c.title, c.start, c.end])).toEqual([
      ["Unit 1: Cells", 5, 14],
      ["Unit 2: Plants", 14, 30],
    ]);
  });

  test("chapters numbered the plain way are read, not discarded", async () => {
    // No unit word at all: "1. Cells", "2. Plants". The strict reader sees
    // two orphan sections and drops them; the loose reader knows a contents
    // the model transcribed is worth reading however it is numbered.
    const out = await transcribeModelContents(
      async () => ({ text: "1. Cells .... 3\n2. Plants .... 12" }),
      probe,
      pages,
      30,
    );
    expect(out?.units).toEqual([
      { number: "1", title: "Cells", page: 3 },
      { number: "2", title: "Plants", page: 12 },
    ]);
    expect(out?.chapters.map((c) => [c.start, c.end])).toEqual([
      [5, 14],
      [14, 30],
    ]);
  });

  test("a refusal shows the line the reader could not use", async () => {
    const outcome: ModelReadOutcome = { reason: null };
    const out = await transcribeModelContents(
      async () => ({ text: "Grade 10 student handbook" }),
      probe,
      pages,
      30,
      outcome,
    );
    expect(out).toBeNull();
    expect(outcome.reason).toMatch(/fewer than two units/i);
    expect(outcome.reason).toContain('It began: "Grade 10 student handbook"');
  });
});
