import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __resetAdmissionForTests } from "./admission";
import {
  __overrideProviderForTests,
  ai,
  aiTelemetrySnapshot,
  type ConceptChecklistItem,
  focusScore,
  gapAnalysisFrom,
  questionUserPrompt,
} from "./gemini";
import {
  COGNITIVE_LEVELS,
  enforceRecallMix,
  enforceSingleBeyondText,
  fallbackLevels,
  isCognitiveLevel,
  judgeClosedAnswer,
  RECALL_FORMATS,
  RECALL_MIN_QUESTIONS,
  recallFormatCounts,
  recallFormatPlan,
  recallIsFlat,
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

  test("a recall set is flat only when it never leaves one level", () => {
    expect(recallIsFlat([])).toBe(false);
    expect(recallIsFlat([{ level: "knowledge" }])).toBe(true);
    expect(
      recallIsFlat([
        { level: "knowledge" },
        { level: "comprehension" },
        { level: "knowledge" },
      ]),
    ).toBe(false);
    // Every question at one level (or untagged) measures nothing but memory.
    expect(recallIsFlat([{ level: "knowledge" }, { level: "knowledge" }])).toBe(
      true,
    );
    expect(recallIsFlat([{}, {}])).toBe(true);
  });
});

describe("the two writers", () => {
  test("the user prompt carries the checklist and the stated objectives", () => {
    const prompt = questionUserPrompt(GAPS, [CONCEPT], [OBJECTIVE]);
    expect(prompt).toContain(CONCEPT.conceptText);
    expect(prompt).toContain("STATED OBJECTIVES");
    expect(prompt).toContain(OBJECTIVE);
  });

  test("the user prompt carries the chapter text and the unprobed leftovers", () => {
    const prompt = questionUserPrompt(GAPS, [CONCEPT], [OBJECTIVE], {
      chapterText: "Osmosis is the movement of water across a membrane.",
      unprobed: ["Active transport"],
    });
    expect(prompt).toContain("CHAPTER TEXT");
    expect(prompt).toContain("movement of water across a membrane");
    expect(prompt).toContain("NOT YET CHECKED");
    expect(prompt).toContain("Active transport");
    // Both blocks are optional; the prompt is unchanged without them.
    const bare = questionUserPrompt(GAPS, [CONCEPT], [OBJECTIVE]);
    expect(bare).not.toContain("CHAPTER TEXT");
    expect(bare).not.toContain("NOT YET CHECKED");
  });

  test("only the first beyond-text question survives, and a soft set gets one repair", async () => {
    const systems: string[] = [];
    __overrideProviderForTests("gemini", async (_model, system) => {
      systems.push(system);
      if (systems.length === 1) {
        // First answer: one level only, no spread — a soft set.
        return JSON.stringify({
          questions: [
            {
              question: "What is osmosis?",
              level: "knowledge",
              targetConcept: CONCEPT.conceptText,
            },
          ],
        });
      }
      return JSON.stringify({
        questions: [
          { question: "Define it.", level: "knowledge", beyondText: true },
          { question: "Use it.", level: "application", beyondText: true },
          {
            question: "Compare it.",
            level: "compare_contrast",
            beyondText: false,
          },
        ],
      });
    });
    const questions = await ai.generateRetestQuestions(
      GAPS,
      [CONCEPT],
      [OBJECTIVE],
    );
    // One corrective call, and the repaired set is the one returned.
    expect(systems).toHaveLength(2);
    expect(systems[1]).toContain("too soft");
    expect(questions).toHaveLength(3);
    expect(questions.filter((q) => q.beyondText)).toHaveLength(1);
  });

  test("a 6–10 question prompt keeps at most ten of what the writer sent", async () => {
    __overrideProviderForTests("gemini", async () =>
      JSON.stringify({
        questions: Array.from({ length: 12 }, (_, i) => ({
          question: `Question ${i + 1}`,
          level: COGNITIVE_LEVELS[i % COGNITIVE_LEVELS.length],
          targetConcept: CONCEPT.conceptText,
          beyondText: i === 0,
        })),
      }),
    );
    const questions = await ai.generateRetestQuestions(
      GAPS,
      [CONCEPT],
      [OBJECTIVE],
    );
    expect(questions).toHaveLength(10);
  });

  test("recall and retest are given different system prompts", async () => {
    const systems: string[] = [];
    __overrideProviderForTests("gemini", async (_model, system) => {
      systems.push(system);
      return JSON.stringify({ questions: [] });
    });

    await ai.generateRecallQuestions(GAPS, [CONCEPT], [OBJECTIVE]);
    await ai.generateRetestQuestions(GAPS, [CONCEPT], [OBJECTIVE]);

    // Recall now fans out into provider chunks, so there can be more than one
    // recall system prompt; retest stays a single call.
    const recallSystems = systems.filter((s) => s.includes("DIAGNOSTIC"));
    const retestSystems = systems.filter((s) => s.includes("beyondText"));
    expect(recallSystems.length).toBeGreaterThan(0);
    expect(retestSystems).toHaveLength(1);
    expect(recallSystems[0]).not.toBe(retestSystems[0]);
    // Both carry the shared taxonomy; only the retest asks for beyond-textbook
    // reasoning, and only the recall is framed as a diagnostic.
    expect(recallSystems[0]).toContain("cognitive level");
    expect(retestSystems[0]).toContain("cognitive level");
    expect(recallSystems[0]).not.toContain("beyondText");
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
  test("the ten-question floor is 6/3/1 and the blank-heavy families 4/5/1", () => {
    expect(recallFormatCounts(RECALL_MIN_QUESTIONS, "history_social")).toEqual({
      multiple_choice: 6,
      fill_blank: 3,
      short_answer: 1,
    });
    for (const family of [
      "mathematics",
      "physics",
      "chemistry",
      "biology",
      "cs_ict",
    ] as const) {
      expect(recallFormatCounts(RECALL_MIN_QUESTIONS, family)).toEqual({
        multiple_choice: 4,
        fill_blank: 5,
        short_answer: 1,
      });
    }
  });

  test("counts always sum to the request, whatever the size", () => {
    for (let count = 0; count <= 16; count++) {
      for (const family of ["other", "mathematics"] as const) {
        const counts = recallFormatCounts(count, family);
        const sum = RECALL_FORMATS.reduce((acc, f) => acc + counts[f], 0);
        expect(sum).toBe(count);
      }
    }
  });

  test("a large set never carries more spoken answers than the cap", () => {
    for (let count = 10; count <= 16; count++) {
      expect(
        recallFormatCounts(count, "other").short_answer,
      ).toBeLessThanOrEqual(2);
      expect(
        recallFormatCounts(count, "mathematics").short_answer,
      ).toBeLessThanOrEqual(2);
    }
  });

  test("the plan keeps one entry per question and never opens on the short answer", () => {
    const plan = recallFormatPlan(RECALL_MIN_QUESTIONS, "other");
    expect(plan).toHaveLength(RECALL_MIN_QUESTIONS);
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
    // Mathematics is blank-heavy, so the format rules lean toward fill-in-the-blank.
    expect(system).toContain("leaning toward fill_blank");
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
    const recallSystems = systems.filter((s) => s.includes("DIAGNOSTIC"));
    const retestSystems = systems.filter((s) =>
      s.includes("never write an easy question"),
    );
    expect(recallSystems[0]).toContain(
      "an easy, quick question is exactly what you want",
    );
    expect(recallSystems[0]).not.toContain("never write an easy question");
    expect(retestSystems).toHaveLength(1);
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
    type Schema = {
      required?: string[];
      properties?: {
        questions?: { items?: { required?: string[] } };
      };
    };
    const recallSchema = options[0] as { schema?: Schema };
    const retestSchema = options[options.length - 1] as { schema?: Schema };
    const itemRequired = (schema?: Schema) =>
      schema?.properties?.questions?.items?.required ?? [];
    expect(recallSchema.schema).toBeDefined();
    expect(retestSchema.schema).toBeDefined();
    // Recall *requires* a format on every question; retest only offers it.
    expect(itemRequired(recallSchema.schema)).toContain("format");
    expect(itemRequired(retestSchema.schema)).not.toContain("format");
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

  test("exactly one beyond-text question survives, however many the writer marked", () => {
    const set = [
      { id: 1, beyondText: false },
      { id: 2, beyondText: true },
      { id: 3 },
      { id: 4, beyondText: true },
    ];
    const out = enforceSingleBeyondText(set);
    expect(out.map((q) => q.beyondText)).toEqual([
      false,
      true,
      undefined,
      false,
    ]);
    // The original objects are not mutated.
    expect(set[3]?.beyondText).toBe(true);
    // A set with none is left alone — that is the soft-set signal's job.
    const untouched = enforceSingleBeyondText<{
      id: number;
      beyondText?: boolean;
    }>([{ id: 1 }]);
    expect(untouched).toHaveLength(1);
    expect(untouched[0]?.beyondText).toBeUndefined();
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

describe("recall coverage across lessons", () => {
  const SECTION_CONCEPTS: ConceptChecklistItem[] = [
    {
      conceptText: "2.1 Cells are the unit of life",
      isMisconception: false,
      weight: 3,
    },
    {
      conceptText: "2.1.1 The cell membrane",
      isMisconception: false,
      weight: 2,
    },
    {
      conceptText: "2.2 Tissues group similar cells",
      isMisconception: false,
      weight: 2,
    },
    {
      conceptText: "2.3 Organs combine tissues",
      isMisconception: false,
      weight: 1,
    },
  ];
  const GAPS_HERE = gapAnalysisFrom(
    { missing: ["2.1 Cells are the unit of life"], misconceptions: [] },
    SECTION_CONCEPTS,
  );

  // Answer each chunk exactly as asked: one question per slot the prompt names.
  function answerSlots(counter: { n: number }) {
    return async (_model: string, _system: string, user: string) => {
      const concepts = [
        ...user.matchAll(/targetConcept must be exactly "([^"]+)"/g),
      ].map((m) => m[1] as string);
      return JSON.stringify({
        questions: concepts.map((c) => ({
          format: "multiple_choice",
          question: `Question ${counter.n++} about ${c}`,
          options: ["A", "B", "C"],
          answer: "A",
          level: "knowledge",
          targetConcept: c,
        })),
      });
    };
  }

  test("a recall set that never leaves one level is counted as flat", async () => {
    __overrideProviderForTests("gemini", answerSlots({ n: 0 }));
    const before = aiTelemetrySnapshot().flatRecall;
    await ai.generateRecallQuestions(GAPS_HERE, SECTION_CONCEPTS, []);
    expect(aiTelemetrySnapshot().flatRecall).toBe(before + 1);
  });

  test("the set reaches the floor and touches every numbered section", async () => {
    const counter = { n: 0 };
    __overrideProviderForTests("gemini", answerSlots(counter));
    const questions = await ai.generateRecallQuestions(
      GAPS_HERE,
      SECTION_CONCEPTS,
      [],
    );
    expect(questions.length).toBeGreaterThanOrEqual(10);
    const lessons = new Set(
      questions.map((q) => q.lesson).filter((l): l is string => !!l),
    );
    expect(lessons).toEqual(new Set(["2.1", "2.2", "2.3"]));
  });

  test("chunks are split across both providers when both are wired", async () => {
    process.env.GROQ_API_KEY = "questions-test-groq-key";
    const gemini = { n: 0 };
    const groq = { n: 0 };
    __overrideProviderForTests("gemini", answerSlots(gemini));
    __overrideProviderForTests("groq", answerSlots(groq));
    const questions = await ai.generateRecallQuestions(
      GAPS_HERE,
      SECTION_CONCEPTS,
      [],
    );
    expect(questions.length).toBeGreaterThanOrEqual(10);
    // The deliberate split means neither provider carries the whole set alone.
    expect(gemini.n).toBeGreaterThan(0);
    expect(groq.n).toBeGreaterThan(0);
  });

  test("a chunk that skips a lesson is topped up so no section is dropped", async () => {
    // Gemini answers only the first concept it is asked about; every other slot
    // it was given goes unanswered. The top-up and fallback must still leave
    // every section with a question.
    __overrideProviderForTests("gemini", async (_m, _s, user) => {
      const first = /targetConcept must be exactly "([^"]+)"/.exec(user)?.[1];
      if (!first) return JSON.stringify({ questions: [] });
      return JSON.stringify({
        questions: [
          {
            format: "multiple_choice",
            question: `Only one, for ${first}`,
            options: ["A", "B"],
            answer: "A",
            level: "knowledge",
            targetConcept: first,
          },
        ],
      });
    });
    const questions = await ai.generateRecallQuestions(
      GAPS_HERE,
      SECTION_CONCEPTS,
      [],
    );
    const lessons = new Set(
      questions.map((q) => q.lesson).filter((l): l is string => !!l),
    );
    expect(lessons).toEqual(new Set(["2.1", "2.2", "2.3"]));
  });
});
