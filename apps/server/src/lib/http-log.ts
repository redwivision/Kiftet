/**
 * Request logging that survives being hit by a viral link.
 *
 * The straightforward version — one line per request to stderr — is a
 * denial-of-service vector with no attacker: a waitlist link shared into a
 * Telegram channel produces thousands of requests per second, and each one
 * becomes a synchronous `write` into the platform's log pipe. Past a few
 * hundred lines a second the *logging* is the bottleneck, and the symptom is a
 * site that times out for reasons that look nothing like the cause.
 *
 * The rules, and the tension between them stated up front:
 *
 *  1. **Interesting requests bypass sampling.** A 4xx/5xx or anything slower
 *     than SLOW_MS is exactly what an incident review needs. Sampling failures
 *     is how a monitoring system ends up green during an outage.
 *  2. **Everything is still bounded.** Rule 1 must not become an unbounded
 *     write path, because a 4xx flood is as good a lever as a 2xx flood. So
 *     interesting lines get their own, much higher ceiling rather than an
 *     exemption. A limiter that special-cases errors with no limit is a
 *     limiter that has chosen a different way to go down.
 *  3. **Overflow is reported, always.** Suppressed logging that stays silent
 *     is worse than logging that floods: a quiet log is indistinguishable from
 *     a dead process, and "is the site even up?" is the first question anyone
 *     asks.
 *
 * On rule 3, "always" is doing real work in this file. The first version
 * reported the suppressed count from a `noteSuppressed(write)` callback that
 * only the caller held, and only fired on a refused reservation. Reservations
 * stop being refused the instant the per-second budget resets, so the summary
 * was unreachable in the one scenario it existed for: a burst that ends. The
 * counter was cleared and nothing was ever printed. The sink now belongs to
 * this module, and the report is checked on every reservation rather than only
 * at the second boundary — so a burst that stops after 1.5s still gets its
 * summary, instead of leaving a log that simply stops mid-incident.
 *
 * In-memory and per-process, like the rest of the runtime telemetry. It resets
 * on restart, which is acceptable for a counter whose only job is to stop us
 * drowning.
 */

const SLOW_MS = 1_000;
const SAMPLE_EVERY = 20;
const MAX_LINES_PER_SECOND = 50;
const MAX_INTERESTING_PER_SECOND = 200;
const REPORT_EVERY_MS = 10_000;

export type LogKind = "ordinary" | "interesting";

export type RequestLogState = {
  /** Decides whether an ordinary successful request is logged at all. */
  shouldSample: () => boolean;
  /**
   * Claim a slot in the current second. False means the budget for this kind
   * is spent; the caller should drop the line. Never silently — the drop is
   * counted and reported (see below).
   */
  tryReserve: (kind: LogKind) => boolean;
  /** Emit the pending suppressed-count summary if one is due. */
  flush: () => void;
  snapshot: () => { emitted: number; suppressed: number };
  reset: () => void;
};

export function createRequestLog(
  write: (line: string) => void = (line) => console.error(line),
): RequestLogState {
  let sampled = 0;
  let windowStart = Date.now();
  let emitted = 0;
  let emittedInteresting = 0;
  let suppressed = 0;
  let lastReport = Date.now();

  function reportIfDue(now: number): void {
    if (suppressed === 0) return;
    if (now - lastReport < REPORT_EVERY_MS) return;
    lastReport = now;
    const count = suppressed;
    suppressed = 0;
    write(
      `[http] suppressed ${count} request log line(s) — rate ceiling reached, the app is NOT idle`,
    );
  }

  return {
    shouldSample() {
      // Keep the most recent 1-in-N rather than the first: on a burst the tail
      // is the part that lines up with whatever is currently happening.
      sampled = (sampled + 1) % SAMPLE_EVERY;
      return sampled === 0;
    },

    tryReserve(kind) {
      const now = Date.now();

      // On every call, not just at the boundary. A burst that ends before the
      // report interval elapses never reaches a second boundary again, and
      // that burst is precisely the one whose absence needs explaining.
      reportIfDue(now);

      if (now - windowStart >= 1_000) {
        windowStart = now;
        emitted = 0;
        emittedInteresting = 0;
      }

      const spent = kind === "interesting" ? emittedInteresting : emitted;
      const ceiling =
        kind === "interesting"
          ? MAX_INTERESTING_PER_SECOND
          : MAX_LINES_PER_SECOND;
      if (spent >= ceiling) {
        suppressed += 1;
        return false;
      }
      if (kind === "interesting") emittedInteresting += 1;
      else emitted += 1;
      return true;
    },

    flush() {
      reportIfDue(Date.now());
    },

    snapshot() {
      return { emitted, suppressed };
    },

    reset() {
      sampled = 0;
      windowStart = Date.now();
      emitted = 0;
      emittedInteresting = 0;
      suppressed = 0;
      lastReport = Date.now();
    },
  };
}

/**
 * One line per request, subject to the rules above.
 *
 * Mounted first in the middleware chain so it also wraps the health handlers:
 * if the platform probes a path and gets anything but 200, the log shows which
 * one and what answered it. That is how we see what the PaaS is probing.
 */
export function requestLogger(state: RequestLogState = createRequestLog()) {
  return function logRequest(
    req: { method: string; originalUrl: string },
    res: { statusCode: number; on: (e: string, f: () => void) => void },
    next: () => void,
  ): void {
    const start = performance.now();
    res.on("finish", () => {
      const ms = Math.round(performance.now() - start);
      const status = res.statusCode;
      const interesting = status >= 400 || ms >= SLOW_MS;
      if (!interesting && !state.shouldSample()) return;
      // Dropped lines are not counted here — `tryReserve` counts them, so
      // there is exactly one place that knows how many were lost.
      if (!state.tryReserve(interesting ? "interesting" : "ordinary")) return;
      console.error(
        `[http] ${req.method} ${req.originalUrl} ${status} ${ms}ms`,
      );
    });
    next();
  };
}
