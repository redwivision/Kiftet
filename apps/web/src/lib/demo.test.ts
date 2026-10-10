import { expect, test } from "bun:test";
import { isDemoVisitor } from "./demo";

const session = { user: { id: "u1" } };

test("an anonymous stranger with a demo id is a demo visitor", () => {
  expect(isDemoVisitor(null, "demo-123")).toBe(true);
});

test("a signed-in student is never a demo visitor, even with a stale demo id", () => {
  expect(isDemoVisitor(session, "demo-123")).toBe(false);
});

test("no demo id and no session is not a demo visitor", () => {
  expect(isDemoVisitor(null, null)).toBe(false);
});

test("a signed-in student without a demo id is not a demo visitor", () => {
  expect(isDemoVisitor(session, null)).toBe(false);
});
