import { describe, expect, test } from "bun:test";

import { createDemoGate } from "./demo-gate";

describe("createDemoGate", () => {
  test("lets a normal visitor through", () => {
    const gate = createDemoGate({ perIpPerMinute: 2, globalPerMinute: 25 });
    expect(gate.decide("1.1.1.1")).toBe("ok");
    expect(gate.decide("1.1.1.1")).toBe("ok");
  });

  test("limits one address after its own allowance", () => {
    const gate = createDemoGate({ perIpPerMinute: 2, globalPerMinute: 25 });
    gate.decide("1.1.1.1");
    gate.decide("1.1.1.1");
    expect(gate.decide("1.1.1.1")).toBe("per-ip");
    expect(gate.decide("2.2.2.2")).toBe("ok");
  });

  test("the per-IP limit is the reason reported when it is the one hit", () => {
    const gate = createDemoGate({ perIpPerMinute: 1, globalPerMinute: 25 });
    gate.decide("1.1.1.1");
    expect(gate.decide("1.1.1.1")).toBe("per-ip");
  });

  test("a viral link is bounded by the GLOBAL limit, not the per-IP one", () => {
    // This is the reason the global limit exists. A link shared into a Telegram
    // channel is a thousand distinct addresses arriving at once, and a per-IP
    // cap lets every one of them take its full personal allowance — so without
    // a process-wide budget, "2 per IP" would still mean thousands of seeds a
    // minute, each four statements deep, all queued against the same five
    // connections the study loop needs.
    const gate = createDemoGate({ perIpPerMinute: 2, globalPerMinute: 25 });

    let admitted = 0;
    let perIpRefusals = 0;
    let globalRefusals = 0;
    for (let i = 0; i < 5_000; i += 1) {
      const decision = gate.decide(`viral-${i}.example`);
      if (decision === "ok") admitted += 1;
      else if (decision === "per-ip") perIpRefusals += 1;
      else globalRefusals += 1;
    }

    expect(admitted).toBe(25);
    // The flood is refused globally, not per-address, because every address is
    // new and therefore within its personal allowance.
    expect(globalRefusals).toBeGreaterThan(perIpRefusals);
  });

  test("the global budget is shared, not per address", () => {
    const gate = createDemoGate({ perIpPerMinute: 5, globalPerMinute: 3 });
    expect(gate.decide("a")).toBe("ok");
    expect(gate.decide("b")).toBe("ok");
    expect(gate.decide("c")).toBe("ok");
    // Each of these is a first-time address, so nothing is per-IP limited —
    // the budget is simply spent.
    expect(gate.decide("d")).toBe("global");
    expect(gate.decide("e")).toBe("global");
  });

  test("a per-IP refusal does not spend the global budget", () => {
    // Otherwise one abusive address could exhaust the budget that real
    // visitors are waiting on — which would turn an attack into an outage.
    const gate = createDemoGate({ perIpPerMinute: 1, globalPerMinute: 2 });
    gate.decide("abuser");
    for (let i = 0; i < 20; i += 1) gate.decide("abuser");
    expect(gate.decide("abuser")).toBe("per-ip");
    // The global budget still has room for a real visitor.
    expect(gate.decide("real-visitor")).toBe("ok");
  });

  test("retry hints are actionable, never zero", () => {
    const gate = createDemoGate({ perIpPerMinute: 1, globalPerMinute: 1 });
    gate.decide("a");
    expect(gate.decide("a")).toBe("per-ip");
    expect(gate.retryAfterSeconds("a")).toBeGreaterThan(0);

    expect(gate.decide("b")).toBe("global");
    expect(gate.globalRetryAfterSeconds()).toBeGreaterThan(0);
  });

  test("an unlimited address reports no wait", () => {
    const gate = createDemoGate({ perIpPerMinute: 2, globalPerMinute: 25 });
    gate.decide("fresh");
    // Not limited, so there is nothing to wait for. A `Retry-After: 0` here
    // would invite an immediate retry loop from the client.
    expect(gate.retryAfterSeconds("someone-else")).toBe(0);
  });

  test("the budget refills as the window slides", async () => {
    const gate = createDemoGate({
      perIpPerMinute: 1,
      globalPerMinute: 2,
      windowMs: 30,
    });
    gate.decide("a");
    gate.decide("b");
    expect(gate.decide("c")).toBe("global");

    await Bun.sleep(50);
    expect(gate.decide("d")).toBe("ok");
  });

  test("reset clears both budgets", () => {
    const gate = createDemoGate({ perIpPerMinute: 1, globalPerMinute: 1 });
    gate.decide("a");
    expect(gate.decide("b")).toBe("global");
    gate.reset();
    expect(gate.decide("b")).toBe("ok");
  });
});
