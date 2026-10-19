import { describe, expect, test } from "bun:test";
import { summarizeStudyScores } from "./study-result";

describe("study result scores", () => {
  test("uses the pretest as the before score when available", () => {
    expect(
      summarizeStudyScores([
        { stage: "pretest", score: 41 },
        { stage: "recall", score: 70 },
        { stage: "retest", score: 85 },
      ]),
    ).toEqual({ before: 41, after: 85 });
  });

  test("falls back to the mean recall score for older sessions", () => {
    expect(
      summarizeStudyScores([
        { stage: "recall", score: 20 },
        { stage: "recall", score: 41 },
        { stage: "retest", score: 80 },
        { stage: "retest", score: 90 },
      ]),
    ).toEqual({ before: 31, after: 85 });
  });

  test("does not invent scores when a test was skipped", () => {
    expect(
      summarizeStudyScores([
        { stage: "pretest", score: 55 },
        { stage: "recall", score: 100 },
        { stage: "retest", score: null },
      ]),
    ).toEqual({ before: 55, after: null });
    expect(summarizeStudyScores([])).toEqual({ before: null, after: null });
  });
});
