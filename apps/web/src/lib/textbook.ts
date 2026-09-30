import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  joinOcrPages,
  type OcrLanguage,
  type OcrProgress,
  ocrPageRange,
} from "./ocr";
import { ocrBookKey } from "./ocr-cache";
import {
  chaptersFromToc,
  looksLikeTocPage,
  parseToc,
  TOC_MAX_PAGES,
  TOC_MIN_ENTRIES_PER_PAGE,
  TOC_SEARCH_PAGES,
  type TocChapter,
} from "./toc";

type ExtractedItem = { str?: string; hasEOL?: boolean };

// The units we cut and hand to AI are *chunks* — one TOC section at a time,
// never the whole book. A chunk is derived from the PDF's own table of
// contents (its outline/bookmarks tree) when one exists, and falls back to
// heading detection on the extracted text.
export type ImportChunk = {
  title: string;
  rawText: string;
  /**
   * Half-open page range this chunk covers, when the pages still need reading.
   * Present exactly when `needsOcr` is true; the import flow fills `rawText`
   * from these pages and never OCRs the whole book at once.
   */
  pages?: { start: number; end: number };
  /**
   * True when the PDF's text layer could not be read, so the body has to be
   * recognized from the page image. `rawText` is empty until that happens.
   */
  needsOcr?: boolean;
  /**
   * The topics the book's own contents lists inside this chapter, in reading
   * order, as written: "2.3.1 The internal structure of a leaf".
   *
   * These are the author's own structure, so they seed the checklist directly
   * instead of being inferred from prose by a model that has never seen the
   * table of contents.
   */
  topics?: string[];
};

export type ImportSource =
  | { kind: "pdf"; name: string; file: File }
  | { kind: "text"; name: string; text: string };

// Textbook files are capped by MB. 15 MB is deliberately tight for the demo
// (school PDFs run 10–80 MB) — opens wide when we ship. The number exists so a
// phone never chokes on a monster PDF, and it is shown to the user in the UI.
export const MAX_FILE_MB = 15;

// Server enforces a 200k cap per chunk (`ingestSchema.rawText`); stay under
// it so oversized output is split client-side instead of hitting a 400.
const MAX_CHAPTER_CHARS = 190_000;

