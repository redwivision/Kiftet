import { env } from "../env.server";
import {
  type AdmissionConfig,
  type AdmissionState,
  applyOutcome,
  refillTokens,
  secondsUntilCircuitCloses,
  secondsUntilToken,
} from "./admission-state";
import { consumeAdmission, settleAdmission } from "./admission-store";

/**
 * Global admission control for the AI seam.
 *
 * One gate per provider, because the thing being protected is a *per-provider*
 * free-tier quota: Gemini and Groq draw on two different pools, so admitting
 * them against one bucket would let a starved Gemini take a healthy Groq
 * offline with it — the exact failure this module exists to prevent.
 *
 * Each provider's gate has two mechanisms of its own, and there is one shared
 * third, because they answer three separate questions and confusing them is
 * what produces an outage that looks like a bug:
 *
 *  1. **A leaky bucket** — how many calls may be made to THAT provider in
 *     total. This and the free tier are the only capacity we actually have: the
 *     tier is per *project* and shared by every student, so N students at 8
 *     req/min each is not 8N of capacity, it is a shared pool that empties.
 *     Admitting work we cannot serve is what manufactures 429s, and a 429
 *     inside `ask` costs a full retry budget before it becomes a fallback (or a
 *     handover to the second provider). Because the pool is global, the bucket
 *     lives in Postgres (`admission-store.ts`), not in this process — two
 *     instances with private buckets would together admit twice the allowance.
 *
 *  2. **A concurrency cap** — shared, not one pool per provider: a real
 *     student request occupies one slot whether Gemini or Groq ends up
 *     answering it. Bounds memory and stops the retry ladder from multiplying
 *     load precisely when a provider is least able to absorb it. This one is
 *     deliberately *per process*: it bounds one instance's own load, and a
 *     per-instance cap times the instance count is a fine global bound.
 *
 *  3. **A circuit breaker** — per provider, and shared (in Postgres, with the
 *     bucket). When a provider is persistently failing, stop calling it and
 *     hand the ladder to the other one. Without this, a Gemini quota storm
 *     holds every request open for the whole retry budget; enough of those and
 *     the process is doing nothing but waiting for a provider that has already
 *     said no. A provider failing for us is failing for every instance, so the
 *     breaker is central too.
 *
 * Every refusal raises `AiBusyError`. That is deliberate and it is the whole
 * point of the distinction from falling through to the deterministic fallback:
 * a fallback is a *worse answer* for one student, a refusal is an *honest*
 * answer for everyone, and silently substituting one for the other is what
 * shipped before (see docs/howItWorks/roadmap.md, 2026-09-27). The ladder in
 * `ask` catches a refusal for ITS provider and moves to the next one; only
 * when every configured provider refuses does the refusal reach the student.
 */

/** The AI providers the app can gate. Adding one is a decision about
 *  contract, capacity and language, so the union is closed on purpose. */
export type AiProvider = "gemini" | "groq";

export const AI_PROVIDERS: readonly AiProvider[] = ["gemini", "groq"];

/** Why admission refused. Carried on the error so the HTTP layer can pick an
 *  honest status and so telemetry can separate "we shed load on purpose"
 *  from "the provider broke". */
export type AdmissionReason =
  | "circuit-open"
  | "provider-busy"
  | "saturated"
  | "store-unavailable";

export class AiBusyError extends Error {
  constructor(
    readonly reason: AdmissionReason,
    readonly retryAfterSeconds: number,
  ) {
    super(`AI admission refused: ${reason} (retry in ${retryAfterSeconds}s)`);
    this.name = "AiBusyError";
  }
}

export function isAiBusy(error: unknown): error is AiBusyError {
  return error instanceof AiBusyError;
}

// Every tweakable number ships a default in .env.schema, so the `??` branches
// are unreachable in a correctly configured process. They exist because the
// generated types mark the vars optional, and because a limit silently becoming
// NaN or 0 would be a far worse failure than a slightly wrong default: a zero
// bucket sheds 100% of AI traffic with no obvious cause.
function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

// The MAX_CONCURRENT / failures / cooldown knobs are shared across providers;
// only the per-minute allowance is per provider, which is the definition of
// their separation. Tune them in .env.schema, not here.
const MAX_CONCURRENT = positive(env.AI_MAX_CONCURRENT, 4);
const CIRCUIT_FAILURES = positive(env.AI_CIRCUIT_FAILURES, 6);
const CIRCUIT_COOLDOWN_MS = positive(env.AI_CIRCUIT_COOLDOWN_MS, 30_000);

const PER_MINUTE: Record<AiProvider, number> = {
  gemini: positive(env.AI_GEMINI_PER_MINUTE, 5),
  groq: positive(env.AI_GROQ_PER_MINUTE, 20),
};

