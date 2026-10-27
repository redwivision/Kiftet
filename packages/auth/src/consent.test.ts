import { expect, test } from "bun:test";
import type { Database } from "@kiftet/db";
import { account, session, user } from "@kiftet/db/schema/auth";
import { chapter, studySession, textbook } from "@kiftet/db/schema/study";
import { createTestDb } from "@kiftet/db/test-db";
import { eq } from "drizzle-orm";

import { createAuth, TERMS_VERSION } from "./index";

const env = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-not-used-in-tests-test-secret",
  CORS_ORIGIN: "http://localhost:3000",
  REQUIRE_EMAIL_VERIFICATION: false,
  AUTH_EMAIL_TRANSPORT: "console",
};

const password = "correct-horse-battery-staple";

async function signUp(auth: ReturnType<typeof createAuth>, email: string) {
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "Test Student" }),
    }),
  );
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  return { response, cookie };
}

test("sign-up records the terms version the student accepted", async () => {
  const db = await createTestDb();
  try {
    const auth = createAuth(env, db as unknown as Database, []);
    const { response } = await signUp(auth, "consent@example.com");
    expect(response.status).toBe(200);

    const [row] = await db
      .select()
      .from(user)
      .where(eq(user.email, "consent@example.com"));
    expect(row?.termsVersion).toBe(TERMS_VERSION);
    expect(row?.termsAcceptedAt).toBeInstanceOf(Date);
  } finally {
    await db.$close();
  }
}, 30_000);

test("a student can delete their account and all of their study data", async () => {
  const db = await createTestDb();
  try {
    const auth = createAuth(env, db as unknown as Database, []);
    const { response, cookie } = await signUp(auth, "leaving@example.com");
    expect(response.status).toBe(200);

    const [row] = await db
      .select()
      .from(user)
      .where(eq(user.email, "leaving@example.com"));
    if (!row) throw new Error("sign-up did not create a user");

    await db.insert(textbook).values({
      id: "book-leaving",
      ownerId: row.id,
      title: "Leaving book",
      subject: "Biology",
    });
    await db.insert(chapter).values({
      id: "chapter-leaving",
      textbookId: "book-leaving",
      title: "Chapter one",
      rawText: "Cells.",
    });
    await db.insert(studySession).values({
      id: "session-leaving",
      userId: row.id,
      chapterId: "chapter-leaving",
    });

    const deletion = await auth.handler(
      new Request("http://localhost:3000/api/auth/delete-user", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookie ?? "",
        },
        body: JSON.stringify({ password }),
      }),
    );
    expect(deletion.status).toBe(200);

    expect(
      await db.select().from(user).where(eq(user.id, row.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(account).where(eq(account.userId, row.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(session).where(eq(session.userId, row.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(textbook).where(eq(textbook.ownerId, row.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(chapter).where(eq(chapter.id, "chapter-leaving")),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(studySession)
        .where(eq(studySession.id, "session-leaving")),
    ).toHaveLength(0);
  } finally {
    await db.$close();
  }
}, 30_000);