// Chunk-start headings across English, Afaan Oromoo and Amharic, followed by
// a number (digits, roman, or written English words).
const HEADING_RE =
  /^\s*(?:chapter|unit|lesson|part|section|topic|module|boqonnaa|ምዕራፍ|ክፍል|ትምህርት)\s+(?:\d{1,3}|[IVXLCDM]{1,7}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;

/**
 * Collapse a string that is one phrase drawn over and over.
 *
 * The Grade 10 Biology textbook writes its running header *five times* on the
 * same page — five identical text items, no line break between them, same font
 * (`g_d0_f6`). That is an artifact of whatever generated the file, not
 * something the student sees. Left alone it welds into
 * "Unit 2: PlantsUnit 2: PlantsUnit 2: PlantsUnit 2: PlantsUnit 2: Plants",
 * which is both an ugly chapter name and long enough to be thrown away as a
 * heading.
 *
 * Only a *pure* repetition is collapsed. One extra word ("Unit 2: Plants 17")
 * means there is real content after the header, and cutting it short would
 * throw away a heading that a normal reader would use.
 */
function collapseRepeats(text: string): string {
  const n = text.length;
  for (let len = 1; len * 2 <= n; len += 1) {
    const unit = text.slice(0, len);
    let rest = text;
    while (rest.startsWith(unit)) rest = rest.slice(len);
    if (rest.length === 0 && len < n) return unit;
  }
  return text;
}

function headingOf(text: string): string | null {
  const lines = text.split("\n");
  for (const raw of lines) {
    const line = collapseRepeats(raw.trim());
    if (!line || line.length > 80) continue;
    if (HEADING_RE.test(line)) return line;
  }
  return null;
}

function uniqueTitles(chunks: ImportChunk[]): ImportChunk[] {
  const seen = new Map<string, number>();
  return chunks.map((c) => {
    const base = c.title.trim().replace(/\.+$/, "") || "Untitled chunk";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return { ...c, title: count === 0 ? base : `${base} (${count + 1})` };
  });
}

/**
 * Split one chapter's text into parts the server will accept.
 *
 * Exported because OCR produces text no chunker has bounded yet: a recognised
 * 59-page unit lands as one string, and the ingest endpoint caps a chapter at
 * 200k characters inside a 256kb body. Splitting here, at the same sentence
 * boundary, means the split is invisible in the library — just "(part 2)".
 */
export function withPartSplits(
  title: string,
  full: string,
  topics?: string[],
): ImportChunk[] {
  const out: ImportChunk[] = [];
  let rest = full;
  let part = 1;
  while (rest.length > MAX_CHAPTER_CHARS) {
    let cut = MAX_CHAPTER_CHARS;
    // Don't cut mid-sentence when we can help it.
    const rewind = rest.lastIndexOf(". ", cut);
    if (rewind > cut * 0.7) cut = rewind + 1;
    out.push({
      title: `${title} (part ${part})`,
      rawText: rest.slice(0, cut).trim(),
      // Keep the chapter outline on one part; repeating it creates duplicate
      // checklist items across the split chapters.
      topics: part === 1 ? topics : undefined,
    });
    rest = rest.slice(cut).trim();
    part += 1;
  }
  if (rest)
    out.push({
      title: part === 1 ? title : `${title} (part ${part})`,
      rawText: rest,
      topics: part === 1 ? topics : undefined,
    });
  return out;
}

// ────────────────────────────────────────────────────────────────
// PDF path — text is extracted on this device; the file never uploads.
// ────────────────────────────────────────────────────────────────

/**
 * Some PDFs — including Ministry of Education textbooks — embed subsetted
 * fonts with no Unicode mapping. A viewer renders them by glyph outline, so
 * the pages *look* fine, but a text extractor gets back control characters
 * instead of letters.
 *
 * Measured on the Grade 10 Biology student textbook (182 pages, bilingual):
 * the body prose decodes to C0 control codes (U+0014–U+001E) and only the
 * running headers ("Unit 4: Cell Reproduction") come through as real text.
 *
 * Those control characters are never legitimate in a textbook, so they are
 * dropped here rather than passed on.
 */
export function stripUndecodableGlyphs(text: string): string {
  // Keep \n and \t (we join text items with them); drop every other C0/C1
  // control, which is what a missing ToUnicode map produces.
  return text.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the whole point is to match the control codes a font with no Unicode map emits
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g,
    "",
  );
}

// A word is a run of two or more letters/digits. Amharic breaks on spaces
// the way Latin does, so one count serves every language in the library.
const WORD_RE = /[\p{L}\p{N}]{2,}/gu;

function wordCount(text: string): number {
  return (text.match(WORD_RE) ?? []).length;
}

/**
 * A running header — "Unit 4: Cell Reproduction    47" — is about six words.
 * A page of body text is 150–400. The whole distance between those two
 * numbers is the signal that separates a book we can read from a book that
 * only *looks* readable.
 *
 * Median words per page, measured across the books on hand: the Grade 10
 * Biology textbook scores 27 (headers only), while every genuinely readable
 * PDF scores 58 or higher. 40 sits in the gap, closer to the middle than to
 * either side, and a book that trips it tells the user to paste the text —
 * a recoverable inconvenience — instead of silently producing a confident,
 * wrong checklist, which is the one failure this product cannot make.
 */
const MIN_MEDIAN_WORDS_PER_PAGE = 40;

// A whole book of 1,000 letters is about half a page. Below that there is
// nothing to chunk, whatever the file's byte count says.
const MIN_READABLE_CHARS = 1_000;

// A chunk under this many readable words is a heading and a page number, not
// study material.
const MIN_CHUNK_WORDS = 40;

export type PdfUnreadableReason = "no-text" | "too-thin" | "header-only";

