import { user } from "@kiftet/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { env } from "../env.server";
import { getDb } from "../services";
import { demoCutoff, resolveDemoTtlHours } from "./demo-ttl";

/**
 * The demo janitor. Demo identities are DB-backed on purpose (a visitor
 * survives a restart), but nothing removed them, so every /demo/start left a
 * user, a textbook, a chapter and ten concept rows behind forever. This
 * collects demo users past their TTL; the foreign keys cascade, so a single
 * delete takes the textbook, chapters, concepts, cached guide/plan content,
 * sessions, attempts and misconception hits with it.
 *
 * In-process rather than a separate cron because there is exactly one
 * long-running Express server, the sweep is a single idempotent DELETE, and
 * several instances running it concurrently is harmless. The timer is
 * unref()'d so it never holds the process open. See docs/howItWorks/roadmap.md
 * ("Demo janitor").
 *
 * KNOWN ONE-TIME COST: before this shipped, nothing ever deleted a demo row, so
 * the first sweep collects the entire accumulated backlog in one cascading
 * DELETE. Fine at the scale the demo has run so far; if the backlog is large
 * this single statement can hold a connection and a lock for a while. The fix,
 * if it ever bites, is to batch it (`DELETE … LIMIT` in a loop) — not done yet,
 * because it is added surface for a problem that has not occurred. See the
 * caveat in docs/howItWorks/security.md §"Demo identity".
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 30_000;

/** Delete demo users created before the cutoff. Returns how many were removed. */
export async function sweepDemoUsers(now: Date = new Date()): Promise<number> {
  const cutoff = demoCutoff(now, resolveDemoTtlHours(env.DEMO_TTL_HOURS));
  const collected = await getDb()
    .delete(user)
    .where(and(eq(user.kind, "demo"), lt(user.createdAt, cutoff)))
    .returning({ id: user.id });
  return collected.length;
}

export function startDemoCleanup(): void {
  const run = () => {
    void sweepDemoUsers()
      .then((count) => {
        if (count > 0) {
          console.log(
            `[demo] janitor collected ${count} expired demo ${count === 1 ? "identity" : "identities"}`,
          );
        }
      })
      .catch((error) => console.error("[demo] janitor sweep failed", error));
  };
  setTimeout(run, FIRST_SWEEP_DELAY_MS).unref();
  setInterval(run, SWEEP_INTERVAL_MS).unref();
}
