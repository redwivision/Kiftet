import { expect, test } from "bun:test";
import { isEditableTarget, shouldHandleSpace } from "./shortcuts";

const el = (tagName: string, extra: Record<string, unknown> = {}) =>
  ({ tagName, isContentEditable: false, ...extra }) as unknown as Element;

test("space is handled when nothing interactive has focus", () => {
  expect(shouldHandleSpace(null)).toBe(true);
  expect(shouldHandleSpace(el("BODY"))).toBe(true);
  expect(shouldHandleSpace(el("DIV"))).toBe(true);
});

test("space is left to fields and to buttons and links", () => {
  for (const tag of ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]) {
    expect(shouldHandleSpace(el(tag))).toBe(false);
  }
});

test("contenteditable counts as a field", () => {
  const editable = el("DIV", { isContentEditable: true });
  expect(isEditableTarget(editable)).toBe(true);
  expect(shouldHandleSpace(editable)).toBe(false);
});
