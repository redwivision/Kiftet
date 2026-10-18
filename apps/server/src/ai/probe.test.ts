/**
 * The quota visibility seam: /ai/telemetry's `config` + `health`, and the
 * /ai/probe verdict.
 *
 * The property worth protecting here is NEGATIVE — a probe must not disturb
 * anything a student's request depends on. So every success case below is
 * paired with an assertion that the admission bucket and the telemetry counters
 * came through untouched, because a diagnostic that sheds students or rewrites
 * `lastProvider` is worse than no diagnostic at all.
 *
 * No real key and no network: callbacks are swapped via
 * __overrideProviderForTests, exactly like the failover tests.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  __resetAdmissionForTests,
  admissionSnapshot,
  admitAiCall,
} from "./admission";
import {
  __overrideProviderForTests,
  aiProviderConfig,
  aiTelemetrySnapshot,
  probeProvider,
  providerHealth,
} from "./gemini";

const GEMINI_KEY = "gemini-test-key";
const GROQ_KEY = "groq-test-key";

const realNow = Date.now;
let clockOffset = 0;

function advance(ms: number): void {
  clockOffset += ms;
}

/** The telemetry half of the snapshot, minus the nested admission state — the
 *  part a probe is forbidden to move. */
function telemetryCounters() {
  const { admission: _admission, ...rest } = aiTelemetrySnapshot();
  return rest;
}

beforeEach(() => {
  clockOffset = 0;
  Date.now = () => realNow() + clockOffset;
  __resetAdmissionForTests();
  // Both read as configured unless a test narrows it, matching the default the
  // rest of the suite assumes.
  process.env.GEMINI_API_KEY = GEMINI_KEY;
  process.env.GROQ_API_KEY = GROQ_KEY;
});

afterEach(() => {
  __overrideProviderForTests("gemini", null);
  __overrideProviderForTests("groq", null);
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  Date.now = realNow;
  clockOffset = 0;
});

describe("aiProviderConfig", () => {
  test("a placeholder key reads as not configured", () => {
    process.env.GEMINI_API_KEY = "placeholder-gemini-api-key";
    expect(aiProviderConfig().gemini.configured).toBe(false);
  });

  test("an absent key reads as not configured", () => {
    delete process.env.GEMINI_API_KEY;
    expect(aiProviderConfig().gemini.configured).toBe(false);
    expect(aiProviderConfig().groq.configured).toBe(true);
  });

  test("the model lists travel with the config so a report needs no second call", () => {
    const config = aiProviderConfig();
    expect(config.gemini.models.length).toBeGreaterThan(0);
    expect(config.groq.models).toEqual(["openai/gpt-oss-120b"]);
  });

  test("vision is available exactly when Gemini is, because Groq is text-only", () => {
    expect(aiProviderConfig().groq.vision).toBe(false);
    expect(aiProviderConfig().gemini.vision).toBe(true);
    delete process.env.GEMINI_API_KEY;
    expect(aiProviderConfig().gemini.vision).toBe(false);
  });
});

describe("providerHealth", () => {
  test("no key is not_configured, which is an answer rather than a fault", () => {
    delete process.env.GEMINI_API_KEY;
    expect(providerHealth("gemini")).toBe("not_configured");
    // The other provider is untouched by this provider's absence.
    expect(providerHealth("groq")).toBe("unprobed");
  });

  test("a configured provider we have never spent from is unprobed, not ready", () => {
    expect(providerHealth("gemini")).toBe("unprobed");
  });

  test("a provider that has served a call is ready", async () => {
    (await admitAiCall()).settle("success");
    expect(providerHealth("gemini")).toBe("ready");
    // The other provider's gate is independent, so it stays unprobed.
    expect(providerHealth("groq")).toBe("unprobed");
  });

  test("an emptied bucket is a wait, reported as rate_limited", async () => {
    for (let i = 0; i < 5; i += 1) (await admitAiCall()).settle("success");
    expect(providerHealth("gemini")).toBe("rate_limited");
  });

  test("an open breaker outranks every other reading", async () => {
    for (let i = 0; i < 6; i += 1) {
      if (i > 0) advance(12_000);
      (await admitAiCall()).settle("provider-failure");
    }
    expect(providerHealth("gemini")).toBe("circuit_open");
  });
});