export type PageTextAudit = {
  /** Letters and digits across the whole book — the "is anything there" floor. */
  readableChars: number;
  /** Words on a typical page — the "is it a book or just headers" measure. */
  medianWords: number;
  /** null when the book passed. */
  problem: PdfUnreadableReason | null;
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]
    : Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Decide whether a PDF's text is real prose or a book-shaped shell.
 *
 * The earlier check counted readable characters across the whole file and
 * demanded 1,000. That sounds strict and measured nothing at all: the Grade
 * 10 Biology book clears it with 30,444 characters, every one of them a
 * running header repeated 182 times. Length cannot tell the difference,
 * because a broken book is not short — it is *dense with nothing*.
 */
export function auditPageText(pages: string[]): PageTextAudit {
  const readableChars = (pages.join(" ").match(/[\p{L}\p{N}]/gu) ?? []).length;
  const medianWords = median(pages.map(wordCount));

  let problem: PdfUnreadableReason | null = null;
  if (readableChars < MIN_READABLE_CHARS) {
    problem = readableChars === 0 ? "no-text" : "too-thin";
  } else if (medianWords < MIN_MEDIAN_WORDS_PER_PAGE) {
    problem = "header-only";
  }
  return { readableChars, medianWords, problem };
}

/**
 * Thrown when a PDF's text cannot be trusted. Carries the measured numbers
 * and a reason code rather than a finished sentence, so the route can render
 * it in the student's language.
 */
export class PdfUnreadableError extends Error {
  readonly reason: PdfUnreadableReason;
  readonly audit: PageTextAudit;

  constructor(audit: PageTextAudit) {
    super(`PDF text is not readable (${audit.problem ?? "no-text"})`);
    this.name = "PdfUnreadableError";
    this.reason = audit.problem ?? "no-text";
    this.audit = audit;
  }
}

let pdfLibPromise: Promise<typeof import("pdfjs-dist")> | null = null;

type OutlineNode = NonNullable<
  Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>
>[number];

// Lazy-loads the PDF engine (and its worker) only on first use, so the base
// bundle and first paint stay light on mobile connections.
async function getPdfLib() {
  if (!pdfLibPromise) {
    pdfLibPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([lib, workerModule]) => {
      lib.GlobalWorkerOptions.workerSrc = workerModule.default;
      return lib;
    });
  }
  return pdfLibPromise;
}

type OutlineEntry = { title: string; path: string; pageIndex: number };

// The PDF's outline is its table of contents. Flatten the tree in reading
// order, keeping each heading's full path (`Chapter 1 · 1.2 Reflection`) and
// the page it lands on. That path is what we slice chunks with.
async function readOutline(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const raw = await doc.getOutline();
  if (!raw?.length) return [];

  const entries: OutlineEntry[] = [];
  const walk = async (nodes: OutlineNode[], parentPath: string) => {
    for (const node of nodes) {
      const title = (node?.title ?? "").trim();
      let pageIndex: number | null = null;
      if (node?.dest != null) {
        try {
          const dest = await doc.getDestination(
            node.dest as Parameters<PDFDocumentProxy["getDestination"]>[0],
          );
          const ref = dest?.[0] as { num: number; gen: number } | undefined;
          if (ref?.num != null) pageIndex = await doc.getPageIndex(ref);
        } catch {
          // Unresolvable destination — the entry simply isn't a cut point.
        }
      }
      const path = parentPath ? `${parentPath} · ${title}` : title;
      if (title && pageIndex != null) {
        entries.push({ title, path, pageIndex });
      }
      if (Array.isArray(node?.items) && node.items.length) {
        await walk(node.items, path);
      }
    }
  };
  await walk(raw, "");
  return entries;
}

// Single source of truth for the "too big" rejection, shared by the PDF path
// in this module and the file-picker validation in the textbooks route.
export function fileSizeError(file: File): string | null {
  if (file.size > MAX_FILE_MB * 1_000_000) {
    return `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB — Kiftet accepts PDFs up to ${MAX_FILE_MB} MB.`;
  }
  return null;
}

