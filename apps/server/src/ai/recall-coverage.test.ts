import { describe, expect, test } from "bun:test";
import { RECALL_MAX_QUESTIONS, RECALL_MIN_QUESTIONS } from "./questions";
import {
  buildCoverageUnits,
  chunkRecallSlots,
  planRecallSlots,
  recallQuestionCount,
  scopedConcepts,
  scopedUnits,
  sectionKey,
  unitByConcept,
  unitForConcept,
} from "./recall-coverage";

const numbered = (texts: string[]) =>
  texts.map((conceptText) => ({ conceptText }));

describe("sectionKey", () => {
  test("takes the first two numbering segments, whatever the depth", () => {
    expect(sectionKey("2.3.1 The internal structure of a leaf")).toBe("2.3");
    expect(sectionKey("2.3 Leaves")).toBe("2.3");
    expect(sectionKey("2 Photosynthesis")).toBe("2");
    expect(sectionKey("10.12.4 Something deep")).toBe("10.12");
  });

  test("a label with no leading number has no section", () => {
    expect(sectionKey("Osmosis moves water across a membrane")).toBeNull();
    expect(sectionKey("   ")).toBeNull();
  });
});

describe("buildCoverageUnits", () => {
  test("groups numbered concepts by their section, in book order", () => {
    const units = buildCoverageUnits(
      numbered([
        "2.1 Cells",
        "2.1.1 Cell wall",
        "2.2 Tissues",
        "2.2.1 Muscle tissue",
      ]),
      [],
    );
    expect(units.map((u) => u.key)).toEqual(["2.1", "2.2"]);
    expect(units[0]?.concepts).toEqual(["2.1 Cells", "2.1.1 Cell wall"]);
    expect(units[1]?.concepts).toEqual(["2.2 Tissues", "2.2.1 Muscle tissue"]);
    expect(units[0]?.label).toBe("2.1");
  });

  test("an unnumbered chapter is split into ordered windows, never one lump", () => {
    const units = buildCoverageUnits(
      numbered(["A one", "B two", "C three", "D four", "E five"]),
      [],
    );
    expect(units.length).toBeGreaterThan(1);
    expect(units.flatMap((u) => u.concepts)).toEqual([
      "A one",
      "B two",
      "C three",
      "D four",
      "E five",
    ]);
    // A windowed unit has no book label — the UI must not invent "Section w1".
    expect(units.every((u) => u.label === "")).toBe(true);
  });

  test("chapter-level objectives are dealt round-robin when they carry no section", () => {
    const units = buildCoverageUnits(
      numbered(["2.1 Cells", "2.2 Tissues", "2.3 Organs"]),
      ["Explain the cell", "Compare tissues", "Describe an organ"],
    );
    expect(units.map((u) => u.objectives.length)).toEqual([1, 1, 1]);
  });

  test("an objective numbered like a section lands on that section", () => {
    const units = buildCoverageUnits(numbered(["2.1 Cells", "2.2 Tissues"]), [
      "2.2 Explain how tissues differ",
      "Explain the cell",
    ]);
    expect(units[1]?.objectives).toContain("2.2 Explain how tissues differ");
    expect(units[0]?.objectives).toContain("Explain the cell");
  });

  test("more sections than the ceiling are merged down to it", () => {
    const many = numbered(
      Array.from({ length: 30 }, (_, i) => `${i + 1}.1 Concept ${i + 1}`),
    );
    const units = buildCoverageUnits(many, []);
    expect(units.length).toBeLessThanOrEqual(RECALL_MAX_QUESTIONS);
    // Nothing is lost in the merge.
    expect(units.flatMap((u) => u.concepts)).toHaveLength(30);
  });
});

describe("scoping a session's sections (phase 11, step 4)", () => {
  const sectioned = numbered([
    "2.1 Cells",
    "2.1.1 Cell wall",
    "2.2 Tissues",
    "2.3 Organs",
  ]);

  test("empty, absent or unknown scope means the whole chapter", () => {
    const units = buildCoverageUnits(sectioned, []);
    expect(scopedUnits(units, null).map((u) => u.key)).toEqual([
      "2.1",
      "2.2",
      "2.3",
    ]);
    expect(scopedUnits(units, []).map((u) => u.key)).toEqual([
      "2.1",
      "2.2",
      "2.3",
    ]);
    // A stale key from a re-read chapter must not shrink the session to nothing.
    expect(scopedUnits(units, ["9.9"]).map((u) => u.key)).toEqual([
      "2.1",
      "2.2",
      "2.3",
    ]);
  });

  test("a selected section keeps all of its concepts", () => {
    const units = buildCoverageUnits(sectioned, []);
    expect(scopedUnits(units, ["2.1"]).map((u) => u.key)).toEqual(["2.1"]);
    expect(
      scopedConcepts(sectioned, ["2.1"]).map((c) => c.conceptText),
    ).toEqual(["2.1 Cells", "2.1.1 Cell wall"]);
  });

  test("several sections stay in the chapter's order", () => {
    expect(
      scopedConcepts(sectioned, ["2.3", "2.1"]).map((c) => c.conceptText),
    ).toEqual(["2.1 Cells", "2.1.1 Cell wall", "2.3 Organs"]);
  });

  test("an unnumbered chapter scopes by its window keys", () => {
    const loose = numbered(["A one", "B two", "C three", "D four"]);
    const units = buildCoverageUnits(loose, []);
    const first = units[0]?.key ?? "";
    expect(scopedConcepts(loose, [first]).length).toBeLessThan(loose.length);
    expect(scopedConcepts(loose, [first]).length).toBeGreaterThan(0);
  });
});

