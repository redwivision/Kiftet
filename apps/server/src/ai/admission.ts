import { env } from "../env.server";

/**
 * Global admission control for the AI seam.
 *
 * Three mechanisms, because they answer three separate questions, and
 * confusing them is what produces an outage that looks like a bug:
 *
 *  1. **A leaky bucket** — how many Gemini calls this process may make in
 *     total. This is the only capacity we actually have. The Gemini free tier
 *     is per *project* and shared by every student, so N students at 8 req/min
 *     each is not 8N of capacity, it is a shared pool that empties. Admitting
 *     work we cannot serve is what manufactures 429s, and a 429 inside
 *     `askJson` costs a full retry budget before it becomes a fallback.
 *
 *  2. **A concurrency cap** — how many admitted calls may be in flight at
 *     once. Bounds memory and stops the retry ladder from multiplying load
 *     exactly when the provider is least able to absorb it.
 *
 *  3. **A circuit breaker** — when the provider is persistently failing, stop
 *     calling it and refuse fast. Without this, a Gemini 429 storm holds every
 *     request open for `GEMINI_TOTAL_BUDGET_MS`; enough of those and the
 *     process is doing nothing but waiting. That is the self-inflicted outage:
 *     a provider blip becomes a total site outage.
 *
 * Every refusal raises `AiBusyError` rather than falling through to the
 * deterministic fallback. That distinction is the whole point: a fallback is a
 * *worse answer* for one student, a refusal is an *honest* answer for everyone,
 * and silently substituting one for the other is what shipped before
 * (see docs/howItWorks/roadmap.md, 2026-09-27).
 */

/** Why admission refused. Carried on the error so the HTTP layer can pick an
 *  honest status and so telemetry can separate "we shed load on purpose"
 *  from "the provider broke". */
export type AdmissionReason = "circuit-open" | "provider-busy" | "saturated";

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

// Every one of these ships a default in .env.schema, so the `??` branches are
// unreachable in a correctly configured process. They exist because the
// generated types mark the vars optional, and because a limit silently becoming
// NaN or 0 would be a far worse failure than a slightly wrong default: a zero
// bucket sheds 100% of AI traffic with no obvious cause.
function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

const PER_MINUTE = positive(env.AI_GLOBAL_PER_MINUTE, 5);
const MAX_CONCURRENT = positive(env.AI_MAX_CONCURRENT, 4);
const CIRCUIT_FAILURES = positive(env.AI_CIRCUIT_FAILURES, 6);
const CIRCUIT_COOLDOWN_MS = positive(env.AI_CIRCUIT_COOLDOWN_MS, 30_000);

// ── 1. Leaky bucket ───────────────────────────────────────────────────
//
// Capacity equals one minute of allowance, because "a whole minute's worth
// arriving at once" is the realistic burst shape (a Telegram link hits, or a
// class finishes a lesson at the same minute) and the tokens are there to
// absorb exactly that. Refill is continuous rather than per-minute so a
// student who waits 20 seconds gets 1/3 of a call's worth, instead of nothing
// until the top of the minute — which is what made the old rolling window feel
// arbitrary to students asking "when does it restart?".
//
// Backdated to `lastRefillAt` on first use so a process that boots and sits
// idle for an hour does not wake up with a full bucket plus an hour of credit.

let tokens = PER_MINUTE;
let lastRefillAt = Date.now();

function refill(now: number): void {
  if (now === lastRefillAt) return;
  const elapsedMinutes = (now - lastRefillAt) / 60_000;
  if (elapsedMinutes <= 0) return;
  tokens = Math.min(PER_MINUTE, tokens + elapsedMinutes * PER_MINUTE);
  lastRefillAt = now;
}

function tokensAvailable(now: number): number {
  refill(now);
  return tokens;
}

function takeToken(now: number): boolean {
  if (tokensAvailable(now) < 1) return false;
  tokens -= 1;
  return true;
}

/** Seconds until the bucket holds a whole token again — the honest answer to
 *  "try again in…?" rather than a fixed "in a minute". */
function secondsUntilToken(now: number): number {
  refill(now);
  const missing = 1 - tokens;
  if (missing <= 0) return 0;
  return Math.max(1, Math.ceil((missing / PER_MINUTE) * 60));
}