/**
 * Open a PDF and pull everything we can from its text layer.
 *
 * The document is deliberately left *loaded* when the text turns out to be
 * unreadable: OCR needs to render the same pages later, and re-opening an
 * 11 MB book costs seconds. The caller closes it via `close`.
 */
/**
 * A run that decodes to nothing but control characters was *body text* — those
 * codes are the letters, one per glyph. Leaving it inline welds its readable
 * neighbours together, and on the Grade 10 Biology textbook that is exactly
 * what turned a running header into "Unit 2: PlantsUnit 2: PlantsUnit 2:
 * Plants". Breaking the line there keeps the survivors apart, and costs
 * nothing: a broken run contributes no words either way.
 */
function isUndecodableRun(text: string): boolean {
  return text.length > 0 && stripUndecodableGlyphs(text).trim().length === 0;
}

async function openPdf(file: File): Promise<{
  doc: PDFDocumentProxy;
  close: () => Promise<void>;
  pages: string[];
  outline: OutlineEntry[];
  audit: PageTextAudit;
}> {
  const sizeError = fileSizeError(file);
  if (sizeError) {
    throw new Error(sizeError);
  }

  const pdf = await getPdfLib();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdf.getDocument({ data });
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let line = "";
    for (const item of content.items) {
      if (!item || typeof item !== "object" || !("str" in item)) continue;
      const { str, hasEOL } = item as ExtractedItem;
      const text = str ?? "";
      line += text;
      if (hasEOL || isUndecodableRun(text)) {
        if (line.trim()) lines.push(line);
        line = "";
      }
    }
    if (line.trim()) lines.push(line);
    // Drop undecodable glyphs per page, so a page that is half headers and
    // half control codes does not poison the chunk it lands in.
    pages.push(stripUndecodableGlyphs(lines.join("\n")).trim());
  }

  const outline = await readOutline(doc);

  return {
    doc,
    pages,
    outline,
    audit: auditPageText(pages),
    close: () => loadingTask.destroy(),
  };
}

type PageSegment = { title: string; start: number; end: number };

// Slice the book along its own table of contents: each outline entry becomes
// the *start* of a chunk, so the AI reads one navigable section at a time.
// Front matter (cover, the ToC itself) before the first cut is skipped.
function chunkByOutline(
  pages: string[],
  outline: OutlineEntry[],
): PageSegment[] {
  const sorted = outline
    .filter((e) => e.pageIndex > 0 && e.pageIndex < pages.length)
    .sort((a, b) => a.pageIndex - b.pageIndex);

  // One cut per page — a heading pinned to the same page as an earlier one
  // keeps the earlier cut, and its text rolls into the chunk below it.
  const cuts: OutlineEntry[] = [];
  for (const e of sorted) {
    const last = cuts[cuts.length - 1];
    if (!last || last.pageIndex !== e.pageIndex) cuts.push(e);
  }
  if (cuts.length < 2) return [];

  const segments: PageSegment[] = [];
  for (let i = 0; i < cuts.length; i += 1) {
    const start = cuts[i].pageIndex;
    const end = i + 1 < cuts.length ? cuts[i + 1].pageIndex : pages.length;
    if (end <= start) continue;
    segments.push({ title: cuts[i].path, start, end });
  }
  return segments;
}

function segmentPages(pages: string[]): PageSegment[] {
  const segments: PageSegment[] = [];
  let current: PageSegment = { title: "Chunk 1", start: 0, end: 0 };
  pages.forEach((text, i) => {
    const heading = headingOf(text);
    if (heading && i > current.start) {
      current.end = i;
      segments.push(current);
      current = { title: heading, start: i, end: i };
    } else if (heading && i === 0) {
      current.title = heading;
    }
  });
  current.end = pages.length;
  segments.push(current);
  return segments;
}

