import { expect, test } from "bun:test";
import {
  chaptersFromToc,
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
