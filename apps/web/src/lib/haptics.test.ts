import { expect, test } from "bun:test";
import { haptic } from "./haptics";

test("buzzes when the device can and motion is allowed", () => {
  const felt: (number | number[])[] = [];
  haptic(10, { reducedMotion: false, vibrate: (p) => felt.push(p) });
  haptic([12, 60, 12], { reducedMotion: false, vibrate: (p) => felt.push(p) });
  expect(felt).toEqual([10, [12, 60, 12]]);
});

test("stays still under reduced motion", () => {
  let called = 0;
  haptic([12, 60, 12], { reducedMotion: true, vibrate: () => called++ });
  expect(called).toBe(0);
});

test("missing hardware is a silent no-op, never a throw", () => {
  expect(() => haptic(10, { reducedMotion: false })).not.toThrow();
});