function configFor(provider: AiProvider): AdmissionConfig {
  return {
    perMinute: PER_MINUTE[provider],
    circuitFailures: CIRCUIT_FAILURES,
    circuitCooldownMs: CIRCUIT_COOLDOWN_MS,
  };
}

// ── Process-local mirror ──────────────────────────────────────────────
//
// The database is the source of truth for every admission *decision*. This tiny
// mirror exists only so telemetry (`admissionSnapshot`, called synchronously on
// the health and telemetry routes) does not have to be async or hit the
// database: it is refreshed from the state each decision writes back. It can be
// a few hundred milliseconds stale across instances, which is exactly right for
// monitoring and never consulted for a decision.

type Mirror = AdmissionState & {
  admitted: number;
  shedBusy: number;
  shedSaturated: number;
  shedCircuit: number;
};

function freshMirror(provider: AiProvider): Mirror {
  const now = Date.now();
  return {
    tokens: PER_MINUTE[provider],
    lastRefillAt: now,
    consecutiveFailures: 0,
    openUntil: 0,
    admitted: 0,
    shedBusy: 0,
    shedSaturated: 0,
    shedCircuit: 0,
  };
}

const mirrors: Record<AiProvider, Mirror> = {
  gemini: freshMirror("gemini"),
  groq: freshMirror("groq"),
};

function refreshMirror(provider: AiProvider, state: AdmissionState): void {
  const mirror = mirrors[provider];
  mirror.tokens = state.tokens;
  mirror.lastRefillAt = state.lastRefillAt;
  mirror.consecutiveFailures = state.consecutiveFailures;
  mirror.openUntil = state.openUntil;
}

// ── 2. Concurrency cap (shared, per process) ──────────────────────────
//
// A counting semaphore with FIFO waiters. Not a timeout-bounded queue on
// purpose: waiting is only worthwhile if a slot is genuinely coming, and a
// bucket above is what guarantees one arrives. Past that, waiting just holds a
// request open — so a waiter that cannot be served within WAIT_MS is released
// with the same honest refusal.
const WAIT_MS = positive(env.AI_ADMISSION_WAIT_MS, 8_000);
let inFlight = 0;
const waiters: (() => void)[] = [];

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = waiters.shift();
  if (next) next();
}

function acquireSlot(waitMs: number): Promise<boolean> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const grant = () => {
      if (settled) return;
      settled = true;
      inFlight += 1;
      resolve(true);
    };
    const timer = setTimeout(() => {
      const at = waiters.indexOf(grant);
      if (at !== -1) waiters.splice(at, 1);
      if (settled) return;
      settled = true;
      resolve(false);
    }, waitMs);
    // Don't hold the event loop open for a student who already gave up.
    if (typeof timer.unref === "function") timer.unref();
    waiters.push(grant);
  });
}

// ── Telemetry ─────────────────────────────────────────────────────────
//
// One snapshot per provider, merged by the caller rather than kept separate,
// because the question an operator actually asks at 2am is one question: "are
// we serving real generations, and if not, who stopped us?" Splitting it
// across endpoints makes that a join.

/** One snapshot per provider, so "who stopped us?" stays a per-provider
 *  story and both halves show up in the merged telemetry route. */
function providerSnapshot(provider: AiProvider) {
  const mirror = mirrors[provider];
  const now = Date.now();
  const isOpen = now < mirror.openUntil;
  const config = configFor(provider);
  // The mirror's tokens are only advanced when this process makes a decision,
  // so refill for display the same way a decision would.
  const refilled = Math.max(
    0,
    Math.min(config.perMinute, refillTokens(mirror, now, config.perMinute)),
  );
  return {
    perMinuteLimit: config.perMinute,
    maxConcurrent: MAX_CONCURRENT,
    tokensAvailable: Number(refilled.toFixed(2)),
    inFlight,
    queued: waiters.length,
    circuitOpen: isOpen,
    circuitOpensUntil: isOpen ? new Date(mirror.openUntil).toISOString() : null,
    consecutiveFailures: mirror.consecutiveFailures,
    /** Admitted because the bucket had a token and a slot was free. */
    admitted: mirror.admitted,
    /** Refused because the bucket was empty — the honest ceiling. */
    shedBusy: mirror.shedBusy,
    /** Refused because every slot was taken and none freed in time. */
    shedSaturated: mirror.shedSaturated,
    /** Refused because THAT provider's circuit was open. */
    shedCircuit: mirror.shedCircuit,
  };
}

/** Defaults to Gemini so operators of a single-provider install read the same
 *  shape they always did; Groq is one arg away. */
export function admissionSnapshot(provider: AiProvider = "gemini") {
  return providerSnapshot(provider);
}

