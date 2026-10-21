import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chapter, studyPosition, textbook, user } from "@kiftet/db/schema";
import { eq } from "drizzle-orm";

import { asUser, startTestServer, type TestServer } from "./harness";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

/**
 * A student with one book, one chapter, and the printed sections inside it.
 * The topics are the book's own contents lines — the same shape the importer
 * posts — because the position has to survive the book being re-read.
 */
async function seedStudentWithBook(options?: {
  topics?: { path: string; title: string; page: number | null }[];
}) {
  const userId = crypto.randomUUID();
  const textbookId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();

  await server.db.insert(user).values({
    id: userId,
    name: "Student",
    email: `${userId}@placement.kiftet.test`,
    emailVerified: true,
    kind: "demo",
  });
  await server.db.insert(textbook).values({
    id: textbookId,
    ownerId: userId,
    title: "Biology",
    subject: "Biology",
    language: "en",
  });
  await server.db.insert(chapter).values({
    id: chapterId,
    textbookId,
    title: "Unit 3: Photosynthesis",
    rawText: "Plants make food from light.",
    topics: options?.topics ?? [
      { path: "3.1", title: "3.1 The light reaction", page: 41 },
      { path: "3.2", title: "3.2 The Calvin cycle", page: 48 },
    ],
  });

  return { userId, textbookId, chapterId };
}

