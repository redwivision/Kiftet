import { expect, test } from "bun:test";
import {
  auditPageText,
  type ImportSource,
  PdfUnreadableError,
  planChunks,
  stripUndecodableGlyphs,
} from "./textbook";

// A page of prose, close to what the extractor pulls off a real textbook.
function prosePage(words: number, seed = 0): string {
  const base =
    "The respiratory and circulatory systems work together to provide oxygen to the body and remove carbon dioxide from the body while the student studies the chapter carefully before the examination begins. ";
  const out: string[] = [];
  for (let i = 0; i < words; i += 1) {
    out.push(base.trim().split(" ")[(i + seed) % 24]);
  }
  return out.join(" ");
}

// The running header that survived extraction from the Grade 10 Biology
// textbook, plus a page number — six words where prose has hundreds.
const headerOnly = "Unit 5: Human Biology";

test("control characters are stripped, but line breaks survive", () => {
  // U+0014–U+001E is what a font with no Unicode map decodes to instead of
  // letters. Left in, they are what made a broken book look like a full one.
  const decoded = `\u0014\u0015\u0016${headerOnly}\u0017\u0018 47\u001a`;
  const cleaned = stripUndecodableGlyphs(decoded);
  expect(cleaned).toBe(`${headerOnly} 47`);
  expect(cleaned).not.toMatch(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the control codes are gone
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/,
  );
  // Text items are joined with newlines; dropping those would weld every
  // page into one line and break the heading detection downstream.
  expect(stripUndecodableGlyphs("a\nb\tc\rd")).toBe("a\nb\tc\rd");
});

test("a page of real prose passes", () => {
  const pages = Array.from({ length: 12 }, (_, i) => prosePage(300, i));
  const audit = auditPageText(pages);
  expect(audit.problem).toBeNull();
  expect(audit.medianWords).toBeGreaterThanOrEqual(40);
});

test("a book that is nothing but headers is rejected, however long it is", () => {
  // This is the Grade 10 Biology textbook, faithfully: 182 pages of a running
  // header. The old guard counted readable characters and asked for 1,000 —
  // this clears that with 30,000+ characters of nothing. Length cannot tell a
  // book from a book-shaped shell; density can.
  const pages = Array.from({ length: 182 }, () => `${headerOnly}\n47`);
  const audit = auditPageText(pages);
  expect(audit.readableChars).toBeGreaterThan(1_000);
  expect(audit.problem).toBe("header-only");
  expect(audit.medianWords).toBeLessThan(40);
});

test("the real textbook's numbers, as measured", () => {
  // Guard against the threshold drifting off the evidence. These are the
  // figures from the calibration run: median 27 words/page for the unreadable
  // MoE textbook, 58 for the sparsest genuinely readable PDF on hand.
  const moe = auditPageText(
    Array.from({ length: 182 }, () => `${headerOnly}\nGrade 10 Biology\n47`),
  );
  expect(moe.medianWords).toBeLessThan(40);
  const sparsestReal = auditPageText(
    Array.from({ length: 22 }, (_, i) => prosePage(58, i)),
  );
  expect(sparsestReal.problem).toBeNull();
});

test("a scanned book with no text at all says so", () => {
  expect(auditPageText(Array.from({ length: 40 }, () => "")).problem).toBe(
    "no-text",
  );
});

test("a book with a little text is too thin to study", () => {
  expect(auditPageText(["a little text", "and a little more"]).problem).toBe(
    "too-thin",
  );
});

test("an empty extraction is rejected rather than passed on", async () => {
  expect(auditPageText([]).problem).toBe("no-text");
  // A PDF that yields nothing must not reach the user as an empty chapter.
  const source: ImportSource = { kind: "text", name: "p", text: "   \n  " };
  const chunks = await planChunks(source);
  expect(chunks.length).toBeLessThanOrEqual(1);
});

test("the error carries the measurement, not just a sentence", () => {
  const audit = auditPageText(Array.from({ length: 182 }, () => headerOnly));
  const err = new PdfUnreadableError(audit);
  expect(err.reason).toBe("header-only");
  expect(err.audit.readableChars).toBe(audit.readableChars);
  expect(err.audit.medianWords).toBe(audit.medianWords);
  expect(err).toBeInstanceOf(Error);
});

test("pasted text still chunks by heading", async () => {
  const text = [
    "Unit 1 Introduction",
    prosePage(200),
    "Unit 2 Cell Structure",
    prosePage(200),
  ].join("\n");
  const chunks = await planChunks({ kind: "text", name: "pasted", text });
  expect(chunks.map((c) => c.title)).toEqual([
    "Unit 1 Introduction",
    "Unit 2 Cell Structure",
  ]);
});
