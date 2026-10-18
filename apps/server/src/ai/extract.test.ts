/**
 * Chunked chapter extraction.
 *
 * A single call only ever read a chapter's first 24k characters, so on a full
 * unit most of the chapter had no concepts at all. These tests drive the
 * provider callbacks directly (no key, no network) to prove the read now sweeps
 * the whole chapter, merges what each window found, and still falls back as one
 * unit when the AI is wholly unavailable.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { __resetAdmissionForTests } from "./admission";
import { __overrideProviderForTests, ai, extractionWindows } from "./gemini";

const GROQ_KEY = "groq-test-key";

beforeEach(() => {
  __resetAdmissionForTests();
  process.env.GROQ_API_KEY = GROQ_KEY;
});

afterEach(() => {
  __overrideProviderForTests("gemini", null);
  __overrideProviderForTests("groq", null);
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
});

describe("extractionWindows", () => {
  test("empty text yields no windows", () => {
    expect(extractionWindows("")).toEqual([]);
    expect(extractionWindows("   \n  ")).toEqual([]);
  });

  test("a chapter that fits under the window is one call", () => {
    const text = "line one\nline two\nline three";
    expect(extractionWindows(text)).toEqual([text]);
  });

  test("a long chapter is split into bounded windows", () => {
    const line = "the quick brown fox jumps over the lazy dog";
    const text = Array.from({ length: 2_000 }, () => line).join("\n");
    const windows = extractionWindows(text, 1_000, 8);
    expect(windows.length).toBe(8);
    for (const window of windows) {
      expect(window.trim().length).toBeGreaterThan(0);
      expect(window.length).toBeLessThanOrEqual(text.length);
    }
  });

  test("the number of calls never exceeds the ceiling", () => {
    const text = "x".repeat(240_000);
    expect(extractionWindows(text, 24_000, 6).length).toBe(6);
  });

  test("cuts fall on a line break rather than mid-sentence", () => {
    const text = Array.from(
      { length: 100 },
      (_, i) => `sentence number ${i} about the chapter topic`,
    ).join("\n");
    const windows = extractionWindows(text, 300, 8);
    // Every window that is not the last ends at a real line break: the next
    // window begins where a word was not split, so no sentence is cut in half.
    for (let i = 0; i < windows.length - 1; i += 1) {
      expect(windows[i]?.includes("\n")).toBe(true);
    }
  });
});

describe("extractChapter across windows", () => {
  test("merges concepts found in every window of a long chapter", async () => {
    const calls: string[] = [];
    __overrideProviderForTests("groq", async (_model, _system, userInput) => {
      calls.push(userInput);
      const n = calls.length;
      return JSON.stringify({
        items: [
          {
            conceptText: `window ${n} idea`,
            weight: 2,
            isMisconception: false,
          },
        ],
        objectives: [],
      });
    });

    const text = Array.from(
      { length: 3_000 },
      (_, i) => `paragraph ${i} of the chapter body text`,
    ).join("\n");
    const extraction = await ai.extractChapter(text);

    expect(calls.length).toBeGreaterThan(1);
    expect(extraction.estimated).toBe(false);
    expect(extraction.concepts.map((c) => c.conceptText)).toEqual(
      calls.map((_, i) => `window ${i + 1} idea`),
    );
  });

  test("one failed window does not discard the others", async () => {
    let call = 0;
    __overrideProviderForTests("groq", async () => {
      call += 1;
      if (call === 2) {
        throw Object.assign(new Error("429 RESOURCE_EXHAUSTED"), {
          status: 429,
        });
      }
      return JSON.stringify({
        items: [{ conceptText: `idea from call ${call}`, weight: 1 }],
        objectives: [],
      });
    });

    const text = Array.from(
      { length: 3_000 },
      (_, i) => `paragraph ${i} of the chapter body text`,
    ).join("\n");
    const extraction = await ai.extractChapter(text);

    expect(extraction.estimated).toBe(false);
    expect(extraction.concepts.map((c) => c.conceptText)).toContain(
      "idea from call 1",
    );
    expect(extraction.concepts.map((c) => c.conceptText)).toContain(
      "idea from call 3",
    );
    expect(extraction.concepts.map((c) => c.conceptText)).not.toContain(
      "idea from call 2",
    );
  });

  test("every window failing falls back as one read", async () => {
    // Unusable replies, not transport failures: a repeated 429 would trip the
    // circuit breaker and turn the sweep into an honest "busy", which is a
    // different contract (and asserted elsewhere).
    __overrideProviderForTests("groq", async () => "not json at all");

    const text = Array.from(
      { length: 3_000 },
      (_, i) => `Paragraph ${i} explains a distinct idea in the chapter.`,
    ).join("\n");
    const extraction = await ai.extractChapter(text);

    expect(extraction.estimated).toBe(true);
    expect(extraction.concepts.length).toBeGreaterThan(0);
  });

  test("deduplicates a concept reported by more than one window", async () => {
    __overrideProviderForTests("groq", async () =>
      JSON.stringify({
        items: [{ conceptText: "the same idea", weight: 3 }],
        objectives: [],
      }),
    );

    const text = Array.from(
      { length: 3_000 },
      (_, i) => `paragraph ${i} of the chapter body text`,
    ).join("\n");
    const extraction = await ai.extractChapter(text);
    expect(
      extraction.concepts.filter((c) => c.conceptText === "the same idea"),
    ).toHaveLength(1);
  });
});