/** The full picture for the /ai/telemetry route: one snapshot per provider. */
export function allAdmissionSnapshots() {
  return {
    gemini: providerSnapshot("gemini"),
    groq: providerSnapshot("groq"),
  };
}

/** Test seam: reset every mirror and the semaphore so a case can drive a
 *  bucket and a breaker from a known starting point, on any provider. */
export function __resetAdmissionForTests(): void {
  for (const provider of AI_PROVIDERS) {
    mirrors[provider] = freshMirror(provider);
  }
  inFlight = 0;
  waiters.length = 0;
}

/**
 * Test seam: replace the database-backed store with an in-memory one, so unit
 * tests that drive the AI seam (and therefore admission) do not need a live
 * Postgres. `null` restores the real store. The in-memory backend uses the same
 * pure arithmetic, so it exercises the real decision logic — only the storage
 * moves.
 */
let storeOverride: {
  consume: typeof consumeAdmission;
  settle: typeof settleAdmission;
} | null = null;

export function __setAdmissionStoreForTests(
  override: {
    consume: typeof consumeAdmission;
    settle: typeof settleAdmission;
  } | null,
): void {
  storeOverride = override;
}

function consume(provider: AiProvider, config: AdmissionConfig) {
  return storeOverride
    ? storeOverride.consume(provider, config)
    : consumeAdmission(provider, config);
}

function settle(
  provider: AiProvider,
  outcome: AiOutcome,
  config: AdmissionConfig,
) {
  return storeOverride
    ? storeOverride.settle(provider, outcome, config)
    : settleAdmission(provider, outcome, config);
}

// ── The gate ──────────────────────────────────────────────────────────

export type AiAdmission = {
  /** Call exactly once, when the call settles. */
  settle: (outcome: AiOutcome) => void;
};

export type AiOutcome =
  /** We got a usable answer. Closes the breaker and clears the streak. */
  | "success"
  /**
   * The provider is failing us: 429, 5xx, a timeout, or a retry budget spent.
   * This is the only outcome that counts against the breaker.
   */
  | "provider-failure"
  /**
   * A 4xx we caused — a malformed prompt, an invalid request. The provider is
   * healthy; it just declined this request. Counting it would let one bad
   * prompt open a circuit that refuses AI for every student in the country,
   * which is the opposite of what a breaker is for.
   */
  | "caller-error";

/**
 * Admit one call to one provider, or refuse it.
 *
 * Order matters: the provider's circuit and bucket are checked together in one
 * locked database transaction so an open circuit costs no tokens and the bucket
 * is never over-spent across instances; the concurrency slot is then acquired
 * only once the token is spent, so the two limits can't deadlock against each
 * other and no slot is held without quota to use it.
 */
export async function admitAiCall(
  provider: AiProvider = "gemini",
  maxWaitMs = WAIT_MS,
): Promise<AiAdmission> {
  const config = configFor(provider);

  let decision: Awaited<ReturnType<typeof consumeAdmission>>;
  try {
    decision = await consume(provider, config);
  } catch {
    // A database we cannot read must not become an open door: refuse, exactly
    // as an open circuit would, rather than admitting an unbounded call.
    mirrors[provider].shedCircuit += 1;
    throw new AiBusyError("store-unavailable", 2);
  }
  refreshMirror(provider, decision.state);

  if (decision.kind === "refuse") {
    if (decision.reason === "circuit-open") mirrors[provider].shedCircuit += 1;
    else mirrors[provider].shedBusy += 1;
    throw new AiBusyError(decision.reason, decision.retryAfterSeconds);
  }

  const gotSlot = await acquireSlot(Math.min(WAIT_MS, Math.max(0, maxWaitMs)));
  if (!gotSlot) {
    // The token was already consumed; a shed here costs the student nothing
    // extra and is recorded so "saturated" is distinguishable from "busy".
    mirrors[provider].shedSaturated += 1;
    throw new AiBusyError("saturated", 2);
  }

  mirrors[provider].admitted += 1;

  return {
    settle(outcome) {
      releaseSlot();
      // Update the telemetry mirror *synchronously* from the same pure
      // arithmetic the store applies, so `admissionSnapshot`/`providerHealth`
      // read the breaker immediately after a settle rather than a microtask
      // later. The store write then reconciles the authoritative shared row;
      // the mirror is telemetry only, so an optimistic update is correct here.
      refreshMirror(
        provider,
        applyOutcome(mirrors[provider], outcome, Date.now(), config),
      );
      // The counter changes too, but mirrors count admissions/sheds, not
      // outcomes, so nothing else to update.
      void settle(provider, outcome, config).then((next) => {
        if (next) refreshMirror(provider, next);
      });
    },
  };
}

// Re-exported for callers that want the shared arithmetic (telemetry copy,
// tests) without reaching into the store.
export { secondsUntilCircuitCloses, secondsUntilToken };
