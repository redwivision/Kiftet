import { expect, test } from "bun:test";
import { shouldOfferInstall } from "./install";

const base = {
  offered: false,
  standalone: false,
  coarsePointer: false,
  touchPoints: 0,
};

test("offers on a touch phone that is not installed", () => {
  expect(shouldOfferInstall({ ...base, coarsePointer: true })).toBe(true);
  expect(shouldOfferInstall({ ...base, touchPoints: 5 })).toBe(true);
});

test("stays quiet once it has been offered", () => {
  expect(
    shouldOfferInstall({ ...base, coarsePointer: true, offered: true }),
  ).toBe(false);
});

test("stays quiet when it is already installed", () => {
  expect(
    shouldOfferInstall({ ...base, coarsePointer: true, standalone: true }),
  ).toBe(false);
});

test("stays quiet on a desktop with no touch and no coarse pointer", () => {
  expect(shouldOfferInstall(base)).toBe(false);
});
