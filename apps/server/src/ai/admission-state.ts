import type { AdmissionReason } from "./admission";

/**
 * The admission arithmetic, with no storage and no clock of its own.
 *
 * This is the part of `admission.ts` that is worth testing exhaustively: the
 * leaky-bucket refill, the token check-and-consume, and the circuit-breaker
 * transitions. It is pure — every function takes the current state, `now`, and
 * a policy config, and returns the next state plus a decision — so it can be
 * driven from a test with a fake clock and *also* reused inside a database
 * transaction, where the same arithmetic runs against a row read `FOR UPDATE`.
 * Keeping it here is what lets "shared state" and "correct arithmetic" be two
 * independent concerns.
 */

/** One provider's shared state, as stored. Times are epoch milliseconds so the
 *  arithmetic is identical in memory and in the database round-trip. */
export type AdmissionState = {
  /** Fractional tokens left in the bucket. */
  tokens: number;
  lastRefillAt: number;
  consecutiveFailures: number;
  /** Epoch ms when the circuit reopens for probing; 0 when closed. */
  openUntil: number;
};

export type AdmissionConfig = {
  perMinute: number;
  circuitFailures: number;
  circuitCooldownMs: number;
};

/** The starting state for a provider the database has no row for yet: a full
 *  bucket, no failures, circuit closed. */
export function initialAdmissionState(
  perMinute: number,
  now: number,
): AdmissionState {
  return {
    tokens: perMinute,
    lastRefillAt: now,
    consecutiveFailures: 0,
    openUntil: 0,
  };
}

/** Refill continuously by elapsed time, never above the one-minute capacity.
 *  Backdated to `lastRefillAt` so a process that sits idle cannot bank credit
 *  and wake up with more than a minute's worth. */
export function refillTokens(
  state: AdmissionState,
  now: number,
  perMinute: number,
): number {
  const elapsedMinutes = Math.max(0, now - state.lastRefillAt) / 60_000;
  if (elapsedMinutes <= 0) return state.tokens;
  return Math.min(perMinute, state.tokens + elapsedMinutes * perMinute);
}

export function circuitIsOpen(state: AdmissionState, now: number): boolean {
  return now < state.openUntil;
}

export function secondsUntilCircuitCloses(
  state: AdmissionState,
  now: number,
): number {
  return Math.max(1, Math.ceil((state.openUntil - now) / 1000));
}

/** Seconds until the bucket holds a whole token again — the honest answer to
 *  "try again in…?" rather than a fixed "in a minute". */
export function secondsUntilToken(
  state: AdmissionState,
  now: number,
  perMinute: number,
): number {
  const tokens = refillTokens(state, now, perMinute);
  const missing = 1 - tokens;
  if (missing <= 0) return 0;
  return Math.max(1, Math.ceil((missing / perMinute) * 60));
}

export type AdmissionDecision =
  | { kind: "admit"; state: AdmissionState }
  | {
      kind: "refuse";
      reason: AdmissionReason;
      retryAfterSeconds: number;
      state: AdmissionState;
    };

/**
 * Decide one call against the shared state and return the next state.
 *
 * Order matters and is the design: the circuit is checked before the bucket so
 * an open circuit costs no tokens, and the bucket before the concurrency slot
 * (which lives elsewhere) so no slot is ever held without quota to use it. A
 * refusal returns the refilled state unchanged otherwise — the store bumps the
 * matching shed counter.
 */
export function decideAdmission(
  state: AdmissionState,
  now: number,
  config: AdmissionConfig,
): AdmissionDecision {
  const base: AdmissionState = {
    tokens: refillTokens(state, now, config.perMinute),
    lastRefillAt: now,
    consecutiveFailures: state.consecutiveFailures,
    openUntil: state.openUntil,
  };

  if (circuitIsOpen(base, now)) {
    return {
      kind: "refuse",
      reason: "circuit-open",
      retryAfterSeconds: secondsUntilCircuitCloses(base, now),
      state: base,
    };
  }

  if (base.tokens < 1) {
    return {
      kind: "refuse",
      reason: "provider-busy",
      retryAfterSeconds: secondsUntilToken(base, now, config.perMinute),
      state: base,
    };
  }

  return { kind: "admit", state: { ...base, tokens: base.tokens - 1 } };
}

/**
 * Fold a settled outcome into the state. Success closes the circuit and clears
 * the streak; `provider-failure` advances the streak and opens the circuit at
 * the threshold; `caller-error` is inert — a request we sent badly says nothing
 * about the next one, and resetting on it would let a single 400 close a
 * circuit that was correctly open.
 */
export function applyOutcome(
  state: AdmissionState,
  outcome: "success" | "provider-failure" | "caller-error",
  now: number,
  config: AdmissionConfig,
): AdmissionState {
  if (outcome === "success") {
    return { ...state, consecutiveFailures: 0, openUntil: 0 };
  }
  if (outcome === "caller-error") return state;
  const failures = state.consecutiveFailures + 1;
  return {
    ...state,
    consecutiveFailures: failures,
    openUntil:
      failures >= config.circuitFailures
        ? now + config.circuitCooldownMs
        : state.openUntil,
  };
}
