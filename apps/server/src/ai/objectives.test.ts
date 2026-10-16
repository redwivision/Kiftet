/**
 * The deterministic objectives reader is what keeps a chapter read to ONE model
 * call: when the book states its own outcomes, this finds them without asking.
 * These tests hold the two properties that matters for: it finds a real
 * objectives list, and it refuses to invent one when there is none.
 */
import { describe, expect, test } from "bun:test";
import { fallbackObjectives } from "./objectives";

describe("fallbackObjectives", () => {
  test("reads a bulleted objectives list under its heading", () => {
    const raw = [
      "UNIT 1: CELL BIOLOGY",
      "",
      "Objectives",
      "After studying this unit, you will be able to:",
      "• describe the structure of a plant cell",
      "• explain the function of the cell membrane",
      "• distinguish between plant and animal cells",
      "",
      "A cell is the smallest unit of life. All living things are made of cells.",
    ].join("\n");

    const objectives = fallbackObjectives(raw);
    expect(objectives.map((o) => o.objectiveText)).toEqual([
      "describe the structure of a plant cell",
      "explain the function of the cell membrane",
      "distinguish between plant and animal cells",
    ]);
  });

  test("offsets index the original text", () => {
    const raw =
      "Learning Outcomes\n1. define photosynthesis\n2. state the word equation";
    const [first] = fallbackObjectives(raw);
    expect(first).toBeDefined();
    if (!first) throw new Error("expected an objective");
    expect(raw.slice(first.offset).startsWith(first.objectiveText)).toBe(true);
  });

  test("recognises the sentence-form heading", () => {
    const raw =
      "By the end of this chapter, you will be able to:\n- calculate the molar mass of a compound\n- balance a chemical equation";
    expect(fallbackObjectives(raw).map((o) => o.objectiveText)).toEqual([
      "calculate the molar mass of a compound",
      "balance a chemical equation",
    ]);
  });

  test("returns nothing when the chapter states no objectives", () => {
    const raw =
      "A cell is the smallest unit of life. All living things are made of cells. " +
      "The nucleus controls the cell.";
    expect(fallbackObjectives(raw)).toEqual([]);
  });

  test("does not collect body prose after the list ends", () => {
    // The list is contiguous. A paragraph that follows it is not an objective
    // even though it may contain a verb the list also uses.
    const raw = [
      "Objectives",
      "• describe photosynthesis",
      "",
      "Photosynthesis is the process by which plants make food. It happens in",
      "the chloroplast. Explain nothing here — this is prose.",
    ].join("\n");
    expect(fallbackObjectives(raw).map((o) => o.objectiveText)).toEqual([
      "describe photosynthesis",
    ]);
  });

  test("ignores a heading with no list under it", () => {
    const raw =
      "Objectives\n\nThe chapter has no stated outcomes in this edition.";
    expect(fallbackObjectives(raw)).toEqual([]);
  });
});