describe("placement preferences", () => {
  test("a student with no preferences gets the defaults", async () => {
    const { userId } = await seedStudentWithBook();
    const res = await asUser(server.baseUrl, userId)("/api/placement");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      preferences: {
        reviewPreference: string;
        examDate: string | null;
        dailyMinutes: number;
        placementDismissed: boolean;
      };
    };
    expect(body.preferences.reviewPreference).toBe("light");
    expect(body.preferences.examDate).toBeNull();
    expect(body.preferences.dailyMinutes).toBe(20);
    expect(body.preferences.placementDismissed).toBe(false);
  });

  test("the student sets how much past they want reviewed", async () => {
    const { userId } = await seedStudentWithBook();
    const res = await asUser(server.baseUrl, userId)(
      "/api/placement/preferences",
      {
        method: "PUT",
        body: JSON.stringify({ reviewPreference: "none" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      preferences: { reviewPreference: string };
    };
    expect(body.preferences.reviewPreference).toBe("none");
  });

  test("an exam date is a real calendar date, not a parseable one", async () => {
    const { userId } = await seedStudentWithBook();

    const missing = await asUser(server.baseUrl, userId)(
      "/api/placement/preferences",
      {
        method: "PUT",
        body: JSON.stringify({ examDate: "2026-07-15" }),
      },
    );
    expect(missing.status).toBe(200);
    const okBody = (await missing.json()) as {
      preferences: { examDate: string };
    };
    expect(okBody.preferences.examDate).toBe("2026-07-15");

    // 13 is not a month. `new Date("2026-13-01")` would roll into March and
    // hand the student an exam they never asked for.
    const impossible = await asUser(server.baseUrl, userId)(
      "/api/placement/preferences",
      {
        method: "PUT",
        body: JSON.stringify({ examDate: "2026-13-01" }),
      },
    );
    expect(impossible.status).toBe(400);

    const notADate = await asUser(server.baseUrl, userId)(
      "/api/placement/preferences",
      {
        method: "PUT",
        body: JSON.stringify({ examDate: "next tuesday" }),
      },
    );
    expect(notADate.status).toBe(400);
  });

  test("twenty minutes is a default, not a rule", async () => {
    const { userId } = await seedStudentWithBook();
    const res = await asUser(server.baseUrl, userId)(
      "/api/placement/preferences",
      {
        method: "PUT",
        body: JSON.stringify({ dailyMinutes: 45 }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      preferences: { dailyMinutes: number };
    };
    expect(body.preferences.dailyMinutes).toBe(45);

    const tooLong = await asUser(server.baseUrl, userId)(
      "/api/placement/preferences",
      {
        method: "PUT",
        body: JSON.stringify({ dailyMinutes: 600 }),
      },
    );
    expect(tooLong.status).toBe(400);
  });

  test("a student can decline to be asked again", async () => {
    const { userId } = await seedStudentWithBook();
    const res = await asUser(server.baseUrl, userId)(
      "/api/placement/preferences",
      {
        method: "PUT",
        body: JSON.stringify({ placementDismissed: true }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      preferences: { placementDismissed: boolean };
    };
    expect(body.preferences.placementDismissed).toBe(true);
  });
});

describe("placement position", () => {
  test("the student says which chapter and section they are in", async () => {
    const { userId, textbookId, chapterId } = await seedStudentWithBook();

    const res = await asUser(server.baseUrl, userId)(
      "/api/placement/position",
      {
        method: "PUT",
        body: JSON.stringify({ textbookId, chapterId, topicPath: "3.2" }),
      },
    );
    expect(res.status).toBe(200);

    const read = await asUser(server.baseUrl, userId)("/api/placement");
    const body = (await read.json()) as {
      books: {
        id: string;
        currentChapterId: string | null;
        currentTopicPath: string | null;
        chapters: { id: string; title: string; topics: { path: string }[] }[];
      }[];
    };
    const book = body.books.find((b) => b.id === textbookId);
    expect(book?.currentChapterId).toBe(chapterId);
    expect(book?.currentTopicPath).toBe("3.2");
    expect(book?.chapters[0]?.topics.map((t) => t.path)).toEqual([
      "3.1",
      "3.2",
    ]);
  });

  test("moving on replaces the position rather than adding a second one", async () => {
    const { userId, textbookId, chapterId } = await seedStudentWithBook();

    await asUser(server.baseUrl, userId)("/api/placement/position", {
      method: "PUT",
      body: JSON.stringify({ textbookId, chapterId, topicPath: "3.1" }),
    });
    await asUser(server.baseUrl, userId)("/api/placement/position", {
      method: "PUT",
      body: JSON.stringify({ textbookId, chapterId, topicPath: "3.2" }),
    });

    const rows = await server.db
      .select()
      .from(studyPosition)
      .where(eq(studyPosition.textbookId, textbookId));
    expect(rows.length).toBe(1);
    expect(rows[0]?.topicPath).toBe("3.2");
  });

  test("a position can be a chapter on its own, for a book with no printed sections", async () => {
    const { userId, textbookId, chapterId } = await seedStudentWithBook({
      topics: [],
    });

    const res = await asUser(server.baseUrl, userId)(
      "/api/placement/position",
      {
        method: "PUT",
        body: JSON.stringify({ textbookId, chapterId }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { topicPath: string | null };
    expect(body.topicPath).toBeNull();
  });

  test("a section the book does not have is refused", async () => {
    const { userId, textbookId, chapterId } = await seedStudentWithBook();

    const res = await asUser(server.baseUrl, userId)(
      "/api/placement/position",
      {
        method: "PUT",
        body: JSON.stringify({ textbookId, chapterId, topicPath: "9.9" }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("another student's book is not a position anyone can claim", async () => {
    const mine = await seedStudentWithBook();
    const theirs = await seedStudentWithBook();

    const res = await asUser(server.baseUrl, mine.userId)(
      "/api/placement/position",
      {
        method: "PUT",
        body: JSON.stringify({
          textbookId: theirs.textbookId,
          chapterId: theirs.chapterId,
          topicPath: "3.1",
        }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("a chapter from another book is refused", async () => {
    const { userId, textbookId } = await seedStudentWithBook();
    const other = await seedStudentWithBook();

    const res = await asUser(server.baseUrl, userId)(
      "/api/placement/position",
      {
        method: "PUT",
        body: JSON.stringify({ textbookId, chapterId: other.chapterId }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("a chapter that is deleted takes the position with it", async () => {
    const { userId, textbookId, chapterId } = await seedStudentWithBook();
    await asUser(server.baseUrl, userId)("/api/placement/position", {
      method: "PUT",
      body: JSON.stringify({ textbookId, chapterId, topicPath: "3.1" }),
    });

    await server.db.delete(chapter).where(eq(chapter.id, chapterId));

    const rows = await server.db
      .select()
      .from(studyPosition)
      .where(eq(studyPosition.textbookId, textbookId));
    expect(rows.length).toBe(0);

    const read = await asUser(server.baseUrl, userId)("/api/placement");
    const body = (await read.json()) as {
      books: {
        id: string;
        currentChapterId: string | null;
        currentTopicPath: string | null;
      }[];
    };
    const book = body.books.find((b) => b.id === textbookId);
    expect(book?.currentChapterId).toBeNull();
    expect(book?.currentTopicPath).toBeNull();
  });
});
