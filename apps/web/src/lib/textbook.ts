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
  /** User-facing chapter title when this internal ingest chunk is one of parts. */
  parentTitle?: string;
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
  topics?: TopicEntry[];
};

/**
 * One numbered line of the book's contents, with the page it begins on.
 *
 * The page is what lets a student tick "1.1.1 The nucleus" instead of the whole
 * unit it sits in: a numbered line plus its page is a range, because the next
 * line's page is where this one stops. Dropping the page earlier left every
 * topic as a label with nothing behind it.
 */
export type TopicEntry = {
  /**
   * Nesting as the book's own outline spells it, " · " joined:
   * `"1.1 · 1.1.1 The nucleus"`. The chain is kept because it is what says
   * whether a line is a first-level topic or a third-level one — the number
   * alone cannot, on a book that numbers its units per chapter.
   */
  path: string;
  title: string;
  /** PDF page index this topic begins on, or null when the book did not say. */
  page: number | null;
};

/** The topic as the ingest endpoint and the book both spell it. */
export function topicLabel(topic: TopicEntry): string {
  return topic.path;
}

export type ImportTocNode = {
  id: string;
  title: string;
  start: number | null;
  end: number | null;
  children: ImportTocNode[];
  /** Internal ingest rows represented by this user-facing chapter. */
  chunkIndexes?: number[];
};

/**
 * The printed number a TOC line carries, and the label left once it is removed.
 *
 * Splitting these two is what lets the contents render like a contents page: the
 * number sits in its own aligned column and the titles line up under each other,
 * which is how a student reads a book — "1.1.1" is an address, not a sentence.
 *
 * A unit is written "Unit 2: Plants", so its number is "Unit 2" and the colon is
 * left on the title rather than being swallowed.
 */
export function splitTocNumber(title: string): {
  number: string | null;
  label: string;
} {
  const unit = /^Unit\s+(\d+)\s*[:.-]?\s*(.+)$/i.exec(title);
  if (unit) return { number: `Unit ${unit[1]}`, label: unit[2] ?? title };
  const dotted = /^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/.exec(title);
  if (dotted) return { number: dotted[1] ?? null, label: dotted[2] ?? title };
  return { number: null, label: title };
}

/**
 * How many numbering levels a line carries: "Unit 2" is one, "2.3" is two,
 * "2.3.1" is three.
 *
 * This is only ever used to line the number up in the contents column — the
 * tree itself nests on `children`, which the parser already got right. A line
 * the book never numbered returns 0, and the renderer falls back to its place
 * in the tree.
 */
export function numberDepth(title: string): number {
  const { number } = splitTocNumber(title);
  return number ? number.split(".").length : 0;
}

/**
 * Everything the contents tree needs, computed once per tree in the UI.
 *
 * Counting is done here rather than in the renderer because the two numbers are
 * easy to get wrong together: how many entries the book holds in total, and how
 * many sit under a given branch. A unit's own count is what the checklist shows
 * next to its checkbox, and it has to include the sub-topics — a unit with two
 * topics and five sub-topics reads as seven, not two.
 */
export type TocIndex = {
  /** Every node by id, so a tick anywhere can find its unit. */
  byId: Map<string, ImportTocNode>;
  /** Every id in reading order — the order a keyboard walks the tree in. */
  order: string[];
  /** Total entries in the book, units included. */
  total: number;
  /** Entries under a node, sub-topics included, excluding the node itself. */
  descendants: Map<string, number>;
  /** Nearest ancestor that carries `chunkIndexes` — the unit a node belongs to. */
  unitOf: Map<string, ImportTocNode>;
};

export function indexToc(nodes: ImportTocNode[]): TocIndex {
  const byId = new Map<string, ImportTocNode>();
  const unitOf = new Map<string, ImportTocNode>();
  const order: string[] = [];
  const walk = (list: ImportTocNode[], unit: ImportTocNode | null) => {
    for (const node of list) {
      order.push(node.id);
      byId.set(node.id, node);
      const owner = node.chunkIndexes ? node : unit;
      unitOf.set(node.id, owner ?? node);
      walk(node.children, owner ?? null);
    }
  };
  walk(nodes, null);
  const descendants = new Map<string, number>();
  const count = (node: ImportTocNode): number => {
    const n = node.children.reduce((sum, child) => sum + count(child), 0);
    descendants.set(node.id, n);
    return n + 1;
  };
  for (const node of nodes) count(node);
  return { byId, order, total: order.length, descendants, unitOf };
}

