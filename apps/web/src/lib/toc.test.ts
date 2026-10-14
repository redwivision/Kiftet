import { expect, test } from "bun:test";
import {
  chaptersFromToc,
  contentsFromPages,
  isSummaryOrReview,
  looksLikeTocPage,
  parseToc,
  type TocChapter,
} from "./toc";
import { REAL_TOC_OCR } from "./toc.fixture";

function chapters(text = REAL_TOC_OCR): TocChapter[] {
  return chaptersFromToc(parseToc(text));
}

test("every unit in the real book is found, with its printed start page", () => {
  const found = chapters();
  expect(found.map((c) => [c.unit, c.title, c.page])).toEqual([
    [1, "Sub-fields of Biology", 1],
    [2, "Plants", 17],
    [3, "Biochemical Molecules", 50],
    [4, "Cell Reproduction", 81],
    [5, "Human Biology", 94],
    [6, "Ecological Interaction", 153],
  ]);
});

test("numbering depth is preserved as hierarchy", () => {
  const plants = chapters()[1];
  const leaf = plants.topics.find((t) =>
    t.title.includes("internal structure"),
  );
  expect(leaf?.path).toEqual(["2", "3", "1"]);
  const parts = plants.topics.find((t) => t.title.startsWith("Structure"));
  expect(parts?.path).toEqual(["2", "3"]);
  expect(plants.topics.filter((t) => t.path.length === 2)).toHaveLength(11);
  expect(plants.topics.filter((t) => t.path.length === 3)).toHaveLength(13);
});

test("all 59 entries survive, with nothing invented", () => {
  // 6 units + 53 numbered entries in the book's own contents.
  expect(parseToc(REAL_TOC_OCR)).toHaveLength(59);
});

test("a contents whose leaders arrive one glyph per line is still read", () => {
  // The Grade 10 Economics textbook, extracted rather than recognized: its dot
  // leaders are U+FFFD, and the extractor emits each one as its own line, so
  // "Unit 1: …" arrives with its page number several lines below it. Nothing
  // about that page is unreadable to a person — the whole contents was simply
  // being discarded, and the book's eight units read as ~150 fragments.
  const economics = [
    "III",
    "Table of Contents",
    "Content ",
    "Page",
    "Unit 1: Theory of Consumer Behaviour \uFFFD ",
    "\uFFFD ",
    "\uFFFD ",
    "1",
    "1.1 The Concept of Utility . . . . . . . 2",
    "1.2 The Cardinal Utility Theory . . . . . 6",
    "Unit 2: Theories of Demand and Supply \uFFFD ",
    "\uFFFD ",
    "17",
    "2.1 Theory of Demand . . . . . . . . . . 19",
    "2.2 Theory of Supply . . . . . . . . . . . 31",
  ].join("\n");
  const found = chaptersFromToc(parseToc(economics));
  expect(found.map((c) => [c.unit, c.title, c.page])).toEqual([
    [1, "Theory of Consumer Behaviour", 1],
    [2, "Theories of Demand and Supply", 17],
  ]);
  expect(found[0].topics.map((t) => t.title)).toEqual([
    "The Concept of Utility",
    "The Cardinal Utility Theory",
  ]);
  // No leader glyph is left welded to a title.
  expect(found.some((c) => c.title.includes("\uFFFD"))).toBe(false);
});

test("a title that wrapped onto the next line is rejoined", () => {
  const wrapped = chapters()[0].topics.find((t) => t.path.join(".") === "1.4");
  expect(wrapped?.title).toBe(
    "The contributions of biological discoveries to society and the environment",
  );
  expect(wrapped?.page).toBe(9);
});

test("a number the renderer split in two is repaired", () => {
  const flow = chapters()[5].topics.find((t) =>
    t.title.includes("Flow of energy"),
  );
  expect(flow?.path).toEqual(["6", "1", "2"]);
  expect(flow?.page).toBe(156);
});

test("decoration that imitates an entry is discarded", () => {
  const titles = chapters().flatMap((c) => c.topics.map((t) => t.title));
  expect(titles.some((t) => t.includes("Fe") && t.includes("ap"))).toBe(false);
  // The three-character doodle that once swallowed Unit 3 entirely.
  expect(chapters().some((c) => c.unit === 3)).toBe(true);
  expect(parseToc(REAL_TOC_OCR).every((e) => e.page > 0)).toBe(true);
});

