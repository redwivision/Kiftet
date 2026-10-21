import { aiAdmission } from "@kiftet/db/schema";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../services";
import {
  type AdmissionConfig,
  type AdmissionDecision,
  type AdmissionState,
  applyOutcome,
  decideAdmission,
  initialAdmissionState,
} from "./admission-state";

/**
 * The shared, cross-instance half of AI admission: the leaky bucket and the
 * circuit breaker, kept in Postgres because the provider quota they protect is
 * per-project and therefore global (see the table comment in `schema/study.ts`).
 *
 * Every transition is a read-modify-write inside one transaction that locks the
 * provider's single row `FOR UPDATE`. That lock is what makes the check and the
 * consume atomic across instances: two servers asking for the last token are
 * serialized, one wins, the other is refused — the same guarantee the
 * conditional upsert gives the per-user `ai_usage` table, expressed as a row
 * lock because the state here is a fraction, not a counter.
 */

/** A DB error here must never be *less* protective than the in-memory design it
 *  replaced — just as an open circuit costs no token, a database we cannot read
 *  must not become an open door. On failure the caller is refused, not admitted. */
export class AdmissionStoreError extends Error {
  constructor(cause: unknown) {
    super(
      `AI admission store unavailable: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "AdmissionStoreError";
  }
}

function toState(row: {
  tokens: number;
  lastRefillAt: Date;
  consecutiveFailures: number;
  openUntil: Date | null;
}): AdmissionState {
  return {
    tokens: row.tokens,
    lastRefillAt: row.lastRefillAt.getTime(),
    consecutiveFailures: row.consecutiveFailures,
    openUntil: row.openUntil ? row.openUntil.getTime() : 0,
  };
}

/**
 * Try to admit one call to `provider`. Locks and updates the shared row in one
 * transaction and returns the decision (which the caller turns into either a
 * lease or an `AiBusyError`), or throws `AdmissionStoreError` if the database
 * is unreachable.
 */
export async function consumeAdmission(
  provider: string,
  config: AdmissionConfig,
  now: number = Date.now(),
): Promise<AdmissionDecision> {
  const db = getDb();
  try {
    return await db.transaction(async (tx): Promise<AdmissionDecision> => {
      // Lock the row (or create it) so the read below cannot race another
      // instance's. `FOR UPDATE` on a missing row locks nothing, so the insert
      // is `ON CONFLICT DO NOTHING` then re-selected under the same statement's
      // transaction — the row is always present and locked by the time we read.
      await tx.execute(
        sql`insert into ai_admission (provider, tokens, last_refill_at)
            values (${provider}, ${config.perMinute}, to_timestamp(${now / 1000}))
            on conflict (provider) do nothing`,
      );
      const [row] = await tx
        .select()
        .from(aiAdmission)
        .where(eq(aiAdmission.provider, provider))
        .for("update");
      if (!row) throw new AdmissionStoreError("admission row vanished");

      const state = toState(row);
      const decision = decideAdmission(state, now, config);

      const counters = {
        admitted: row.admitted + (decision.kind === "admit" ? 1 : 0),
        shedBusy:
          row.shedBusy +
          (decision.kind === "refuse" && decision.reason === "provider-busy"
            ? 1
            : 0),
        shedCircuit:
          row.shedCircuit +
          (decision.kind === "refuse" && decision.reason === "circuit-open"
            ? 1
            : 0),
      };

      await tx
        .update(aiAdmission)
        .set({
          tokens: decision.state.tokens,
          lastRefillAt: new Date(decision.state.lastRefillAt),
          consecutiveFailures: decision.state.consecutiveFailures,
          openUntil:
            decision.state.openUntil > 0
              ? new Date(decision.state.openUntil)
              : null,
          ...counters,
        })
        .where(eq(aiAdmission.provider, provider));

      // "saturated" is decided by the caller (the in-process semaphore), so it
      // is never returned here; the store only owns bucket + breaker.
      return decision;
    });
  } catch (error) {
    if (error instanceof AdmissionStoreError) throw error;
    throw new AdmissionStoreError(error);
  }
}

/** Fold a settled outcome into the shared state (breaker transitions only —
 *  the token was already spent at admission). Best-effort: a failure to record
 *  an outcome must not fail the student's request. Returns the resulting state
 *  so the caller can refresh its telemetry mirror. */
export async function settleAdmission(
  provider: string,
  outcome: "success" | "provider-failure" | "caller-error",
  config: AdmissionConfig,
  now: number = Date.now(),
): Promise<AdmissionState | null> {
  if (outcome === "caller-error") return null; // inert by design; skip the write
  try {
    return await getDb().transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(aiAdmission)
        .where(eq(aiAdmission.provider, provider))
        .for("update");
      if (!row) return null;
      const next = applyOutcome(toState(row), outcome, now, config);
      await tx
        .update(aiAdmission)
        .set({
          consecutiveFailures: next.consecutiveFailures,
          openUntil: next.openUntil > 0 ? new Date(next.openUntil) : null,
        })
        .where(eq(aiAdmission.provider, provider));
      return next;
    });
  } catch (error) {
    console.warn(
      `[admission] could not record ${outcome} for ${provider}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/** The shared counters and current state, for the telemetry route. Reads
 *  without locking — a slightly stale snapshot is exactly right for monitoring. */
export async function readAdmissionState(
  provider: string,
  config: AdmissionConfig,
  now: number = Date.now(),
): Promise<AdmissionState> {
  try {
    const [row] = await getDb()
      .select()
      .from(aiAdmission)
      .where(eq(aiAdmission.provider, provider));
    if (!row) return initialAdmissionState(config.perMinute, now);
    return toState(row);
  } catch {
    return initialAdmissionState(config.perMinute, now);
  }
}
