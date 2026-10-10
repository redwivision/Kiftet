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
/**
 * How a unit introduces itself.
 *
 * The same vocabulary `HEADING_RE` in `textbook.ts` recognises as a chapter
 * start — that parity is the point: a book whose contents open "Chapter 1:"
 * or "Lesson 2:" must parse here, or the units are found when scanning
 * headings and thrown away when reading the page that names them, and the
 * model is then handed a transcript it cannot rescue either. Roman numerals
 * count too ("Part III"), because the heading scanner has always accepted
 * them.
 */
const UNIT_WORD =
  "unit|chapter|lesson|part|module|topic|section|boqonnaa|ምዕራፍ|ክፍል|ትምህርት";
/** A unit's own number: an integer, a dotted integer ("2.1"), or a roman numeral. */
const UNIT_NUM = String.raw`\d{1,3}(?:\s*\.\s*\d+)*|[IVXLCDM]{1,7}`;
const UNIT_RE = new RegExp(
  String.raw`^(?:${UNIT_WORD})\s+(${UNIT_NUM})\s*[:.-]?\s*(.+?)\s+(\d{1,3})$`,
  "i",
);
const STARTS_LIKE_ENTRY_RE = new RegExp(String.raw`^${NUMBER_SOURCE}\s+\S`);

/** A unit line, which is an entry start that does not begin with a digit. */
const UNIT_STARTS_RE = new RegExp(
  String.raw`^(?:${UNIT_WORD})\s+(?:\d|[IVXLCDM])`,
  "i",
);

const ROMAN_VALUES: Record<string, number> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000,
};

/** "III" → 3, or null when the token is not a roman numeral worth trusting. */
function romanToInt(text: string): number | null {
  const chars = text.toLowerCase().split("");
  if (chars.length === 0 || chars.length > 12) return null;
  let total = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const value = ROMAN_VALUES[chars[i]];
    if (value === undefined) return null;
    const next = ROMAN_VALUES[chars[i + 1]];
    total += next !== undefined && next > value ? -value : value;
  }
  return total >= 1 ? total : null;
}

/** A captured unit number as an integer: "2" → 2, "2.1" → 2, "III" → 3. */
function parseUnitNumber(token: string): number | null {
  if (/^\d/.test(token)) {
    const n = Number(token.split(".")[0]);
    return Number.isInteger(n) && n >= 1 ? n : null;
  }
  return romanToInt(token);
}

/**
 * Letters of any script.
 *
 * These books are set in English, Afaan Oromoo and Amharic, and the contents
 * page of an Amharic book has no ASCII in it at all — a `[A-Za-z]` count
 * scored every one of its titles as zero letters, so `titleLooksReal` refused
 * them and `hasWords` refused to hold them while they wrapped. The whole
 * contents parsed to nothing and the student got the heading scan instead.
 */
const LETTER_RE = /\p{L}/gu;
const WORD_RE = /\p{L}{2,}/gu;

/**
 * Decoration can imitate an entry: a flourish reading "2 ; —" begins with a
 * digit, and "… OX Na " - 7" ends with one. A real title is overwhelmingly
 * letters; a flourish is punctuation with a few stray letters mixed in.
 */
/** Is this title letters rather than decoration? Exported: the transcript
 *  reader in `textbook.ts` applies the same test to its looser lines. */
export function titleLooksReal(title: string): boolean {
  const compact = title.replace(/\s+/g, "");
  if (compact.length < 3) return false;
  const letters = (compact.match(LETTER_RE) ?? []).length;
  return letters / compact.length >= 0.7;
}

/**
 * Is this the title of a unit's summary or review section, rather than
 * something to study from?
 *
 * Ethiopian textbooks close every unit with the same back matter — "Summary",
 * "Unit Summary", "Review Questions", "Review Exercises", "Revision". They are
 * worth reading once and worthless to ingest: a summary is the unit restated,
 * and a review is questions with no teaching in them, so a study material
 * generated from either is a worse copy of the unit itself.
 *
 * The whole title must be the back-matter phrase (bar a leading "Unit" and its
 * number), so a chapter a book genuinely calls "Review of cell biology" or
 * "Summary of the nitrogen cycle" is left alone.
 */
export function isSummaryOrReview(title: string): boolean {
  const bare = title
    .trim()
    .replace(/^unit\s+/i, "")
    .replace(/^\d+(?:\.\d+)*[.)]?\s*/, "")
    .trim()
    .toLowerCase();
  return /^(?:summary|review(?:\s+(?:questions|exercises|activities))?|revision(?:\s+(?:questions|exercises))?)$/.test(
    bare,
  );
}

/** At least two real words — what separates a wrapped title from a doodle. */
function hasWords(line: string): boolean {
  return (line.match(WORD_RE) ?? []).length >= 2;
}

function endsWithPageNumber(line: string): boolean {
  return /\d{1,3}\s*$/.test(line);
}

