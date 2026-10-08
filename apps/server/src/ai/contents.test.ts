/**
 * The contents read is a transcription, not a structure: the model copies the
 * contents lines verbatim, and everything after that — parsing them into
 * units, measuring where the printed numbers land — is deterministic code on
 * the client. What is locked down here is the contract this side owns: the
 * prompt that carries the pages, and the honest refusals (no key, nothing to
 * read) that keep a deployment from silently guessing.
 */
import { describe, expect, test } from "bun:test";

import { ai, type ContentsPage, contentsUserPrompt } from "./gemini";

describe("contentsUserPrompt", () => {
  const pages: ContentsPage[] = [
    { index: 3, text: "Grade 10 Biology" },
    { index: 4, text: "Contents\nUnit 1: Cells .... 6" },
  ];

  test("labels every page with its index in the input", () => {
    const prompt = contentsUserPrompt(pages);
    expect(prompt).toContain("[page 3]");
    expect(prompt).toContain("[page 4]");
    expect(prompt).toContain("0-based page index");
  });

  test("keeps the page text it was given", () => {
    const prompt = contentsUserPrompt(pages);
    expect(prompt).toContain("Grade 10 Biology");
    expect(prompt).toContain("Unit 1: Cells .... 6");
  });

  test("asks for a transcription, one entry per line", () => {
    expect(contentsUserPrompt(pages)).toContain("one entry per line");
  });
});

describe("ai.parseContents", () => {
  test("without a model key the answer says so, instead of blaming the book", async () => {
    // CI has no key, and this must not be a failure: the client still falls
    // back to the heading scan, but the reason travels with the refusal so the
    // screen can say the list is a guess because nothing was asked — not that
    // the book has no contents. It must also not reach the network.
    const out = await ai.parseContents([{ index: 0, text: "Contents" }]);
    expect(out.text).toBe("");
    expect(out.refused).toMatch(/not configured/i);
  });

  test("nothing to read is not a call worth making", async () => {
    expect(await ai.parseContents([])).toEqual({ text: "" });
  });
});
