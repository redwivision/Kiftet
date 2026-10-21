import { describe, expect, test } from "bun:test";

import {
  requestIdMiddleware,
  resolveRequestId,
  sanitizeRequestId,
} from "./request-id";

describe("sanitizeRequestId", () => {
  test("accepts a plain uuid", () => {
    const id = "3f1a2b4c-5d6e-7f80-9a1b-2c3d4e5f6071";
    expect(sanitizeRequestId(id)).toBe(id);
  });

  test("accepts the punctuation real id schemes use", () => {
    expect(sanitizeRequestId("trace:abc_123.def-ghi/jkl+1")).toBe(
      "trace:abc_123.def-ghi/jkl+1",
    );
  });

  test("trims surrounding whitespace", () => {
    expect(sanitizeRequestId("  abc123  ")).toBe("abc123");
  });

  test("rejects an empty or whitespace-only value", () => {
    expect(sanitizeRequestId("")).toBeNull();
    expect(sanitizeRequestId("   ")).toBeNull();
  });

  test("rejects a non-string", () => {
    expect(sanitizeRequestId(undefined)).toBeNull();
    expect(sanitizeRequestId(["a"])).toBeNull();
    expect(sanitizeRequestId(42)).toBeNull();
  });

  test("rejects a newline, which would forge a log line", () => {
    expect(sanitizeRequestId("good\nlevel=error injected")).toBeNull();
    expect(sanitizeRequestId("good\r\nbad")).toBeNull();
  });

  test("rejects other control characters and spaces", () => {
    expect(sanitizeRequestId("has space")).toBeNull();
    expect(sanitizeRequestId("tab\there")).toBeNull();
    expect(sanitizeRequestId("bell\u0007")).toBeNull();
  });

  test("rejects an over-long value (a log-flood lever)", () => {
    expect(sanitizeRequestId("a".repeat(201))).toBeNull();
    expect(sanitizeRequestId("a".repeat(200))).toBe("a".repeat(200));
  });

  test("rejects a value that would need escaping in JSON", () => {
    expect(sanitizeRequestId('{"injected":true}')).toBeNull();
    expect(sanitizeRequestId('quote"here')).toBeNull();
  });
});

describe("resolveRequestId", () => {
  test("prefers a usable inbound id", () => {
    expect(resolveRequestId("inbound-123")).toBe("inbound-123");
  });

  test("mints a fresh id when the inbound one is unusable", () => {
    expect(resolveRequestId("bad\nvalue", () => "minted")).toBe("minted");
    expect(resolveRequestId(undefined, () => "minted")).toBe("minted");
  });

  test("mints a uuid by default", () => {
    expect(resolveRequestId(undefined)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("requestIdMiddleware", () => {
  function run(headers: Record<string, unknown>) {
    const req: { headers: Record<string, unknown>; requestId?: string } = {
      headers,
    };
    const set: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        set[name] = value;
      },
    };
    let nexted = false;
    requestIdMiddleware()(req, res, () => {
      nexted = true;
    });
    return { req, set, nexted };
  }

  test("adopts an inbound id and echoes it back", () => {
    const { req, set, nexted } = run({ "x-request-id": "abc-123" });
    expect(req.requestId).toBe("abc-123");
    expect(set["X-Request-Id"]).toBe("abc-123");
    expect(nexted).toBe(true);
  });

  test("mints an id when the header is absent and still echoes it", () => {
    const { req, set, nexted } = run({});
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(set["X-Request-Id"]).toBe(req.requestId);
    expect(nexted).toBe(true);
  });

  test("a forged header value is replaced, not adopted", () => {
    const { req, set } = run({ "x-request-id": "evil\ninjected" });
    expect(req.requestId).not.toBe("evil\ninjected");
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(set["X-Request-Id"]).toBe(req.requestId);
  });
});
