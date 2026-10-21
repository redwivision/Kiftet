/**
 * A running server for integration tests, backed by an in-process Postgres.
 *
 * The unit tests prove the pure helpers; this proves the *wiring* — that the
 * routes, the schema and the SQL agree. It mounts the real routers and the real
 * auth middleware on a real Express app listening on a real socket, and drives
 * it with `fetch`, so a test sees what a client sees (status codes, JSON
 * bodies, the `X-Request-Id` header) rather than a mocked handler's internals.
 *
 * The database is PGlite (see packages/db/src/test-db.ts): real Postgres, no
 * network, no secrets. Migrations are applied from the repository's own SQL
 * files, so a schema change that never made it into a migration fails here
 * exactly as it would in production.
 *
 * The middleware order mirrors apps/server/src/index.ts for the launch path.
 * It is not the whole server on purpose: the health probes, CORS and static
 * assets are exercised elsewhere and would only add noise.
 */

import { createTestDb, type TestDatabase } from "@kiftet/db/test-db";
import express from "express";
import { requireAuth } from "../auth-middleware";
import { errorMiddleware } from "../error-handler";
import { requestLogger } from "../lib/http-log";
import { requestIdMiddleware } from "../lib/request-id";
import demoRouter from "../routes/demo";
import studyRouter from "../routes/study";
import { __resetDbForTests, __setDbForTests } from "../services";

export type TestServer = {
  baseUrl: string;
  db: TestDatabase;
  close: () => Promise<void>;
};

export async function startTestServer(): Promise<TestServer> {
  const db = await createTestDb();
  __setDbForTests(db);

  const app = express();
  // Same order as production: id first, then the access log, then the body
  // parser, then the routes. An error thrown anywhere lands in the shared
  // error middleware, so a 500 is checked against the real handler too.
  app.use(requestIdMiddleware());
  app.use(requestLogger());
  app.use(express.json({ limit: "256kb" }));
  app.use("/api/demo", demoRouter);
  app.use("/api", requireAuth, studyRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  app.use(errorMiddleware);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("test server did not bind a port");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    db,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      __resetDbForTests();
      await db.$close();
    },
  };
}

/**
 * Create a demo user, textbook, chapter and concept set directly, and return
 * the ids. Uses the demo path's own shape (a `kind: "demo"` user, a
 * pre-extracted chapter) so the study routes' ownership checks pass without a
 * real auth session — which the harness cannot mint, because Better Auth is
 * bound to the production pool at import time.
 */
export async function seedChapter(
  db: TestDatabase,
  options: { concepts?: string[]; extracted?: boolean } = {},
): Promise<{ userId: string; textbookId: string; chapterId: string }> {
  const { user, textbook, chapter, conceptNode } = await import(
    "@kiftet/db/schema"
  );
  const concepts = options.concepts ?? [
    "Photosynthesis converts light energy into chemical energy.",
    "Chlorophyll absorbs light most strongly in the blue and red bands.",
    "The light-dependent reactions split water and release oxygen.",
  ];
  const userId = crypto.randomUUID();
  const textbookId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();

  await db.insert(user).values({
    id: userId,
    name: "Test Student",
    email: `${userId}@demo.kiftet.test`,
    emailVerified: true,
    kind: "demo",
  });
  await db.insert(textbook).values({
    id: textbookId,
    ownerId: userId,
    title: "Test Textbook",
    subject: "Biology",
    language: "en",
  });
  await db.insert(chapter).values({
    id: chapterId,
    textbookId,
    title: "Test Chapter",
    rawText: "Photosynthesis is the process by which plants make food.",
    extractedAt: options.extracted === false ? null : new Date(),
  });
  await db.insert(conceptNode).values(
    concepts.map((conceptText, i) => ({
      id: crypto.randomUUID(),
      chapterId,
      conceptText,
      isMisconception: false,
      weight: 1,
      sortOrder: i,
    })),
  );

  return { userId, textbookId, chapterId };
}

/** A fetch that carries the demo identity header the study routes accept. */
export function asUser(baseUrl: string, userId: string) {
  return (path: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-demo-user-id": userId,
        ...(init.headers ?? {}),
      },
    });
}
