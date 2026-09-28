import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type ConceptMeta, weightedMastery } from "@/lib/mastery";
import { CoverageView } from "./gap-list";

const names = {
  solid: "Photosynthesis",
  almost: "Respiration and photosynthesis",
  wrong: "Water as a reactant",
  open: "Limiting factors",
};
const meta: Record<string, ConceptMeta> = {
  [names.solid]: { weight: 5, isMisconception: false },
  [names.almost]: { weight: 4, isMisconception: false },
  [names.wrong]: { weight: 2, isMisconception: false },
  [names.open]: { weight: 4, isMisconception: false },
};
const mastery = {
  [names.solid]: 3,
  [names.almost]: 1,
  [names.wrong]: 2,
  [names.open]: 0,
} as const;

test("renders every one of the four levels, not three lists", () => {
  const html = renderToStaticMarkup(
    <CoverageView
      covered={[names.solid]}
      missing={[names.open]}
      misconceptions={[names.wrong]}
      mastery={mastery as never}
      meta={meta}
    />,
  );
  // The level-1 concept appears in NO input list. It must still be shown, or
  // the state the whole screen exists for silently disappears.
  expect(html).toContain(names.almost);
  expect(html).toContain(names.solid);
  expect(html).toContain(names.wrong);
  expect(html).toContain(names.open);
});

test("the headline number is the weighted score, not a flat count", () => {
  const score = weightedMastery(mastery as never, meta, Object.keys(mastery));
  const html = renderToStaticMarkup(
    <CoverageView
      covered={[names.solid]}
      missing={[names.open]}
      misconceptions={[names.wrong]}
      mastery={mastery as never}
      meta={meta}
      score={score}
    />,
  );
  // w5*1 + w4*0.5 + w2*0 + w4*0 = 7 of 15 -> 47%
  expect(Math.round(score * 100)).toBe(47);
  expect(html).toContain("47");
  // A flat count would have said 50 (1 of 2) -- make sure we are not that.
  expect(html).not.toContain(">50<");
});

test("falls back to inferring levels from the lists when given no map", () => {
  const html = renderToStaticMarkup(
    <CoverageView covered={["Alpha"]} missing={["Beta", "Gamma"]} />,
  );
  expect(html).toContain("Alpha");
  expect(html).toContain("Beta");
  expect(html).toContain("Gamma");
});

test("an empty chapter renders a placeholder instead of crashing", () => {
  const html = renderToStaticMarkup(<CoverageView covered={[]} missing={[]} />);
  expect(html).toContain("0");
});

test("the ring is decorative, and the number is real text", () => {
  const html = renderToStaticMarkup(
    <CoverageView
      covered={[names.solid]}
      missing={[names.open]}
      mastery={mastery as never}
      meta={meta}
    />,
  );
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("47");
});