test("a page with no contents parses to nothing rather than to junk", () => {
  expect(parseToc("Chapter 1\nSome prose about cells and membranes.")).toEqual(
    [],
  );
});

test("a contents page is recognised from its heading alone", () => {
  expect(looksLikeTocPage("Table of Contents")).toBe(true);
  expect(looksLikeTocPage("=== Table\\of{/Contents")).toBe(true);
  expect(looksLikeTocPage("Unit 2: Plants")).toBe(false);
});

test("a contents page is recognised by its shape, no matter its language", () => {
  // The word "contents" is English; a page set in Amharic never says it. What
  // it still has is the shape: lines that end in a page number, joined to
  // their titles by a run of dots.
  const page = [
    "የይዘት ዝርዝር",
    "ምዕራፍ 1: የባዮሎጂ ንዑስ ዘርፎች ......... 1",
    "1.1 ንዑስ ዘርፎች ......... 1",
    "1.2 ንጹህና ተግባራዊ ዘርፎች ......... 5",
    "1.3 ባዮሎጂን የቀየሩ ግኝቶች ......... 6",
  ].join("\n");
  expect(looksLikeTocPage(page)).toBe(true);
  // An exercise page is numbered but never dotted: requiring the leaders is
  // what keeps "4. Name three." from passing as contents.
  const exercises = [
    "1. Cells divide.",
    "2. Energy is stored.",
    "3. Genes are inherited.",
  ].join("\n");
  expect(looksLikeTocPage(exercises)).toBe(false);
});

test("an Amharic contents page is read instead of discarded", () => {
  const amharic = [
    "ምዕራፍ 1: የባዮሎጂ ንዑስ ዘርፎች 1",
    "1.1 ንዑስ ዘርፎች 1",
    "1.2 ንጹህና ተግባራዊ ዘርፎች 5",
    "ምዕራፍ 2: እፅዋት 17",
    "2.1 የእፅዋት ባህሪያት 17",
  ].join("\n");
  const found = chaptersFromToc(parseToc(amharic));
  expect(found.map((c) => [c.unit, c.title])).toEqual([
    [1, "የባዮሎጂ ንዑስ ዘርፎች"],
    [2, "እፅዋት"],
  ]);
  expect(found[0].topics).toHaveLength(2);
  expect(found[1].topics).toHaveLength(1);
});

test("topics stay in reading order within their unit", () => {
  const plants = chapters()[1];
  const pages = plants.topics.map((t) => t.page);
  expect(pages).toEqual([...pages].sort((a, b) => a - b));
});

test("a unit with no topics under it is not offered as a chapter", () => {
  const sparse = parseToc("Unit 1: Biology 1\n1.1 Cells 2");
  const lonely = chaptersFromToc(
    sparse.concat(parseToc("Unit 2: Chemistry 9") as never),
  );
  expect(lonely).toHaveLength(1);
  expect(lonely[0].unit).toBe(1);
});

// ─── The chapter vocabulary ─────────────────────────────────────────────
//
// The heading scanner has always accepted Chapter/Lesson/Part/Module as
// chapter starts. The contents reader must accept the same words, or a book
// that says "Chapter 1:" in its contents finds its units when scanning
// headings and throws them away when reading the page that names them.

test("Chapter and Lesson lines are units, the same as Unit lines", () => {
  const found = parseToc(
    "Chapter 1: Introduction 4\nChapter 2: The cell 12\nLesson 3: Photosynthesis 30",
  );
  expect(found).toEqual([
    { kind: "unit", unit: 1, title: "Introduction", page: 4 },
    { kind: "unit", unit: 2, title: "The cell", page: 12 },
    { kind: "unit", unit: 3, title: "Photosynthesis", page: 30 },
  ]);
});

test("a roman numeral is a unit number, as it is to the heading scanner", () => {
  const found = parseToc("Part I: The highlands 5\nPart II: The lowlands 20");
  expect(found).toEqual([
    { kind: "unit", unit: 1, title: "The highlands", page: 5 },
    { kind: "unit", unit: 2, title: "The lowlands", page: 20 },
  ]);
});

test("a dotted unit number keeps the chapter and drops the rest", () => {
  const found = parseToc("Topic 1.1: The cell 5\nTopic 1.2: The leaf 9");
  expect(found).toEqual([
    { kind: "unit", unit: 1, title: "The cell", page: 5 },
    { kind: "unit", unit: 1, title: "The leaf", page: 9 },
  ]);
});

