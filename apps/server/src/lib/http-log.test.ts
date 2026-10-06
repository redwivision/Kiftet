import { describe, expect, test } from "bun:test";

import { createRequestLog, type RequestLogState } from "./http-log";

/** Captures what the module would have written, and lets us drive the clock. */
function harness() {
  const lines: string[] = [];
  let offset = 0;
  const realNow = Date.now;
  Date.now = () => realNow() + offset;
  const state = createRequestLog((line) => lines.push(line));
  const advance = (ms: number) => {
    offset += ms;
  };
  const restore = () => {
    Date.now = realNow;
  };
  return { lines, state, advance, restore };
}

/**
 * Reserve until the ceiling refuses. Note the refusal that ends the loop is
 * itself a suppressed line, so the count starts at 1, not 0.
 */
function untilRefused(
  state: RequestLogState,
  kind: "ordinary" | "interesting",
) {
  let granted = 0;
  while (state.tryReserve(kind)) granted += 1;
  return granted;
}

describe("createRequestLog", () => {
  test("a quiet app logs nothing and reports nothing", () => {
    const h = harness();
    try {
      for (let i = 0; i < 500; i += 1) h.state.tryReserve("ordinary");
      expect(h.lines).toEqual([]);
    } finally {
      h.restore();
    }
  });

  test("the ordinary ceiling is enforced", () => {
    const h = harness();
    try {
      const granted = untilRefused(h.state, "ordinary");
      expect(granted).toBeGreaterThan(0);
      expect(granted).toBeLessThanOrEqual(50);
      expect(h.state.tryReserve("ordinary")).toBe(false);
    } finally {
      h.restore();
    }
  });

  test("a refused line is counted, not forgotten", () => {
    const h = harness();
    try {
      untilRefused(h.state, "ordinary");
      // 1 from the refusal that ended untilRefused, plus 7 more.
      for (let i = 0; i < 7; i += 1) h.state.tryReserve("ordinary");
      expect(h.state.snapshot().suppressed).toBe(8);
    } finally {
      h.restore();
    }
  });

  test("the suppressed count is reported once the interval passes", () => {
    const h = harness();
    try {
      untilRefused(h.state, "ordinary");
      for (let i = 0; i < 42; i += 1) h.state.tryReserve("ordinary");
      expect(h.lines).toEqual([]);

      h.advance(10_000);
      // Any reservation at all is enough to flush — including one that is
      // itself refused, which is what happens while the burst continues.
      h.state.tryReserve("ordinary");

      expect(h.lines).toHaveLength(1);
      expect(h.lines[0]).toContain("suppressed");
      expect(h.lines[0]).toContain("43");
      expect(h.lines[0]).toContain("NOT idle");
    } finally {
      h.restore();
    }
  });

  test("a burst that stops mid-interval still reports", () => {
    const h = harness();
    try {
      untilRefused(h.state, "ordinary");
      h.state.tryReserve("ordinary");
      h.state.tryReserve("ordinary");

      // The traffic stops. No second boundary is ever crossed, so a report
      // gated on rollover never arrives — the log just goes quiet at the exact
      // moment an operator needs it to explain itself.
      h.advance(11_000);
      h.state.flush();

      expect(h.lines).toHaveLength(1);
      expect(h.lines[0]).toContain("NOT idle");
    } finally {
      h.restore();
    }
  });

  test("the report is not repeated without new losses", () => {
    const h = harness();
    try {
      untilRefused(h.state, "ordinary");
      h.advance(10_000);
      h.state.flush();
      expect(h.lines).toHaveLength(1);

      h.advance(10_000);
      h.state.flush();
      expect(h.lines).toHaveLength(1);
    } finally {
      h.restore();
    }
  });

  test("interesting lines get their own, higher ceiling", () => {
    const h = harness();
    try {
      const ordinary = untilRefused(h.state, "ordinary");

      h.advance(1_000);
      const interesting = untilRefused(h.state, "interesting");

      // Errors must survive a flood, but not without bound — a 4xx flood is
      // as good a lever as a 2xx flood.
      expect(interesting).toBeGreaterThan(ordinary);
      expect(interesting).toBeLessThanOrEqual(200);
    } finally {
      h.restore();
    }
  });

  test("spending the ordinary budget does not cost interesting lines", () => {
    const h = harness();
    try {
      untilRefused(h.state, "ordinary");
      expect(h.state.tryReserve("interesting")).toBe(true);
    } finally {
      h.restore();
    }
  });

  test("the budget refreshes every second", () => {
    const h = harness();
    try {
      untilRefused(h.state, "ordinary");
      expect(h.state.tryReserve("ordinary")).toBe(false);

      h.advance(1_000);
      expect(h.state.tryReserve("ordinary")).toBe(true);
    } finally {
      h.restore();
    }
  });

  test("sampling keeps the most recent 1-in-N", () => {
    const h = harness();
    try {
      const seen = Array.from({ length: 20 }, () => h.state.shouldSample());
      // Exactly one line per twenty, and it is the last of each block rather
      // than the first, so the tail of a burst is what is kept.
      expect(seen.filter(Boolean)).toHaveLength(1);
      expect(seen[19]).toBe(true);
    } finally {
      h.restore();
    }
  });

  test("reset returns to a clean state", () => {
    const h = harness();
    try {
      untilRefused(h.state, "ordinary");
      h.state.reset();
      expect(h.state.snapshot()).toEqual({ emitted: 0, suppressed: 0 });
      expect(h.state.tryReserve("ordinary")).toBe(true);
    } finally {
      h.restore();
    }
  });
});