function fallbackPages(pages: string[]): PageSegment[] {
  // No TOC and no headings — split into roughly-equal page runs with enough
  // text per chunk, but keep each under the character cap.
  const total = pages.join(" ").length;
  const targetCount = Math.max(1, Math.min(20, Math.round(total / 14_000)));
  const per = Math.max(2, Math.ceil(pages.length / targetCount));
  const segments: PageSegment[] = [];
  for (let start = 0; start < pages.length; start += per) {
    segments.push({
      title: `Chunk ${segments.length + 1}`,
      start,
      end: Math.min(pages.length, start + per),
    });
  }
  return segments;
}

// ────────────────────────────────────────────────────────────────
// OCR path — chapters are found without reading the body at all.
// ────────────────────────────────────────────────────────────────

/**
 * A segment shorter than this is a divider or a contents page, not a unit.
 *
 * When the chapter list has to come from a running header (see
 * `segmentsForOcrBook`) the *first* page of each unit often carries a short
 * variant of the unit's name while the pages after it carry the full one —
 * "Unit 1: S" on the contents page, "Unit One: Sub-fields of Biology" in the
 * header. Cutting on both produces a one-page chunk that is really just a
 * title page, so a cut that lands this soon after the previous one is folded
 * into the chapter that follows.
 */
const MIN_OCR_SEGMENT_PAGES = 2;

/**
 * Derive chapters from a book whose body text cannot be extracted.
 *
 * This is the trick that makes on-device OCR usable at all. Measured on the
 * Grade 10 Biology textbook: 90% of its characters are in a font with no
 * Unicode map, but the remaining 10% — unit headers, figure captions,
 * "Review Questions" — extracts cleanly. That 10% is enough to find where each
 * unit starts, so the chapter list appears in about a second instead of the
 * ~16 minutes it would take to recognize all 182 pages up front. The body is
 * read later, one chapter at a time, on demand.
 *
 * The subtlety is that these headings are *running headers*: "Unit One:
 * Sub-fields of Biology" prints on all 15 pages of Unit One. Cutting on every
 * occurrence would yield 175 one-page chunks. So a heading only starts a new
 * chapter when it differs from the one currently in force.
 */
export function segmentsForOcrBook(pages: string[]): PageSegment[] {
  const segments: PageSegment[] = [];
  let current: PageSegment | null = null;
  let inForce = "";

  for (let i = 0; i < pages.length; i += 1) {
    const heading = headingOf(pages[i]);
    if (!heading) continue;
    const key = heading.toLowerCase();
    // Same header as the page before: still inside the current chapter.
    if (key === inForce) continue;
    inForce = key;

    if (!current) {
      // Front matter — cover, contents — before the first real heading. It is
      // not a unit, so it is skipped the way `chunkByOutline` skips it.
      if (i > 0) current = { title: heading, start: i, end: pages.length };
      continue;
    }

    const span = i - current.start;
    if (span < MIN_OCR_SEGMENT_PAGES) {
      // Too short to be its own chapter: keep going and take the better title.
      // The longer of the two is nearly always the real one — "Unit One:
      // Sub-fields of Biology" beats a truncated "Unit 1: S".
      if (heading.length > current.title.length) current.title = heading;
      continue;
    }

    current.end = i;
    segments.push(current);
    current = { title: heading, start: i, end: pages.length };
  }

  if (current) segments.push(current);
  return segments;
}

// ────────────────────────────────────────────────────────────────
// The book's own contents page — the best answer to "what are the chapters".
// ────────────────────────────────────────────────────────────────

/**
 * Recognize the contents pages, starting at the page that announces one.
 *
 * Page at a time, rather than a fixed block, because the length of a contents
 * is not knowable in advance and every page beyond it is both seconds the
 * student waits and noise in the parse. A page that stops yielding entries
 * ends the walk.
 *
 * Returns whatever was read, so a contents cut short by a bad page still yields
 * the units it did manage to state.
 */