// ── 2. Concurrency cap ────────────────────────────────────────────────
//
// A counting semaphore with FIFO waiters. Not a timeout-bounded queue on
// purpose: waiting is only worthwhile if a slot is genuinely coming, and the
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

// ── 3. Circuit breaker ────────────────────────────────────────────────
//
// `consecutiveFailures` counts *transient* provider failures only — a
// non-retryable 400 is the request's problem, not the provider's, and must
// not open the circuit for every other student. A success resets it.
//
// Half-open admits exactly one probe. If the probe succeeds the circuit closes;
// if it fails the cooldown restarts. That is the difference between "we try
// the provider occasionally and stay healthy" and "every student gets one
// failed call per cooldown window forever".

let consecutiveFailures = 0;
let openUntil = 0;

function circuitOpen(now: number): boolean {
  return now < openUntil;
}

function secondsUntilCircuitCloses(now: number): number {
  return Math.max(1, Math.ceil((openUntil - now) / 1000));
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  openUntil = 0;
}

function recordFailure(now: number): void {
  consecutiveFailures += 1;
  if (consecutiveFailures < CIRCUIT_FAILURES) return;
  openUntil = now + CIRCUIT_COOLDOWN_MS;
}

// ── Telemetry ─────────────────────────────────────────────────────────
//
// Merged into the existing AI counters rather than kept separate, because the
// question an operator actually asks at 2am is one question: "are we serving
// real generations, and if not, who stopped us?" Splitting it across two
// endpoints makes that a join.
const admissionTelemetry = {
  admitted: 0,
  /** Refused because the global bucket was empty — the honest ceiling. */
  shedBusy: 0,
  /** Refused because every slot was taken and none freed in time. */
  shedSaturated: 0,
  /** Refused because the circuit was open. */
  shedCircuit: 0,
};

export function admissionSnapshot() {
  const now = Date.now();
  return {
    perMinuteLimit: PER_MINUTE,
    maxConcurrent: MAX_CONCURRENT,
    tokensAvailable: Number(tokensAvailable(now).toFixed(2)),
    inFlight,
    queued: waiters.length,
    circuitOpen: circuitOpen(now),
    circuitOpensUntil: circuitOpen(now)
      ? new Date(openUntil).toISOString()
      : null,
    consecutiveFailures,
    ...admissionTelemetry,
  };
}

/** Test seam: reset module state so a case can drive the bucket and the
 *  breaker from a known starting point. */
export function __resetAdmissionForTests(): void {
  tokens = PER_MINUTE;
  lastRefillAt = Date.now();
  inFlight = 0;
  waiters.length = 0;
  consecutiveFailures = 0;
  openUntil = 0;
  admissionTelemetry.admitted = 0;
  admissionTelemetry.shedBusy = 0;
  admissionTelemetry.shedSaturated = 0;
  admissionTelemetry.shedCircuit = 0;
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
 * Admit one AI call, or refuse it.
 *
 * Order matters: the circuit is checked before the bucket so an open circuit
 * costs no tokens, and the bucket before the semaphore so we never hold a slot
 * we have no quota to use. The semaphore is only acquired once the token is
 * spent, so the two limits can't deadlock against each other.
 */
export async function admitAiCall(): Promise<AiAdmission> {
  const now = Date.now();

  if (circuitOpen(now)) {
    admissionTelemetry.shedCircuit += 1;
    throw new AiBusyError("circuit-open", secondsUntilCircuitCloses(now));
  }

  if (!takeToken(now)) {
    admissionTelemetry.shedBusy += 1;
    throw new AiBusyError("provider-busy", secondsUntilToken(now));
  }

  const gotSlot = await acquireSlot(WAIT_MS);
  if (!gotSlot) {
    admissionTelemetry.shedSaturated += 1;
    throw new AiBusyError("saturated", 2);
  }

  admissionTelemetry.admitted += 1;

  return {
    settle(outcome) {
      releaseSlot();
      if (outcome === "success") recordSuccess();
      // `caller-error` is deliberately inert: it neither opens the breaker nor
      // clears the streak. A request we sent badly says nothing about whether
      // the next request will work, and resetting on it would let a single
      // 400 close a circuit that was correctly open.
      else if (outcome === "provider-failure") recordFailure(Date.now());
    },
  };
}
