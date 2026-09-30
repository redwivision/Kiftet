// Persisted OCR results, keyed by book + page.
//
// OCR is the slowest thing this app does — ~5 s per page even when it works —
// so the whole reason this module exists is to make sure we never pay that
// twice. A page is recognized once, ever, and every later attempt (a retry, a
// re-import, a resumed session, the same book opened on a second visit) reads
// the text back out of IndexedDB instead of re-rendering and re-recognizing.
//
// The cache is deliberately *not* keyed by a hash of the file. A textbook is
// identified by its name and size, which is what the student recognizes it by,
// and re-OCRing a 182-page book to prove two files are byte-identical would
// defeat the point. Changing either value produces a new key, so a replaced
// book is never served from the old book's text.
//
// Nothing here ever leaves the device: the textbook's text is written to the
// same local store as lessons and checklists (see lib/store.ts), for the same
// offline-first reason.
import type { OcrPageResult } from "./ocr";
import { allStore, dbAvailable, putStore, removeStore } from "./store";

/** Bump when the recognized-text shape changes, so old rows are not reused. */
const OCR_SCHEMA_VERSION = 1;

type StoredPage = {
  bookKey: string;
  pageIndex: number;
  text: string;
  confidence: number;
  version: number;
  cachedAt: number;
};

/**
 * Identity for one book: name + byte length. Same name and size means the same
 * book, as far as a student is concerned.
 */
export function ocrBookKey(name: string, size: number): string {
  return `${name.trim()}|${size}`;
}

export async function cacheOcrPage(
  bookKey: string,
  page: OcrPageResult,
): Promise<void> {
  if (!dbAvailable()) return;
  const row: StoredPage = {
    bookKey,
    pageIndex: page.pageIndex,
    text: page.text,
    confidence: page.confidence,
    version: OCR_SCHEMA_VERSION,
    cachedAt: Date.now(),
  };
  await putStore("ocr", row, `${bookKey}#${page.pageIndex}`);
}

/**
 * Read back the requested pages of a book. Pages that were never recognized,
 * or were recognized by an older version of this code, are simply absent from
 * the result — the caller re-recognizes those, so a stale cache degrades into
 * a slower run rather than wrong text.
 */
export async function getOcrPages(
  bookKey: string,
  pageIndexes: number[],
): Promise<OcrPageResult[]> {
  if (!dbAvailable()) return [];
  const rows = await allStore<StoredPage>("ocr");
  const wanted = new Set(pageIndexes);
  return rows
    .filter(
      (r) =>
        r.bookKey === bookKey &&
        r.version === OCR_SCHEMA_VERSION &&
        wanted.has(r.pageIndex),
    )
    .map((r) => ({
      pageIndex: r.pageIndex,
      text: r.text,
      confidence: r.confidence,
    }));
}

/** Drop every page cached for one book (e.g. the student replaced the file). */
export async function clearOcrBook(bookKey: string): Promise<void> {
  if (!dbAvailable()) return;
  const rows = await allStore<StoredPage>("ocr");
  await Promise.all(
    rows
      .filter((r) => r.bookKey === bookKey)
      .map((r) => removeStore("ocr", `${bookKey}#${r.pageIndex}`)),
  );
}
