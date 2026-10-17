import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __resetAdmissionForTests } from "./admission";
import {
  __overrideProviderForTests,
  ai,
  type ConceptChecklistItem,
  focusScore,
  gapAnalysisFrom,
  questionUserPrompt,
} from "./gemini";
import {
  COGNITIVE_LEVELS,
  fallbackLevels,
  isCognitiveLevel,
  judgeClosedAnswer,
  RECALL_FORMATS,
  RECALL_SET_SIZE,
  recallFormatCounts,
  recallFormatPlan,
} from "./questions";

const CONCEPT: ConceptChecklistItem = {
  conceptText: "Osmosis moves water across a membrane",
  isMisconception: false,
  weight: 3,
};

const GAPS = gapAnalysisFrom(
  { missing: [CONCEPT.conceptText], misconceptions: [] },
  [CONCEPT],
);

const OBJECTIVE = "Explain how water crosses a semi-permeable membrane";

beforeEach(() => {
  __resetAdmissionForTests();
  process.env.GEMINI_API_KEY = "questions-test-key";
  delete process.env.GROQ_API_KEY;
});

afterEach(() => {
  __overrideProviderForTests("gemini", null);
  __overrideProviderForTests("groq", null);
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  __resetAdmissionForTests();
});

describe("the cognitive taxonomy", () => {
  test("has exactly the five levels", () => {
    expect(COGNITIVE_LEVELS).toHaveLength(5);
    expect(isCognitiveLevel("application")).toBe(true);
    expect(isCognitiveLevel("bogus")).toBe(false);
    expect(isCognitiveLevel(undefined)).toBe(false);
  });

  test("fallbacks spread across levels: recall diagnostic, retest the full ladder", () => {
    expect(fallbackLevels("recall", 3)).toEqual([
      "comprehension",
      "application",
      "compare_contrast",
    ]);
    expect(fallbackLevels("retest", 5)).toEqual([...COGNITIVE_LEVELS]);
    expect(fallbackLevels("retest", 6)[5]).toBe("knowledge");
  });
});

describe("the two writers", () => {
  test("the user prompt carries the checklist and the stated objectives", () => {
    const prompt = questionUserPrompt(GAPS, [CONCEPT], [OBJECTIVE]);
    expect(prompt).toContain(CONCEPT.conceptText);
    expect(prompt).toContain("STATED OBJECTIVES");
    expect(prompt).toContain(OBJECTIVE);
  });

  test("recall and retest are given different system prompts", async () => {
    const systems: string[] = [];
    __overrideProviderForTests("gemini", async (_model, system) => {
      systems.push(system);
      return JSON.stringify({ questions: [] });
    });

    await ai.generateRecallQuestions(GAPS, [CONCEPT], [OBJECTIVE]);
    await ai.generateRetestQuestions(GAPS, [CONCEPT], [OBJECTIVE]);

    expect(systems).toHaveLength(2);
    expect(systems[0]).not.toBe(systems[1]);
    // Both carry the shared taxonomy; only the retest asks for beyond-textbook
    // reasoning, and only the recall is framed as a diagnostic.
    expect(systems[0]).toContain("cognitive level");
    expect(systems[1]).toContain("cognitive level");
    expect(systems[0]).toContain("DIAGNOSTIC");
    expect(systems[1]).toContain("beyondText");
  });

  test("keeps the level and beyond-text flag the writer returned", async () => {
    __overrideProviderForTests("gemini", async () =>
      JSON.stringify({
        questions: [
          {
            question: "A cell is placed in salty water — what happens?",
            level: "critical_thinking",
            targetConcept: CONCEPT.conceptText,
            beyondText: true,
          },
        ],
      }),
    );
    const questions = await ai.generateRetestQuestions(
      GAPS,
      [CONCEPT],
      [OBJECTIVE],
    );
    expect(questions[0]?.level).toBe("critical_thinking");
    expect(questions[0]?.beyondText).toBe(true);
  });

  test("an unrecognised level degrades to comprehension, never a mislabel", async () => {
    __overrideProviderForTests("gemini", async () =>
      JSON.stringify({
        questions: [{ question: "What is osmosis?", level: "synthesis" }],
      }),
    );
    const questions = await ai.generateRetestQuestions(
      GAPS,
      [CONCEPT],
      [OBJECTIVE],
    );
    expect(questions[0]?.level).toBe("comprehension");
  });

  test("with no model, every fallback question is still level-tagged", async () => {
    __overrideProviderForTests("gemini", null);
    __overrideProviderForTests("groq", null);
    delete process.env.GEMINI_API_KEY;
    const questions = await ai.generateRetestQuestions(
      GAPS,
      [CONCEPT],
      [OBJECTIVE],
    );
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) expect(isCognitiveLevel(q.level)).toBe(true);
  });
});

