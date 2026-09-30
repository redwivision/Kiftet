import { expect, test } from "bun:test";
import { mergeConcepts } from "./concepts";

test("the book's own order is kept, not the model's", () => {
  const out = mergeConcepts(
    ["2.1 Characteristics of plants", "2.3 Structure and function"],
    [
      { conceptText: "Photosynthesis", isMisconception: false, weight: 5 },
      {
        conceptText: "Plants respire at night",
        isMisconception: true,
        weight: 4,
      },
    ],
  );
  expect(out.map((c) => c.conceptText)).toEqual([
    "2.1 Characteristics of plants",
    "2.3 Structure and function",
    "Photosynthesis",
    "Plants respire at night",
  ]);
});

test("a topic the model also found is one checklist item, not two", () => {
  const out = mergeConcepts(
    ["2.3.1 The internal structure of a leaf"],
    [
      {
        conceptText: "The Internal Structure of a Leaf!",
        isMisconception: false,
        weight: 5,
      },
    ],
  );
  expect(out).toHaveLength(1);
  // The typesetter's wording wins; the model's is dropped.
  expect(out[0]?.conceptText).toBe("2.3.1 The internal structure of a leaf");
});

test("nesting survives as lower weight on the deeper topic", () => {
  const nested = mergeConcepts(
    [
      "2.3 Structure and function of plant parts",
      "2.3.1 The internal structure of a leaf",
    ],
    [],
  );
  expect(nested.map((c) => c.weight)).toEqual([4, 2]);
});

test("a chapter with no contents still behaves exactly as before", () => {
  const extracted = [
    { conceptText: "Cell membrane", isMisconception: false, weight: 5 },
  ];
  expect(mergeConcepts(undefined, extracted)).toEqual(extracted);
  expect(mergeConcepts([], extracted)).toEqual(extracted);
});

test("punctuation alone is not an idea", () => {
  const out = mergeConcepts(["2 ; —", "1.1 Cells"], []);
  expect(out).toHaveLength(1);
});
