import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { aiUsage } from "@kiftet/db/schema";

import { createTestDb, type TestDatabase } from "@kiftet/db/test-db";
import { eq, sql } from "drizzle-orm";
import {
  consumeAdmission,
  readAdmissionState,
  settleAdmission,
} from "../ai/admission-store";
import { consumeAiRequest } from "../lib/ai-quota-store";
import { __resetDbForTests, __setDbForTests } from "../services";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDb();
  // The admission/quota stores read through getDb(), so point it here. The
  // in-memory admission seam installed by the global preload is bypassed on
  // purpose: this test is about the SQL, not the arithmetic.
  __setDbForTests(db);
});

afterAll(async () => {
  __resetDbForTests();
  await db.$close();
});

describe("ai_admission table", () => {
  const config = {
    perMinute: 3,
    circuitFailures: 3,
    circuitCooldownMs: 30_000,
  };

  test("a bucket admits exactly its allowance, then refuses", async () => {
    await db.execute(sql`delete from ai_admission`);
    const now = Date.now();
    const kinds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const decision = await consumeAdmission("gemini", config, now);
      kinds.push(decision.kind === "admit" ? "admit" : decision.reason);
    }
    expect(kinds).toEqual([
      "admit",
      "admit",
      "admit",
      "provider-busy",
      "provider-busy",
    ]);
  });

  test("three provider failures open the breaker in the shared row", async () => {
    await db.execute(sql`delete from ai_admission`);
    let now = Date.now();
    for (let i = 0; i < 3; i += 1) {
      const decision = await consumeAdmission("groq", config, now);
      if (decision.kind === "admit") {
        await settleAdmission("groq", "provider-failure", config, now);
      }
      now += 20_000; // buy a token back between failures
    }
    const state = await readAdmissionState("groq", config, Date.now());
    expect(state.consecutiveFailures).toBe(3);
    expect(state.openUntil).toBeGreaterThan(0);

    const next = await consumeAdmission("groq", config, Date.now());
    expect(next.kind).toBe("refuse");
    if (next.kind === "refuse") expect(next.reason).toBe("circuit-open");
  });

  test("a success resets the failure streak", async () => {
    await db.execute(sql`delete from ai_admission`);
    const now = Date.now();
    await consumeAdmission("gemini", config, now);
    await settleAdmission("gemini", "provider-failure", config, now);
    await consumeAdmission("gemini", config, now);
    await settleAdmission("gemini", "success", config, now);
    const state = await readAdmissionState("gemini", config, now);
    expect(state.consecutiveFailures).toBe(0);
  });
});

describe("ai_usage table", () => {
  test("counts requests per owner per clock-minute and enforces the limit", async () => {
    const { user } = await import("@kiftet/db/schema");
    const userId = crypto.randomUUID();
    await db.insert(user).values({
      id: userId,
      name: "Quota Student",
      email: `${userId}@quota.test`,
    });

    const minute = new Date(60_000);
    let allowed = 0;
    for (let i = 0; i < 10; i += 1) {
      const result = await consumeAiRequest(
        db as unknown as Parameters<typeof consumeAiRequest>[0],
        userId,
        3,
        minute,
      );
      if (result.allowed) allowed += 1;
    }
    expect(allowed).toBe(3);

    const rows = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(3);
  });
});