describe("recallQuestionCount", () => {
  test("never falls below the floor, scales with lessons, never passes the ceiling", () => {
    expect(recallQuestionCount(0)).toBe(RECALL_MIN_QUESTIONS);
    expect(recallQuestionCount(3)).toBe(RECALL_MIN_QUESTIONS);
    expect(recallQuestionCount(RECALL_MIN_QUESTIONS)).toBe(
      RECALL_MIN_QUESTIONS,
    );
    expect(recallQuestionCount(13)).toBe(13);
    expect(recallQuestionCount(99)).toBe(RECALL_MAX_QUESTIONS);
  });
});

describe("planRecallSlots", () => {
  const units = buildCoverageUnits(
    numbered(["2.1 a", "2.2 b", "2.3 c", "2.4 d"]),
    [],
  );

  test("asks one question per lesson at least, and reaches the floor", () => {
    const slots = planRecallSlots(
      units,
      recallQuestionCount(units.length),
      "other",
    );
    expect(slots.length).toBe(RECALL_MIN_QUESTIONS);
    const keys = new Set(slots.map((s) => s.unit.key));
    expect(keys.size).toBe(units.length);
  });

  test("the format mix holds across the whole plan, and no two shorts are adjacent", () => {
    const slots = planRecallSlots(units, 16, "other");
    expect(slots).toHaveLength(16);
    expect(
      slots.filter((s) => s.format === "short_answer").length,
    ).toBeLessThanOrEqual(2);
    expect(slots[0]?.format).not.toBe("short_answer");
  });

  test("extras go to the lessons the student's own gaps flagged, before the rest", () => {
    const preferred = new Set(["2.3"]);
    const slots = planRecallSlots(units, 5, "other", preferred);
    // One extra slot over the four lessons: it lands on the flagged lesson.
    const forPreferred = slots.filter((s) => s.unit.key === "2.3").length;
    const plain = slots.filter((s) => s.unit.key === "2.1").length;
    expect(forPreferred).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThanOrEqual(1);
  });

  test("concepts from a lesson are cycled so its questions do not all repeat one idea", () => {
    const two = buildCoverageUnits(
      numbered(["2.1 alpha", "2.1 beta", "2.2 gamma"]),
      [],
    );
    const slots = planRecallSlots(two, 8, "other");
    const inFirst = slots
      .filter((s) => s.unit.key === "2.1")
      .map((s) => s.concept);
    expect(new Set(inFirst).size).toBeGreaterThan(1);
  });

  test("no units means no slots", () => {
    expect(planRecallSlots([], 10, "other")).toEqual([]);
  });
});

describe("chunkRecallSlots", () => {
  test("splits into focused windows, keeping the last partial chunk", () => {
    const units = buildCoverageUnits(numbered(["2.1 a", "2.2 b"]), []);
    const slots = planRecallSlots(units, 12, "other");
    const chunks = chunkRecallSlots(slots, 5);
    expect(chunks.map((c) => c.length)).toEqual([5, 5, 2]);
    expect(chunks.flat()).toEqual(slots);
  });
});

describe("unitByConcept / unitForConcept", () => {
  test("finds the lesson a written concept belongs to, case- and space-insensitively", () => {
    const units = buildCoverageUnits(
      numbered(["2.1  The Cell", "2.2 Tissues"]),
      [],
    );
    const index = unitByConcept(units);
    expect(unitForConcept(index, " 2.1   the   cell ")?.key).toBe("2.1");
    expect(unitForConcept(index, "2.2 TISSUES")?.key).toBe("2.2");
    expect(unitForConcept(index, "something else")).toBeNull();
    expect(unitForConcept(index, undefined)).toBeNull();
  });
});
