import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  __resetAdmissionForTests,
  type AiBusyError,
  admissionSnapshot,
  admitAiCall,
  isAiBusy,
} from "./admission";

// The module reads its limits from env at import time; with the inert env from
// test-setup.ts the documented fallbacks apply (5/min, 4 concurrent, 6 failures
// to trip, 30s cooldown). The tests below assert behaviour against those, not
// against whatever a developer has in their .env.
const PER_MINUTE = 5;

const realNow = Date.now;
let clockOffset = 0;

/** Move the process clock forward. Installed for every test, because the bucket
 *  refills on elapsed time and a breaker opens on elapsed time — a test that
 *  could not advance the clock could only ever test the steady state. */
function advance(ms: number): void {
  clockOffset += ms;
}

beforeEach(() => {
  clockOffset = 0;
  Date.now = () => realNow() + clockOffset;
  __resetAdmissionForTests();
});

afterEach(() => {
  Date.now = realNow;
  clockOffset = 0;
});

async function expectRefusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(isAiBusy(error)).toBe(true);
    return error as AiBusyError;
  }
  throw new Error("expected the call to be refused");
}

/**
 * Drive the breaker open by failing every admitted call.
 *
 * The bucket only holds five tokens, so a single student's request can never
 * open a six-failure breaker on its own — failures accumulate across the whole
 * process, which is the only way they can accumulate. Each iteration buys back
 * exactly one token with 12s of clock (5/min), so the bucket is never the thing
 * being tested, and the loop deliberately does *not* advance time after the
 * final failure: doing so would expire the cooldown it just started and the
 * breaker would be closed again by the time it was inspected.
 */
async function tripBreaker(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    if (i > 0) advance(12_000);
    (await admitAiCall()).settle("provider-failure");
  }
}

