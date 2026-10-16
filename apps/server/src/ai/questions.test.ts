import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __resetAdmissionForTests } from "./admission";
import {
  __overrideProviderForTests,
  ai,
  type ConceptChecklistItem,
  gapAnalysisFrom,
  questionUserPrompt,
} from "./gemini";
import {
  COGNITIVE_LEVELS,
  fallbackLevels,
  isCognitiveLevel,
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
