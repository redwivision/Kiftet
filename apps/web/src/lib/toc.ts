/**
 * Reading a textbook's own table of contents.
 *
 * A textbook states its structure explicitly, in numbered order, with a page
 * number for every line. That is a far better answer to "what are the
 * chapters" than anything inferred from page text — and it is the only part of
 * a badly-encoded book that is still worth reading carefully, because the
 * contents pages are two or three of the cheapest pages in the file to
 * recognize.
 *
 * Measured on the Grade 10 Biology textbook, whose body text is 90%
 * unrecoverable, the contents pages OCR into this:
 *
 *   Unit 2: Plants 17
 *   2.3 Structure and function of plant parts 20
 *   2.3.1 The internal structure of a leaf 22
 *
 * The unit is the chapter; `2.3` is a topic inside it; `2.3.1` is a topic
 * inside that. The depth of the number *is* the hierarchy, which is why this
 * never asks a model to guess at structure it has been handed.
 */

/** A unit — "Unit 2: Plants". The level a student studies as a chapter. */
export type TocUnit = {
  kind: "unit";
  unit: number;
  title: string;
  /** The book's own printed page number, not the PDF's. */
  page: number;
};

/** A numbered entry — "2.3.1 The internal structure of a leaf". */
export type TocSection = {
  kind: "section";
  /** The numbering split on dots: ["2","3","1"]. Length is the depth. */
  path: string[];
  title: string;
  page: number;
};

export type TocEntry = TocUnit | TocSection;

/** A chapter as the contents page describes it. */
export type TocChapter = {
  unit: number;
  title: string;
  /** Printed page where the unit starts. */
  page: number;
  /** Topics in reading order, deepest numbering included. */
  topics: TocSection[];
};

// A dotted number, tolerating the ways OCR spaces it out: "2.1", "2.1.",
// "6.2.4.", and the "6.1. 2" where the renderer split one number in two.
const NUMBER_SOURCE = String.raw`\d+(?:\s*\.\s*\d+)*\s*\.?`;
const SECTION_RE = new RegExp(
  String.raw`^(${NUMBER_SOURCE})\s+(.+?)\s+(\d{1,3})$`,
);
const UNIT_RE = /^Unit\s+(\d+)\s*[:.-]?\s*(.+?)\s+(\d{1,3})$/i;
const STARTS_LIKE_ENTRY_RE = new RegExp(String.raw`^${NUMBER_SOURCE}\s+\S`);

/**
 * Decoration can imitate an entry: a flourish reading "2 ; —" begins with a
 * digit, and "… OX Na " - 7" ends with one. A real title is overwhelmingly
 * letters; a flourish is punctuation with a few stray letters mixed in.
 */
function titleLooksReal(title: string): boolean {
  const compact = title.replace(/\s+/g, "");
  if (compact.length < 3) return false;
  const letters = (compact.match(/[A-Za-z]/g) ?? []).length;
  return letters / compact.length >= 0.7;
}

/** At least two real words — what separates a wrapped title from a doodle. */
function hasWords(line: string): boolean {
  return (line.match(/[A-Za-z]{2,}/g) ?? []).length >= 2;
}

function endsWithPageNumber(line: string): boolean {
  return /\d{1,3}\s*$/.test(line);
}

function takeEntry(line: string, into: TocEntry[]): boolean {
  const unit = line.match(UNIT_RE);
  if (unit) {
    if (!titleLooksReal(unit[2])) return false;
    into.push({
      kind: "unit",
      unit: Number(unit[1]),
      title: unit[2].trim(),
      page: Number(unit[3]),
    });
    return true;
  }
  const section = line.match(SECTION_RE);
  if (section) {
    if (!titleLooksReal(section[2])) return false;
    const path = section[1]
      .replace(/\s*\.\s*/g, ".")
      .replace(/\.$/, "")
      .split(".")
      .filter(Boolean);
    if (path.length === 0) return false;
    into.push({
      kind: "section",
      path,
      title: section[2].trim(),
      page: Number(section[3]),
    });
    return true;
  }
  return false;
}

/**
 * Parse recognized contents pages into units and their numbered topics.
 *
 * Returns an empty array when the text is not a contents page — the caller
 * falls back to scanning page headings, which is worse but still works.
 */
export function parseToc(text: string): TocEntry[] {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const entries: TocEntry[] = [];
  let held: string | null = null;

  for (const line of lines) {
    if (held !== null) {
      const merged: string = `${held} ${line}`;
      if (takeEntry(merged, entries)) {
        held = null;
        continue;
      }
      held = merged;
      continue;
    }
    if (takeEntry(line, entries)) continue;
    // Looks like the start of an entry but has no page number yet, so it is a
    // title that wrapped onto the next line — hold it. A line that already
    // ends in a number but failed the title test is decoration pretending to
    // be an entry: dropping it is what stops it being glued onto the next real
    // line and swallowing a whole unit.
    if (
      STARTS_LIKE_ENTRY_RE.test(line) &&
      !endsWithPageNumber(line) &&
      hasWords(line)
    ) {
      held = line;
    }
  }
  return entries;
}

/**
 * Group entries into one chapter per unit, each carrying its topics.
 *
 * Entries are assigned to the most recent unit rather than to the leading
 * digit of their number, so a book that renumbers per unit still groups the way
 * a reader would expect.
 */
export function chaptersFromToc(entries: TocEntry[]): TocChapter[] {
  const chapters: TocChapter[] = [];
  let current: TocChapter | null = null;
  for (const entry of entries) {
    if (entry.kind === "unit") {
      current = {
        unit: entry.unit,
        title: entry.title,
        page: entry.page,
        topics: [],
      };
      chapters.push(current);
      continue;
    }
    if (!current) continue;
    current.topics.push(entry);
  }
  return chapters.filter((chapter) => chapter.topics.length > 0);
}

/** Does this page look like the start of a contents section? */
export function looksLikeTocPage(text: string): boolean {
  return /\b(table\s+of\s+contents|contents)\b/i.test(text.slice(0, 400));
}

/**
 * How many pages to recognize while hunting for the contents.
 *
 * Contents run to a handful of pages. Capped so a book with no contents costs a
 * fixed few seconds rather than a scan of the whole file.
 */
export const TOC_SEARCH_PAGES = 12;

/**
 * How many pages to recognize before stopping.
 *
 * The contents of the book this was written against runs to two pages. Reading
 * a fixed six wasted four recognitions on the first chapter's opening — about
 * six seconds a student watches for nothing. The reader instead stops as soon
 * as a page stops yielding contents entries, and this is the ceiling for a book
 * whose contents genuinely are longer.
 */
export const TOC_MAX_PAGES = 6;

/**
 * A page that yields fewer than this many entries is not a contents page.
 *
 * The first real chapter page also lists numbered lines — its own topics — so
 * counting alone would not separate them; but it yields no *page-numbered*
 * entries the way a contents line does, which is what this measures.
 */
export const TOC_MIN_ENTRIES_PER_PAGE = 3;
