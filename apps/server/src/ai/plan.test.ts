import { describe, expect, test } from "bun:test";
import {
  type ConceptChecklistItem,
  fallbackPlan,
  type GapAnalysis,
  sanitizePlanSteps,
} from "./gemini";

const CONCEPTS: ConceptChecklistItem[] = [
  {
    conceptText:
      "Chloroplasts are the organelles where photosynthesis occurs in plant cells",
    isMisconception: false,
    weight: 5,
  },
  {
    conceptText:
      "The nucleus stores genetic material (DNA) and controls the cell's activities",
    isMisconception: false,
    weight: 4,
  },
  {
    conceptText: "Lysosomes contain enzymes that digest waste",
    isMisconception: false,
    weight: 2,
  },
  {
    conceptText: "Chloroplasts are found in animal cells",
    isMisconception: true,
    weight: 1,
  },
];

function gaps(missing: string[], misconceptions: string[]): GapAnalysis {
  return {
    covered: [],
    missing,
    misconceptions,
    mastery: {},
    score: 0,
    estimated: false,
  };
}

describe("fallbackPlan", () => {
  test("puts misconceptions before missing ideas", () => {
    const plan = fallbackPlan(
      gaps(
        [
          "Chloroplasts are the organelles where photosynthesis occurs in plant cells",
        ],
        ["Chloroplasts are found in animal cells"],
      ),
      CONCEPTS,
    );
    expect(plan.steps.map((s) => s.gapType)).toEqual([
      "misconception",
      "missing",
    ]);
  });

  test("orders missing ideas by weight, heaviest first", () => {
    const plan = fallbackPlan(
      gaps(
        [
          "Lysosomes contain enzymes that digest waste",
          "The nucleus stores genetic material (DNA) and controls the cell's activities",
        ],
        [],
      ),
      CONCEPTS,
    );
    expect(plan.steps.map((s) => s.concept)).toEqual([
      "The nucleus stores genetic material (DNA) and controls the cell's activities",
      "Lysosomes contain enzymes that digest waste",
    ]);
  });

  test("keeps names verbatim and is flagged as estimated", () => {
    const plan = fallbackPlan(
      gaps(["Lysosomes contain enzymes that digest waste"], []),
      CONCEPTS,
    );
    expect(plan.steps).toEqual([
      {
        concept: "Lysosomes contain enzymes that digest waste",
        gapType: "missing",
        weight: 2,
      },
    ]);
    expect(plan.estimated).toBe(true);
    expect(plan.estMinutes).toBeGreaterThan(0);
  });

  test("returns an empty roadmap when there are no gaps", () => {
    const plan = fallbackPlan(gaps([], []), CONCEPTS);
    expect(plan.steps).toEqual([]);
  });
});

describe("sanitizePlanSteps", () => {
  test("drops invented names and dedupes; keeps the model's order", () => {
    const input = {
      steps: [
        {
          concept: "chloroplasts are found in animal cells",
          gapType: "misconception",
          whyFirst: "You had this backwards — fix it first.",
          searchTopic: "chloroplast location in cells",
        },
        { concept: "Not a real concept at all", gapType: "missing" },
        {
          concept: "chloroplasts are found in animal cells",
          gapType: "misconception",
        },
      ],
    };
    const steps = sanitizePlanSteps(
      input,
      gaps([], ["Chloroplasts are found in animal cells"]),
      CONCEPTS,
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({
      concept: "Chloroplasts are found in animal cells",
      gapType: "misconception",
      weight: 1,
      whyFirst: "You had this backwards — fix it first.",
      searchTopic: "chloroplast location in cells",
    });
  });

  test("snaps drifted spellings onto the checklist's canonical name", () => {
    const steps = sanitizePlanSteps(
      {
        steps: [
          {
            concept: "LYSOsomes contain enzymes that digest waste",
            gapType: "missing",
          },
        ],
      },
      gaps(["Lysosomes contain enzymes that digest waste"], []),
      CONCEPTS,
    );
    expect(steps).toHaveLength(1);
    const [step] = steps;
    if (!step) throw new Error("expected one sanitized step");
    expect(step.concept).toBe("Lysosomes contain enzymes that digest waste");
    expect(step.weight).toBe(2);
  });

  test("returns nothing for non-object or empty input", () => {
    expect(sanitizePlanSteps(null, gaps([], []), CONCEPTS)).toEqual([]);
    expect(sanitizePlanSteps("junk", gaps([], []), CONCEPTS)).toEqual([]);
    expect(
      sanitizePlanSteps({ steps: [] as unknown[] }, gaps([], []), CONCEPTS),
    ).toEqual([]);
  });
});
