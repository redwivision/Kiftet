import { expect, test } from "bun:test";
import { daysUntilExam } from "./today-plan";

test("exam countdown compares calendar days in the student's timezone", () => {
  const now = new Date(2026, 9, 22, 23, 50);
  expect(daysUntilExam("2026-10-23", now)).toBe(1);
  expect(daysUntilExam("2026-10-22", now)).toBe(0);
  expect(daysUntilExam("2026-10-21", now)).toBe(-1);
});

test("exam countdown rejects malformed or impossible dates", () => {
  expect(daysUntilExam("2026-13-01")).toBeNull();
  expect(daysUntilExam("2026-02-30")).toBeNull();
  expect(daysUntilExam("tomorrow")).toBeNull();
});
