import type { Database } from "@kiftet/db";

import { aiUsage } from "@kiftet/db/schema";
import { and, eq, gte, lt, sql } from "drizzle-orm";

import { AI_WINDOW_MS, minuteBucket } from "./ai-quota";

/**
 * The database half of the AI quota: one row per (owner, clock-minute) in
 * `ai_usage`, and a single atomic statement that both decides and records.
 *
 * The whole point of moving this out of process memory is that more than one
 * server instance can share one counter. That only holds if the check and the
 * increment are one statement — read the count, decide, then write is a race
 * two instances lose against each other. So `consumeAiRequest` is an upsert
 * with a `WHERE` on the running total: Postgres evaluates it against the row
 * it is locked on, and the loser of the race simply affects zero rows.
 */

export type ConsumeResult = {
  /** True when the call was allowed and counted. */
  allowed: boolean;
  /** The bucket's count after this call (or the count that refused it). */
  count: number;
};

/**
 * Count one AI request against `userId` for the current minute, if there is
 * room. Returns whether it was allowed and the resulting count.
 *
 * The conditional upsert is what makes this safe under concurrency:
 *   - no row for this (user, minute) yet → INSERT with count 1;
 *   - a row with room           → UPDATE ... SET count = count + 1
 *                                  WHERE ai_usage.count < limit;
 *   - a row already at the limit → the WHERE fails, zero rows change, and
 *                                  RETURNING tells us the loser to report.
 * `RETURNING count` is present on the do-nothing branch too, so a refused call
 * still learns the exact total it is competing against.
 */
export async function consumeAiRequest(
  db: Database,
  userId: string,
  limit: number,
  now: Date = new Date(),
): Promise<ConsumeResult> {
  const bucket = minuteBucket(now);
  // `setWhere` gates the update: when the bucket is already full the row is
  // left untouched and — this is the trap — Postgres returns *no* row from
  // `RETURNING`, because nothing was updated. So an empty result is not "count
  // zero", it is "refused"; the row that refused us already holds the total.
  const updated = await db
    .insert(aiUsage)
    .values({ id: crypto.randomUUID(), userId, windowStart: bucket, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.windowStart],
      set: { count: sql`${aiUsage.count} + 1` },
      setWhere: sql`${aiUsage.count} < ${limit}`,
    })
    .returning({ count: aiUsage.count });

  const updatedCount = updated[0]?.count;
  if (updatedCount !== undefined) {
    return { allowed: true, count: updatedCount };
  }

  // Refused. Read the standing total so the 429 can name an honest number.
  const count = await readAiUsage(db, userId, now);
  return { allowed: false, count };
}

/**
 * Read the current minute's count without spending anything — for the budget
 * probe the dashboard polls. Missing row means nothing spent this minute, not
 * an error.
 */
export async function readAiUsage(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const bucket = minuteBucket(now);
  const row = await db
    .select({ count: aiUsage.count })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.windowStart, bucket)))
    .limit(1)
    .then((r) => r[0]);
  return row?.count ?? 0;
}

/**
 * Delete this owner's buckets that are older than the current one. The rows are
 * pure scratch — nobody will ever ask about a minute that has passed — so they
 * are pruned opportunistically on the next call rather than by a scheduled job.
 * Scoped to one owner and one comparison so it stays an index hit.
 */
export async function pruneAiUsage(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const bucket = minuteBucket(now);
  await db
    .delete(aiUsage)
    .where(and(eq(aiUsage.userId, userId), lt(aiUsage.windowStart, bucket)));
}

/**
 * Drop every owner's expired buckets. Called on a timer, not per request, so a
 * student who spends their last call and never returns does not leave a bucket
 * behind forever. Cheap: one ranged delete against the `window_start` index.
 */
export async function sweepAiUsage(
  db: Database,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(minuteBucket(now).getTime() - AI_WINDOW_MS);
  const removed = await db
    .delete(aiUsage)
    .where(and(lt(aiUsage.windowStart, cutoff), gte(aiUsage.count, 0)))
    .returning({ id: aiUsage.id });
  return removed.length;
}

// Old buckets are dead scratch, but they are written on every AI call and only
// pruned opportunistically when that same owner calls again — an owner who
// spends their last request and leaves would leave a row behind for good. This
// sweeps the stragglers. Kept short (a few minutes) because the rows are tiny
// and the delete rides the `window_start` index. Same shape as the demo
// janitor: in-process, unref()'d, harmless to run on several instances at once.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 60_000;

export function startAiUsageSweep(db: Database): void {
  const run = () => {
    void sweepAiUsage(db).catch((error) =>
      console.error("[ai] quota sweep failed", error),
    );
  };
  setTimeout(run, FIRST_SWEEP_DELAY_MS).unref();
  setInterval(run, SWEEP_INTERVAL_MS).unref();
}