// ─── Back matter ────────────────────────────────────────────────────────
//
// Every unit closes with a summary and a review. They are the unit said back
// and questions with no teaching in them — worth reading, worthless to study
// from, so the importer drops them.

test("a unit's summary and review headings are recognised", () => {
  for (const heading of [
    "Summary",
    "Unit Summary",
    "Review",
    "Unit Review",
    "Review Questions",
    "Review Exercises",
    "Revision",
    "2.7 Summary",
  ]) {
    expect(isSummaryOrReview(heading)).toBe(true);
  }
});

test("a real chapter that mentions review or summary is left alone", () => {
  for (const title of [
    "Review of cell biology",
    "Summary of the nitrogen cycle",
    "Reviewing the microscope",
    "Cell Review",
  ]) {
    expect(isSummaryOrReview(title)).toBe(false);
  }
});

// ─── Universality ───────────────────────────────────────────────────────
//
// "Works on every textbook" means the parser must not depend on the house
// style of the handful of books it was written against. These are the shapes
// other books actually use: leaderless contents, bare numeric chapters, dashes
// for leaders, word numbers, and contents that continue for many pages.

test("a leaderless contents page is still recognised by its shape", () => {
  // No English word, no dot leaders — just numbered lines that each end in a
  // page number. A book whose leaders did not extract still has this shape.
  const page = [
    "Kapitel 1 Einführung 1",
    "1.1 Grundlagen 3",
    "1.2 Methoden 7",
    "Kapitel 2 Zellen 12",
    "2.1 Membranen 13",
  ].join("\n");
  expect(looksLikeTocPage(page)).toBe(true);
});

test("a bare-numbered chapter line is a unit when a unit word leads it", () => {
  const found = parseToc(
    [
      "Unit 1 Plants 17",
      "1.1 Leaves 18",
      "Unit 2 Animals 40",
      "2.1 Fish 41",
    ].join("\n"),
  );
  expect(found.map((e) => e.kind)).toEqual([
    "unit",
    "section",
    "unit",
    "section",
  ]);
  expect(found[0]).toMatchObject({ unit: 1, title: "Plants", page: 17 });
});

test("dashes, ellipses and middle dots all count as leaders", () => {
  const found = parseToc(
    [
      "Chapter 1 — Introduction ———— 1",
      "1.1 Some topic ......... 2",
      "1.2 Another topic ······ 3",
    ].join("\n"),
  );
  expect(found.map((e) => e.kind)).toEqual(["unit", "section", "section"]);
  expect(found[0]).toMatchObject({ unit: 1, title: "Introduction", page: 1 });
  expect(found[1]).toMatchObject({ title: "Some topic", page: 2 });
  expect(found[2]).toMatchObject({ title: "Another topic", page: 3 });
});

test("no leader glyph survives into a title", () => {
  const found = parseToc("Unit 1: Cells ————— 1\n1.1 The cell ………… 2");
  for (const entry of found) {
    expect(/[—…·_�]/.test(entry.title)).toBe(false);
  }
});

test("an Afaan Oromoo contents page is read", () => {
  const oromo = [
    "Qabiyyee",
    "Kutaa 1: Seensa Saayinsii 1",
    "1.1 Yaada Saayinsii 3",
    "1.2 Tooftaa Saayinsii 7",
    "Kutaa 2: Lubbuu 12",
    "2.1 Biqiltuu 13",
  ].join("\n");
  const found = chaptersFromToc(parseToc(oromo));
  expect(found.map((c) => [c.unit, c.title])).toEqual([
    [1, "Seensa Saayinsii"],
    [2, "Lubbuu"],
  ]);
  expect(found[0].topics).toHaveLength(2);
});

test("a contents that spans many pages is not cut short by a thin one", () => {
  // Page 1 lists four units, then two later pages list one unit each. A rule
  // that stopped once a page added fewer than three units would drop those
  // tails; the walk follows the shape, not the count.
  const pages = [
    "Contents",
    "Unit 1 Introduction 1\n1.1 Basics 2\nUnit 2 Cells 3\n2.1 Membranes 4\nUnit 3 Genetics 5\n3.1 DNA 6\nUnit 4 Ecology 7\n4.1 Food webs 8",
    "Unit 5 Evolution 9\n5.1 Natural selection 10",
    "Unit 6 Physiology 11\n6.1 The heart 12",
    "Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy.",
  ];
  const read = contentsFromPages(pages);
  expect(read?.chapters.map((c) => c.unit)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(read?.pagesRead).toBe(4);
});
