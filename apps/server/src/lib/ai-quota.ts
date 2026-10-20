/**
 * The arithmetic behind the AI request quota, kept free of the database so it
 * can be reasoned about (and tested) on its own.
 *
 * A quota is a clock-minute bucket per owner: every call in the same minute
 * increments the same counter, and the counter is thrown away when the minute
 * ends. `minuteBucket` is the identity of that counter; `quotaState` turns a
 * bucket's count into the numbers the student is shown. Everything that talks
 * to Postgres lives in `ai-quota-store.ts`; everything that decides "how many
 * are left, and when do they come back" lives here.
 */

export const AI_WINDOW_MS = 60_000;

/**
 * The start of the clock-minute containing `at`, truncated to the minute in
 * UTC. UTC on purpose: the bucket is an internal accounting identity, not
 * something a student reads, so it must not move with the server's local zone
 * or a deployment's TZ would silently reset everyone's counter.
 */
export function minuteBucket(at: Date): Date {
  return new Date(Math.floor(at.getTime() / AI_WINDOW_MS) * AI_WINDOW_MS);
}

/** The start of the minute after `bucket` — when its count stops counting. */
export function nextBucketAt(bucket: Date): number {
  return bucket.getTime() + AI_WINDOW_MS;
}

export type QuotaState = {
  limitPerMinute: number;
  callsThisMinute: number;
  remaining: number;
  windowSeconds: number;
  /** Epoch ms when this bucket expires, or null when nothing is spent yet. */
  resetAt: number | null;
  /** Seconds to wait before trying again; 0 unless the owner is blocked. */
  retryAfterSeconds: number;
};

/**
 * Turn a bucket count into what the client reports. `resetAt` is the end of the
 * bucket — a real, clock-anchored time, not a guess — and is only attached once
 * something has been spent (an untouched owner has nothing to wait for, so
 * `resetAt: null` and `retryAfterSeconds: 0`).
 */
export function quotaState(params: {
  count: number;
  limitPerMinute: number;
  bucket: Date;
  now: number;
}): QuotaState {
  const { count, limitPerMinute, bucket, now } = params;
  const callsThisMinute = Math.max(0, count);
  const remaining = Math.max(0, limitPerMinute - callsThisMinute);
  const resetAt = callsThisMinute > 0 ? nextBucketAt(bucket) : null;
  return {
    limitPerMinute,
    callsThisMinute,
    remaining,
    windowSeconds: AI_WINDOW_MS / 1000,
    resetAt,
    retryAfterSeconds:
      remaining > 0 || resetAt === null
        ? 0
        : Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}
