import type { PDFDocumentProxy } from "pdfjs-dist";

type ExtractedItem = { str?: string; hasEOL?: boolean };

// The units we cut and hand to AI are *chunks* — one TOC section at a time,
// never the whole book. A chunk is derived from the PDF's own table of
// contents (its outline/bookmarks tree) when one exists, and falls back to
// heading detection on the extracted text.
export type ImportChunk = {
  title: string;
  rawText: string;
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

function headingOf(text: string): string | null {
  const lines = text.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
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

function withPartSplits(title: string, full: string): ImportChunk[] {
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
    });
    rest = rest.slice(cut).trim();
    part += 1;
  }
  if (rest)
    out.push({
      title: part === 1 ? title : `${title} (part ${part})`,
      rawText: rest,
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

async function extractPdfPages(
  file: File,
): Promise<{ pages: string[]; outline: OutlineEntry[] }> {
  const sizeError = fileSizeError(file);
  if (sizeError) {
    throw new Error(sizeError);
  }

  const pdf = await getPdfLib();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdf.getDocument({ data });
  const doc = await loadingTask.promise;

  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = "";
      for (const item of content.items) {
        if (!item || typeof item !== "object" || !("str" in item)) continue;
        const { str, hasEOL } = item as ExtractedItem;
        line += str ?? "";
        if (hasEOL) {
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

    // Reject a book whose text is not really there *before* any of it is
    // chunked, imported, or sent to the model. See `auditPageText` for the
    // measurement that replaced the old raw-length check, which this book
    // passed with 30,000+ characters of nothing but page headers.
    const audit = auditPageText(pages);
    if (audit.problem) throw new PdfUnreadableError(audit);
    return { pages, outline };
  } finally {
    // Free the PDF worker no matter how far extraction got — a throw mid-page
    // must not leak the loading task for the rest of the browser session.
    await loadingTask.destroy();
  }
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

export async function planChunks(source: ImportSource): Promise<ImportChunk[]> {
  let chunks: ImportChunk[];

  if (source.kind === "pdf") {
    const { pages, outline } = await extractPdfPages(source.file);
    let segments =
      outline.length >= 2
        ? chunkByOutline(pages, outline)
        : segmentPages(pages);
    if (segments.length <= 1) segments = fallbackPages(pages);
    chunks = segments.flatMap((s) => {
      const full = pages.slice(s.start, s.end).join("\n\n").trim();
      return full ? withPartSplits(s.title, full) : [];
    });
    // A book can pass the audit overall and still have a section that is
    // nothing but a heading and a page number. Importing that as a chapter
    // would have the model diagnose a page it never actually read, so those
    // segments are dropped rather than shown as study material.
    chunks = chunks.filter((c) => wordCount(c.rawText) >= MIN_CHUNK_WORDS);
  } else {
    const segments = segmentText(source.text);
    chunks = segments.flatMap((s) => withPartSplits(s.title, s.text));
  }

  return uniqueTitles(chunks);
}
