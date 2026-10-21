import { describe, expect, test } from "bun:test";

import { AiBusyError, isAiBusy } from "./admission";
import {
  type AdmissionConfig,
  type AdmissionState,
  applyOutcome,
  circuitIsOpen,
  decideAdmission,
  initialAdmissionState,
  refillTokens,
  secondsUntilCircuitCloses,
  secondsUntilToken,
} from "./admission-state";

/**
 * The admission arithmetic used to be tested through `admitAiCall`, which held
 * the state in memory. The bucket and breaker now live in Postgres so that two
 * server instances share one provider allowance, and the arithmetic moved to
 * `admission-state.ts` — pure, so a test can drive it with a fake clock exactly
 * as before. The database mechanics (locking, atomicity) are a separate concern
 * covered by the live integration path; what is asserted here is the arithmetic
 * that decides admit-or-refuse, which is where the subtle bugs live.
 */

const PER_MINUTE = 5;
const CONFIG: AdmissionConfig = {
  perMinute: PER_MINUTE,
  circuitFailures: 6,
  circuitCooldownMs: 30_000,
};

let now = 1_000_000;
const at = () => now;
const advance = (ms: number) => {
  now += ms;
};

function fresh(): AdmissionState {
  return initialAdmissionState(PER_MINUTE, at());
}

/** Admit or refuse one call and fold the outcome, advancing the clock between
 *  failures so the bucket is never the thing under test. */
function decide(
  state: AdmissionState,
  outcome: "success" | "provider-failure" | "caller-error" = "success",
) {
  const decision = decideAdmission(state, at(), CONFIG);
  const next =
    decision.kind === "admit"
      ? applyOutcome(decision.state, outcome, at(), CONFIG)
      : decision.state;
  return { decision, state: next };
}

describe("decideAdmission", () => {
  test("admits up to the allowance, then sheds honestly", () => {
    let state = fresh();
    for (let i = 0; i < PER_MINUTE; i += 1) {
      const { decision, state: next } = decide(state);
      expect(decision.kind).toBe("admit");
      state = next;
    }
    const decision = decideAdmission(state, at(), CONFIG);
    // "provider-busy" is the ceiling being reached — a different operational
    // story from the provider being broken.
    expect(decision.kind).toBe("refuse");
    if (decision.kind === "refuse") {
      expect(decision.reason).toBe("provider-busy");
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  test("the allowance refills continuously, not on a minute boundary", () => {
    let state = fresh();
    for (let i = 0; i < PER_MINUTE; i += 1) state = decide(state).state;
    expect(decideAdmission(state, at(), CONFIG).kind).toBe("refuse");

    // Twelve seconds is a fifth of a minute, so a fifth of a token comes back —
    // enough for exactly one call. A student who waits 12s should not be told
    // to wait a whole minute.
    advance(12_000);
    expect(decideAdmission(state, at(), CONFIG).kind).toBe("admit");
  });

  test("the bucket never refills above one minute's capacity", () => {
    const state = fresh();
    advance(10 * 60_000); // ten idle minutes
    expect(refillTokens(state, at(), PER_MINUTE)).toBe(PER_MINUTE);
  });
});

describe("the circuit breaker", () => {
  /** Drive the breaker open across enough calls, buying back one token each. */
  function trip(start: AdmissionState): AdmissionState {
    let state = start;
    for (let i = 0; i < 6; i += 1) {
      if (i > 0) advance(12_000);
      state = decide(state, "provider-failure").state;
    }
    return state;
  }

  test("opens after sustained provider failures and refuses immediately", () => {
    const state = trip(fresh());
    expect(circuitIsOpen(state, at())).toBe(true);
    const decision = decideAdmission(state, at(), CONFIG);
    expect(decision.kind).toBe("refuse");
    if (decision.kind === "refuse") {
      expect(decision.reason).toBe("circuit-open");
      expect(decision.retryAfterSeconds).toBeLessThanOrEqual(30);
    }
  });

  test("an open circuit costs no bucket tokens", () => {
    const state = trip(fresh());
    const before = refillTokens(state, at(), PER_MINUTE);
    // A refusal returns the state with its tokens intact — no spend on refuse.
    const decision = decideAdmission(state, at(), CONFIG);
    expect(decision.kind).toBe("refuse");
    if (decision.kind === "refuse") {
      expect(refillTokens(decision.state, at(), PER_MINUTE)).toBe(before);
    }
  });

  test("a success closes the circuit and clears the streak", () => {
    let state = trip(fresh());
    advance(31_000);
    // Half-open: one probe gets through and succeeds.
    const { decision, state: next } = decide(state, "success");
    expect(decision.kind).toBe("admit");
    state = next;
    expect(circuitIsOpen(state, at())).toBe(false);
    expect(state.consecutiveFailures).toBe(0);
  });

  test("the cooldown expires on its own", () => {
    const state = trip(fresh());
    expect(circuitIsOpen(state, at())).toBe(true);
    advance(31_000);
    expect(circuitIsOpen(state, at())).toBe(false);
    expect(secondsUntilCircuitCloses(state, at() - 31_000)).toBeGreaterThan(0);
  });
});

describe("caller errors", () => {
  test("a request we sent badly never opens the breaker", () => {
    let state = fresh();
    for (let i = 0; i < 10; i += 1) {
      if (i > 0) advance(12_000);
      state = decide(state, "caller-error").state;
    }
    expect(state.consecutiveFailures).toBe(0);
    expect(circuitIsOpen(state, at())).toBe(false);
  });

  test("a caller error neither opens nor resets the streak", () => {
    let state = fresh();
    for (let i = 0; i < 5; i += 1) {
      if (i > 0) advance(12_000);
      state = decide(state, "provider-failure").state;
    }
    expect(state.consecutiveFailures).toBe(5);
    advance(12_000);
    state = decide(state, "caller-error").state;
    expect(state.consecutiveFailures).toBe(5);
    advance(12_000);
    state = decide(state, "provider-failure").state;
    expect(circuitIsOpen(state, at())).toBe(true);
  });
});

describe("secondsUntilToken", () => {
  test("is the honest wait, not a fixed minute", () => {
    let state = fresh();
    for (let i = 0; i < PER_MINUTE; i += 1) state = decide(state).state;
    // Empty bucket, 5/min: exactly one token needs a fifth of a minute = 12s.
    expect(secondsUntilToken(state, at(), PER_MINUTE)).toBe(12);
    advance(6_000); // half a token banked
    expect(secondsUntilToken(state, at(), PER_MINUTE)).toBe(6);
  });
});

describe("AiBusyError", () => {
  test("carries an honest reason and a retry hint", () => {
    const error = new AiBusyError("store-unavailable", 2);
    expect(isAiBusy(error)).toBe(true);
    expect(error.reason).toBe("store-unavailable");
    expect(error.retryAfterSeconds).toBe(2);
    expect(error.message).toContain("store-unavailable");
  });

  test("is distinguishable from any other error", () => {
    expect(isAiBusy(new Error("nope"))).toBe(false);
    expect(isAiBusy(null)).toBe(false);
  });
});
