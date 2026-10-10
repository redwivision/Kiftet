import { expect, test } from "bun:test";
import { SHARE_CARD_SIZE, shareCardSvg } from "./share-card";

test("draws the brand ring and wordmark", () => {
  const svg = shareCardSvg("One gap, closed.");
  expect(svg).toContain('width="1080"');
  expect(svg).toContain(SHARE_CARD_SIZE.toString());
  // the brand arc, identical to components/brand-mark.tsx
  expect(svg).toContain("M 93.46 43.12 A 44 44 0 1 1 56.88 6.54");
  expect(svg).toContain(">Kiftet<");
  expect(svg).toContain("One gap, closed.");
});

test("escapes a caption so it cannot break out of the markup", () => {
  const svg = shareCardSvg('<script>alert("x")</script> & co');
  expect(svg).not.toContain("<script>");
  expect(svg).toContain("&lt;script&gt;");
  expect(svg).toContain("&amp;");
});

test("carries only the line it is given — no slot for personal data", () => {
  const svg = shareCardSvg("One gap, closed.");
  // the two text nodes are the caption and the wordmark, nothing else
  const texts = svg.match(/<text[\s\S]*?<\/text>/g) ?? [];
  expect(texts.length).toBe(2);
});