describe("probeProvider", () => {
  test("a healthy provider answers ok with a model and a latency", async () => {
    __overrideProviderForTests("gemini", async () => "ok");
    const result = await probeProvider("gemini");
    expect(result).toEqual({
      provider: "gemini",
      outcome: "ok",
      model: expect.any(String),
      latencyMs: expect.any(Number),
      status: null,
      detail: null,
    });
  });

  test("an unconfigured provider costs no network call at all", async () => {
    delete process.env.GEMINI_API_KEY;
    let called = false;
    __overrideProviderForTests("gemini", async () => {
      called = true;
      return "ok";
    });
    expect((await probeProvider("gemini")).outcome).toBe("not_configured");
    expect(called).toBe(false);
  });

  test("a quota-exhausted project reports rate_limited, not an error", async () => {
    __overrideProviderForTests("gemini", async () => {
      throw Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 });
    });
    const result = await probeProvider("gemini");
    expect(result.outcome).toBe("rate_limited");
    expect(result.status).toBe(429);
  });

  test("a rejected key is named as such rather than as an outage", async () => {
    __overrideProviderForTests("gemini", async () => {
      throw Object.assign(new Error("API key not valid"), { status: 401 });
    });
    const result = await probeProvider("gemini");
    expect(result.outcome).toBe("invalid_key");
    expect(result.status).toBe(401);
  });

  test("a malformed request is kept distinct from a bad key", async () => {
    __overrideProviderForTests("groq", async () => {
      throw Object.assign(new Error("bad request"), { status: 400 });
    });
    expect((await probeProvider("groq")).outcome).toBe("invalid_request");
  });

  test("an upstream 5xx is the provider's, not our key's", async () => {
    __overrideProviderForTests("gemini", async () => {
      throw Object.assign(new Error("backend error"), { status: 503 });
    });
    expect((await probeProvider("gemini")).outcome).toBe("provider_error");
  });

  test("a stalled provider cannot hang the route", async () => {
    __overrideProviderForTests("gemini", () => new Promise<string>(() => {}));
    const result = await probeProvider("gemini", 20);
    expect(result.outcome).toBe("timeout");
    expect(result.status).toBeNull();
  });

  test("the probe spends no admission token, so it cannot shed a student", async () => {
    __overrideProviderForTests("gemini", async () => "ok");
    const before = admissionSnapshot("gemini");
    await probeProvider("gemini");
    const after = admissionSnapshot("gemini");
    expect(after.admitted).toBe(before.admitted);
    expect(after.tokensAvailable).toBe(before.tokensAvailable);
    expect(after.consecutiveFailures).toBe(before.consecutiveFailures);
    expect(after.circuitOpen).toBe(false);
  });

  test("a probe overwrites neither lastProvider nor lastModel", async () => {
    __overrideProviderForTests("gemini", async () => "ok");
    const before = telemetryCounters();
    await probeProvider("gemini");
    expect(telemetryCounters()).toEqual(before);
  });

  test("a FAILED probe still moves no telemetry — its failure is a report, not a signal", async () => {
    __overrideProviderForTests("gemini", async () => {
      throw Object.assign(new Error("429"), { status: 429 });
    });
    const before = telemetryCounters();
    await probeProvider("gemini");
    expect(telemetryCounters()).toEqual(before);
  });

  test("the probe has no ladder: a dead Gemini is not answered by Groq", async () => {
    __overrideProviderForTests("gemini", async () => {
      throw Object.assign(new Error("429"), { status: 429 });
    });
    let groqCalled = false;
    __overrideProviderForTests("groq", async () => {
      groqCalled = true;
      return "ok";
    });
    expect((await probeProvider("gemini")).outcome).toBe("rate_limited");
    expect(groqCalled).toBe(false);
  });
});