/** True when this node's own pages are known well enough to import alone. */
export function isSelectableTopic(node: ImportTocNode): boolean {
  return (
    !node.chunkIndexes &&
    node.start !== null &&
    node.end !== null &&
    node.end > node.start
  );
}

export function visibleChapterTitle(title: string): {
  title: string;
  section: number | null;
} {
  const match = /^(.*?) \(part (\d+)\)$/.exec(title);
  return match
    ? { title: match[1] ?? title, section: Number(match[2]) }
    : { title, section: null };
}

function topicsAsTree(
  topics: TopicEntry[],
  parentId: string,
  chapterEnd: number,
): ImportTocNode[] {
  const roots: ImportTocNode[] = [];
  const stack: { depth: number; node: ImportTocNode }[] = [];
  topics.forEach((topic, index) => {
    const pathParts = topic.path.split(" · ");
    const title = pathParts.at(-1) ?? topic.path;
    const prefix = /^(\d+(?:\.\d+)*)\b/.exec(title)?.[1];
    const numberDepth = prefix ? prefix.split(".").length : 1;
    const depth = Math.max(pathParts.length, numberDepth);
    const node: ImportTocNode = {
      id: `${parentId}-topic-${index}`,
      title,
      start: topic.page,
      end: null,
      children: [],
    };
    while ((stack.at(-1)?.depth ?? 0) >= depth) stack.pop();
    const parent = stack.at(-1)?.node;
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push({ depth, node });
  });
  // Reading order, flattened. A topic's own pages run until the next line at
  // the same depth or shallower — a sub-topic sits *inside* its parent's
  // range, so counting every following line would end a unit at its own first
  // page and leave the rest of the book unclaimed.
  const flat: { depth: number; node: ImportTocNode }[] = [];
  const walk = (nodes: ImportTocNode[], depth: number) => {
    for (const node of nodes) {
      flat.push({ depth, node });
      walk(node.children, depth + 1);
    }
  };
  walk(roots, 1);
  flat.forEach((entry, i) => {
    const next = flat.slice(i + 1).find((later) => later.depth <= entry.depth);
    entry.node.end = Math.max(
      next?.node.start ?? chapterEnd,
      (entry.node.start ?? chapterEnd) + 1,
    );
  });
  return roots;
}

/**
 * One thing to read, in the order the book teaches it.
 *
 * A unit is one job covering all of its chunks, including the "(part n)" splits
 * an oversized chapter is carved into. A topic is one job covering exactly the
 * pages between its own number and the next line at the same depth or shallower.
 */
export type TocJob =
  | { kind: "unit"; nodeId: string; title: string; chunkIndexes: number[] }
  | {
      kind: "topic";
      nodeId: string;
      title: string;
      unit: string;
      number: string | null;
      pages: { start: number; end: number };
    };

/**
 * Turn a set of ticked node ids into the list of things to read.
 *
 * A ticked unit swallows its topics rather than queueing alongside them:
 * reading Unit 1 whole already covers the pages of 1.1 and 1.1.1, so honouring
 * both would OCR every page of the unit twice and ingest the same text under
 * two chapter names.
 *
 * A ticked topic under an *unticked* unit does stand on its own, which is the
 * point — a student who only wants 1.1.1 gets 1.1.1's pages and nothing else.
 */
