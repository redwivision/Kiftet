import { expect, test } from "bun:test";
import type { Phase } from "@/components/study-provider";
import { loopTab } from "./tab-chrome";

const PHASES: Phase[] = ["recall", "gaps", "lesson", "retest", "result"];

// Drawn-arc length baked into a favicon's stroke-dasharray, so the ring's
// closure can be compared without rendering the SVG.
function drawnLength(href: string): number {
  const svg = decodeURIComponent(href.replace("data:image/svg+xml,", ""));
  const match = svg.match(/stroke-dasharray="([\d.]+) /);
  if (!match) throw new Error("no stroke-dasharray in favicon");
  return Number(match[1]);
}

test("every phase names itself and draws a ring", () => {
  for (const phase of PHASES) {
    const { title, href } = loopTab(phase, "en");
    expect(title.length).toBeGreaterThan(0);
    expect(href.startsWith("data:image/svg+xml,")).toBe(true);
    expect(drawnLength(href)).toBeGreaterThan(0);
  }
});

test("the ring only ever closes as the loop advances", () => {
  const lengths = PHASES.map((phase) => drawnLength(loopTab(phase, "en").href));
  for (let i = 1; i < lengths.length; i++) {
    expect(lengths[i]).toBeGreaterThan(lengths[i - 1]);
  }
  // The result is the whole circumference — the gap closed.
  const full = 2 * Math.PI * 44;
  expect(lengths.at(-1)).toBeCloseTo(full, 0);
});

test("the title follows the language, brand included", () => {
  expect(loopTab("retest", "en").title).toBe("Test — Kiftet");
  expect(loopTab("retest", "am").title).toContain("ኪፍተት");
  expect(loopTab("recall", "am").title).not.toBe(loopTab("recall", "en").title);
});