function takeEntry(line: string, into: TocEntry[]): boolean {
  // A leader that lands immediately before the page number survives the
  // run-collapsing above, because on its own it is not a run — leaving it as a
  // stray glyph welded to the end of the title ("Behaviour �").
  const tidy = (title: string) => title.trim().replace(/[\s.·…_�]+$/, "");

  const unit = line.match(UNIT_RE);
  if (unit) {
    if (!titleLooksReal(unit[2])) return false;
    const number = parseUnitNumber(unit[1]);
    if (number === null) return false;
    into.push({
      kind: "unit",
      unit: number,
      title: tidy(unit[2]),
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
      title: tidy(section[2]),
      page: Number(section[3]),
    });
    return true;
  }
  return false;
}

/**
 * Leaders between a contents entry and its page number.
 *
 * A contents page fills the gap between a title and its page with repeated
 * dots — the most recent Ethiopian textbooks encode them as U+FFFD, one per
 * leader, so the run arrives as "Behaviour � � � � 1" rather than
 * "Behaviour ..... 1". Either way the entry does not end in a page number as far
 * as the patterns above are concerned, so it is not an entry at all: a book's
 * contents can be sitting right there, plainly readable, and parse to nothing.
 *
 * Only runs of two or more are collapsed. A single dot is not decoration but
 * numbering — "1.2" and the trailing "1.2." are both one dot each — and removing
 * those would merge a section's number into its title.
 */
const LEADER_RUN = /(?:\s*[.·…_�]\s*){2,}/g;

/** One contents line, with its leaders collapsed and its spacing normalized.
 *  Exported: the transcript reader in `textbook.ts` normalizes its lines the
 *  same way before reading them loosely. */
export function normalizeTocLine(line: string): string {
  return line.replace(/\s+/g, " ").replace(LEADER_RUN, " ").trim();
}

/**
 * Parse recognized contents pages into units and their numbered topics.
 *
 * Returns an empty array when the text is not a contents page — the caller
 * falls back to scanning page headings, which is worse but still works.
 */
export function parseToc(text: string): TocEntry[] {
  const lines = text.split("\n").map(normalizeTocLine).filter(Boolean);
  const entries: TocEntry[] = [];
  let held: string | null = null;

  for (const line of lines) {
    if (held !== null) {
      const merged = normalizeTocLine(`${held} ${line}`);
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
    //
    // A unit counts as an entry start too, and has to: this book's leaders are
    // emitted one per line, so "Unit 1: …" arrives with its page number several
    // lines below it and nothing else would hold the two together.
    if (
      (STARTS_LIKE_ENTRY_RE.test(line) || UNIT_STARTS_RE.test(line)) &&
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
/**
 * The same run as `LEADER_RUN`, without the `g` flag.
 *
 * A `g` regex carries `lastIndex` between calls, so `.test()` on it answers
 * true on one line and false on the next for no reason a reader could see.
 */
const LEADER_TEST = /(?:\s*[.·…_�]\s*){2,}/;

/**
 * Does this page look like the start of a contents section?
 *
 * The obvious tell is the word "contents" — but that is an English word on a
 * page that may be set in Amharic or Afaan Oromoo, and a book that titles its
 * contents something else never says it either. The student then loses the
 * book's own structure entirely and gets the heading scan, which is a guess.
 *
 * What every contents page has regardless of language is a *shape*: several
 * lines that end in a page number, most of them joined to their title by a run
 * of dots. Requiring the dots as well as the numbers is what keeps a page of
 * exercises — numbered, and ending in numbers — from being read as contents.
 */
export function looksLikeTocPage(text: string): boolean {
  if (/\b(table\s+of\s+contents|contents)\b/i.test(text.slice(0, 400))) {
    return true;
  }
  let withPage = 0;
  let withLeader = 0;
  for (const raw of text.split("\n").slice(0, 60)) {
    const line = raw.trim();
    if (!endsWithPageNumber(line)) continue;
    withPage += 1;
    if (LEADER_TEST.test(line)) withLeader += 1;
  }
  return withPage >= TOC_MIN_ENTRIES_PER_PAGE && withLeader >= 2;
}

/**
 * How many pages to recognize while hunting for the contents.
 *
 * Contents run to a handful of pages. Capped so a book with no contents costs a
 * fixed few seconds rather than a scan of the whole file.
 */
export const TOC_SEARCH_PAGES = 15;

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
 * How many pages of a readable book to read looking for the contents.
 *
 * Reading a text layer is free and instant, unlike OCR, so this is bounded only
 * by where a contents page plausibly ends rather than by what a student waits.
 */
export const TOC_TEXT_PAGES = 4;

/**
 * A page that yields fewer than this many entries is not a contents page.
 *
 * The first real chapter page also lists numbered lines — its own topics — so
 * counting alone would not separate them; but it yields no *page-numbered*
 * entries the way a contents line does, which is what this measures.
 */
export const TOC_MIN_ENTRIES_PER_PAGE = 3;
