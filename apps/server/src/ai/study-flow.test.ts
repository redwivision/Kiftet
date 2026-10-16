import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __resetAdmissionForTests } from "./admission";
import {
  __overrideProviderForTests,
  ai,
  buildStudyPlan,
  type ConceptChecklistItem,
  focusScore,
} from "./gemini";

const CONCEPT: ConceptChecklistItem = {
  conceptText: "The membrane blocks some substances",
  isMisconception: false,
  weight: 3,
};
const CHAPTER =
  "The plasma membrane surrounds the cell and controls which substances enter and leave, letting some molecules pass while blocking others.";
const WRONG_RECALL =
  "The membrane blocks some substances only when it is switched off.";
const CORRECT_RECALL =
  "The membrane blocks some substances while letting some molecules pass.";

beforeEach(() => {
  __resetAdmissionForTests();
  process.env.GEMINI_API_KEY = "study-flow-test-key";
  delete process.env.GROQ_API_KEY;

  __overrideProviderForTests("gemini", async (_model, system, user) => {
    if (system.includes("You judge how well a student's spoken recall")) {
      const correct = user.includes(CORRECT_RECALL);
      return JSON.stringify({
        mastery: { [CONCEPT.conceptText]: correct ? 3 : 2 },
        covered: correct ? [CONCEPT.conceptText] : [],
        missing: [],
        misconceptions: correct ? [] : [CONCEPT.conceptText],
      });
    }
    if (
      system.includes("Write questions that prove a student is bulletproof")
    ) {
      return JSON.stringify({
        questions: [
          {
            question:
              "What does the membrane let through, and what does it block?",
            level: "application",
            targetConcept: CONCEPT.conceptText,
          },
        ],
      });
    }
    throw new Error(`Unexpected study-flow AI prompt: ${system.slice(0, 40)}`);
  });
});

afterEach(() => {
  __overrideProviderForTests("gemini", null);
  __overrideProviderForTests("groq", null);
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  __resetAdmissionForTests();
});

describe("recall-to-retest study flow", () => {
  test("diagnoses, builds a grounded step, and grades a targeted retest", async () => {
    const diagnosis = await ai.gradeRecall(WRONG_RECALL, [CONCEPT]);
    expect(diagnosis.mastery[CONCEPT.conceptText]).toBe(2);
    expect(diagnosis.evidence?.[CONCEPT.conceptText]).toBe(WRONG_RECALL);

    const plan = buildStudyPlan(
      diagnosis,
      [CONCEPT],
      "Cell structure",
      CHAPTER,
      new Map([[CONCEPT.conceptText.toLowerCase(), "You flipped the rule."]]),
      "Biology",
      "en",
      20,
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.gapType).toBe("misconception");
    expect(plan.steps[0]?.whyFirst).toBe("You flipped the rule.");
    expect(plan.steps[0]?.anchor.excerpt).toContain("membrane");
    expect(plan.steps[0]?.studentWords).toBe(WRONG_RECALL);

    const retestQuestions = await ai.generateRetestQuestions(
      diagnosis,
      [CONCEPT],
      [],
    );
    expect(retestQuestions[0]?.targetConcept).toBe(CONCEPT.conceptText);
    expect(retestQuestions[0]?.level).toBe("application");

    const retest = await ai.gradeRecall(CORRECT_RECALL, [CONCEPT]);
    expect(focusScore(retest, [CONCEPT])).toBe(1);
  });
});
