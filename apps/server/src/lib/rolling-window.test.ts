import { afterEach, describe, expect, test } from "bun:test";

import { createRollingWindow } from "./rolling-window";

const MINUTE = 60_000;

describe("createRollingWindow", () => {
  afterEach(() => {
    // Nothing global to clean up — each test builds its own window. Asserted
    // here so a future shared-singleton refactor can't silently leak state
    // between cases.
  });

  test("permits up to the limit, then refuses", () => {
    const w = createRollingWindow(MINUTE);
    expect(w.hit("a", 3)).toBe(true);
    expect(w.hit("a", 3)).toBe(true);
    expect(w.hit("a", 3)).toBe(true);
    expect(w.hit("a", 3)).toBe(false);
  });

  test("keys are independent", () => {
    const w = createRollingWindow(MINUTE);
    expect(w.hit("a", 1)).toBe(true);
    expect(w.hit("b", 1)).toBe(true);
    // One IP being blocked must not be another IP's problem — this is the
    // shared-NAT case behind the generous per-IP limits.
    expect(w.hit("a", 1)).toBe(false);
  });

  test("count does not record", () => {
    const w = createRollingWindow(MINUTE);
    expect(w.count("a")).toBe(0);
    w.hit("a", 5);
    expect(w.count("a")).toBe(1);
    expect(w.count("a")).toBe(1);
  });

  test("a refused hit is not recorded", () => {
    const w = createRollingWindow(MINUTE, 10);
    w.hit("a", 1);
    expect(w.hit("a", 1)).toBe(false);
    // Still exactly one hit, so the window frees on schedule rather than being
    // pushed forward by every rejected attempt — otherwise a client hammering
    // a 429 could hold its own block open indefinitely.
    expect(w.count("a")).toBe(1);
  });

  test("entries expire out of the window", async () => {
    const w = createRollingWindow(20);
    expect(w.hit("a", 1)).toBe(true);
    expect(w.hit("a", 1)).toBe(false);
    await Bun.sleep(40);
    expect(w.hit("a", 1)).toBe(true);
    // And the expired key is gone, not merely under the limit.
    expect(w.count("a")).toBe(1);
  });

  test("stays bounded under a flood of distinct keys", () => {
    // The whole point of the cap. This is the shape of a link shared into a
    // Telegram channel: thousands of distinct addresses inside one window, all
    // legitimately live, so expiry alone cannot reclaim anything.
    const cap = 50;
    const w = createRollingWindow(MINUTE, cap);
    for (let i = 0; i < 5_000; i += 1) w.hit(`ip-${i}`, 5);
    expect(w.size()).toBeLessThanOrEqual(cap);
  });

  test("the cap is the real limit, not one below it", () => {
    // A limiter that quietly settles at cap-1 has a limit nobody wrote down.
    // Three keys fit in a cap of three — not two.
    const w = createRollingWindow(MINUTE, 3);
    expect(w.hit("a", 5)).toBe(true);
    expect(w.hit("b", 5)).toBe(true);
    expect(w.hit("c", 5)).toBe(true);
    expect(w.size()).toBe(3);
  });

  test("a cap of one still limits", () => {
    // The regression that motivated the `>` above. Enforcing after insertion
    // with `>=` evicted the key just recorded, so the map stayed empty and a
    // cap of one admitted everything — the single configuration in which being
    // full is impossible.
    const w = createRollingWindow(MINUTE, 1);
    expect(w.hit("a", 1)).toBe(true);
    expect(w.hit("a", 1)).toBe(false);
    expect(w.hit("a", 1)).toBe(false);
  });

  test("evicts the least recently touched key when full", async () => {
    const w = createRollingWindow(15, 3);
    w.hit("old", 5);
    await Bun.sleep(5);
    w.hit("new", 5);
    await Bun.sleep(5);
    // Touching "old" again must move it to the most-recent end, so "new" is now
    // the coldest thing in the map and therefore the one that goes.
    w.hit("old", 5);
    await Bun.sleep(5);
    w.hit("newer", 5);
    await Bun.sleep(5);
    w.hit("newest", 5);

    expect(w.size()).toBeLessThanOrEqual(3);
    // "new" was touched before "newer" and "newest", so it is the eviction
    // candidate. If it were dropped, this block would be reset for no reason.
    expect(w.hit("new", 5)).toBe(true);
  });

  test("sweep drops expired keys and reports how many", async () => {
    const w = createRollingWindow(15, 100);
    w.hit("a", 5);
    w.hit("b", 5);
    expect(w.sweep()).toBe(0);
    await Bun.sleep(40);
    expect(w.sweep()).toBe(2);
    expect(w.size()).toBe(0);
  });

  test("resetInSeconds reports when the window frees", async () => {
    const w = createRollingWindow(1_000);
    // Nothing recorded means nothing to wait for — a caller must not tell a
    // student to wait when they have not been limited at all.
    expect(w.resetInSeconds("a")).toBe(0);

    w.hit("a", 1);
    const wait = w.resetInSeconds("a");
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(1);
  });

  test("reset clears everything", () => {
    const w = createRollingWindow(MINUTE);
    w.hit("a", 1);
    w.reset();
    expect(w.size()).toBe(0);
    expect(w.count("a")).toBe(0);
  });
});
