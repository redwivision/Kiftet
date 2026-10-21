import { describe, expect, test } from "bun:test";
import type pg from "pg";
import { connectWithRetry } from "./index";

// A minimal stand-in: connectWithRetry only ever calls `.connect()`.
function asPool(connect: () => Promise<unknown>): pg.Pool {
  return { connect } as unknown as pg.Pool;
}

describe("connectWithRetry", () => {
  test("returns the client on the first try when the pool is warm", async () => {
    let calls = 0;
    const client = { tag: "client" };
    const pool = asPool(async () => {
      calls += 1;
      return client;
    });
    expect((await connectWithRetry(pool, 4, 0)) as unknown).toBe(client);
    expect(calls).toBe(1);
  });

  test("retries a failing connect and then succeeds", async () => {
    let calls = 0;
    const client = { tag: "client" };
    const pool = asPool(async () => {
      calls += 1;
      if (calls < 3) throw new Error("ECONNREFUSED");
      return client;
    });
    expect((await connectWithRetry(pool, 5, 0)) as unknown).toBe(client);
    expect(calls).toBe(3);
  });

  test("gives up after the bounded number of attempts, surfacing the last error", async () => {
    let calls = 0;
    const pool = asPool(async () => {
      calls += 1;
      throw new Error(`attempt ${calls}`);
    });
    await expect(connectWithRetry(pool, 4, 0)).rejects.toThrow("attempt 4");
    expect(calls).toBe(4);
  });

  test("a non-Error rejection is still thrown as an Error", async () => {
    const pool = asPool(async () => {
      throw "boom";
    });
    await expect(connectWithRetry(pool, 2, 0)).rejects.toThrow("boom");
  });
});