async function readContentsPages(
  doc: PDFDocumentProxy,
  bookKey: string,
  start: number,
  pageCount: number,
  language: OcrLanguage,
): Promise<TocChapter[]> {
  let text = "";
  let chapters: TocChapter[] = [];
  const limit = Math.min(start + TOC_MAX_PAGES, pageCount);
  for (let page = start; page < limit; page += 1) {
    const [recognized] = await ocrPageRange(
      doc,
      bookKey,
      page,
      page + 1,
      language,
    );
    const grown = parseToc(joinOcrPages([recognized]));
    // One thin page mid-contents — a blank verso, a fold — should not be read as
    // the end of it, so only stop once the walk has found something to lose.
    if (chapters.length > 0 && grown.length < TOC_MIN_ENTRIES_PER_PAGE) break;
    text += `\n${recognized?.text ?? ""}`;
    chapters = chaptersFromToc(parseToc(text));
  }
  return chapters;
}

/**
 * Find the printed-page → PDF-page offset by cross-checking two independent
 * signals: the contents page names where each unit starts, and the running
 * headers in the page text show where each unit actually begins.
 *
 * Pairing them in order is deliberate. Matching on the *text* of a heading
 * would be more direct and much less reliable — this book's contents say "Unit
 * 2: Plants" while its headers say "Unit Two: Plants", and on a worse book
 * neither may extract at all. Order survives when wording does not.
 *
 * Returns null unless the agreement is convincing, because a wrong offset
 * silently produces six chapters of the wrong pages, and that is worse than
 * falling back to the heading scan which at least knows where the headings are.
 */