export function tocJobs(
  toc: ImportTocNode[],
  selection: Set<string>,
): TocJob[] {
  const jobs: TocJob[] = [];
  const walk = (nodes: ImportTocNode[], unitTitle: string | null) => {
    for (const node of nodes) {
      const isUnit = Boolean(node.chunkIndexes);
      if (selection.has(node.id)) {
        if (isUnit) {
          jobs.push({
            kind: "unit",
            nodeId: node.id,
            title: node.title,
            chunkIndexes: node.chunkIndexes ?? [],
          });
          continue;
        }
        if (isSelectableTopic(node) && unitTitle !== null) {
          const { number } = splitTocNumber(node.title);
          jobs.push({
            kind: "topic",
            nodeId: node.id,
            title: node.title,
            unit: unitTitle,
            number,
            pages: { start: node.start ?? 0, end: node.end ?? 0 },
          });
          continue;
        }
        // Ticked but unreadable alone (no page range): fall through to its
        // children so ticking a branch with one broken line still reads the
        // lines beneath it.
      }
      walk(node.children, isUnit ? node.title : unitTitle);
    }
  };
  walk(toc, null);
  return jobs;
}

/** Entries in the selection a student can count on being read. */
export function selectedCount(toc: ImportTocNode[], selection: Set<string>) {
  return tocJobs(toc, selection).length;
}

export function importTocTree(chunks: ImportChunk[]): ImportTocNode[] {
  const roots = new Map<string, ImportTocNode>();
  chunks.forEach((chunk, index) => {
    const title = chunk.parentTitle ?? chunk.title;
    let root = roots.get(title);
    if (!root) {
      const id = `chapter-${index}`;
      root = {
        id,
        title,
        start: chunk.pages?.start ?? null,
        end: chunk.pages?.end ?? null,
        children: topicsAsTree(
          chunk.topics ?? [],
          id,
          chunk.pages?.end ?? chunk.pages?.start ?? 0,
        ),
        chunkIndexes: [],
      };
      roots.set(title, root);
    }
    root.chunkIndexes?.push(index);
  });
  return [...roots.values()];
}

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
 *
 * `pages` rides along onto every part. The span describes the chapter, not the
 * individual part, and it is what the contents tree needs: without it a topic's
 * range has no end to stop at, so the last topic of a unit came out a page short
 * of the unit's own last page.
 */
export function withPartSplits(
  title: string,
  full: string,
  topics?: TopicEntry[],
  pages?: { start: number; end: number },
): ImportChunk[] {
  const out: ImportChunk[] = [];
  const split = full.length > MAX_CHAPTER_CHARS;
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
      parentTitle: split ? title : undefined,
      pages,
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
      parentTitle: split ? title : undefined,
      pages,
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

/**
 * The page an outline entry lands on.
 *
 * Two shapes of destination exist, and pdfjs only resolves one of them.
 * `getDestination` looks up a *named* destination by string and rejects anything
 * else. The array form — `[pageRef, /XYZ, left, top, zoom]` — carries the page
 * reference itself as `{ num, gen }`, and `getPageIndex` takes that shape
 * directly. Word, LaTeX, Acrobat, PyMuPDF and pypdf all write the array form, so
 * sending it to `getDestination` threw on every entry, the error was swallowed,
 * and the whole outline came back empty: a readable book with bookmarks was cut
 * up by heading detection instead, with no topics and no page ranges.
 */
async function outlinePageIndex(
  doc: PDFDocumentProxy,
  dest: unknown,
): Promise<number | null> {
  const ref = (candidate: unknown) =>
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { num?: unknown }).num === "number" &&
    typeof (candidate as { gen?: unknown }).gen === "number"
      ? (candidate as { num: number; gen: number })
      : null;

  try {
    if (typeof dest === "string") {
      const resolved = await doc.getDestination(dest);
      const named = ref(resolved?.[0]);
      return named ? await doc.getPageIndex(named) : null;
    }
    if (Array.isArray(dest)) {
      const direct = ref(dest[0]);
      return direct ? await doc.getPageIndex(direct) : null;
    }
    return null;
  } catch {
    // Unresolvable destination — the entry simply isn't a cut point.
    return null;
  }
}

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
      const pageIndex =
        node?.dest == null
          ? null
          : await outlinePageIndex(doc, node.dest as never);
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

/**
 * The book as its own bookmarks describe it: one chunk per top-level entry,
 * with everything nested under it kept as that entry's topics.
 *
 * Exported because the level this picks is a judgement worth pinning — see the
 * test for the book whose first unit opens on page 0.
 */
