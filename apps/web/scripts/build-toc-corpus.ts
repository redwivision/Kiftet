/**
 * Regenerate the golden-corpus fixture from the real textbooks in `docs/`.
 *
 * The corpus is the answer to "does the contents reader work on every book
 * that has a contents?" — which cannot be answered from one hand-written
 * string. Each entry pins the front-matter page text a real book actually
 * extracts to, together with the structure it is known to have, so the pure
 * reader in `toc.ts` can be checked against reality without a PDF, a key, or a
 * network in the test run.
 *
 * Run it (from `apps/web`):
 *
 *   bun scripts/build-toc-corpus.ts
 *
 * It rewrites `src/lib/__fixtures__/toc-corpus.ts`. The PDFs stay in `docs/`
 * and out of the repo's test path; only their extracted page text is committed.
 *
 * Where each `expected` comes from:
 *   - citizenship — `docs/TOC-Grade10Citizenship`, hand-verified, independent
 *     of the parser. This is the book whose three-page contents the old
 *     early-stop rule truncated.
 *   - economics   — the book's own two contents pages, captured once and frozen
 *     as a regression guard (it reads correctly today).
 *   - biology     — `null`: its body is a scan and its text layer yields no
 *     contents, so the reader must decline and let the OCR path take over.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  contentsFromPages,
  isSummaryOrReview,
  type TocChapter,
} from "../src/lib/toc";

const HERE = import.meta.dir;
const DOCS = resolve(HERE, "../../../docs");
const OUT = resolve(HERE, "../src/lib/__fixtures__/toc-corpus.ts");

// The front-matter window kept per book. Wide enough to hold the contents and
// the first body page that ends the walk, and no wider — this is what makes a
// committed fixture small enough to read in a diff.
const KEEP_PAGES = 12;
const PAGE_CHARS = 6000;

async function readPages(file: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(resolve(DOCS, file)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      text += item.str ?? "";
      if (item.hasEOL) text += "\n";
    }
    pages.push(text.slice(0, PAGE_CHARS));
  }
  return pages;
}

/** Citizenship's verified tree, read from the hand-checked markdown. */
function citizenshipExpected(): TocChapter[] {
  const md = readFileSync(resolve(DOCS, "TOC-Grade10Citizenship"), "utf8");
  const chapters: TocChapter[] = [];
  let current: TocChapter | null = null;
  for (const raw of md.split("\n")) {
    const unit = raw.match(/^### \*\*UNIT (\d+):\s*(.+?)\*\*\s*\(Page (\d+)\)/);
    if (unit) {
      current = {
        unit: Number(unit[1]),
        title: unit[2].trim(),
        page: Number(unit[3]),
        topics: [],
      };
      chapters.push(current);
      continue;
    }
    const topic = raw.match(/^\* \*\*(.+?)\*\*\s*\(Page (\d+)\)/);
    if (!topic || !current) continue;
    const numbered = topic[1].match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
    if (!numbered) continue;
    const title = numbered[2].trim();
    if (isSummaryOrReview(title)) continue;
    current.topics.push({
      kind: "section",
      path: numbered[1].split("."),
      title,
      page: Number(topic[2]),
    });
  }
  return chapters;
}

type Book = {
  id: string;
  file: string;
  note: string;
  pages: string[];
  expected: { chapters: TocChapter[] } | null;
};

const books: Book[] = [];

{
  const file = "G10-Citizenship-STB-2023-web.pdf";
  const pages = await readPages(file);
  const chapters = citizenshipExpected();
  const read = contentsFromPages(pages);
  console.log(
    `citizenship: verified ${chapters.length} units, reader found ${read?.chapters.length ?? 0}`,
  );
  books.push({
    id: "citizenship",
    file,
    note: "Three-page contents; the last page lists only two units, which the old early-stop rule dropped.",
    pages: pages.slice(0, KEEP_PAGES),
    expected: { chapters },
  });
}

{
  const file = "G10-Economics-STB-2023-web.pdf";
  const pages = await readPages(file);
  const read = contentsFromPages(pages);
  if (!read)
    throw new Error(
      "economics no longer parses — the fixture would freeze a regression",
    );
  console.log(
    `economics: frozen ${read.chapters.length} units (regression guard)`,
  );
  books.push({
    id: "economics",
    file,
    note: "Reads correctly today; frozen as a regression guard so the citizenship fix cannot cost it a unit.",
    pages: pages.slice(0, KEEP_PAGES),
    expected: { chapters: read.chapters },
  });
}

{
  const file = "G10-Biology-STB-2023-web.pdf";
  const pages = await readPages(file);
  const read = contentsFromPages(pages);
  console.log(
    `biology: reader found ${read?.chapters.length ?? "nothing"} (must decline)`,
  );
  books.push({
    id: "biology",
    file,
    note: "Body is a scan; the text layer states no contents, so the reader must decline and the OCR path must stand in.",
    pages: pages.slice(0, KEEP_PAGES),
    expected: null,
  });
}

mkdirSync(dirname(OUT), { recursive: true });
const header = `// GENERATED by apps/web/scripts/build-toc-corpus.ts — do not edit by hand.
// Regenerate with: (from apps/web) bun scripts/build-toc-corpus.ts
//
// Real front-matter page text from the textbooks in docs/, paired with the
// structure each book is known to have. The corpus test replays these through
// the pure contents reader, so "works on every book" is a checked claim rather
// than one book's happy path.

import type { TocChapter } from "../toc";

export type TocCorpusBook = {
  /** Stable name for the test to report by. */
  id: string;
  /** The PDF this text was extracted from, in docs/. */
  file: string;
  /** Why this book is in the corpus, in a sentence. */
  note: string;
  /** The front-matter pages exactly as the extractor produced them. */
  pages: string[];
  /** The structure the book is known to have, or null when it has no readable contents. */
  expected: { chapters: TocChapter[] } | null;
};

export const TOC_CORPUS: TocCorpusBook[] = `;
writeFileSync(OUT, `${header}${JSON.stringify(books, null, 2)};\n`);
console.log(`wrote ${OUT}`);
