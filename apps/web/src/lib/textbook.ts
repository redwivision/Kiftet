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

// Textbook files are capped by MB, not by AI-relevant size. The number is
// generous (a Grade 11 physics PDF is usually 10–80 MB) but keeps a laptop
// from being turned into a potato.
export const MAX_FILE_MB = 100;

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

let pdfLibPromise: Promise<typeof import("pdfjs-dist")> | null = null;

type OutlineNode =
	NonNullable<
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

async function extractPdfPages(
	file: File,
): Promise<{ pages: string[]; outline: OutlineEntry[] }> {
	if (file.size > MAX_FILE_MB * 1_000_000) {
		throw new Error(
			`This file is ${(file.size / 1_000_000).toFixed(1)} MB — Kiftet accepts PDFs up to ${MAX_FILE_MB} MB.`,
		);
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
			line += str ?? "";
			if (hasEOL) {
				if (line.trim()) lines.push(line);
				line = "";
			}
		}
		if (line.trim()) lines.push(line);
		pages.push(lines.join("\n").trim());
	}

	const outline = await readOutline(doc);
	await loadingTask.destroy();

	const total = pages.join(" ").replace(/\s+/g, "").length;
	if (total < 200) {
		throw new Error(
			"This PDF has no readable text (it may be scanned images). Try the paste path instead.",
		);
	}
	return { pages, outline };
}

type PageSegment = { title: string; start: number; end: number };

// Slice the book along its own table of contents: each outline entry becomes
// the *start* of a chunk, so the AI reads one navigable section at a time.
// Front matter (cover, the ToC itself) before the first cut is skipped.
function chunkByOutline(pages: string[], outline: OutlineEntry[]): PageSegment[] {
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
			outline.length >= 2 ? chunkByOutline(pages, outline) : segmentPages(pages);
		if (segments.length <= 1) segments = fallbackPages(pages);
		chunks = segments.flatMap((s) => {
			const full = pages.slice(s.start, s.end).join("\n\n").trim();
			return full ? withPartSplits(s.title, full) : [];
		});
	} else {
		const segments = segmentText(source.text);
		chunks = segments.flatMap((s) => withPartSplits(s.title, s.text));
	}

	return uniqueTitles(chunks);
}