import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CONNECT_RETRIES,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_POOL_MAX,
  intFrom,
} from "./pool-config";

describe("intFrom", () => {
  test("reads a number through unchanged", () => {
    expect(intFrom(7, DEFAULT_POOL_MAX)).toBe(7);
  });

  test("parses a container string", () => {
    expect(intFrom("12", DEFAULT_POOL_MAX)).toBe(12);
  });

  test("falls back when unset or empty", () => {
    expect(intFrom(undefined, DEFAULT_POOL_MAX)).toBe(DEFAULT_POOL_MAX);
    expect(intFrom("", DEFAULT_POOL_MAX)).toBe(DEFAULT_POOL_MAX);
  });

  test("falls back on nonsense rather than disarming a pool", () => {
    expect(intFrom("abc", DEFAULT_POOL_MAX)).toBe(DEFAULT_POOL_MAX);
    expect(intFrom("NaN", DEFAULT_POOL_MAX)).toBe(DEFAULT_POOL_MAX);
    expect(intFrom(Number.POSITIVE_INFINITY, 9)).toBe(9);
  });

  test("clamps zero and negatives up to one", () => {
    expect(intFrom(0, DEFAULT_POOL_MAX)).toBe(DEFAULT_POOL_MAX);
    expect(intFrom("-3", DEFAULT_POOL_MAX)).toBe(DEFAULT_POOL_MAX);
  });

  test("floors a fractional value", () => {
    expect(intFrom(3.9, DEFAULT_POOL_MAX)).toBe(3);
  });
});

describe("connection-budget defaults", () => {
  test("are the documented numbers", () => {
    expect(DEFAULT_POOL_MAX).toBe(5);
    expect(DEFAULT_CONNECT_TIMEOUT_MS).toBe(15_000);
    expect(DEFAULT_CONNECT_RETRIES).toBe(6);
  });

  test("the connect timeout is long enough for a cold Neon wake", () => {
    // Neon scale-to-zero adds a few hundred ms on wake; 5s was too tight and
    // failed the first request after idle.
    expect(DEFAULT_CONNECT_TIMEOUT_MS).toBeGreaterThan(5_000);
  });
});
