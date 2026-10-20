import { describe, expect, test } from "bun:test";
import {
  AI_WINDOW_MS,
  minuteBucket,
  nextBucketAt,
  quotaState,
} from "./ai-quota";

describe("the quota minute bucket", () => {
  test("truncates to the start of the minute", () => {
    const at = new Date("2026-10-20T12:34:56.789Z");
    expect(minuteBucket(at).toISOString()).toBe("2026-10-20T12:34:00.000Z");
  });

  test("a call on the minute boundary is its own bucket", () => {
    const at = new Date("2026-10-20T12:34:00.000Z");
    expect(minuteBucket(at).toISOString()).toBe("2026-10-20T12:34:00.000Z");
  });

  test("two calls in the same minute share a bucket", () => {
    const a = minuteBucket(new Date("2026-10-20T12:34:01.000Z"));
    const b = minuteBucket(new Date("2026-10-20T12:34:59.999Z"));
    expect(a.getTime()).toBe(b.getTime());
  });

  test("the next bucket is one window later", () => {
    const bucket = minuteBucket(new Date("2026-10-20T12:34:56.000Z"));
    expect(nextBucketAt(bucket) - bucket.getTime()).toBe(AI_WINDOW_MS);
  });
});

describe("quota state", () => {
  const now = new Date("2026-10-20T12:34:10.000Z").getTime();
  const bucket = minuteBucket(new Date(now));

  test("an untouched owner has the full allowance and nothing to wait for", () => {
    const state = quotaState({ count: 0, limitPerMinute: 8, bucket, now });
    expect(state.callsThisMinute).toBe(0);
    expect(state.remaining).toBe(8);
    expect(state.resetAt).toBeNull();
    expect(state.retryAfterSeconds).toBe(0);
  });

  test("spending decrements the remaining count", () => {
    const state = quotaState({ count: 5, limitPerMinute: 8, bucket, now });
    expect(state.callsThisMinute).toBe(5);
    expect(state.remaining).toBe(3);
  });

  test("resetAt is the end of the bucket once anything is spent", () => {
    const state = quotaState({ count: 1, limitPerMinute: 8, bucket, now });
    expect(state.resetAt).toBe(nextBucketAt(bucket));
  });

  test("a blocked owner is told how long to wait, to the second", () => {
    const state = quotaState({ count: 8, limitPerMinute: 8, bucket, now });
    expect(state.remaining).toBe(0);
    // 50 seconds remain in the 12:34 minute from :10.
    expect(state.retryAfterSeconds).toBe(50);
  });

  test("the wait is never below one second", () => {
    const nearlyDone = new Date("2026-10-20T12:34:59.999Z").getTime();
    const state = quotaState({
      count: 8,
      limitPerMinute: 8,
      bucket: minuteBucket(new Date(nearlyDone)),
      now: nearlyDone,
    });
    expect(state.retryAfterSeconds).toBe(1);
  });

  test("an over-spent count cannot show negative remaining", () => {
    const state = quotaState({ count: 9, limitPerMinute: 8, bucket, now });
    expect(state.remaining).toBe(0);
    expect(state.callsThisMinute).toBe(9);
  });
});
