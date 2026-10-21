import { describe, expect, test } from "bun:test";

import { createLogger } from "./log";

function capture() {
  const lines: string[] = [];
  const logger = createLogger((line) => lines.push(line));
  return { lines, logger };
}

describe("createLogger", () => {
  test("emits exactly one JSON object per call", () => {
    const { lines, logger } = capture();
    logger("info", { event: "http", msg: "hello" });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.event).toBe("http");
    expect(parsed.msg).toBe("hello");
    expect(parsed.level).toBe("info");
  });

  test("carries a parseable timestamp", () => {
    const { lines, logger } = capture();
    logger("warn", { event: "x", msg: "y" });
    const parsed = JSON.parse(lines[0] as string);
    expect(Number.isNaN(Date.parse(parsed.time))).toBe(false);
  });

  test("a message with a newline still produces one physical line", () => {
    const { lines, logger } = capture();
    logger("error", { event: "x", msg: "line one\nline two" });
    expect(lines).toHaveLength(1);
    expect((lines[0] as string).includes("\n")).toBe(false);
    expect(JSON.parse(lines[0] as string).msg).toBe("line one\nline two");
  });

  test("keeps the fixed fields and drops nothing set", () => {
    const { lines, logger } = capture();
    logger("error", {
      event: "http",
      requestId: "abc",
      method: "POST",
      path: "/api/sessions",
      status: 500,
      durationMs: 1234,
      reason: "TypeError",
      msg: "boom",
    });
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      level: "error",
      event: "http",
      requestId: "abc",
      method: "POST",
      path: "/api/sessions",
      status: 500,
      durationMs: 1234,
      reason: "TypeError",
      msg: "boom",
    });
  });

  test("omits fields that were not provided rather than writing undefined", () => {
    const { lines, logger } = capture();
    logger("info", { event: "boot", msg: "up" });
    const parsed = JSON.parse(lines[0] as string);
    expect("requestId" in parsed).toBe(false);
    expect("status" in parsed).toBe(false);
  });
});
