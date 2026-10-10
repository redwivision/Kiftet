/**
 * The model list is a reliability claim, not a config detail: probing found
 * 3.6 answering 503 "high demand" on every attempt while 2.5 answered every
 * prompt. These lock in the two properties that make that useful — the leader
 * is the one that measured working, and a busy leader does not strand a
 * student on the deterministic fallback.
 */
import { describe, expect, test } from "bun:test";

import {
  buildAttemptOrder,
  buildProviderAttempts,
  DEFAULT_GROQ_MODEL,
  DEFAULT_MODEL,
  MODEL_FALLBACKS,
} from "./gemini";

describe("model selection", () => {
  test("leads with the model that measured working", () => {
    expect(DEFAULT_MODEL).toBe("gemini-2.5-flash");
  });

  test("lists no retired model, which the API 404s on", () => {
    // These returned 404 "no longer available" when probed, so listing one
    // would spend a whole attempt on a guaranteed failure.
    for (const retired of [
      "gemini-1.5-flash",
      "gemini-2.0-flash",
      "gemini-2.5-flash-lite",
    ]) {
      expect(MODEL_FALLBACKS).not.toContain(retired);
    }
  });

  test("has somewhere to go when the leader is busy", () => {
    expect(MODEL_FALLBACKS.length).toBeGreaterThan(1);
  });
});

describe("buildAttemptOrder", () => {
  test("tries a different model on attempt 2 rather than the same one", () => {
    // The whole point: a 503 on the leader must not be answered by waiting
    // on the leader, because the budget is spent either way.
    const order = buildAttemptOrder(["a", "b", "c"], 4);
    expect(order[0]).toBe("a");
    expect(order[1]).toBe("b");
  });

  test("returns the leader for a retry before running out of attempts", () => {
    // A single transient blip on the one model that works should still get the
    // good model, not be written off in favour of alternates. Every model gets
    // a turn, then the leader comes back for the last attempt.
    expect(buildAttemptOrder(["a", "b", "c"], 4)).toEqual(["a", "b", "c", "a"]);
  });

  test("repeats the whole list once alternates are exhausted", () => {
    // Repeating the model we measured beats failing the student.
    expect(buildAttemptOrder(["a", "b"], 4)).toEqual(["a", "b", "a", "b"]);
  });

  test("does not burn two attempts on one model while another is untried", () => {
    // The budget is shared wall clock: spending it twice on a model that is
    // answering 503 means never trying the one that works.
    expect(buildAttemptOrder(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  test("never returns more attempts than it was given", () => {
    for (let attempts = 0; attempts <= 8; attempts++) {
      expect(buildAttemptOrder(["a", "b", "c"], attempts)).toHaveLength(
        attempts,
      );
    }
  });

  test("returns nothing for an empty model list", () => {
    // Guards the destructuring: an empty list must not yield [undefined].
    expect(buildAttemptOrder([], 4)).toEqual([]);
  });
});

describe("buildProviderAttempts", () => {
  test("gemini-only config yields only gemini attempts, led by the measured model", () => {
    const list = buildProviderAttempts(true, false);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => a.provider === "gemini")).toBe(true);
    expect(list[0]?.model).toBe(DEFAULT_MODEL);
  });

  test("groq-only config still has somewhere real to go", () => {
    // A deployment that never got a Gemini key is not dead — it is a
    // groq-backed install, and it must behave like one rather than like a
    // fallback chain that forgot it has a provider.
    const list = buildProviderAttempts(false, true);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => a.provider === "groq")).toBe(true);
    expect(list[0]?.model).toBe(DEFAULT_GROQ_MODEL);
  });

  test("with both wired, gemini leads and groq follows at its own count", () => {
    const list = buildProviderAttempts(true, true);
    expect(list[0]?.provider).toBe("gemini");
    const geminiCount = list.filter((a) => a.provider === "gemini").length;
    const groqCount = list.filter((a) => a.provider === "groq").length;
    expect(geminiCount).toBeGreaterThan(0);
    expect(groqCount).toBeGreaterThan(0);
    expect(list).toHaveLength(geminiCount + groqCount);
    // Gemini's whole ladder precedes the first groq attempt.
    expect(
      list.slice(0, geminiCount).every((a) => a.provider === "gemini"),
    ).toBe(true);
  });

  test("neither provider configured yields nothing to try", () => {
    expect(buildProviderAttempts(false, false)).toEqual([]);
  });
});
