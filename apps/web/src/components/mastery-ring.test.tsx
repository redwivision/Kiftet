import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SegmentedRing } from "./mastery-ring";

test("segmented ring draws one segment per answer state", () => {
  const html = renderToStaticMarkup(
    <SegmentedRing states={["correct", "wrong", "current", "pending"]} />,
  );
  // A faint track plus one segment per question.
  expect(html.match(/<circle/g)?.length).toBe(5);
});

test("segmented ring is decorative", () => {
  const html = renderToStaticMarkup(<SegmentedRing states={["current"]} />);
  expect(html).toContain('aria-hidden="true"');
});

test("an empty retest is one pending segment, not a crash", () => {
  const html = renderToStaticMarkup(<SegmentedRing states={[]} />);
  expect(html).toContain("<circle");
});
