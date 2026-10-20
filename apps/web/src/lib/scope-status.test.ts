import { describe, expect, test } from "bun:test";
import { scopeSummary } from "./scope-status";

const units = [
  { key: "a", label: "2.1" },
  { key: "b", label: "2.2" },
  { key: "c", label: "" },
];

describe("scopeSummary", () => {
  test("says nothing when the chapter has no real choice", () => {
    expect(scopeSummary(null, null)).toBeNull();
    expect(scopeSummary([], null)).toBeNull();
    expect(scopeSummary([{ key: "a", label: "1.1" }], null)).toBeNull();
  });

  test("a null or empty selection is the whole chapter", () => {
    expect(scopeSummary(units, null)).toEqual({ kind: "whole" });
    expect(scopeSummary(units, [])).toEqual({ kind: "whole" });
  });

  test("one section is named by the book's own label", () => {
    expect(scopeSummary(units, ["b"])).toEqual({ kind: "one", label: "2.2" });
  });

  test("an unnumbered section falls back to its position, one-based", () => {
    expect(scopeSummary(units, ["c"])).toEqual({ kind: "one", label: "3" });
  });

  test("several sections are counted, not listed", () => {
    expect(scopeSummary(units, ["a", "b"])).toEqual({ kind: "many", n: 2 });
  });

  test("a stale key is counted rather than labelled as a section that is gone", () => {
    expect(scopeSummary(units, ["missing"])).toEqual({ kind: "many", n: 1 });
  });
});
