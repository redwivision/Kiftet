// On-device OCR for PDFs whose text layer cannot be read.
//
// Bet 3 (STRATEGY.md) says the textbook is read on the student's device and
// the file never uploads. Most PDFs give us their text directly, but a fair
// number of real books — Ministry of Education textbooks especially — embed
// subsetted fonts with no Unicode map. A viewer paints those pages perfectly
// from glyph outlines, so the book *looks* fine; an extractor gets control
// characters instead of letters. Rejecting those books is safe but useless,
// because they are the books students actually own.
//
// The fix is to read the pixels. pdf.js already renders the page for us, so
// the pipeline is: render page → canvas → Tesseract → text. Nothing but the
// page bitmap crosses a process boundary, and it never leaves the device.
//
// Two constraints shaped this module:
//
//   1. Speed. Measured on the Grade 10 Biology book in Chrome: ~10 s/page for
//      a cold single worker, ~5.2 s/page across four. The whole 182-page book
//      is therefore ~16 minutes, which is far too long to make a student wait
//      before they can see the chapter list. So OCR is never run up front for
//      the whole book — `planChunks` reads only the *readable* 10% of each
//      page (headings and captions) to find the chapters, and the body is
//      recognized lazily, one chapter at a time, on import.
//
//   2. Not re-paying for it. OCR is the slowest thing this app does, so every
//      page's text is cached in IndexedDB keyed by book + page. A second
//      attempt, a re-import, or a resumed session reads the cache instead of
//      re-recognizing.
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { cacheOcrPage, getOcrPages } from "./ocr-cache";

// Rendering at 150 dpi balances legibility against time: 100 dpi measures 88%
// confidence on this book against 91% at 150, for 5.8 s/page instead of 7.3 s.
// Going to 200 dpi bought nothing worth the extra 13.8 s/page.
const OCR_DPI = 150;

// How many recognition workers to run at once. Four measured as the knee of
// the curve on a desktop-class machine; each one is a full WASM heap, so this
// stays conservative for phones rather than scaling with `navigator.hardwareConcurrency`.
const OCR_WORKERS = 4;

// Tesseract's Amharic model is the reason language is a parameter and not a
// constant. English is the default because English is the common case; the
// model is chosen per book, not guessed from page text.
export type OcrLanguage = "eng" | "amh";

// ── Asset wiring ──────────────────────────────────────────────────
//
// tesseract.js by default pulls its worker, its WASM core and its trained
// model from a CDN at runtime. Two of those three are code we already ship in
// node_modules, so they are bundled here instead of fetched: that keeps the
// app's own engine versions pinned to the lockfile, and it means OCR still
// works with no network once the app itself is cached.
//
// The trained model stays on the CDN, and that is deliberate. `fast` is 1 MB
// gzipped for English (10 MB for the accuracy-tuned model) — committing a
// binary that size to the repository for a feature that is still behind a
// flag is the wrong trade. Tesseract caches the downloaded model in IndexedDB
// on first use, so the request happens once and never again. A model file is
// not the student's textbook: nothing they own is sent anywhere.

/* eslint-disable no-restricted-imports */
// These are asset URLs, not code: `?url` makes Vite fingerprint and copy the
// file. They are reached through `import()` behind an `import.meta.env.SSR`
// guard because OCR only ever runs in a browser — a static import at module
// scope makes the *server* build emit all three cores as well, which is 12 MB
// of assets no request will ever serve. The specifiers stay literal so Vite
// still resolves and fingerprints them.
type Asset = { default: string };

type CoreAssets = {
  worker: string;
  relaxedSimd: string;
  simd: string;
  base: string;
};

let coreAssets: Promise<CoreAssets> | null = null;

function getCoreAssets(): Promise<CoreAssets> {
  if (!coreAssets) {
    coreAssets = (async () => {
      // Dead branch in the server build, which keeps the cores from being
      // copied into it at all — 12 MB of assets nothing can request.
      if (import.meta.env.SSR) {
        return { worker: "", relaxedSimd: "", simd: "", base: "" };
      }
      const [worker, relaxedSimd, simd, base] = await Promise.all([
        import("tesseract.js/dist/worker.min.js?url") as Promise<Asset>,
        import(
          "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js?url"
        ) as Promise<Asset>,
        import(
          "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url"
        ) as Promise<Asset>,
        import(
          "tesseract.js-core/tesseract-core-lstm.wasm.js?url"
        ) as Promise<Asset>,
      ]);
      return {
        worker: worker.default,
        relaxedSimd: relaxedSimd.default,
        simd: simd.default,
        base: base.default,
      };
    })();
  }
  return coreAssets;
}
/* eslint-enable no-restricted-imports */

// `4.0.0_fast` is the small "fast" model set. It measured 88–91% confidence on
// the Grade 10 body text against the full model's ~91%, at a tenth of the bytes.
const LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0_fast";

export type OcrReason = "no-text" | "too-thin" | "header-only" | null;