export function chaptersFromOutline(
  pages: string[],
  outline: OutlineEntry[],
): ImportChunk[] | null {
  const valid = outline
    // `>= 0`, not `> 0`: a book whose first unit opens on its own first page
    // puts that unit at index 0, and dropping it leaves one top-level entry —
    // one too few to trust the top level, so the whole hierarchy collapses onto
    // the second level and the units disappear from the tree.
    .filter((entry) => entry.pageIndex >= 0 && entry.pageIndex < pages.length)
    .sort((a, b) => a.pageIndex - b.pageIndex);
  const topLevel = valid.filter((entry) => !entry.path.includes(" · "));
  let chapters = topLevel.length >= 2 ? topLevel : [];
  if (chapters.length < 2) {
    const secondLevel = valid.filter(
      (entry) => entry.path.split(" · ").length === 2,
    );
    if (secondLevel.length >= 2) chapters = secondLevel;
  }
  const cuts = chapters.filter(
    (entry, index) =>
      index === 0 || entry.pageIndex !== chapters[index - 1]?.pageIndex,
  );
  if (cuts.length < 2) return null;

  const chunks = cuts.flatMap((entry, index) => {
    const start = entry.pageIndex;
    const end = cuts[index + 1]?.pageIndex ?? pages.length;
    const body = pages.slice(start, end).join("\n\n").trim();
    if (!body) return [];
    const prefix = `${entry.path} · `;
    const topics = valid
      .filter(
        (candidate) =>
          candidate.path.startsWith(prefix) &&
          candidate.pageIndex >= start &&
          candidate.pageIndex < end,
      )
      .map((candidate) => ({
        path: candidate.path.slice(prefix.length),
        title: candidate.title,
        page: candidate.pageIndex,
      }));
    return withPartSplits(entry.title, body, topics, { start, end });
  });
  return uniqueTitles(
    chunks.filter((chunk) => wordCount(chunk.rawText) >= MIN_CHUNK_WORDS),
  );
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
 * The identity of a heading: what it says the chapter *is*, ignoring the parts
 * that change page to page.
 *
 * Text extraction hands back the running header exactly as the page printed it,
 * so "Unit 3: Cell Reproduction 47" and "Unit 3: Cell Reproduction 48" are
 * different strings and different chapters — one unit became five. Dropping the
 * trailing page number, punctuation and case makes the comparison answer the
 * question the caller is actually asking: is this the same chapter again?
 */
function headingKey(heading: string): string {
  return cleanHeading(heading).toLowerCase().replace(/\s+/g, " ").trim();
}

/** A heading without its trailing page number, which is not part of its name. */
function cleanHeading(heading: string): string {
  const cleaned = heading
    .trim()
    .replace(/[\s:.,;–—-]+$/, "")
    .replace(/\s+(?:p(?:age)?\.?\s*)?\d{1,4}$/i, "")
    .trim();
  // Never strip a heading down to nothing — "Unit 4" must survive.
  return cleaned || heading.trim();
}

/**
 * The last page of the front matter: the cover and the book's own contents.
 *
 * A contents page lists every unit title with its page number, so a heading read
 * there is a listing rather than a unit. Counting it as the start of a chapter
 * is not only wasted work — it shifts that unit's range onto the contents page
 * and shifts the printed-page offset that the whole cross-check depends on.
 * Nothing is OCR'd to learn this: the extracted text already says "contents".
 */
function frontMatterEnd(pages: string[]): number {
  let last = -1;
  const window = Math.min(pages.length, TOC_SEARCH_PAGES);
  for (let i = 0; i < window; i += 1) {
    if (looksLikeTocPage(pages[i])) last = i;
  }
  return last;
}

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
  const front = frontMatterEnd(pages);
  let current: PageSegment | null = null;
  let inForce = "";
  let currentKey = "";

  for (let i = 0; i < pages.length; i += 1) {
    const heading = headingOf(pages[i]);
    if (!heading) continue;
    // The cover carries no unit, and page 0 of a scanned book is as likely to be
    // a title page as a chapter. Asked before the heading is remembered, not
    // after: a heading that is refused here must not mark the unit that follows
    // it as already seen, or the whole of that unit is skipped as a repeat.
    if (!current && i === 0) continue;
    if (i <= front) continue;
    const key = headingKey(heading);
    // Same header as the page before: still inside the current chapter.
    if (key === inForce) continue;
    inForce = key;

    if (!current) {
      current = { title: cleanHeading(heading), start: i, end: pages.length };
      currentKey = key;
      continue;
    }

    // The same unit seen again, further in. Only its header changed — a new page
    // number, or a second line that fell above it. Still one chapter.
    if (key === currentKey) {
      const title = cleanHeading(heading);
      if (title.length > current.title.length) current.title = title;
      continue;
    }

    const span = i - current.start;
    if (span < MIN_OCR_SEGMENT_PAGES) {
      // Too short to be its own chapter: keep going and take the better title.
      // The longer of the two is nearly always the real one — "Unit One:
      // Sub-fields of Biology" beats a truncated "Unit 1: S".
      const title = cleanHeading(heading);
      if (title.length > current.title.length) {
        current.title = title;
        currentKey = key;
      }
      continue;
    }

    current.end = i;
    segments.push(current);
    current = { title: cleanHeading(heading), start: i, end: pages.length };
    currentKey = key;
  }

  if (current) segments.push(current);

  // Neighbours that resolve to the same unit are one chapter. A book whose
  // running header alternates between two renderings of one name would
  // otherwise still yield a chapter per pair of pages.
  const merged: PageSegment[] = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (previous && headingKey(previous.title) === headingKey(segment.title)) {
      previous.end = segment.end;
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
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
): Promise<{ chapters: TocChapter[]; text: string; pagesRead: number }> {
  let text = "";
  let chapters: TocChapter[] = [];
  let pagesRead = 0;
  const limit = Math.min(start + TOC_MAX_PAGES, pageCount);
  for (let page = start; page < limit; page += 1) {
    const [recognized] = await ocrPageRange(
      doc,
      bookKey,
      page,
      page + 1,
      language,
    );
    pagesRead += 1;
    const grown = parseToc(joinOcrPages([recognized]));
    // One thin page mid-contents — a blank verso, a fold — should not be read as
    // the end of it, so only stop once the walk has found something to lose.
    if (chapters.length > 0 && grown.length < TOC_MIN_ENTRIES_PER_PAGE) break;
    text += `\n${recognized?.text ?? ""}`;
    chapters = chaptersFromToc(parseToc(text));
  }
  return { chapters, text, pagesRead };
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
):
  | {
      title: string;
      start: number;
      end: number;
      topics: TopicEntry[];
    }[]
  | null {
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
      // The printed page becomes a page index with the same offset the units
      // used, so a topic's range and its unit's range are in one coordinate
      // system — mixing the two would put 1.1.1 outside the unit holding it.
      topics: chapter.topics.map((topic) => ({
        path: `${topic.path.join(".")} ${topic.title}`,
        title: topic.title,
        page: topic.page + offset,
      })),
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
  toc: ImportTocNode[];
  /** Present only when the book has to be read from page images. */
  reader: OcrChunkReader | null;
  /** Why OCR is needed, for the message shown to the student. */
  ocrReason: PdfUnreadableReason | null;
  /**
   * What this function understood of the book, in the order it worked it out.
   *
   * A student looking at a contents tree cannot tell a bad reading of the book
   * from a bad display of a good reading — both are just "the units look wrong".
   * This is the receipt: which source produced the list, whether the contents
   * page was found and what it said, what was parsed off it, what the heading
   * scan found, whether the page offset could be trusted, and the tree the
   * screen is about to show. It is deliberately plain data so it can be pasted
   * somewhere and read.
   */
  diagnostics: ImportDiagnostics;
};

export type ImportDiagnostics = {
  /** The path that produced this list — the first thing to look at. */
  source:
    | "pasted-text"
    | "pdf-outline"
    | "pdf-text-layer"
    | "ocr-contents"
    | "ocr-headings";
  file: string;
  pageCount: number;
  /** Entries in the PDF's own bookmark tree, when it has one. */
  outlineEntries: number;
  /** Why the text layer was rejected, when it was. */
  auditProblem: PdfUnreadableReason | null;
  /** Page the word "contents" was found on, or null. */
  contentsPage: number | null;
  /** How many pages were recognized looking for the contents. */
  contentsPagesRead: number;
  /** What those pages said, so a parse that found nothing can be read. */
  contentsText: string;
  /** Entries as parsed off the contents, in the order the book lists them. */
  contentsEntries: { unit: number; title: string; page: number }[];
  /** Units the heading scan found, with the pages each one covers. */
  segments: { title: string; start: number; end: number }[];
  /** Printed page number → PDF page index. Null when it could not be trusted. */
  pageOffset: number | null;
  /** The tree the screen will draw, as flat text. */
  tree: string[];
};

/** Trim a recognized page so a pasted report stays readable. */
function trimForReport(text: string, limit = 3000): string {
  const flat = text.replace(/\n{3,}/g, "\n\n").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}\n…` : flat;
}

/** The tree as indented lines — what the screen is about to draw, readable. */
export function flatTree(toc: ImportTocNode[], depth = 0): string[] {
  const lines: string[] = [];
  for (const node of toc) {
    lines.push(`${"  ".repeat(depth)}${node.title}`);
    lines.push(...flatTree(node.children, depth + 1));
  }
  return lines;
}

/**
 * Print what was understood of the book, in the order it was worked out.
 *
 * One object, one prefix, easy to copy out of a browser console and easy to
 * read: the source that produced the list, whether the contents page was found
 * and what it said, what was parsed off it, what the heading scan found, and
 * whether the page offset was trusted. The tree comes last so it can be compared
 * against the earlier lines without scrolling back.
 */
function logHierarchy(report: ImportDiagnostics): void {
  const { contentsText, ...rest } = report;
  console.info(
    `[textbook] hierarchy — ${report.file} (${report.source})`,
    { ...rest, contentsText: contentsText || "(none read)" },
    report.tree,
  );
}

function ocrLanguage(language: string): OcrLanguage {
  return language === "am" ? "amh" : "eng";
}

/**
 * A reader for a book whose text was already extracted.
 *
 * A readable PDF is read and closed during planning, so at import time there is
 * no document left to open — and yet the pages still have to be servable,
 * because "1.1.1 The nucleus" is not a chunk of its own. It is pages 6 to 8 of
 * a chapter that is, and a student who ticks the sub-topic wants those pages
 * and not the twenty around them. So the per-page text is held and a slice is
 * handed back.
 *
 * The text is already in memory either way — every chunk carries its own pages
 * as one string — so this holds a second reference to the same words rather
 * than keeping the PDF's WASM heap and font tables alive for the session.
 */
export function textLayerReader(pages: string[]): OcrChunkReader {
  return {
    bookKey: "text-layer",
    isComplete: (chunk) =>
      Boolean(chunk.rawText.trim()) ||
      (chunk.pages !== undefined && chunk.pages.end > chunk.pages.start),
    read: async (chunk) => {
      if (chunk.rawText.trim()) return chunk.rawText;
      if (!chunk.pages) return "";
      const start = Math.max(chunk.pages.start, 0);
      const end = Math.min(chunk.pages.end, pages.length);
      return pages.slice(start, end).join("\n\n").trim();
    },
    close: async () => {},
  };
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
  // Filled in as the work proceeds and handed back with the plan, so a reading
  // that looks wrong on screen can be told apart from a display of a good
  // reading. Every field has a value before the plan is returned, including on
  // the paths that bail out early.
  const report: ImportDiagnostics = {
    source: "pasted-text",
    file: source.name,
    pageCount: 0,
    outlineEntries: 0,
    auditProblem: null,
    contentsPage: null,
    contentsPagesRead: 0,
    contentsText: "",
    contentsEntries: [],
    segments: [],
    pageOffset: null,
    tree: [],
  };

  if (source.kind !== "pdf") {
    const chunks = await planChunks(source);
    const toc = importTocTree(chunks);
    report.tree = flatTree(toc);
    logHierarchy(report);
    return {
      chunks,
      toc,
      reader: null,
      ocrReason: null,
      diagnostics: report,
    };
  }

  const { doc, pages, outline, audit, close } = await openPdf(source.file);
  report.pageCount = pages.length;
  report.outlineEntries = outline.length;
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
      let chunks =
        outline.length >= 2 ? chaptersFromOutline(pages, outline) : null;
      if (!chunks) {
        let segments =
          outline.length >= 2
            ? chunkByOutline(pages, outline)
            : segmentPages(pages);
        if (segments.length <= 1) segments = fallbackPages(pages);
        chunks = segments
          .flatMap((s) => {
            const full = pages.slice(s.start, s.end).join("\n\n").trim();
            return full
              ? withPartSplits(s.title, full, undefined, {
                  start: s.start,
                  end: s.end,
                })
              : [];
          })
          // A book can pass the audit overall and still have a section that is
          // nothing but a heading and a page number. Importing that as a chapter
          // would have the model diagnose a page it never actually read.
          .filter((c) => wordCount(c.rawText) >= MIN_CHUNK_WORDS);
      }
      const unique = uniqueTitles(chunks);
      const toc = importTocTree(unique);
      report.source =
        unique.length > 0 && outline.length >= 2
          ? "pdf-outline"
          : "pdf-text-layer";
      report.tree = flatTree(toc);
      logHierarchy(report);
      return {
        chunks: unique,
        toc,
        reader: textLayerReader(pages),
        ocrReason: null,
        diagnostics: report,
      };
    }

    // The text layer is unreadable. Find the chapters from whatever *is*
    // readable, and read the bodies later.
    report.auditProblem = audit.problem;
    let segments = segmentsForOcrBook(pages);
    if (segments.length === 0) segments = fallbackPages(pages);
    report.segments = segments.map((s) => ({
      title: s.title,
      start: s.start,
      end: s.end,
    }));

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
          topics: TopicEntry[];
        }[]
      | null = null;
    const tocStart = pages.findIndex(
      (text, i) => i < TOC_SEARCH_PAGES && looksLikeTocPage(text),
    );
    report.contentsPage = tocStart >= 0 ? tocStart : null;
    if (tocStart >= 0) {
      try {
        // Read the contents one page at a time and stop at the first page that
        // is not one. The book's contents run to two pages; the third is the
        // first chapter, which also lists numbered lines but no page numbers,
        // so it ends the walk in three recognitions instead of six.
        const read = await readContentsPages(
          doc,
          bookKey,
          tocStart,
          pages.length,
          language_,
        );
        report.contentsPagesRead = read.pagesRead;
        report.contentsText = trimForReport(read.text);
        report.contentsEntries = read.chapters.map((c) => ({
          unit: c.unit,
          title: c.title,
          page: c.page,
        }));
        const offset = tocPageOffset(read.chapters, segments);
        report.pageOffset = offset;
        if (offset !== null) {
          contents = chaptersFromContents(read.chapters, offset, pages.length);
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
    report.source = contents ? "ocr-contents" : "ocr-headings";
    report.tree = flatTree(importTocTree(chunks));
    logHierarchy(report);

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

    return {
      chunks,
      toc: importTocTree(chunks),
      reader,
      ocrReason: audit.problem,
      diagnostics: report,
    };
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
    let chunks =
      outline.length >= 2 ? chaptersFromOutline(pages, outline) : null;
    if (!chunks) {
      let segments =
        outline.length >= 2
          ? chunkByOutline(pages, outline)
          : segmentPages(pages);
      if (segments.length <= 1) segments = fallbackPages(pages);
      chunks = segments
        .flatMap((s) => {
          const full = pages.slice(s.start, s.end).join("\n\n").trim();
          return full
            ? withPartSplits(s.title, full, undefined, {
                start: s.start,
                end: s.end,
              })
            : [];
        })
        .filter((c) => wordCount(c.rawText) >= MIN_CHUNK_WORDS);
    }
    return uniqueTitles(chunks);
  } finally {
    await close();
  }
}
