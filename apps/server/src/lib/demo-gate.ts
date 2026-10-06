import { createRollingWindow } from "./rolling-window";

/**
 * Who gets to fabricate a demo room.
 *
 * Split out of routes/demo.ts because the policy is worth testing on its own
 * and the route is not testable without a database. It also keeps the two
 * limits from being tangled: they are separate decisions with separate
 * consequences, and merging them is how one ends up silently reporting the
 * other's reason.
 */

export type DemoDecision =
  /** Go ahead and seed. */
  | "ok"
  /** This address has used up its own allowance. A 429, and the visitor's fault. */
  | "per-ip"
  /**
   * The process-wide budget is spent. A 503, and nobody's fault — a viral link
   * simply arrived. The distinction is the whole point: telling a visitor who
   * hit the global ceiling that they were "rate limited for making too many
   * requests" is a lie about a limit they never touched, and it sends them away
   * instead of telling them to come back in a moment.
   */
  | "global";

export type DemoGate = {
  decide: (ip: string) => DemoDecision;
  /** Seconds until `ip`'s personal allowance frees up. 0 if not limited. */
  retryAfterSeconds: (ip: string) => number;
  /** Seconds until the global budget frees up. */
  globalRetryAfterSeconds: () => number;
  reset: () => void;
};

const GLOBAL_KEY = "all";

export function createDemoGate({
  perIpPerMinute,
  globalPerMinute,
  windowMs = 60_000,
  maxKeys = 20_000,
}: {
  perIpPerMinute: number;
  globalPerMinute: number;
  windowMs?: number;
  maxKeys?: number;
}): DemoGate {
  const perIp = createRollingWindow(windowMs, maxKeys);
  // One fixed key turns the same sliding-window primitive into a process-wide
  // budget. Reusing it is deliberate: one rate-limiting primitive means one
  // thing to reason about when this is the thing that fails at 3am.
  const global = createRollingWindow(windowMs, 1);

  return {
    decide(ip) {
      if (!perIp.hit(ip, perIpPerMinute)) return "per-ip";
      if (!global.hit(GLOBAL_KEY, globalPerMinute)) return "global";
      return "ok";
    },
    retryAfterSeconds: (ip) => perIp.resetInSeconds(ip),
    globalRetryAfterSeconds: () => global.resetInSeconds(GLOBAL_KEY),
    reset() {
      perIp.reset();
      global.reset();
    },
  };
}
