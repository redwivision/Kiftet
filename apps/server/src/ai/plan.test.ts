import { describe, expect, test } from "bun:test";
import {
  buildStudyPlan,
  type ConceptChecklistItem,
  estimateStudyStepMinutes,
  fallbackStudyPlanContent,
  type GapAnalysis,
  type MasteryLevel,
  planArchetype,
  planStepType,
  type StudyPlanContent,
  validateGroundedPlanContent,
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
  {
    conceptText: PLASMA_MEMBRANE,
    isMisconception: false,
    weight: 5,
  },
  {
    conceptText: CYTOPLASM,
    isMisconception: false,
    weight: 3,
  },
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
  content: Map<string, StudyPlanContent> = new Map(),
) {
  return buildStudyPlan(
    gaps(levels),
    CONCEPTS,
    "Cell Structure and Function",
    RAW,
    content,
    "Biology",
    "en",
    budget,
  );
}

describe("study plan personalization", () => {
  test("step type comes directly from mastery level", () => {
    expect(
      [0, 1, 2, 3].map((level) => planStepType(level as MasteryLevel)),
    ).toEqual(["BUILD", "FINISH", "CONTRAST", "BUILD"]);
  });

  test("PROCESS and CAUSAL steps use only subject-appropriate moves", () => {
    const biology = plan([2, 3, 3, 3, 3, 3], 20).steps[0];
    const historyText =
      "The drought reduced crop yields. The reduced harvest raised food prices.";
    const historyConcept: ConceptChecklistItem = {
      conceptText: "The reduced harvest raised food prices",
      isMisconception: false,
      weight: 3,
    };
    const history = buildStudyPlan(
      {
        covered: [],
        missing: [],
        misconceptions: [],
        mastery: { [historyConcept.conceptText]: 2 },
        score: 0,
        estimated: false,
      },
      [historyConcept],
      "History — sample",
      historyText,
      new Map(),
      "History",
      "en",
      20,
    ).steps[0];
    expect(biology?.check.sayItBack).toContain("stages named");
    expect(history?.check.sayItBack).toContain("cause, event, and consequence");
  });

  test("builds different plans for different students on the same chapter", () => {
    const wrongMembrane = plan([2, 3, 3, 3, 3, 3], 20);
    const missingCytoplasm = plan([3, 0, 3, 3, 3, 3], 20);
    expect(wrongMembrane.steps[0]?.concept).toContain("plasma membrane");
    expect(wrongMembrane.steps[0]?.type).toBe("CONTRAST");
    expect(missingCytoplasm.steps[0]?.concept).toContain("Cytoplasm");
    expect(missingCytoplasm.steps[0]?.type).toBe("BUILD");
  });

  test("selects within the time budget and exposes leftovers", () => {
    const longBodies = new Map<string, StudyPlanContent>(
      CONCEPTS.map((concept) => [
        `${concept.conceptText.toLowerCase()}|BUILD`,
        {
          body: [RAW.repeat(8)],
          contrast: null,
          chapterExplains: true,
          estimated: false,
        },
      ]),
    );
    const short = plan([0, 0, 0, 0, 0, 0], 10, longBodies);
    const long = plan([0, 0, 0, 0, 0, 0], 40, longBodies);
    expect(short.estMinutes).toBeLessThanOrEqual(10);
    expect(long.estMinutes).toBeLessThanOrEqual(40);
    expect(short.steps.length).toBeLessThan(long.steps.length);
    expect(long.steps.length).toBeLessThanOrEqual(5);
    expect(short.nextSession.length).toBeGreaterThan(long.nextSession.length);
  });

  test("puts misconceptions first, BUILD before the grouped FINISH round", () => {
    const result = plan([1, 2, 0, 0, 3, 0], 40);
    expect(result.steps[0]?.type).toBe("CONTRAST");
    expect(result.steps.at(-1)?.type).toBe("FINISH");
    expect(result.steps.filter((step) => step.type === "FINISH")).toHaveLength(
      1,
    );
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

  test("step estimate includes reading, spoken prompt, and the check allowance", () => {
    expect(estimateStudyStepMinutes(["one two three"], "say these words")).toBe(
      1,
    );
    expect(
      estimateStudyStepMinutes(
        ["one two three"],
        ["say these words", "why is this true?"],
        "words ".repeat(200),
      ),
    ).toBeGreaterThan(1);
  });

  test("every plan step has a deterministic source anchor and no search links", () => {
    const result = plan([2, 0, 0, 0, 0, 0], 20);
    expect(result.steps.every((step) => step.anchor.excerpt.length > 0)).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toMatch(/youtube|google|https?:\/\//i);
  });
});

describe("grounded plan content", () => {
  test("accepts only exact chapter spans and the expected structured shape", () => {
    const anchorExcerpt = RAW.slice(0, RAW.indexOf(" Inside,"));
    const good = validateGroundedPlanContent(
      {
        body: [anchorExcerpt.slice(0, 80), anchorExcerpt.slice(80)],
        contrast: null,
        chapterExplains: true,
      },
      RAW,
      "BUILD",
      anchorExcerpt,
    );
    expect(good?.estimated).toBe(false);
    expect(
      validateGroundedPlanContent(
        {
          body: [
            "Inside, the cytoplasm is a watery fluid that holds the organelles.",
          ],
          contrast: null,
          chapterExplains: true,
        },
        RAW,
        "BUILD",
        anchorExcerpt,
      ),
    ).toBeUndefined();
    expect(
      validateGroundedPlanContent(
        {
          body: ["See https://example.com"],
          contrast: null,
          chapterExplains: true,
        },
        RAW,
        "BUILD",
        anchorExcerpt,
      ),
    ).toBeUndefined();
  });

  test("contrast requires three source-grounded parts; fallback stays deterministic", () => {
    const anchorExcerpt = RAW.slice(0, RAW.indexOf(" Inside,"));
    expect(
      validateGroundedPlanContent(
        {
          body: [anchorExcerpt.slice(0, 80), anchorExcerpt.slice(80)],
          contrast: {
            bookSays: "The plasma membrane surrounds the cell",
            feelsRightBecause: "The plasma membrane surrounds the cell",
            failsBecause: "The plasma membrane surrounds the cell",
          },
          chapterExplains: true,
        },
        RAW,
        "CONTRAST",
        anchorExcerpt,
      )?.contrast,
    ).not.toBeNull();
    expect(fallbackStudyPlanContent("An exact passage.")).toEqual({
      body: ["An exact passage."],
      contrast: null,
      chapterExplains: null,
      estimated: true,
    });
  });
});