/** One page recognized. `confidence` is Tesseract's 0–100 self-report. */
export type OcrPageResult = {
  pageIndex: number;
  text: string;
  confidence: number;
};

/** Progress across a run, for the progress bar in the import UI. */
export type OcrProgress = {
  done: number;
  total: number;
  pageIndex: number;
};

type OcrWorker = {
  recognize: (
    image: unknown,
  ) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

let enginePromise: Promise<{
  workers: OcrWorker[];
  next: number;
}> | null = null;

/**
 * Pick the fastest WASM core this browser can actually run.
 *
 * Handing tesseract.js a *directory* makes it run this same detection itself
 * and then load the chosen core over the network. Passing a single `.js` URL
 * makes it use exactly what we give it, so the choice happens here instead —
 * against the file that ships, with no request. `wasm-feature-detect` is the
 * same module tesseract.js uses for this test, so the answer is not a guess.
 */
async function pickCoreUrl(assets: CoreAssets): Promise<string> {
  try {
    const { relaxedSimd, simd } = await import("wasm-feature-detect");
    if (await relaxedSimd()) return assets.relaxedSimd;
    if (await simd()) return assets.simd;
  } catch {
    // Detection is an optimization. If it cannot run, the plain core is the
    // safest answer — it is the baseline every browser above supports.
  }
  return assets.base;
}

async function getEngine(language: OcrLanguage): Promise<{
  workers: OcrWorker[];
  next: number;
}> {
  // One engine per language per session: re-creating workers throws away a
  // trained model that took seconds to load.
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    const assets = await getCoreAssets();
    const { createWorker } = await import("tesseract.js");
    const corePath = await pickCoreUrl(assets);
    const workers = (await Promise.all(
      Array.from({ length: OCR_WORKERS }, () =>
        createWorker(language, 1, {
          workerPath: assets.worker,
          corePath,
          langPath: LANG_PATH,
          logger: () => {},
          errorHandler: () => {},
        } as Parameters<typeof createWorker>[2]),
      ),
    )) as unknown as OcrWorker[];
    return { workers, next: 0 };
  })();

  try {
    return await enginePromise;
  } catch (err) {
    // A failed model load must not poison every later attempt.
    enginePromise = null;
    throw err;
  }
}

/** Release the WASM heaps. Called when the import flow is abandoned. */
export async function releaseOcr(): Promise<void> {
  if (!enginePromise) return;
  const pending = enginePromise;
  enginePromise = null;
  try {
    const { workers } = await pending;
    await Promise.all(workers.map((w) => w.terminate()));
  } catch {
    // Nothing to release.
  }
}

async function renderPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
): Promise<HTMLCanvasElement> {
  const page: PDFPageProxy = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: OCR_DPI / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error(
      "This browser could not prepare a canvas to read the page.",
    );
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

/** Tidy OCR output: rejoin words hyphenated across lines, collapse whitespace. */
function tidy(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * Recognize the pages of one chapter, cache-first.
 *
 * `pageStart` is 0-based and inclusive, `pageEnd` exclusive — the same
 * half-open shape the chunker uses everywhere else.
 */
export async function ocrPageRange(
  doc: PDFDocumentProxy,
  bookKey: string,
  pageStart: number,
  pageEnd: number,
  language: OcrLanguage = "eng",
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrPageResult[]> {
  const wanted: number[] = [];
  for (let i = pageStart; i < pageEnd; i += 1) wanted.push(i);

  const cached = await getOcrPages(bookKey, wanted);
  const byPage = new Map(cached.map((r) => [r.pageIndex, r]));
  const missing = wanted.filter((i) => !byPage.has(i));

  let done = cached.length;
  onProgress?.({ done, total: wanted.length, pageIndex: pageStart });

  if (missing.length) {
    const engine = await getEngine(language);
    let cursor = 0;
    const recognizeOne = async (pageIndex: number): Promise<void> => {
      const canvas = await renderPage(doc, pageIndex);
      const worker = engine.workers[engine.next % engine.workers.length];
      engine.next += 1;
      try {
        const { data } = await worker.recognize(canvas);
        byPage.set(pageIndex, {
          pageIndex,
          text: tidy(data.text ?? ""),
          confidence: Math.round(data.confidence ?? 0),
        });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    };

    // Fixed pool: each worker pulls pages off the queue until it is empty.
    // Four at a time measured 5.2 s/page; one at a time measured ~10 s/page.
    await Promise.all(
      engine.workers.slice(0, OCR_WORKERS).map(async () => {
        while (cursor < missing.length) {
          const pageIndex = missing[cursor++];
          await recognizeOne(pageIndex);
          done += 1;
          onProgress?.({ done, total: wanted.length, pageIndex });
          await cacheOcrPage(bookKey, byPage.get(pageIndex) as OcrPageResult);
        }
      }),
    );
  }

  return wanted
    .map((i) => byPage.get(i))
    .filter((r): r is OcrPageResult => Boolean(r));
}

/** Join a chapter's pages back into one block of text, in reading order. */
export function joinOcrPages(pages: OcrPageResult[]): string {
  return pages
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
