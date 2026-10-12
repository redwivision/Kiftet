import { describe, expect, test } from "bun:test";

import {
  DEFAULT_DEMO_TTL_HOURS,
  demoCutoff,
  resolveDemoTtlHours,
} from "./demo-ttl";

const HOUR = 60 * 60 * 1000;

describe("demoCutoff", () => {
  test("subtracts the TTL in hours from now", () => {
    const now = new Date("2026-01-02T12:00:00.000Z");
    expect(demoCutoff(now, 24).toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });

  test("a zero TTL means every existing demo is at or before the cutoff", () => {
    const now = new Date("2026-01-02T12:00:00.000Z");
    expect(demoCutoff(now, 0).getTime()).toBe(now.getTime());
  });

  test("keeps a demo created exactly at the cutoff (strictly-older deletes)", () => {
    const created = new Date("2026-01-01T12:00:00.000Z");
    const cutoff = demoCutoff(new Date("2026-01-02T12:00:00.000Z"), 24);
    // `lt` is strict, so equality must not collect it.
    expect(created.getTime() < cutoff.getTime()).toBe(false);
  });

  test("a demo one hour older than the TTL is past the cutoff", () => {
    const created = new Date("2026-01-01T11:00:00.000Z");
    const cutoff = demoCutoff(new Date("2026-01-02T12:00:00.000Z"), 24);
    expect(created.getTime() < cutoff.getTime()).toBe(true);
    expect(created.getTime()).toBe(cutoff.getTime() - HOUR);
  });
});

describe("resolveDemoTtlHours", () => {
  test("accepts a coerced number", () => {
    expect(resolveDemoTtlHours(48)).toBe(48);
  });

  test("accepts a numeric string from the platform", () => {
    expect(resolveDemoTtlHours("6")).toBe(6);
  });

  test("falls back on undefined, empty, NaN, zero and negatives", () => {
    for (const raw of [undefined, null, "", "abc", Number.NaN, 0, -3]) {
      expect(resolveDemoTtlHours(raw)).toBe(DEFAULT_DEMO_TTL_HOURS);
    }
  });
});