export function tocPageOffset(
  chapters: TocChapter[],
  segments: PageSegment[],
): number | null {
  const pairs = Math.min(chapters.length, segments.length);
  if (pairs < 2) return null;
  const tally = new Map<number, number>();
  for (let i = 0; i < pairs; i += 1) {
    const offset = segments[i].start - chapters[i].page;
    tally.set(offset, (tally.get(offset) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [offset, count] of tally) {
    if (offset < 0) continue;
    if (count > bestCount) {
      best = offset;
      bestCount = count;
    }
  }
  // One coincidence is not a pattern. Two agreeing pairs is the floor, and the
  // winner must hold more of them than any rival.
  if (best === null || bestCount < 2) return null;
  return best;
}

/**
 * Chapters as the contents page describes them, with the page ranges the
 * printed page numbers imply.
 *
 * Returns null — meaning "use the heading scan instead" — when the numbering
 * cannot be trusted: no units, no sections under them, pages that do not
 * increase, or a range that runs off the end of the book.
 */
export function chaptersFromContents(
  chapters: TocChapter[],
  offset: number,
  pageCount: number,
): { title: string; start: number; end: number; topics: string[] }[] | null {
  if (chapters.length === 0) return null;
  const out = chapters.map((chapter, i) => {
    const next = chapters[i + 1];
    const start = chapter.page + offset;
    const end = next ? next.page + offset : pageCount;
    return {
      title: `Unit ${chapter.unit}: ${chapter.title}`,
      start,
      end: Math.min(end, pageCount),
      // The number is kept: "2.3.1" carries that it is a third-level idea, and
      // it is what lets the checklist be read in the order the book teaches it.
      topics: chapter.topics.map(
        (topic) => `${topic.path.join(".")} ${topic.title}`,
      ),
    };
  });
  const sane = out.every(
    (c, i) =>
      c.start >= 0 &&
      c.start < pageCount &&
      c.end > c.start &&
      (i === 0 || c.start > out[i - 1].start),
  );
  return sane ? out : null;
}

// ────────────────────────────────────────────────────────────────
// Pasted-text path — same chunking, over raw text instead of pages.
// ────────────────────────────────────────────────────────────────

function segmentText(text: string): { title: string; text: string }[] {
  const lines = text.split("\n");
  const segments: { title: string; text: string }[] = [];
  let current: { title: string; text: string } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = headingOf(line);
    if (heading) {
      if (current) segments.push(current);
      current = { title: heading, text: line };
    } else if (current) {
      current.text += `\n${line}`;
    }
  }
  if (current) segments.push(current);

  if (segments.length <= 1) {
    // No headings — chunk into roughly even, structured pieces.
    const chunks: typeof segments = [];
    let buffer = "";
    for (const line of lines) {
      if (!line.trim()) continue;
      buffer += `${line.trim().replace(/\s+/g, " ")}\n`;
      if (buffer.length >= 12_000) {
        chunks.push({
          title: `Chunk ${chunks.length + 1}`,
          text: buffer.trim(),
        });
        buffer = "";
      }
    }
    if (buffer.trim())
      chunks.push({
        title: `Chunk ${chunks.length + 1}`,
        text: buffer.trim(),
      });
    if (chunks.length) return chunks;
    return [{ title: "Chunk 1", text: text.trim() }];
  }
  return segments;
}

// ────────────────────────────────────────────────────────────────
// Public plan — the list of chunks the user confirms before importing.
// ────────────────────────────────────────────────────────────────

/**
 * Reads the body of one chapter, on demand, from the page images.
 *
 * Held by the import screen rather than resolved during planning, because
 * recognizing a whole book costs ~16 minutes and the student should see the
 * chapter list long before that. One chapter is ~20 pages, so ~2 minutes — and
 * the result is cached per page, so it happens once per book, ever.
 */
export type OcrChunkReader = {
  /** Identity of the book in the OCR cache (name + byte length). */
  bookKey: string;
  /** True once every page of every planned chunk has been recognized. */
  isComplete: (chunk: ImportChunk) => boolean;
  read: (
    chunk: ImportChunk,
    onProgress?: (p: OcrProgress) => void,
  ) => Promise<string>;
  close: () => Promise<void>;
};

export type ImportPlan = {
  chunks: ImportChunk[];
  /** Present only when the book has to be read from page images. */
  reader: OcrChunkReader | null;
  /** Why OCR is needed, for the message shown to the student. */
  ocrReason: PdfUnreadableReason | null;
};

function ocrLanguage(language: string): OcrLanguage {
  return language === "am" ? "amh" : "eng";
}

/**
 * Turn a chosen file into the chapter list the student confirms.
 *
 * A readable PDF is split here and now, exactly as before — extraction is
 * instant and free. A PDF whose text layer is broken takes the OCR path: the
 * chapters are still identified immediately, from the readable fraction of the
 * text, but their bodies arrive later via `reader`.
 */
export async function planImport(
  source: ImportSource,
  language = "en",
): Promise<ImportPlan> {
  if (source.kind !== "pdf") {
    const chunks = await planChunks(source);
    return { chunks, reader: null, ocrReason: null };
  }

  const { doc, pages, outline, audit, close } = await openPdf(source.file);
  let open = true;
  const closeOnce = async () => {
    if (!open) return;
    open = false;
    await close();
  };

  try {
    if (!audit.problem) {
      // The normal path: real text, no OCR, nothing left open.
      await closeOnce();
      let segments =
        outline.length >= 2
          ? chunkByOutline(pages, outline)
          : segmentPages(pages);
      if (segments.length <= 1) segments = fallbackPages(pages);
      const chunks = segments
        .flatMap((s) => {
          const full = pages.slice(s.start, s.end).join("\n\n").trim();
          return full ? withPartSplits(s.title, full) : [];
        })
        // A book can pass the audit overall and still have a section that is
        // nothing but a heading and a page number. Importing that as a chapter
        // would have the model diagnose a page it never actually read.
        .filter((c) => wordCount(c.rawText) >= MIN_CHUNK_WORDS);
      return { chunks: uniqueTitles(chunks), reader: null, ocrReason: null };
    }

    // The text layer is unreadable. Find the chapters from whatever *is*
    // readable, and read the bodies later.
    let segments = segmentsForOcrBook(pages);
    if (segments.length === 0) segments = fallbackPages(pages);

    const bookKey = ocrBookKey(source.name, source.file.size);
    const language_ = ocrLanguage(language);

    // The contents pages are the cheapest pages in the book to recognize and
    // the only ones that state the structure outright, so they are read before
    // anything else — two or three pages, a few seconds, against the ~16
    // minutes the whole file would take.
    let contents:
      | {
          title: string;
          start: number;
          end: number;
          topics: string[];
        }[]
      | null = null;
    const tocStart = pages.findIndex(
      (text, i) => i < TOC_SEARCH_PAGES && looksLikeTocPage(text),
    );
    if (tocStart >= 0) {
      try {
        // Read the contents one page at a time and stop at the first page that
        // is not one. The book's contents run to two pages; the third is the
        // first chapter, which also lists numbered lines but no page numbers,
        // so it ends the walk in three recognitions instead of six.
        const found = await readContentsPages(
          doc,
          bookKey,
          tocStart,
          pages.length,
          language_,
        );
        const offset = tocPageOffset(found, segments);
        if (offset !== null) {
          contents = chaptersFromContents(found, offset, pages.length);
        }
      } catch (error) {
        // No contents, or they would not recognize. The heading scan below
        // already found every unit, so this is a smaller loss, not a failure.
        console.warn(
          "[textbook] contents OCR failed; using detected headings",
          error,
        );
      }
    }

    const chunks = uniqueTitles(
      contents
        ? contents.map((c) => ({
            title: c.title,
            rawText: "",
            pages: { start: c.start, end: c.end },
            needsOcr: true,
            topics: c.topics,
          }))
        : segments.map((s) => ({
            title: s.title,
            rawText: "",
            pages: { start: s.start, end: s.end },
            needsOcr: true,
          })),
    );

    const done = new Set<string>();
    const pagesOf = (chunk: ImportChunk): number[] => {
      if (!chunk.needsOcr || !chunk.pages) return [];
      const { start, end } = chunk.pages;
      return Array.from({ length: end - start }, (_, k) => start + k);
    };
    const reader: OcrChunkReader = {
      bookKey,
      isComplete: (chunk) => {
        if (!chunk.needsOcr) return true;
        // Already read into memory by an earlier call.
        if (chunk.rawText.trim()) return true;
        const pages = pagesOf(chunk);
        return (
          pages.length > 0 && pages.every((i) => done.has(keyOf(bookKey, i)))
        );
      },
      read: async (chunk, onProgress) => {
        if (!chunk.needsOcr || !chunk.pages) return chunk.rawText;
        if (chunk.rawText.trim()) return chunk.rawText;
        const { start, end } = chunk.pages;
        for (let i = start; i < end; i += 1) done.add(keyOf(bookKey, i));
        const results = await ocrPageRange(
          doc,
          bookKey,
          start,
          end,
          ocrLanguage(language),
          onProgress,
        );
        return joinOcrPages(results);
      },
      close: closeOnce,
    };

    return { chunks, reader, ocrReason: audit.problem };
  } catch (err) {
    await closeOnce();
    throw err;
  }
}

const keyOf = (bookKey: string, pageIndex: number) => `${bookKey}#${pageIndex}`;

/**
 * The chapter list on its own, with no OCR reader.
 *
 * Kept for the pasted-text path and for tests that only care about chunking.
 * A PDF that needs OCR cannot be planned this way — there is no body text to
 * return — so it reports the measured reason instead.
 */
export async function planChunks(source: ImportSource): Promise<ImportChunk[]> {
  if (source.kind === "text") {
    const segments = segmentText(source.text);
    return uniqueTitles(
      segments.flatMap((s) => withPartSplits(s.title, s.text)),
    );
  }

  const { pages, outline, audit, close } = await openPdf(source.file);
  try {
    if (audit.problem) throw new PdfUnreadableError(audit);
    let segments =
      outline.length >= 2
        ? chunkByOutline(pages, outline)
        : segmentPages(pages);
    if (segments.length <= 1) segments = fallbackPages(pages);
    const chunks = segments
      .flatMap((s) => {
        const full = pages.slice(s.start, s.end).join("\n\n").trim();
        return full ? withPartSplits(s.title, full) : [];
      })
      .filter((c) => wordCount(c.rawText) >= MIN_CHUNK_WORDS);
    return uniqueTitles(chunks);
  } finally {
    await close();
  }
}
