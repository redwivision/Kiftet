type ExtractedItem = { str?: string; hasEOL?: boolean };

export type ImportChapter = {
	title: string;
	rawText: string;
};

export type ImportSource =
	| { kind: "pdf"; name: string; file: File }
	| { kind: "text"; name: string; text: string };

// Server enforces a 200k cap per chapter (`ingestSchema.rawText`); stay under
// it so oversized output is split client-side instead of hitting a 400.
const MAX_CHAPTER_CHARS = 190_000;

// Chapter-start headings across English, Afaan Oromoo and Amharic, followed by
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

function uniqueTitles(chapters: ImportChapter[]): ImportChapter[] {
	const seen = new Map<string, number>();
	return chapters.map((c) => {
		const base = c.title.trim().replace(/\.+$/, "") || "Untitled chapter";
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return { ...c, title: count === 0 ? base : `${base} (${count + 1})` };
	});
}

function withPartSplits(title: string, full: string): ImportChapter[] {
	const out: ImportChapter[] = [];
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

async function extractPdfPages(file: File): Promise<string[]> {
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
	await loadingTask.destroy();

	const total = pages.join(" ").replace(/\s+/g, "").length;
	if (total < 200) {
		throw new Error(
			"This PDF has no readable text (it may be scanned images). Try the paste path instead.",
		);
	}
	return pages;
}

type PageSegment = { title: string; start: number; end: number };

function segmentPages(pages: string[]): PageSegment[] {
	const segments: PageSegment[] = [];
	let current: PageSegment = { title: "Chapter 1", start: 0, end: 0 };
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
	// No headings detected — split into roughly-equal page runs with enough
	// text per chapter, but keep each under the character cap.
	const total = pages.join(" ").length;
	const targetCount = Math.max(1, Math.min(20, Math.round(total / 14_000)));
	const per = Math.max(2, Math.ceil(pages.length / targetCount));
	const segments: PageSegment[] = [];
	for (let start = 0; start < pages.length; start += per) {
		segments.push({
			title: `Chapter ${segments.length + 1}`,
			start,
			end: Math.min(pages.length, start + per),
		});
	}
	return segments;
}

// ────────────────────────────────────────────────────────────────
// Pasted-text path — same segmentation, over raw text instead of pages.
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
					title: `Chapter ${chunks.length + 1}`,
					text: buffer.trim(),
				});
				buffer = "";
			}
		}
		if (buffer.trim())
			chunks.push({
				title: `Chapter ${chunks.length + 1}`,
				text: buffer.trim(),
			});
		if (chunks.length) return chunks;
		return [{ title: "Chapter 1", text: text.trim() }];
	}
	return segments;
}

// ────────────────────────────────────────────────────────────────
// Public plan — the list of chapters the user confirms before importing.
// ────────────────────────────────────────────────────────────────

export async function planChapters(
	source: ImportSource,
): Promise<ImportChapter[]> {
	let chapters: ImportChapter[];

	if (source.kind === "pdf") {
		const pages = await extractPdfPages(source.file);
		const segments = segmentPages(pages);
		const refined = segments.length <= 1 ? fallbackPages(pages) : segments;
		chapters = refined.flatMap((s) => {
			const full = pages.slice(s.start, s.end).join("\n\n").trim();
			return full ? withPartSplits(s.title, full) : [];
		});
	} else {
		const segments = segmentText(source.text);
		chapters = segments.flatMap((s) => withPartSplits(s.title, s.text));
	}

	return uniqueTitles(chapters);
}
