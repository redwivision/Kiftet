/**
 * The failover the two-provider design exists for: when the primary (and
 * measured-working) provider is exhausted — the Gemini free tier returning 429
 * on every attempt — the exact same student request is answered by Groq with a
 * REAL diagnosis, never an estimated one.
 *
 * No real key and no network: the ladder's provider callbacks are swapped via
 * __overrideProviderForTests so the test drives an exhausted Gemini against a
 * healthy Groq deterministically.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { __resetAdmissionForTests } from "./admission";
import { __overrideProviderForTests, ai, aiTelemetrySnapshot } from "./gemini";

const GEMINI_KEY = "gemini-test-key";
const GROQ_KEY = "groq-test-key";

// The exact JSON gpt-oss-120b would hand back through JSON mode. parseGaps
// turns it into a GapAnalysis.
const GROQ_GRADE = JSON.stringify({
  covered: ["current flows through a resistor"],
  missing: [],
  misconceptions: [],
  mastery: {
    "current flows through a resistor": 3,
    "voltage drop": 0,
  },
});

beforeEach(() => {
  __resetAdmissionForTests();
  // Both providers read as wired up so the ladder is gemini-then-groq.
  process.env.GEMINI_API_KEY = GEMINI_KEY;
  process.env.GROQ_API_KEY = GROQ_KEY;
  __overrideProviderForTests("gemini", async () => {
    // The shape the real SDK surfaces on a quota-exhausted project.
    throw Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 });
  });
  __overrideProviderForTests("groq", async () => GROQ_GRADE);
});

afterEach(() => {
  __overrideProviderForTests("gemini", null);
  __overrideProviderForTests("groq", null);
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
});

describe("provider failover", () => {
  test("a dead primary is answered by the failover, not by the fallback", async () => {
    const concepts = [
      {
        conceptText: "current flows through a resistor",
        isMisconception: false,
        weight: 2,
      },
      { conceptText: "voltage drop", isMisconception: false, weight: 1 },
    ];

    const gaps = await ai.gradeRecall(
      "current flows through a resistor",
      concepts,
    );

    // A real diagnosis: NOT the deterministic fallback. This is the whole
    // point — a quota-exhausted Gemini must cost a student zero quality.
    expect(gaps.estimated).toBe(false);
    expect(gaps.covered).toContain("current flows through a resistor");
    expect(Object.keys(gaps.mastery)).toContain("voltage drop");

    // Groq answered — telemetry names the provider, so a 2am reading can tell
    // "Groq handled it" from "we silently degraded."
    expect(aiTelemetrySnapshot().lastProvider).toBe("groq");
    expect(aiTelemetrySnapshot().lastModel).toBe("openai/gpt-oss-120b");
  });

  test("with only groq wired, the seam still serves instead of degrading", async () => {
    // A deployment that never got a Gemini key is a groq-backed install, and
    // it must answer like one. Restores the no-key default again afterwards.
    delete process.env.GEMINI_API_KEY;
    __overrideProviderForTests("gemini", null);

    const concepts = [
      { conceptText: "voltage drop", isMisconception: false, weight: 1 },
    ];

    const gaps = await ai.gradeRecall("voltage drop", concepts);

    expect(gaps.estimated).toBe(false);
    expect(aiTelemetrySnapshot().lastProvider).toBe("groq");
  });

  test("a status-less Gemini failure (timeout) still hands off to groq", async () => {
    // withTimeout rejects with a plain Error — no `status`. Classification must
    // not treat "Gemini is slow/unreachable" as "this request is bad": both are
    // reasons to move to the next provider, not to give up the ladder.
    __overrideProviderForTests("gemini", async () => {
      throw new Error("AI request timed out after 32000ms");
    });

    const concepts = [
      { conceptText: "voltage drop", isMisconception: false, weight: 1 },
    ];

    const gaps = await ai.gradeRecall("voltage drop", concepts);

    expect(gaps.estimated).toBe(false);
    expect(aiTelemetrySnapshot().lastProvider).toBe("groq");
    expect(aiTelemetrySnapshot().lastModel).toBe("openai/gpt-oss-120b");
  });
});
