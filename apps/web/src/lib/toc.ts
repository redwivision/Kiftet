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
/**
 * A printed page number at the end of a contents line.
 *
 * Arabic numerals are the common case, but the front matter of these textbooks
 * — and of a great many books — numbers its introductory units in *roman*
 * numerals, so a contents can read "Unit 1 Introduction to Biology ix". That
 * line used to parse as nothing: the arabic-only tail refused it, the unit was
 * dropped, and the next unit's title absorbed the orphaned line.
 *
 * The roman form is deliberately confined to this trailing position, where a
 * title always precedes it, and is capped short — front matter runs `i`–`xx`,
 * never a long sequence. Both restrictions matter: `c`, `i`, `l`, `m`, `v`, `x`
 * are all roman letters, so a looser rule reads the end of an ordinary word —
 * "cell … cell" — as a page number and turns body prose into a contents. The
 * generic `endsWithPageNumber` probe stays arabic-only for the same reason; it
 * asks the question of arbitrary lines, where the title-then-token context does
 * not exist.
 */
const PAGE_SOURCE = String.raw`\d{1,3}|[IVXLCDMivxlcdm]{1,5}`;
const SECTION_RE = new RegExp(
  String.raw`^(${NUMBER_SOURCE})\s+(.+?)\s+(${PAGE_SOURCE})$`,
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
  "unit|chapter|lesson|part|module|topic|section|boqonnaa|kutaa|barnoota|cutubaa|barruu|seensa|ምዕራፍ|ክፍል|ትምህርት";
/** A unit's own number: an integer, a dotted integer ("2.1"), or a roman numeral. */
const UNIT_NUM = String.raw`\d{1,3}(?:\s*\.\s*\d+)*|[IVXLCDM]{1,7}`;
const UNIT_RE = new RegExp(
  String.raw`^(?:${UNIT_WORD})\s+(${UNIT_NUM})\s*[:.\-\u2013\u2014]?\s*(.+?)\s+(${PAGE_SOURCE})$`,
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
 * A captured trailing page number as an integer, in either numeral system.
 *
 * Arabic passes straight through. A roman numeral is read by the same
 * `romanToInt` the unit number uses, so "ix" → 9. A roman candidate that does
 * not actually read as a numeral — the letters `cell` at the end of an ordinary
 * title, say — returns null, and the caller refuses the line rather than
 * inventing an entry. A printed page number is informational here (the reader
 * anchors the *PDF* page elsewhere), so a null is a refusal, not a zero.
 */
function parsePageNumber(token: string): number | null {
  if (/^\d/.test(token)) return Number(token);
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
    .replace(/^part\s+/i, "")
    .replace(/^chapter\s+/i, "")
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

// Bare chapter/section lines need no special case: `UNIT_RE`'s separator is
// optional, so "Unit 1 Plants 17" already parses, and `SECTION_RE` already
// reads "1 Introduction 5". What they need is a title that reads as a title,
// which is what `tidyTitle` guarantees.
//
// A single leader glyph is not collapsed by `LEADER_RUN` (which needs two, so
// it never eats the one dot of "1.2"), and a single one can survive on either
// edge of a title: "Unit 2 – GENETICS – 20" leaves a trailing en dash, and
// "Unit 1 · Matter · 1" leaves a leading middle dot. Neither belongs to the
// title, so both edges are trimmed of decoration here.
const TITLE_EDGE_DECOR =
  /^[\s.·\u2022…_�\u00a0\t\u2013\u2014\u2015\u2212\u2010\u2011\u2012\u2060\u00ad-]+|[\s.·\u2022…_�\u00a0\t\u2013\u2014\u2015\u2212\u2010\u2011\u2012\u2060\u00ad-]+$/g;
function tidyTitle(title: string): string {
  return title.replace(TITLE_EDGE_DECOR, "").trim();
}

function takeEntry(line: string, into: TocEntry[]): boolean {
  const unit = line.match(UNIT_RE);
  if (unit) {
    if (!titleLooksReal(unit[2])) return false;
    const number = parseUnitNumber(unit[1]);
    if (number === null) return false;
    const page = parsePageNumber(unit[3]);
    if (page === null) return false;
    into.push({
      kind: "unit",
      unit: number,
      title: tidyTitle(unit[2]),
      page,
    });
    return true;
  }
  const section = line.match(SECTION_RE);
  if (section) {
    if (!titleLooksReal(section[2])) return false;
    const page = parsePageNumber(section[3]);
    if (page === null) return false;
    const path = section[1]
      .replace(/\s*\.\s*/g, ".")
      .replace(/\.$/, "")
      .split(".")
      .filter(Boolean);
    if (path.length === 0) return false;
    into.push({
      kind: "section",
      path,
      title: tidyTitle(section[2]),
      page,
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
const LEADER_RUN =
  /(?:\s*[.\u00b7\u2022\u2026\u2013\u2014\u2015\u00a0\u2002\u2003\u2009\u002d\u2212\u2010\u2011\u2012\u2060_�\u00ad\t]\s*){2,}/g;

/** One contents line, with its leaders collapsed and its spacing normalized.
 *  Exported: the transcript reader in `textbook.ts` normalizes its lines the
 *  same way before reading them loosely. */
export function normalizeTocLine(line: string): string {
  // Collapse all forms of dotted/ruled leaders; collapse multiple spaces and tabs.
  return line
    .replace(/[\u00a0\t]+/g, " ")
    .replace(LEADER_RUN, " ")
    .replace(/\s+/g, " ")
    .trim();
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
 * digit of their number, so a book that renumbers per unit still groups the
 * way a reader would expect.
 *
 * A book that never names a unit — its contents read "1 Introduction 1",
 * "2 Cells 9" — still has chapters: the top-level number is the chapter. When,
 * and only when, the contents names no unit at all, a depth-1 number is read as
 * one, so a book that does say "Unit 1" is never renumbered by a stray section
 * that happened to parse.
 */
export function chaptersFromToc(entries: TocEntry[]): TocChapter[] {
  const named = entries.some((entry) => entry.kind === "unit");
  const grouped = named
    ? entries
    : entries.map(
        (entry): TocEntry =>
          entry.kind === "section" && entry.path.length === 1
            ? {
                kind: "unit",
                unit: Number(entry.path[0]),
                title: entry.title,
                page: entry.page,
              }
            : entry,
      );
  const chapters: TocChapter[] = [];
  let current: TocChapter | null = null;
  for (const entry of grouped) {
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
 * How a book announces its contents, in every language it might use.
 *
 * The obvious tell is the word "contents" — but that is English on a page that
 * may be set in Amharic or Afaan Oromoo, and such a page can carry its
 * structure perfectly while never saying an English word. "ይዘት" (content),
 * "ዝርዝር" (list), "ማውጫ" (index) and the Afaan Oromoo "qabiyyee"/"tarreeffama"
 * are the headings those books actually print, so they are matched directly
 * rather than left to the shape test alone.
 */
const CONTENTS_HEADING_RE =
  /\b(?:table\s+of\s+contents|contents)\b|ይዘት|ዝርዝር|ማውጫ|qabiyyee|tarreeffama/i;

/**
 * How a book opens a page that is *not* a contents, in the words that matter.
 *
 * These are the words a review or exercises page leads with, and it is the
 * leading word that tells the two apart: both are lists of numbered lines that
 * end in numbers, but only the contents is joined by leaders. Some books drop
 * the leaders ("1. What is matter? 5" parses as a dotted entry), so the shape
 * test is not enough on its own and this is the tie-breaker.
 */
const NON_CONTENTS_HEADING_RE =
  /^(?:exercises?|review(?:\s+questions)?|revision|activities|questions|test\s+yourself|self[-\s]?assessment|check\s+your\s+understanding)\b/i;

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
 *
 * A third shape covers the book whose leaders did not extract at all: many
 * *numbered* lines — "1.1 Something" — that each end in a page number. An
 * exercise page is numbered but ends in prose, so it still fails; the count
 * floor is what keeps a stray heading from passing as a contents.
 */
export function looksLikeTocPage(text: string): boolean {
  if (CONTENTS_HEADING_RE.test(text.slice(0, 400))) {
    return true;
  }
  // A page that opens with the back-matter vocabulary is an exercises or review
  // page, not a contents: its lines are numbered and end in numbers — "1. What
  // is matter? 5" — so the shape test alone would read it as contents and pull
  // its questions into the tree. The heading word is what separates the two.
  //
  // Only a *bare* heading counts: a contents page may open straight onto an
  // entry called "Review Questions ... 5", and that line ends in a page number,
  // so it is left to the shape test rather than refused by its first word.
  const firstLine = text.split("\n").find((line) => line.trim() !== "");
  if (
    firstLine &&
    !endsWithPageNumber(firstLine.trim()) &&
    NON_CONTENTS_HEADING_RE.test(firstLine.trim())
  ) {
    return false;
  }
  const lines = text.split("\n").slice(0, 80);
  let withPage = 0;
  let withLeader = 0;
  let numberedWithPage = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!endsWithPageNumber(line)) continue;
    withPage += 1;
    if (LEADER_TEST.test(line)) withLeader += 1;
    if (STARTS_LIKE_ENTRY_RE.test(line) || UNIT_STARTS_RE.test(line)) {
      numberedWithPage += 1;
    }
  }
  // If the page is mostly a list of entries that each end in a page number,
  // it's almost certainly a TOC — even if leaders were stripped.
  const structuralScore = withPage / Math.max(1, lines.length) + withLeader / 5;
  if (structuralScore >= 0.6) return true;
  if (withPage >= TOC_MIN_ENTRIES_PER_PAGE && withLeader >= 2) return true;
  if (withPage >= TOC_MIN_ENTRIES_PER_PAGE + 2 && numberedWithPage >= 3)
    return true;
  return false;
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
 * The contents of the book this was written against runs to two pages. A fixed
 * cap would waste recognitions on a longer contents page, so the walk stops as
 * soon as a page yields no contents entries — and this ceiling is only for the
 * books that genuinely list sections across more pages.
 */
export const TOC_MAX_PAGES = 8;

/**
 * How many pages of a readable book to read looking for the contents.
 *
 * Reading a text layer is free and instant, unlike OCR, so this only bounds how
 * far into the front matter the read looks. Eight covers a contents that runs
 * past its own first page, which a four-page read would have cut off.
 */
export const TOC_TEXT_PAGES = 8;

/**
 * A page that yields fewer than this many entries is not a contents page.
 *
 * The first real chapter page also lists numbered lines — its own topics — so
 * counting alone would not separate them; but it yields no *page-numbered*
 * entries the way a contents line does, which is what this measures.
 */
export const TOC_MIN_ENTRIES_PER_PAGE = 3;

/** What reading a book's contents pages came to. */
export type ContentsRead = {
  /** Index of the page that announced the contents. */
  tocStart: number;
  /** The pages as they were read, joined — kept for the diagnostics report. */
  text: string;
  /** How many pages were read before the walk stopped. */
  pagesRead: number;
  /** Units and topics as the contents stated them, or empty if none parsed. */
  chapters: TocChapter[];
};

/**
 * A cheap identity of a chapter list, answering "did this page add anything?".
 * Counts and start pages, never titles: a page that only rewords a heading has
 * added nothing the walk needs. Exported so the OCR contents walk in
 * `textbook.ts` can stop on the same question the text-layer walk asks.
 */
export function chapterListSignature(chapters: TocChapter[]): string {
  return chapters
    .map((c) => `${c.unit}.${c.page}:${c.topics.length}`)
    .join("|");
}

/**
 * Read a book's contents straight off its page text layer.
 *
 * The whole walk: find the page that announces a contents, then keep reading
 * while the pages still look like one, re-parsing the growing blob each time so
 * a unit's topics that continue onto the next page stay attached to it. Free
 * and instant, because a text layer costs nothing to read.
 *
 * The stop rule is a per-page contents *test*, not a count of the units a page
 * added. That distinction is the whole fix for the Grade 10 Citizenship book:
 * its contents run to three pages and the third lists only two units, so a
 * "stop once a page adds fewer than three units" rule cut its last two units
 * off silently — the tree looked complete and was not. Here the third page
 * still looks like contents, so it is read, and the first *body* page (which
 * does not look like contents) is what ends the walk.
 *
 * Returns null when no contents page was found or none of them parsed, which is
 * the caller's cue to try the heading scan or the model.
 */
export function contentsFromPages(pages: string[]): ContentsRead | null {
  const tocStart = pages.findIndex(
    (text, i) => i < TOC_SEARCH_PAGES && looksLikeTocPage(text),
  );
  if (tocStart < 0) return null;

  let text = "";
  let chapters: TocChapter[] = [];
  let pagesRead = 0;
  const limit = Math.min(tocStart + TOC_TEXT_PAGES, pages.length);
  for (let page = tocStart; page < limit; page += 1) {
    // Every page after the announcing one must still look like contents. A body
    // page that merely repeats "Unit 1" as a running header does not, so it is
    // not read — and cannot be mistaken for a ninth unit.
    if (page > tocStart && !looksLikeTocPage(pages[page])) break;
    const grown = chaptersFromToc(parseToc(`${text}\n${pages[page]}`));
    // A page that looks like contents but yields nothing new — a blank verso
    // that kept a leader line — ends the walk too, so one stray page cannot
    // turn the walk into a scan of the front matter.
    if (
      page > tocStart &&
      chapters.length > 0 &&
      chapterListSignature(grown) === chapterListSignature(chapters)
    ) {
      break;
    }
    text += `\n${pages[page]}`;
    chapters = grown;
    pagesRead += 1;
  }
  return chapters.length > 0 ? { tocStart, text, chapters, pagesRead } : null;
}
