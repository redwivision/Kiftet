import { describe, expect, test } from "bun:test";
import { buildCoverageUnits } from "./recall-coverage";
import {
  deriveSessionVerdict,
  masteryFromStudyAttempts,
} from "./retest-verdict";

const units = buildCoverageUnits(
  [
    { conceptText: "2.1 Cells" },
    { conceptText: "2.1 Tissues" },
    { conceptText: "2.2 Organs" },
  ],
  [],
);

describe("deriveSessionVerdict", () => {
  test("a fully mastered chapter passes with every section probed", () => {
    const verdict = deriveSessionVerdict(units, {
      "2.1 Cells": 3,
      "2.1 Tissues": 3,
      "2.2 Organs": 3,
    });

    expect(verdict.overall).toBe(100);
    expect(verdict.passed).toBe(true);
    expect(verdict.unprobedSections).toBe(0);
    expect(verdict.sections.map((s) => s.key)).toEqual(["2.1", "2.2"]);
  });

  test("an unprobed idea counts as zero, so a skipped chapter cannot score high", () => {
    const verdict = deriveSessionVerdict(units, {
      "2.1 Cells": 3,
      "2.1 Tissues": 3,
    });
    // 2 of 3 ideas mastered, the third never judged.
    expect(verdict.overall).toBe(67);
    expect(verdict.passed).toBe(false);
    expect(verdict.unprobedSections).toBe(1);
    expect(verdict.sections[1]?.probed).toBe(false);
  });

  test("an unprobed section blocks a pass even when the overall score clears the bar", () => {
    const big = buildCoverageUnits(
      [
        { conceptText: "1.1 A" },
        { conceptText: "1.1 B" },
        { conceptText: "1.1 C" },
        { conceptText: "1.1 D" },
        { conceptText: "1.2 E" },
      ],
      [],
    );
    const verdict = deriveSessionVerdict(big, {
      "1.1 A": 3,
      "1.1 B": 3,
      "1.1 C": 3,
      "1.1 D": 3,
    });
    expect(verdict.overall).toBe(80);
    expect(verdict.unprobedSections).toBe(1);
    expect(verdict.passed).toBe(false);
  });

  test("a misconception and an untouched idea earn nothing; partial credit earns half", () => {
    const verdict = deriveSessionVerdict(units, {
      "2.1 Cells": 3,
      "2.1 Tissues": 1,
      "2.2 Organs": 2,
    });
    // 1 + 0.5 + 0 out of 3 = 50.
    expect(verdict.overall).toBe(50);
    expect(verdict.sections[0]?.score).toBe(75);
    expect(verdict.sections[1]?.score).toBe(0);
  });

  test("weights move the score, as the concept checklist says they should", () => {
    const mastery = { "2.1 Cells": 3, "2.1 Tissues": 0, "2.2 Organs": 3 };
    const weighted = deriveSessionVerdict(units, mastery, {
      "2.1 Cells": 5,
      "2.1 Tissues": 1,
      "2.2 Organs": 1,
    });
    // 6 of 7 weight earned.
    expect(weighted.overall).toBe(86);
    // The same mastery scores lower when every idea weighs the same.
    expect(deriveSessionVerdict(units, mastery).overall).toBe(67);
  });

  test("no sections means no pass", () => {
    const verdict = deriveSessionVerdict([], {});
    expect(verdict.overall).toBe(0);
    expect(verdict.passed).toBe(false);
  });

  test("a threshold above the score fails; below it passes", () => {
    const mastery = { "2.1 Cells": 3, "2.1 Tissues": 3, "2.2 Organs": 3 };
    expect(deriveSessionVerdict(units, mastery, {}, 100).passed).toBe(true);
    expect(deriveSessionVerdict(units, mastery, {}, 101).passed).toBe(false);
  });
});

describe("masteryFromStudyAttempts", () => {
  test("uses recall and post-test evidence but never baseline evidence", () => {
    expect(
      masteryFromStudyAttempts([
        {
          stage: "pretest",
          gapsIdentified: { mastery: { "2.1 Cells": 3, "2.1 Tissues": 3 } },
        },
        {
          stage: "recall",
          gapsIdentified: { mastery: { "2.1 Cells": 1 } },
        },
        {
          stage: "retest",
          gapsIdentified: { mastery: { "2.1 Cells": 3 } },
        },
      ]),
    ).toEqual({ "2.1 Cells": 3 });
  });
});
