import { describe, expect, test } from "bun:test";
import express from "express";
import { resolveTrustProxy } from "./trust-proxy";

describe("resolveTrustProxy", () => {
  test("empty in production defaults to one hop", () => {
    expect(resolveTrustProxy("", true)).toBe(1);
    expect(resolveTrustProxy(undefined, true)).toBe(1);
  });

  test("empty in development trusts only loopback", () => {
    expect(resolveTrustProxy("", false)).toBe("loopback");
  });

  test("a positive integer becomes a numeric hop count", () => {
    expect(resolveTrustProxy("2", true)).toBe(2);
    expect(resolveTrustProxy(" 3 ", true)).toBe(3);
  });

  test("false and zero disable trust", () => {
    expect(resolveTrustProxy("false", true)).toBe(false);
    expect(resolveTrustProxy("FALSE", true)).toBe(false);
    expect(resolveTrustProxy("0", true)).toBe(false);
  });

  test("true trusts everything", () => {
    expect(resolveTrustProxy("true", true)).toBe(true);
  });

  test("named subnets and CIDRs pass through as expressions", () => {
    expect(resolveTrustProxy("loopback", true)).toBe("loopback");
    expect(resolveTrustProxy("10.0.0.0/8", true)).toBe("10.0.0.0/8");
    expect(resolveTrustProxy("loopback, linklocal", true)).toBe(
      "loopback, linklocal",
    );
  });
});

// The whole point of the setting is what `req.ip` becomes, so assert that
// against a real Express app rather than only the parsed value.
describe("trust proxy changes what req.ip resolves to", () => {
  async function ipWith(trust: ReturnType<typeof resolveTrustProxy>) {
    const app = express();
    app.set("trust proxy", trust);
    app.get("/ip", (req, res) => res.send(req.ip));
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ip`, {
        headers: { "X-Forwarded-For": "1.2.3.4" },
      });
      return await res.text();
    } finally {
      server.close();
    }
  }

  test("trusting one hop honours the forwarded client address", async () => {
    expect(await ipWith(1)).toBe("1.2.3.4");
  });

  test("loopback trust honours the header from a loopback peer (a local proxy)", async () => {
    // The test connects from 127.0.0.1, which IS loopback, so this is the exact
    // case dev mode is built for: a local reverse proxy in front of the app.
    expect(await ipWith("loopback")).toBe("1.2.3.4");
  });

  test("disabling trust ignores the header entirely", async () => {
    expect(await ipWith(false)).not.toBe("1.2.3.4");
  });
});
