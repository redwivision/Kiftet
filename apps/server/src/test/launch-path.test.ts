import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  asUser,
  seedChapter,
  startTestServer,
  type TestServer,
} from "./harness";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

describe("launch path against a real database", () => {
  test("POST /api/demo/start creates a real, usable demo room", async () => {
    const res = await fetch(`${server.baseUrl}/api/demo/start`, {
      method: "POST",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { userId: string; chapterId: string };
    expect(body.userId).toBeString();
    expect(body.chapterId).toBeString();

    // The rows really landed, with the FK chain intact.
    const { user, chapter, conceptNode } = await import("@kiftet/db/schema");
    const { eq } = await import("drizzle-orm");
    const users = await server.db
      .select()
      .from(user)
      .where(eq(user.id, body.userId));
    expect(users).toHaveLength(1);
    expect(users[0]?.kind).toBe("demo");
    const concepts = await server.db
      .select()
      .from(conceptNode)
      .where(eq(conceptNode.chapterId, body.chapterId));
    expect(concepts.length).toBeGreaterThan(0);
    const chapters = await server.db
      .select()
      .from(chapter)
      .where(eq(chapter.id, body.chapterId));
    expect(chapters[0]?.extractedAt).not.toBeNull();
  });

  test("a seeded chapter starts a session, answers, and produces a result", async () => {
    const { userId, chapterId } = await seedChapter(server.db);
    const call = asUser(server.baseUrl, userId);

    const startRes = await call("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify({ chapterId }),
    });
    expect(startRes.status).toBe(201);
    const { sessionId } = (await startRes.json()) as { sessionId: string };
    expect(sessionId).toBeString();

    const sessionRes = await call(`/api/sessions/${sessionId}`);
    expect(sessionRes.status).toBe(200);

    const recallRes = await call(`/api/sessions/${sessionId}/recall`, {
      method: "POST",
      body: JSON.stringify({
        transcriptText:
          "Photosynthesis turns light energy into chemical energy in plants.",
        attemptId: crypto.randomUUID(),
      }),
    });
    expect(recallRes.status).toBe(200);

    const resultRes = await call(`/api/sessions/${sessionId}/result`);
    expect(resultRes.status).toBe(200);
    const result = (await resultRes.json()) as { before: unknown };
    expect(result).toHaveProperty("before");
  });

  test("every response carries a request id", async () => {
    const res = await fetch(`${server.baseUrl}/health-not-found`);
    expect(res.headers.get("x-request-id")).toBeString();
  });

  test("an inbound request id is echoed back", async () => {
    const res = await fetch(`${server.baseUrl}/api/nope`, {
      headers: { "x-request-id": "trace-integration-1" },
    });
    expect(res.headers.get("x-request-id")).toBe("trace-integration-1");
    // Unauthenticated, so the auth gate answers 401 before the 404 catch-all —
    // the point of the test is that the id survives the whole chain.
    expect(res.status).toBe(401);
  });

  test("an unknown API path answers JSON, not HTML", async () => {
    const { userId } = await seedChapter(server.db);
    const call = asUser(server.baseUrl, userId);
    const res = await call("/api/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