describe("recall formats", () => {
  test("the 8-question default is 5/2/1 and the blank-heavy families 3/4/1", () => {
    expect(recallFormatCounts(RECALL_SET_SIZE, "history_social")).toEqual({
      multiple_choice: 5,
      fill_blank: 2,
      short_answer: 1,
    });
    for (const family of [
      "mathematics",
      "physics",
      "chemistry",
      "biology",
      "cs_ict",
    ] as const) {
      expect(recallFormatCounts(RECALL_SET_SIZE, family)).toEqual({
        multiple_choice: 3,
        fill_blank: 4,
        short_answer: 1,
      });
    }
  });

  test("counts always sum to the request, whatever the size", () => {
    for (let count = 0; count <= 12; count++) {
      for (const family of ["other", "mathematics"] as const) {
        const counts = recallFormatCounts(count, family);
        const sum = RECALL_FORMATS.reduce((acc, f) => acc + counts[f], 0);
        expect(sum).toBe(count);
      }
    }
  });

  test("the plan keeps one entry per question and never opens on the short answer", () => {
    const plan = recallFormatPlan(RECALL_SET_SIZE, "other");
    expect(plan).toHaveLength(RECALL_SET_SIZE);
    expect(plan.filter((f) => f === "short_answer")).toHaveLength(1);
    expect(plan[0]).not.toBe("short_answer");
    expect(recallFormatPlan(4, "mathematics")).toHaveLength(4);
  });

  test("closed answers compare case-, space-, and punctuation-insensitively", () => {
    expect(judgeClosedAnswer("Osmosis.", " osmosis ")).toBe(true);
    expect(judgeClosedAnswer("Osmosis", "osmosis")).toBe(true);
    expect(judgeClosedAnswer("the water potential", "water potential")).toBe(
      false,
    );
    expect(judgeClosedAnswer("", "")).toBe(false);
  });

  test("the recall writer is told the format mix explicitly", async () => {
    const systems: string[] = [];
    __overrideProviderForTests("gemini", async (_model, system) => {
      systems.push(system);
      return JSON.stringify({ questions: [] });
    });
    await ai.generateRecallQuestions(GAPS, [CONCEPT], [OBJECTIVE], "en", {
      subject: "Mathematics",
    });
    const system = systems[0] ?? "";
    expect(system).toContain("multiple_choice");
    expect(system).toContain("fill_blank");
    expect(system).toContain("short_answer");
    // Mathematics is blank-heavy, so the mix is 3/4/1.
    expect(system).toContain('3 "multiple_choice"');
    expect(system).toContain('4 "fill_blank"');
  });

  test("a well-formed multiple-choice question keeps its options and answer", async () => {
    __overrideProviderForTests("gemini", async () =>
      JSON.stringify({
        questions: [
          {
            format: "multiple_choice",
            question: "Which way does water move?",
            options: ["To the salty side", "To the fresh side", "Nowhere"],
            answer: "To the salty side",
            level: "application",
            targetConcept: CONCEPT.conceptText,
          },
        ],
      }),
    );
    const questions = await ai.generateRecallQuestions(
      GAPS,
      [CONCEPT],
      [OBJECTIVE],
    );
    expect(questions[0]?.format).toBe("multiple_choice");
    expect(questions[0]?.options).toHaveLength(3);
    expect(questions[0]?.answer).toBe("To the salty side");
  });

  test("an unanswerable multiple-choice degrades to a spoken short answer", async () => {
    __overrideProviderForTests("gemini", async () =>
      JSON.stringify({
        questions: [
          {
            format: "multiple_choice",
            question: "Which way does water move?",
            // An answer that is not among the options cannot be graded.
            options: ["Left", "Right"],
            answer: "Sideways",
            level: "application",
          },
        ],
      }),
    );
    const questions = await ai.generateRecallQuestions(
      GAPS,
      [CONCEPT],
      [OBJECTIVE],
    );
    expect(questions[0]?.format).toBe("short_answer");
    expect(questions[0]?.options).toBeUndefined();
    expect(questions[0]?.answer).toBeUndefined();
  });

  test("a fill-in-the-blank with no answer also degrades to short answer", async () => {
    __overrideProviderForTests("gemini", async () =>
      JSON.stringify({
        questions: [
          {
            format: "fill_blank",
            question: "Water moves towards the ____ solution.",
            level: "knowledge",
          },
        ],
      }),
    );
    const questions = await ai.generateRecallQuestions(
      GAPS,
      [CONCEPT],
      [OBJECTIVE],
    );
    expect(questions[0]?.format).toBe("short_answer");
  });

  test("with no model, recall falls back to spoken short answers", async () => {
    __overrideProviderForTests("gemini", null);
    __overrideProviderForTests("groq", null);
    delete process.env.GEMINI_API_KEY;
    const questions = await ai.generateRecallQuestions(
      GAPS,
      [CONCEPT],
      [OBJECTIVE],
    );
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) expect(q.format).toBe("short_answer");
  });

  // The closed-answer route grades a multiple-choice/fill-in-the-blank by
  // rebuilding a GapAnalysis through these two functions. A real concept right
  // scores full; a *misconception* answered wrong must NOT be silently credited,
  // which is the trap focusScore's "not restated" rule sets.
  test("a correct closed answer scores full, a wrong one scores zero", () => {
    const real: ConceptChecklistItem = {
      conceptText: "Water crosses by osmosis",
      isMisconception: false,
      weight: 3,
    };
    const right = gapAnalysisFrom(
      { covered: [real.conceptText], missing: [], misconceptions: [] },
      [real],
    );
    const wrong = gapAnalysisFrom(
      { covered: [], missing: [real.conceptText], misconceptions: [] },
      [real],
    );
    expect(focusScore(right, [real])).toBe(1);
    expect(focusScore(wrong, [real])).toBe(0);
  });

  test("a wrong answer to a misconception question stays uncredited", () => {
    const trap: ConceptChecklistItem = {
      conceptText: "Cells make energy from nothing",
      isMisconception: true,
      weight: 3,
    };
    // Right: the student did not restate the wrong belief.
    const right = gapAnalysisFrom(
      { covered: [trap.conceptText], missing: [], misconceptions: [] },
      [trap],
    );
    // Wrong: recorded as the misconception itself, so it is not credited.
    const wrong = gapAnalysisFrom(
      { covered: [], missing: [], misconceptions: [trap.conceptText] },
      [trap],
    );
    expect(focusScore(right, [trap])).toBe(1);
    expect(focusScore(wrong, [trap])).toBe(0);
  });
});
