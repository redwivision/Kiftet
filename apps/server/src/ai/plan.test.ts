import { afterEach, describe, expect, test } from "bun:test";
import { __resetAdmissionForTests } from "./admission";
import {
  __overrideProviderForTests,
  ai,
  buildStudyPlan,
  type ConceptChecklistItem,
  estimateStudyStepMinutes,
  type GapAnalysis,
  type MasteryLevel,
  planAction,
  planArchetype,
  planWhyFirst,
  searchQueryFor,
} from "./gemini";

const RAW =
  "The plasma membrane surrounds the cell and controls which substances enter and leave, letting some molecules pass while blocking others. " +
  "Inside, the cytoplasm is a watery fluid that holds the organelles. " +
  "The nucleus sits at the centre and stores the genetic material, DNA, directing the cell's activities. " +
  "Ribosomes build proteins from amino acids. " +
  "Mitochondria release energy from food by cellular respiration to make ATP. " +
  "The Golgi apparatus packages proteins and modifies them for transport to where they are needed.";

const PLASMA_MEMBRANE =
  "The plasma membrane controls which substances enter and leave";
const CYTOPLASM = "Cytoplasm holds the organelles";
const CONCEPTS: ConceptChecklistItem[] = [
  { conceptText: PLASMA_MEMBRANE, isMisconception: false, weight: 5 },
  { conceptText: CYTOPLASM, isMisconception: false, weight: 3 },
  {
    conceptText: "The nucleus stores DNA and directs cell activities",
    isMisconception: false,
    weight: 4,
  },
  {
    conceptText: "Ribosomes build proteins",
    isMisconception: false,
    weight: 2,
  },
  {
    conceptText: "Mitochondria release energy and make ATP",
    isMisconception: false,
    weight: 4,
  },
  {
    conceptText: "The Golgi apparatus packages proteins for transport",
    isMisconception: false,
    weight: 2,
  },
];

function gaps(
  levels: MasteryLevel[],
  evidence?: Record<string, string | null>,
): GapAnalysis {
  const mastery = Object.fromEntries(
    CONCEPTS.map((concept, index) => [concept.conceptText, levels[index] ?? 0]),
  ) as Record<string, MasteryLevel>;
  return {
    covered: [],
    missing: [],
    misconceptions: [],
    mastery,
    evidence,
    score: 0,
    estimated: false,
  };
}

function plan(
  levels: MasteryLevel[],
  budget: 10 | 20 | 40,
  whyFirstByConcept: Map<string, string> = new Map(),
) {
  return buildStudyPlan(
    gaps(levels),
    CONCEPTS,
    "Cell Structure and Function",
    RAW,
    whyFirstByConcept,
    "Biology",
    "en",
    budget,
  );
}

describe("plan step shape", () => {
  test("the action verb names the move for each failure mode", () => {
    expect(planAction(0, "en")).toBe("Learn it");
    expect(planAction(1, "en")).toBe("Complete it");
    expect(planAction(2, "en")).toBe("Tell them apart");
    expect(planAction(0, "am")).not.toBe("Learn it");
  });

  test("the search query keeps the concept, adds the subject once, then a shaped suffix", () => {
    expect(
      searchQueryFor(
        "The plasma membrane controls which substances enter and leave.",
        "Biology",
        "PROCESS",
        "en",
      ),
    ).toBe(
      "The plasma membrane controls which substances enter and leave Biology steps explained",
    );
    // The subject is not repeated when the concept already names it.
    const again = searchQueryFor(
      "Biology: cell transport",
      "Biology",
      "PROCESS",
      "en",
    );
    expect(again.match(/Biology/g)).toHaveLength(1);
    // Trailing punctuation is stripped so the query pastes cleanly.
    expect(
      searchQueryFor("Causes of the drought?", "History", "CAUSAL", "en"),
    ).toBe("Causes of the drought History causes and effects");
  });

  test("the deterministic why line states the diagnosis, never a fact", () => {
    expect(planWhyFirst(0, null, "en")).toBe(
      "Not in your recall — start here.",
    );
    expect(planWhyFirst(1, null, "en")).toBe(
      "You mentioned this, but not fully.",
    );
    expect(planWhyFirst(2, null, "en")).toBe(
      "You mixed this up with a similar idea.",
    );
    expect(planWhyFirst(2, "it lets everything pass", "en")).toContain(
      "it lets everything pass",
    );
    expect(planWhyFirst(0, null, "am")).not.toBe(
      "Not in your recall — start here.",
    );
  });

  test("step minutes are clamped between three and eight", () => {
    expect(estimateStudyStepMinutes("one two three")).toBe(3);
    expect(estimateStudyStepMinutes("word ".repeat(2000))).toBe(8);
  });
});

