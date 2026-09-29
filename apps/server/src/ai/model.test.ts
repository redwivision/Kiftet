/**
 * The model list is a reliability claim, not a config detail: probing found
 * 3.6 answering 503 "high demand" on every attempt while 2.5 answered every
 * prompt. These lock in the two properties that make that useful — the leader
 * is the one that measured working, and a busy leader does not strand a
 * student on the deterministic fallback.
 */
import { describe, expect, test } from "bun:test";

import { buildAttemptOrder, DEFAULT_MODEL, MODEL_FALLBACKS } from "./gemini";

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
