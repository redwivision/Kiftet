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
  enforceRecallMix,
  fallbackLevels,
  isCognitiveLevel,
  judgeClosedAnswer,
  RECALL_FORMATS,
  RECALL_SET_SIZE,
  recallFormatCounts,
  recallFormatPlan,
  retestIsSoft,
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

  test("fallbacks spread across levels: recall gentle, retest the full ladder", () => {
    // Recall is low-pressure: mostly knowledge checks, the odd comprehension.
    expect(fallbackLevels("recall", 3)).toEqual([
      "knowledge",
      "knowledge",
      "comprehension",
    ]);
    expect(fallbackLevels("recall", 6)[5]).toBe("comprehension");
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

  test("with no model and no chapter text, recall falls back to spoken answers", async () => {
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

  test("with no model, chapter text still yields a real closed mix offline", async () => {
    __overrideProviderForTests("gemini", null);
    __overrideProviderForTests("groq", null);
    delete process.env.GEMINI_API_KEY;
    const concepts: ConceptChecklistItem[] = [
      {
        conceptText: "Osmosis",
        isMisconception: false,
        weight: 3,
      },
      { conceptText: "Diffusion", isMisconception: false, weight: 2 },
      { conceptText: "Active transport", isMisconception: false, weight: 2 },
      { conceptText: "Turgor pressure", isMisconception: false, weight: 1 },
    ];
    const gaps = gapAnalysisFrom(
      { missing: concepts.map((c) => c.conceptText), misconceptions: [] },
      concepts,
    );
    const chapterText =
      "Osmosis is the movement of water across a semi-permeable membrane. " +
      "Diffusion is the movement of particles from high to low concentration. " +
      "Active transport moves substances against a concentration gradient. " +
      "Turgor pressure keeps a plant cell firm.";
    const questions = await ai.generateRecallQuestions(
      gaps,
      concepts,
      [],
      "en",
      { subject: "Biology", chapterText },
    );
    expect(questions.length).toBeGreaterThanOrEqual(4);
    // The offline set is not a wall of spoken essays: it carries closed,
    // deterministically gradable questions with options and answers.
    const closed = questions.filter((q) => q.format === "multiple_choice");
    expect(closed.length).toBeGreaterThan(0);
    for (const q of closed) {
      expect(q.options?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(q.options).toContain(q.answer ?? "");
    }
    const blanks = questions.filter((q) => q.format === "fill_blank");
    for (const q of blanks) {
      expect(q.question).toContain("____");
      expect(q.answer).toBeTruthy();
    }
  });

  test("the recall writer is told easy is fine; the retest is told it never is", async () => {
    const systems: string[] = [];
    __overrideProviderForTests("gemini", async (_model, system) => {
      systems.push(system);
      return JSON.stringify({ questions: [] });
    });
    await ai.generateRecallQuestions(GAPS, [CONCEPT], [OBJECTIVE]);
    await ai.generateRetestQuestions(GAPS, [CONCEPT], [OBJECTIVE]);
    expect(systems[0]).toContain(
      "an easy, quick question is exactly what you want",
    );
    expect(systems[0]).not.toContain("never write an easy question");
    expect(systems[1]).toContain("never write an easy question");
  });

  test("both writers are handed a provider-enforced question schema", async () => {
    const options: unknown[] = [];
    __overrideProviderForTests(
      "gemini",
      async (_model, _system, _user, opts) => {
        options.push(opts);
        return JSON.stringify({ questions: [] });
      },
    );
    await ai.generateRecallQuestions(GAPS, [CONCEPT], [OBJECTIVE]);
    await ai.generateRetestQuestions(GAPS, [CONCEPT], [OBJECTIVE]);
    const recallSchema = options[0] as { schema?: { required?: string[] } };
    const retestSchema = options[1] as { schema?: { required?: string[] } };
    expect(recallSchema.schema).toBeDefined();
    expect(retestSchema.schema).toBeDefined();
    // Recall requires a format on every question; retest has no formats.
    expect(JSON.stringify(recallSchema.schema)).toContain("fill_blank");
  });

  test("enforceRecallMix never leaves two spoken short answers adjacent", () => {
    const set = [
      { format: "short_answer" as const, id: 1 },
      { format: "short_answer" as const, id: 2 },
      { format: "multiple_choice" as const, id: 3 },
      { format: "fill_blank" as const, id: 4 },
      { format: "multiple_choice" as const, id: 5 },
      { format: "short_answer" as const, id: 6 },
    ];
    const mixed = enforceRecallMix(set);
    expect(mixed).toHaveLength(set.length);
    // Introspection order: same questions, closed ones first, shorts spaced.
    expect(mixed[0]?.format).not.toBe("short_answer");
    for (let i = 1; i < mixed.length; i++) {
      expect(
        mixed[i]?.format === "short_answer" &&
          mixed[i - 1]?.format === "short_answer",
      ).toBe(false);
    }
    // The closed questions keep their relative order.
    const closedIds = mixed
      .filter((q) => q.format !== "short_answer")
      .map((q) => q.id);
    expect(closedIds).toEqual([3, 4, 5]);
  });

  test("no short answers means the set is returned untouched", () => {
    const set = [
      { format: "multiple_choice" as const, id: 1 },
      { format: "fill_blank" as const, id: 2 },
    ];
    expect(enforceRecallMix(set)).toEqual(set);
  });

  test("a soft retest is flagged: too few levels or no beyond-text", () => {
    // Three levels, one beyond-text → the shape it should be.
    expect(
      retestIsSoft([
        { level: "knowledge", beyondText: false },
        { level: "application", beyondText: true },
        { level: "compare_contrast", beyondText: false },
      ]),
    ).toBe(false);
    // Only two levels → soft.
    expect(
      retestIsSoft([
        { level: "knowledge", beyondText: true },
        { level: "comprehension" },
        { level: "knowledge" },
      ]),
    ).toBe(true);
    // Enough levels but never leaves the textbook → soft.
    expect(
      retestIsSoft([
        { level: "knowledge" },
        { level: "application" },
        { level: "critical_thinking" },
      ]),
    ).toBe(true);
    // An empty set is not judged.
    expect(retestIsSoft([])).toBe(false);
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