describe("admitAiCall", () => {
  test("admits up to the global allowance, then sheds honestly", async () => {
    for (let i = 0; i < PER_MINUTE; i += 1) {
      const lease = await admitAiCall();
      lease.settle("success");
    }

    const refused = await expectRefusal(admitAiCall());
    // "provider-busy" is the ceiling being reached, which is a different
    // operational story from the provider being broken.
    expect(refused.reason).toBe("provider-busy");
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("the allowance refills continuously rather than on a minute boundary", async () => {
    for (let i = 0; i < PER_MINUTE; i += 1) {
      (await admitAiCall()).settle("success");
    }
    await expectRefusal(admitAiCall());

    // Twelve seconds is a fifth of a minute, so a fifth of a token comes back.
    // A student who waits 12s should not be told to wait a full minute — that
    // is what made the old rolling window feel arbitrary when people asked.
    advance(12_000);

    const lease = await admitAiCall();
    expect(lease).toBeDefined();
    lease.settle("success");
  });

  test("the breaker opens after sustained provider failures", async () => {
    await tripBreaker();
    expect(admissionSnapshot().circuitOpen).toBe(true);

    // Open or not, the important property is that the next caller is refused
    // immediately rather than being made to sit through the 24s retry budget.
    const refused = await expectRefusal(admitAiCall());
    expect(refused.reason).toBe("circuit-open");
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  test("an open breaker costs no bucket tokens", async () => {
    await tripBreaker();
    expect(admissionSnapshot().circuitOpen).toBe(true);
    const tokensWhileOpen = admissionSnapshot().tokensAvailable;

    await expectRefusal(admitAiCall());

    // If refusals drained the bucket, the cooldown would be followed by a
    // second, invisible throttle — the system would still look busy for a
    // reason that had nothing to do with the provider.
    expect(admissionSnapshot().tokensAvailable).toBe(tokensWhileOpen);
  });

  test("a success closes the breaker", async () => {
    await tripBreaker();
    expect(admissionSnapshot().circuitOpen).toBe(true);

    // Half-open: after the cooldown one probe gets through and succeeds.
    advance(31_000);
    const probe = await admitAiCall();
    probe.settle("success");

    expect(admissionSnapshot().circuitOpen).toBe(false);
    expect(admissionSnapshot().consecutiveFailures).toBe(0);
  });

  test("the cooldown expires on its own", async () => {
    await tripBreaker();
    expect(admissionSnapshot().circuitOpen).toBe(true);

    advance(31_000);
    expect(admissionSnapshot().circuitOpen).toBe(false);
  });

  test("releasing a slot lets a later caller through", async () => {
    // Four concurrent slots; a fifth waits rather than being shed.
    const leases = [];
    for (let i = 0; i < 4; i += 1) {
      leases.push(await admitAiCall());
    }
    expect(admissionSnapshot().inFlight).toBe(4);

    const waiting = admitAiCall();
    expect(admissionSnapshot().queued).toBe(1);

    leases[0]?.settle("success");
    const fifth = await waiting;
    expect(fifth).toBeDefined();
    // In flight is back to four: the released slot and the granted one.
    expect(admissionSnapshot().inFlight).toBe(4);
    fifth.settle("success");
  });
});

describe("caller errors", () => {
  test("a request we sent badly never opens the breaker", async () => {
    // Six bad prompts in a row must not take AI away from every other student.
    // This is the failure the three-way outcome exists to prevent: a 400 exits
    // the retry loop immediately, so before this distinction existed it counted
    // as a provider failure and tripped a circuit serving the whole country.
    for (let i = 0; i < 10; i += 1) {
      if (i > 0) advance(12_000);
      (await admitAiCall()).settle("caller-error");
    }

    expect(admissionSnapshot().consecutiveFailures).toBe(0);
    expect(admissionSnapshot().circuitOpen).toBe(false);
    // Still serving: the very next request goes straight through.
    (await admitAiCall()).settle("success");
  });

  test("a caller error neither opens nor resets the streak", async () => {
    // Five provider failures sit one short of the trip threshold. A caller
    // error in between says nothing about provider health, so it must neither
    // push the count over nor wipe it — otherwise any 400 could close a circuit
    // that was correctly open.
    for (let i = 0; i < 5; i += 1) {
      if (i > 0) advance(12_000);
      (await admitAiCall()).settle("provider-failure");
    }
    expect(admissionSnapshot().consecutiveFailures).toBe(5);

    advance(12_000);
    (await admitAiCall()).settle("caller-error");
    expect(admissionSnapshot().consecutiveFailures).toBe(5);

    advance(12_000);
    (await admitAiCall()).settle("provider-failure");
    expect(admissionSnapshot().circuitOpen).toBe(true);
  });

  test("a caller error still releases its concurrency slot", async () => {
    for (let i = 0; i < 4; i += 1) {
      (await admitAiCall()).settle("caller-error");
    }
    // If the slot leaked, inFlight would be 4 and this would queue instead of
    // returning immediately.
    expect(admissionSnapshot().inFlight).toBe(0);
  });
});

describe("admissionSnapshot", () => {
  test("reports enough to answer 'is it the model, or is it us?'", () => {
    const snap = admissionSnapshot();
    expect(snap.perMinuteLimit).toBe(PER_MINUTE);
    expect(snap.maxConcurrent).toBeGreaterThan(0);
    expect(typeof snap.circuitOpen).toBe("boolean");
    expect(snap.admitted).toBeGreaterThanOrEqual(0);
  });

  test("a reset returns to a clean, full state", async () => {
    (await admitAiCall()).settle("provider-failure");
    __resetAdmissionForTests();
    const snap = admissionSnapshot();
    expect(snap.admitted).toBe(0);
    expect(snap.shedBusy).toBe(0);
    expect(snap.circuitOpen).toBe(false);
    expect(snap.tokensAvailable).toBe(PER_MINUTE);
  });
});

describe("per-provider gates", () => {
  test("each provider keeps its own bucket", async () => {
    // Spend gemini's whole allowance…
    for (let i = 0; i < PER_MINUTE; i += 1) {
      (await admitAiCall()).settle("success");
    }
    await expectRefusal(admitAiCall());

    // …and groq still has its own untouched allowance to draw on. This is the
    // property the whole two-provider design exists for: a starved gemini
    // must not take a healthy groq offline with it.
    const groqLease = await admitAiCall("groq");
    groqLease.settle("success");
    expect(admissionSnapshot("groq").admitted).toBe(1);
    expect(admissionSnapshot("groq").shedBusy).toBe(0);
  });

  test("a provider's breaker opens without taking the other offline", async () => {
    for (let i = 0; i < 6; i += 1) {
      if (i > 0) advance(12_000);
      (await admitAiCall("groq")).settle("provider-failure");
    }
    expect(admissionSnapshot("groq").circuitOpen).toBe(true);
    expect(admissionSnapshot("gemini").circuitOpen).toBe(false);
    // While groq is broken, gemini still serves without shedding.
    const lease = await admitAiCall();
    lease.settle("success");
  });

  test("a reset clears every provider's gate", async () => {
    (await admitAiCall("groq")).settle("provider-failure");
    (await admitAiCall("groq")).settle("success");
    __resetAdmissionForTests();
    for (const provider of ["gemini", "groq"] as const) {
      const snap = admissionSnapshot(provider);
      expect(snap.admitted).toBe(0);
      expect(snap.shedBusy).toBe(0);
      expect(snap.circuitOpen).toBe(false);
      // A reset refunds the provider's whole bucket.
      expect(snap.tokensAvailable).toBe(snap.perMinuteLimit);
    }
  });
});
