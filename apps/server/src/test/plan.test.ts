import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  attempt,
  chapter,
  studyPosition,
  studySession,
  textbook,
  user,
} from "@kiftet/db/schema";

import { asUser, startTestServer, type TestServer } from "./harness";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

type Topic = { path: string; title: string; page: number | null };

async function seedStudent(options?: {
  topics?: Topic[];
  chapters?: { title: string; topics?: Topic[] }[];
}): Promise<{
  userId: string;
  textbookId: string;
  chapterIds: [string, ...string[]];
}> {
  const userId = crypto.randomUUID();
  const textbookId = crypto.randomUUID();

  await server.db.insert(user).values({
    id: userId,
    name: "Student",
    email: `${userId}@plan.kiftet.test`,
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

  const chapterIds: string[] = [];
  const chapters = options?.chapters ?? [{ title: "Unit 3: Photosynthesis" }];
  for (const entry of chapters) {
    const chapterId = crypto.randomUUID();
    chapterIds.push(chapterId);
    await server.db.insert(chapter).values({
      id: chapterId,
      textbookId,
      title: entry.title,
      rawText: "Plants make food from light.",
      topics: entry.topics ?? options?.topics ?? null,
    });
  }

  const [firstChapterId, ...remainingChapterIds] = chapterIds;
  if (!firstChapterId) throw new Error("A planner test needs a chapter");
  return {
    userId,
    textbookId,
    chapterIds: [firstChapterId, ...remainingChapterIds],
  };
}

/** A completed study session with one attempt that recorded a mastery map. */
async function seedAttempt(
  userId: string,
  chapterId: string,
  mastery: Record<string, number>,
  createdAt: Date,
) {
  const sessionId = crypto.randomUUID();
  await server.db.insert(studySession).values({
    id: sessionId,
    userId,
    chapterId,
    startedAt: createdAt,
    completedAt: createdAt,
  });
  await server.db.insert(attempt).values({
    id: crypto.randomUUID(),
    sessionId,
    stage: "recall",
    gapsIdentified: { covered: [], missing: [], misconceptions: [], mastery },
    createdAt,
  });
}

async function setPosition(
  _userId: string,
  textbookId: string,
  chapterId: string,
  topicPath: string | null,
  updatedAt: Date,
) {
  await server.db.insert(studyPosition).values({
    id: crypto.randomUUID(),
    textbookId,
    chapterId,
    topicPath,
    updatedAt,
  });
}

type PlanBody = {
  minutes: number;
  book: { textbookId: string; title: string; subject: string } | null;
  learn: {
    chapterId: string;
    chapterTitle: string;
    sectionPath: string | null;
    sectionTitle: string | null;
    remainingInChapter: number;
  } | null;
  review: {
    chapterId: string;
    chapterTitle: string;
    concept: string;
    level: number;
    lastCheckedAt: string;
  }[];
  reviewReason: "preference" | "exam" | null;
  examDate: string | null;
  positioned: boolean;
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

describe("today's plan", () => {
  test("a student with nothing placed gets an honest empty plan", async () => {
    const { userId } = await seedStudent();
    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlanBody;
    expect(body.positioned).toBe(false);
    expect(body.learn).toBeNull();
    expect(body.review).toEqual([]);
    expect(body.minutes).toBe(20);
  });

  test("the plan continues where the student left off", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent({
      chapters: [
        {
          title: "Unit 3: Photosynthesis",
          topics: [
            { path: "3.1", title: "3.1 The light reaction", page: 41 },
            { path: "3.2", title: "3.2 The Calvin cycle", page: 48 },
            { path: "3.3", title: "3.3 Limiting factors", page: 55 },
          ],
        },
      ],
    });
    await setPosition(userId, textbookId, chapterIds[0], "3.1", daysAgo(1));

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.positioned).toBe(true);
    expect(body.book?.title).toBe("Biology");
    expect(body.learn?.sectionPath).toBe("3.2");
    expect(body.learn?.sectionTitle).toBe("3.2 The Calvin cycle");
    expect(body.learn?.remainingInChapter).toBe(2);
  });

  test("the plan reaches the whole chapter when the position does not match", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent({
      chapters: [
        {
          title: "Unit 3: Photosynthesis",
          topics: [
            { path: "3.1", title: "3.1 The light reaction", page: 41 },
            { path: "3.2", title: "3.2 The Calvin cycle", page: 48 },
          ],
        },
      ],
    });
    await setPosition(userId, textbookId, chapterIds[0], "9.9", daysAgo(1));

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.learn?.sectionPath).toBeNull();
    expect(body.learn?.remainingInChapter).toBe(2);
  });

  test("a chapter the student has finished does not offer more", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent({
      chapters: [
        {
          title: "Unit 3: Photosynthesis",
          topics: [
            { path: "3.1", title: "3.1 The light reaction", page: 41 },
            { path: "3.2", title: "3.2 The Calvin cycle", page: 48 },
          ],
        },
      ],
    });
    await setPosition(userId, textbookId, chapterIds[0], "3.2", daysAgo(1));

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.learn?.sectionPath).toBeNull();
    expect(body.learn?.remainingInChapter).toBe(0);
  });

  test("review is absent when the student asked for none and has no exam", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent();
    await setPosition(userId, textbookId, chapterIds[0], null, daysAgo(1));
    await seedAttempt(
      userId,
      chapterIds[0],
      { "Cell membrane": 2 },
      daysAgo(3),
    );

    await asUser(server.baseUrl, userId)("/api/placement/preferences", {
      method: "PUT",
      body: JSON.stringify({ reviewPreference: "none" }),
    });

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.review).toEqual([]);
    expect(body.reviewReason).toBeNull();
  });

  test("an exam date brings review back, and says so", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent();
    await setPosition(userId, textbookId, chapterIds[0], null, daysAgo(1));
    await seedAttempt(
      userId,
      chapterIds[0],
      { "Cell membrane": 2 },
      daysAgo(3),
    );

    await asUser(server.baseUrl, userId)("/api/placement/preferences", {
      method: "PUT",
      body: JSON.stringify({
        reviewPreference: "none",
        examDate: "2030-06-01",
      }),
    });

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.review.length).toBe(1);
    expect(body.review[0]?.concept).toBe("Cell membrane");
    expect(body.reviewReason).toBe("exam");
    expect(body.examDate).toBe("2030-06-01");
  });

  test("the wrongest concept comes first, then the stalest", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent();
    await setPosition(userId, textbookId, chapterIds[0], null, daysAgo(1));
    await seedAttempt(
      userId,
      chapterIds[0],
      { "Wrong one": 2, "Shaky one": 1 },
      daysAgo(4),
    );
    await asUser(server.baseUrl, userId)("/api/placement/preferences", {
      method: "PUT",
      body: JSON.stringify({ reviewPreference: "heavy", dailyMinutes: 45 }),
    });

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.review.map((r) => r.concept)).toEqual([
      "Wrong one",
      "Shaky one",
    ]);
    expect(body.reviewReason).toBe("preference");
  });

  test("a concept that was just checked is not offered again", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent();
    await setPosition(userId, textbookId, chapterIds[0], null, daysAgo(1));
    await seedAttempt(userId, chapterIds[0], { "Just now": 2 }, daysAgo(0));

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.review).toEqual([]);
  });

  test("the pretest is not mistaken for what the student knows now", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent();
    await setPosition(userId, textbookId, chapterIds[0], null, daysAgo(1));

    const sessionId = crypto.randomUUID();
    await server.db.insert(studySession).values({
      id: sessionId,
      userId,
      chapterId: chapterIds[0],
      startedAt: daysAgo(5),
      completedAt: daysAgo(5),
    });
    await server.db.insert(attempt).values({
      id: crypto.randomUUID(),
      sessionId,
      stage: "pretest",
      gapsIdentified: {
        covered: [],
        missing: [],
        misconceptions: [],
        mastery: { "Never studied": 2 },
      },
      createdAt: daysAgo(5),
    });

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.review).toEqual([]);
  });

  test("a heavy review preference brings more than one thing back", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent();
    await setPosition(userId, textbookId, chapterIds[0], null, daysAgo(1));
    await seedAttempt(
      userId,
      chapterIds[0],
      { A: 2, B: 1, C: 3, D: 1 },
      daysAgo(4),
    );

    await asUser(server.baseUrl, userId)("/api/placement/preferences", {
      method: "PUT",
      body: JSON.stringify({ reviewPreference: "heavy", dailyMinutes: 60 }),
    });

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.review.length).toBe(3);
  });

  test("a short day brings back less", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent();
    await setPosition(userId, textbookId, chapterIds[0], null, daysAgo(1));
    await seedAttempt(
      userId,
      chapterIds[0],
      { A: 2, B: 1, C: 3, D: 1 },
      daysAgo(4),
    );

    await asUser(server.baseUrl, userId)("/api/placement/preferences", {
      method: "PUT",
      body: JSON.stringify({ reviewPreference: "heavy", dailyMinutes: 20 }),
    });

    const res = await asUser(server.baseUrl, userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.minutes).toBe(20);
    expect(body.review.length).toBe(1);
  });

  test("another student's plan is not visible", async () => {
    const { userId, textbookId, chapterIds } = await seedStudent();
    await setPosition(userId, textbookId, chapterIds[0], null, daysAgo(1));
    const other = await seedStudent();

    const res = await asUser(server.baseUrl, other.userId)("/api/plan/today");
    const body = (await res.json()) as PlanBody;
    expect(body.positioned).toBe(false);
    expect(body.book).toBeNull();
  });
});
