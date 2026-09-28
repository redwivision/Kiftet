/**
 * These cover the three properties the whole guide rests on. Each one, if
 * broken, breaks the cost argument, the study order, or the student's trust
 * that the page is pointing at real text.
 */
import { describe, expect, test } from "bun:test";
import {
  ai,
  type ConceptChecklistItem,
  type MasteryMap,
  sourceAnchor,
  triageConcepts,
} from "./gemini";

const CH1_RAW =
  "Photosynthesis converts light energy into chemical energy stored in glucose. " +
  "Chlorophyll absorbs red and blue wavelengths but reflects green, which is why leaves look green. " +
  "Water is split during the light-dependent stage, releasing oxygen as a by-product. " +
  "Osmosis is the movement of water across a partially permeable membrane from high to low water potential.";

const CONCEPTS: ConceptChecklistItem[] = [
  { conceptText: "Water potential", weight: 5, isMisconception: false },
  {
    conceptText: "Chlorophyll absorbs green light",
    weight: 4,
    isMisconception: false,
  },
  { conceptText: "Water is a product", weight: 2, isMisconception: false },
  { conceptText: "The sun makes energy", weight: 3, isMisconception: false },
  { conceptText: "Plants eat soil", weight: 1, isMisconception: true },
];

describe("source anchor", () => {
  test("points at the sentence that mentions the concept, with a real offset", () => {
    const anchor = sourceAnchor("Chlorophyll", CH1_RAW);
    expect(anchor).toBeDefined();
    if (!anchor) throw new Error("expected an anchor for Chlorophyll");
    expect(anchor.quote).toContain("Chlorophyll");
    // The offset must index the ORIGINAL text, not a normalised copy, or a
    // "go to this place in your book" link lands on the wrong sentence. The
    // quote itself is whitespace-collapsed for reading, so compare against a
    // collapsed slice of the same span.
    expect(
      CH1_RAW.slice(anchor.offset)
        .replace(/\s+/g, " ")
        .startsWith(anchor.quote),
    ).toBe(true);
  });

  test("a hard-wrapped chapter still yields whole sentences", () => {
    // Textbook text is hard-wrapped. Splitting on newlines produced anchors
    // like "Inside, the cytoplasm is a watery fluid that holds the" — a
    // fragment that is useless as a link and as the section's own text.
    const wrapped = `Every living organism is built from cells, and each cell carries out the
life processes that keep an organism alive. Inside, the cytoplasm is a watery
fluid that holds the organelles.`;
    const anchor = sourceAnchor("cytoplasm", wrapped);
    expect(anchor?.quote).toBe(
      "Inside, the cytoplasm is a watery fluid that holds the organelles.",
    );
  });

  test("different concepts anchor to different places", () => {
    const chlorophyll = sourceAnchor("Chlorophyll", CH1_RAW);
    const osmosis = sourceAnchor("Osmosis", CH1_RAW);
    expect(chlorophyll?.offset).not.toBe(osmosis?.offset);
  });

  test("returns nothing rather than inventing a location", () => {
    // No AI, no model, no guessing: an unrelated concept has no place to
    // point, and a fabricated page number is worse than none.
    expect(sourceAnchor("Nuclear fission", CH1_RAW)).toBeUndefined();
    expect(sourceAnchor("Chlorophyll", "")).toBeUndefined();
    expect(sourceAnchor("", CH1_RAW)).toBeUndefined();
  });
});

describe("the fallback never fakes a language", () => {
  // The deterministic path cannot translate. Copying the chapter's English
  // sentence into `what` produced an English "section" inside a guide that had
  // already claimed language: "am" — an honesty bug, not a cosmetic one.
  test("Amharic scaffolding is Amharic, the book quote stays verbatim", async () => {
    const section = await ai.generateGuideSection(
      "Chlorophyll absorbs green light",
      CH1_RAW,
      "am",
    );
    // No AI key in tests, so this is the fallback path — which is the path
    // this rule exists for.
    expect(section.estimated).toBe(true);
    expect(section.what).toContain("“");
    expect(section.why).not.toBe(section.what);
    // The scaffolding must not be the English book text passed off as Amharic.
    expect(section.what).not.toBe(section.sourceQuote ?? null);
    // The book itself is quoted exactly as written, however the page is titled.
    expect(section.sourceQuote).toBe(
      "Chlorophyll absorbs red and blue wavelengths but reflects green, which is why leaves look green.",
    );
  });

  test("an English guide points at the book too", async () => {
    const section = await ai.generateGuideSection(
      "Chlorophyll absorbs green light",
      CH1_RAW,
      "en",
    );
    expect(section.estimated).toBe(true);
    expect(section.what).toContain("Chlorophyll absorbs green light");
    expect(section.recall).toContain("your own words");
  });
});

describe("triage order", () => {
  test("misconceptions first, then unraised, then untouched, solid last", () => {
    const mastery: MasteryMap = {
      "Plants eat soil": 2,
      "Water potential": 1,
      "Chlorophyll absorbs green light": 3,
      "Water is a product": 0,
    };
    const order = triageConcepts(CONCEPTS, mastery).map((c) => c.conceptText);
    // Wrong belief first: re-reading does not fix it.
    expect(order[0]).toBe("Water potential");
    // Then the cheapest win (level 1), then untouched by importance.
    expect(order.slice(0, 3)).toEqual([
      "Water potential",
      "The sun makes energy",
      "Water is a product",
    ]);
    // The one they got right is last, and is a confirmation, not work.
    expect(order.at(-1)).toBe("Chlorophyll absorbs green light");
  });

  test("never gives a misconception checklist item its own section", () => {
    const order = triageConcepts(CONCEPTS, {}).map((c) => c.conceptText);
    expect(order).not.toContain("Plants eat soil");
    expect(order).toHaveLength(4);
  });

  test("importance decides within a tier", () => {
    // Both level 0, so the weight-5 idea must lead.
    const order = triageConcepts(CONCEPTS, {}).map((c) => c.conceptText);
    expect(order[0]).toBe("Water potential");
    expect(order[1]).toBe("Chlorophyll absorbs green light");
  });

  test("is deterministic: same map in, same guide out", () => {
    const mastery: MasteryMap = { "Water potential": 1 };
    const a = triageConcepts(CONCEPTS, mastery).map((c) => c.conceptText);
    const b = triageConcepts(CONCEPTS, mastery).map((c) => c.conceptText);
    expect(a).toEqual(b);
  });

  test("does not mutate the caller's list", () => {
    const before = CONCEPTS.map((c) => c.conceptText);
    triageConcepts(CONCEPTS, {});
    expect(CONCEPTS.map((c) => c.conceptText)).toEqual(before);
  });
});
