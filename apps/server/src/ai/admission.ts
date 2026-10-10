import { env } from "../env.server";

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
 *  1. **A leaky bucket** — how many calls this process may make to THAT
 *     provider in total. This and the free tier are the only capacity we
 *     actually have: the tier is per *project* and shared by every student,
 *     so N students at 8 req/min each is not 8N of capacity, it is a shared
 *     pool that empties. Admitting work we cannot serve is what manufactures
 *     429s, and a 429 inside `ask` costs a full retry budget before it
 *     becomes a fallback (or a handover to the second provider).
 *
 *  2. **A concurrency cap** — shared, not one pool per provider: a real
 *     student request occupies one slot whether Gemini or Groq ends up
 *     answering it. Bounds memory and stops the retry ladder from multiplying
 *     load precisely when a provider is least able to absorb it.
 *
 *  3. **A circuit breaker** — per provider. When a provider is persistently
 *     failing, stop calling it and hand the ladder to the other one. Without
 *     this, a Gemini quota storm holds every request open for the whole retry
 *     budget; enough of those and the process is doing nothing but waiting for
 *     a provider that has already said no. The per-provider half of the design
 *     is what lets Gemini collapse without taking Groq with it.
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

// ── 1. Leaky bucket (per provider) ────────────────────────────────────
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

type Gate = {
  perMinute: number;
  tokens: number;
  lastRefillAt: number;
  consecutiveFailures: number;
  openUntil: number;
  admitted: number;
  shedBusy: number;
  shedSaturated: number;
  shedCircuit: number;
};

function createGate(perMinute: number): Gate {
  const now = Date.now();
  return {
    perMinute,
    tokens: perMinute,
    lastRefillAt: now,
    consecutiveFailures: 0,
    openUntil: 0,
    admitted: 0,
    shedBusy: 0,
    shedSaturated: 0,
    shedCircuit: 0,
  };
}

const gates: Record<AiProvider, Gate> = {
  gemini: createGate(PER_MINUTE.gemini),
  groq: createGate(PER_MINUTE.groq),
};

function refill(gate: Gate, now: number): void {
  if (now === gate.lastRefillAt) return;
  const elapsedMinutes = (now - gate.lastRefillAt) / 60_000;
  if (elapsedMinutes <= 0) return;
  gate.tokens = Math.min(
    gate.perMinute,
    gate.tokens + elapsedMinutes * gate.perMinute,
  );
  gate.lastRefillAt = now;
}

function tokensAvailable(gate: Gate, now: number): number {
  refill(gate, now);
  return gate.tokens;
}

function takeToken(gate: Gate, now: number): boolean {
  if (tokensAvailable(gate, now) < 1) return false;
  gate.tokens -= 1;
  return true;
}

/** Seconds until the bucket holds a whole token again — the honest answer to
 *  "try again in…?" rather than a fixed "in a minute". */
function secondsUntilToken(gate: Gate, now: number): number {
  refill(gate, now);
  const missing = 1 - gate.tokens;
  if (missing <= 0) return 0;
  return Math.max(1, Math.ceil((missing / gate.perMinute) * 60));
}

// ── 2. Concurrency cap (shared) ───────────────────────────────────────
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

// ── 3. Circuit breaker (per provider) ─────────────────────────────────
//
// `consecutiveFailures` counts *transient* provider failures only — a
// non-retryable 400 is the request's problem, not the provider's, and must
// not open the circuit for every other student. A success resets it.
//
// Half-open admits exactly one probe. If the probe succeeds the circuit closes;
// if it fails the cooldown restarts. That is the difference between "we try
// the provider occasionally and stay healthy" and "every student gets one
// failed call per cooldown window forever".

function circuitOpen(gate: Gate, now: number): boolean {
  return now < gate.openUntil;
}

function secondsUntilCircuitCloses(gate: Gate, now: number): number {
  return Math.max(1, Math.ceil((gate.openUntil - now) / 1000));
}

function recordSuccess(gate: Gate): void {
  gate.consecutiveFailures = 0;
  gate.openUntil = 0;
}

function recordFailure(gate: Gate, now: number): void {
  gate.consecutiveFailures += 1;
  if (gate.consecutiveFailures < CIRCUIT_FAILURES) return;
  gate.openUntil = now + CIRCUIT_COOLDOWN_MS;
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
  const gate = gates[provider];
  const now = Date.now();
  const isOpen = circuitOpen(gate, now);
  return {
    perMinuteLimit: gate.perMinute,
    maxConcurrent: MAX_CONCURRENT,
    tokensAvailable: Number(tokensAvailable(gate, now).toFixed(2)),
    inFlight,
    queued: waiters.length,
    circuitOpen: isOpen,
    circuitOpensUntil: isOpen ? new Date(gate.openUntil).toISOString() : null,
    consecutiveFailures: gate.consecutiveFailures,
    /** Admitted because the bucket had a token and a slot was free. */
    admitted: gate.admitted,
    /** Refused because the bucket was empty — the honest ceiling. */
    shedBusy: gate.shedBusy,
    /** Refused because every slot was taken and none freed in time. */
    shedSaturated: gate.shedSaturated,
    /** Refused because THAT provider's circuit was open. */
    shedCircuit: gate.shedCircuit,
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

/** Test seam: reset every gate's state so a case can drive a bucket and a
 *  breaker from a known starting point, on any provider. */
export function __resetAdmissionForTests(): void {
  for (const provider of AI_PROVIDERS) {
    const gate = gates[provider];
    gate.tokens = gate.perMinute;
    gate.lastRefillAt = Date.now();
    gate.consecutiveFailures = 0;
    gate.openUntil = 0;
    gate.admitted = 0;
    gate.shedBusy = 0;
    gate.shedSaturated = 0;
    gate.shedCircuit = 0;
  }
  inFlight = 0;
  waiters.length = 0;
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
 * Order matters: the provider's circuit is checked before its bucket so an
 * open circuit costs no tokens, and the bucket before the semaphore so we
 * never hold a slot we have no quota to use. The semaphore is only acquired
 * once the token is spent, so the two limits can't deadlock against each
 * other.
 */
export async function admitAiCall(
  provider: AiProvider = "gemini",
): Promise<AiAdmission> {
  const gate = gates[provider];
  const now = Date.now();

  if (circuitOpen(gate, now)) {
    gate.shedCircuit += 1;
    throw new AiBusyError("circuit-open", secondsUntilCircuitCloses(gate, now));
  }

  if (!takeToken(gate, now)) {
    gate.shedBusy += 1;
    throw new AiBusyError("provider-busy", secondsUntilToken(gate, now));
  }

  const gotSlot = await acquireSlot(WAIT_MS);
  if (!gotSlot) {
    gate.shedSaturated += 1;
    throw new AiBusyError("saturated", 2);
  }

  gate.admitted += 1;

  return {
    settle(outcome) {
      releaseSlot();
      if (outcome === "success") recordSuccess(gate);
      // `caller-error` is deliberately inert: it neither opens the breaker nor
      // clears the streak. A request we sent badly says nothing about whether
      // the next request will work, and resetting on it would let a single
      // 400 close a circuit that was correctly open.
      else if (outcome === "provider-failure") recordFailure(gate, Date.now());
    },
  };
}