describe("study plan personalization", () => {
  test("every step carries a why, an action, a search query, and a real anchor", () => {
    const result = plan([2, 0, 0, 0, 0, 0], 20);
    expect(result.steps.length).toBeGreaterThan(0);
    for (const step of result.steps) {
      expect(step.whyFirst.length).toBeGreaterThan(0);
      expect(step.action.length).toBeGreaterThan(0);
      expect(step.searchQuery.length).toBeGreaterThan(0);
      expect(step.anchor.excerpt.length).toBeGreaterThan(0);
    }
    // With no model lines, the plan is honestly marked as estimated.
    expect(result.estimated).toBe(true);
  });

  test("a model-written why is used verbatim and clears the estimated flag", () => {
    const result = buildStudyPlan(
      gaps([0, 3, 3, 3, 3, 3]),
      CONCEPTS,
      "Cell Structure and Function",
      RAW,
      new Map([
        [PLASMA_MEMBRANE.toLowerCase(), "You skipped the gatekeeper idea."],
      ]),
      "Biology",
      "en",
      20,
    );
    const step = result.steps.find((s) => s.concept === PLASMA_MEMBRANE);
    expect(step?.whyFirst).toBe("You skipped the gatekeeper idea.");
    expect(result.estimated).toBe(false);
  });

  test("builds different plans for different students on the same chapter", () => {
    const mixedUp = plan([2, 3, 3, 3, 3, 3], 20);
    const missing = plan([3, 0, 3, 3, 3, 3], 20);
    expect(mixedUp.steps[0]?.concept).toContain("plasma membrane");
    expect(mixedUp.steps[0]?.gapType).toBe("misconception");
    expect(missing.steps[0]?.concept).toContain("Cytoplasm");
    expect(missing.steps[0]?.gapType).toBe("missing");
  });

  test("selects within the time budget and exposes leftovers", () => {
    const short = plan([0, 0, 0, 0, 0, 0], 10);
    const long = plan([0, 0, 0, 0, 0, 0], 40);
    expect(short.estMinutes).toBeLessThanOrEqual(10);
    expect(long.estMinutes).toBeLessThanOrEqual(40);
    expect(short.steps.length).toBeLessThanOrEqual(long.steps.length);
    expect(long.steps.length).toBeLessThanOrEqual(5);
    expect(short.nextSession.length).toBeGreaterThanOrEqual(
      long.nextSession.length,
    );
  });

  test("puts misconceptions first", () => {
    const result = plan([1, 2, 0, 0, 3, 0], 40);
    expect(result.steps[0]?.gapType).toBe("misconception");
  });

  test("includes matched recall evidence only for unfinished or wrong ideas", () => {
    const result = buildStudyPlan(
      gaps([2, 1, 0, 3, 3, 3], {
        [PLASMA_MEMBRANE]: "It lets every substance pass.",
        [CYTOPLASM]: null,
      }),
      CONCEPTS,
      "Cell Structure and Function",
      RAW,
      new Map(),
      "Biology",
      "en",
      40,
    );
    expect(
      result.steps.find((step) => step.masteryLevel === 2)?.studentWords,
    ).toBe("It lets every substance pass.");
    expect(
      result.steps.find((step) => step.masteryLevel === 1)?.studentWords,
    ).toBeNull();
  });

  test("maps subject archetypes and leaves unknown subjects generic", () => {
    expect(planArchetype("Biology")).toBe("PROCESS");
    expect(planArchetype("Chemistry", "Atomic structure")).toBe("PROCESS");
    expect(planArchetype("Chemistry", "Stoichiometry and moles")).toBe(
      "GENERIC",
    );
    expect(planArchetype("History")).toBe("CAUSAL");
    expect(planArchetype("Geography")).toBe("PLACE_SYSTEM");
    expect(planArchetype("Civics & Ethical Education")).toBe("PRINCIPLE");
    expect(planArchetype("English")).toBe("LANGUAGE");
    expect(planArchetype("Mathematics")).toBe("GENERIC");
  });

  test("the plan never invents a URL — search exits are the client's job", () => {
    const result = plan([2, 0, 0, 0, 0, 0], 20);
    expect(JSON.stringify(result)).not.toMatch(/youtube|google|https?:\/\//i);
  });

  test("reading time saved tracks the known ideas, not the budget", () => {
    const manyKnown = plan([3, 3, 3, 3, 3, 3], 20);
    const fewKnown = plan([3, 3, 0, 0, 0, 0], 20);
    expect(manyKnown.skippedKnown.count).toBe(6);
    expect(manyKnown.skippedKnown.estimatedTimeSavedMinutes).toBeGreaterThan(0);
    // Knowing more saves more reading.
    expect(manyKnown.skippedKnown.estimatedTimeSavedMinutes).toBeGreaterThan(
      fewKnown.skippedKnown.estimatedTimeSavedMinutes,
    );
    // A larger budget does not change the time saved by skipping.
    expect(plan([3, 3, 0, 0, 0, 0], 10).skippedKnown).toEqual(
      plan([3, 3, 0, 0, 0, 0], 40).skippedKnown,
    );
  });
});

describe("model-written why lines", () => {
  test("batches every step into one call and drops unusable entries", async () => {
    __resetAdmissionForTests();
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GROQ_API_KEY;
    __overrideProviderForTests("gemini", async () =>
      JSON.stringify({
        steps: [
          { index: 1, why: "You mixed the gate with the wall." },
          { index: 2, why: "See https://example.com for more." },
          { index: 3, why: "x".repeat(200) },
          { index: 99, why: "An index that was never requested." },
        ],
      }),
    );

    const whys = await ai.generatePlanWhyFirst(RAW, [
      {
        conceptText: PLASMA_MEMBRANE,
        gapType: "missing",
        masteryLevel: 0,
        studentWords: null,
        excerpt: RAW.slice(0, 90),
      },
      {
        conceptText: CYTOPLASM,
        gapType: "missing",
        masteryLevel: 0,
        studentWords: null,
        excerpt: "Inside, the cytoplasm is a watery fluid.",
      },
    ]);

    expect(whys.get(PLASMA_MEMBRANE.toLowerCase())).toBe(
      "You mixed the gate with the wall.",
    );
    // URL, over-long, and out-of-range entries are all refused.
    expect(whys.get(CYTOPLASM.toLowerCase())).toBeUndefined();
    expect(whys.size).toBe(1);
  });

  test("falls back to an empty map inside its caller-supplied time budget", async () => {
    __resetAdmissionForTests();
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GROQ_API_KEY;
    __overrideProviderForTests("gemini", () => new Promise<string>(() => {}));

    const startedAt = performance.now();
    const whys = await ai.generatePlanWhyFirst(
      RAW,
      [
        {
          conceptText: PLASMA_MEMBRANE,
          gapType: "missing",
          masteryLevel: 0,
          studentWords: null,
          excerpt: RAW.slice(0, 90),
        },
      ],
      "en",
      { timeoutMs: 40 },
    );

    expect(performance.now() - startedAt).toBeLessThan(250);
    expect(whys.size).toBe(0);
  });

  test("makes no call when AI is skipped", async () => {
    __overrideProviderForTests("gemini", () => {
      throw new Error("should not be called");
    });
    const whys = await ai.generatePlanWhyFirst(
      RAW,
      [
        {
          conceptText: PLASMA_MEMBRANE,
          gapType: "missing",
          masteryLevel: 0,
          studentWords: null,
          excerpt: RAW.slice(0, 90),
        },
      ],
      "en",
      { skipAi: true },
    );
    expect(whys.size).toBe(0);
  });
});

afterEach(() => {
  __overrideProviderForTests("gemini", null);
  __overrideProviderForTests("groq", null);
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  __resetAdmissionForTests();
});
