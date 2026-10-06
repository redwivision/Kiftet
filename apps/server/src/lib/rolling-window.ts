/**
 * A fixed-window-per-key rate limiter that cannot grow without bound.
 *
 * The two limiters this replaces were plain `Map<string, number[]>` with a
 * rolling timestamp filter. That is correct for the decision it makes and
 * quietly wrong about memory: nothing ever removed a key, so the map grew by
 * one entry per distinct IP (or per distinct owner) for the life of the
 * process, and the only thing that ever freed it was a restart. Under the
 * traffic a waitlist launch actually produces, that is a leak sized by
 * attacker enthusiasm, and it is paid for on the same heap as the study loop.
 *
 * Two bounds, because either alone leaves a hole:
 *
 *  - **Expiry** drops keys whose window has fully elapsed. This is the one
 *    that matters at steady state — an IP that signs up once should cost
 *    nothing afterwards.
 *  - **Key cap** drops the least-recently-touched key once the map is full.
 *    Expiry alone does not help during a burst: a thousand distinct IPs inside
 *    one window are all legitimately live, and without a cap the burst is
 *    exactly what sets the new high-water mark forever.
 *
 * `Map` iterates in insertion order, so deleting and re-setting a key on every
 * touch is what turns this into LRU. Doing that per request is cheap next to
 * the database round trip it guards.
 */

export type RollingWindow = {
  /** Record a hit for `key`. Returns false when it is over `limit`. */
  hit: (key: string, limit: number) => boolean;
  /** Hits currently recorded for `key` inside the window. Does not record. */
  count: (key: string) => number;
  /** Timestamp of `key`'s oldest live hit, or null. The raw value behind
   *  `resetInSeconds`, for callers that want to send an absolute time. */
  oldestHitAt: (key: string) => number | null;
  /** Seconds until `key`'s oldest hit ages out — the "when does it restart?"
   *  a student can act on. 0 when the key is not currently limited. */
  resetInSeconds: (key: string) => number;
  /** Drop every key whose window has fully elapsed. Returns keys removed. */
  sweep: () => number;
  /** Live (non-expired) keys. */
  size: () => number;
  reset: () => void;
};

export function createRollingWindow(
  windowMs: number,
  maxKeys = 10_000,
): RollingWindow {
  // key → ascending timestamps inside the current window.
  const windows = new Map<string, number[]>();

  function live(key: string, now: number): number[] {
    const recent = (windows.get(key) ?? []).filter(
      (time) => now - time < windowMs,
    );
    if (recent.length === 0) windows.delete(key);
    else windows.set(key, recent);
    return recent;
  }

  function sweep(now: number): number {
    let removed = 0;
    for (const [key, times] of windows) {
      if (times.every((time) => now - time >= windowMs)) {
        windows.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  function enforceCap(now: number): void {
    // Strictly greater. The cap is "how many keys may be resident", and a
    // limiter that settles one key below its own cap is a limiter whose real
    // limit is a number nobody wrote down. With `>=` this loop also evicted the
    // key that had just been inserted, so a cap of 1 recorded nothing at all
    // and admitted everything — the one configuration where being full is
    // impossible.
    while (windows.size > maxKeys) {
      // Sweep first: expired keys are the cheapest thing to give up, and
      // during a burst most of the map is legitimately expired-but-unswept.
      const before = windows.size;
      sweep(now);
      if (windows.size < before) continue;

      // Still full, so every key is live. Drop the least-recently-touched.
      // `next().done` cannot be true inside this loop, since size > 0.
      const oldest = windows.keys().next();
      if (oldest.done) return;
      windows.delete(oldest.value);
    }
  }

  return {
    hit(key, limit) {
      const now = Date.now();
      sweep(now);
      const recent = live(key, now);
      if (recent.length >= limit) {
        // Still refresh recency: a blocked key hammering us is the most
        // interesting key to keep, and it is the one we want to survive the cap.
        windows.delete(key);
        windows.set(key, recent);
        return false;
      }
      recent.push(now);
      windows.delete(key);
      windows.set(key, recent);
      enforceCap(now);
      return true;
    },

    count(key) {
      return live(key, Date.now()).length;
    },

    oldestHitAt(key) {
      return live(key, Date.now())[0] ?? null;
    },

    resetInSeconds(key) {
      const now = Date.now();
      const recent = live(key, now);
      const oldest = recent[0];
      if (oldest === undefined) return 0;
      return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    },

    sweep: () => sweep(Date.now()),

    size() {
      sweep(Date.now());
      return windows.size;
    },

    reset() {
      windows.clear();
    },
  };
}
