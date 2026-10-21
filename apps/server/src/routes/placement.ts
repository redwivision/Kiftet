import { chapter, studyPosition, textbook, user } from "@kiftet/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { getDb } from "../services";

const router = Router();

/**
 * Where the student is, and how they want their past treated.
 *
 * School is already under way when a student installs the app, so there is no
 * honest default for "where are you" — asking is the only way to know, and
 * the answer changes what the day contains. The two halves live together
 * because they are answered together: a student who is midway through Unit 3
 * and wants their past reviewed is describing one plan, not two settings.
 *
 * The position is per book. A student with a biology book and an economics
 * book is in two places at once, and a book is the same thing as a subject
 * here — which is also the grain the per-subject agent will work at.
 */

const REVIEW_PREFERENCES = ["none", "light", "heavy"] as const;

/** A study day, in minutes. The bounds are the honest ones: long enough to be
 *  worth opening, short enough that twenty minutes is not a wall. */
const MINUTES_MIN = 5;
const MINUTES_MAX = 240;

function db() {
  return getDb();
}

function ownerId(req: Request): string {
  const id = req.authSession?.user.id;
  if (!id) throw new Error("Authenticated user missing from request");
  return id;
}

function ok<T>(res: Response, data: T, status = 200) {
  res.status(status).json(data);
}

function err(res: Response, message: string, status = 400) {
  res.status(status).json({ error: message });
}

export type ReviewPreference = (typeof REVIEW_PREFERENCES)[number];

export type StudyPreferences = {
  reviewPreference: ReviewPreference;
  examDate: string | null;
  dailyMinutes: number;
  placementDismissed: boolean;
};

/**
 * The student's study preferences, with the defaults filled in for a row that
 * predates the columns.
 */
export async function readPreferences(
  owner: string,
): Promise<StudyPreferences> {
  const row = await db()
    .select({
      reviewPreference: user.reviewPreference,
      examDate: user.examDate,
      dailyMinutes: user.dailyMinutes,
      placementDismissed: user.placementDismissed,
    })
    .from(user)
    .where(eq(user.id, owner))
    .limit(1);
  const found = row[0];
  return {
    reviewPreference: found?.reviewPreference ?? "light",
    examDate: found?.examDate ?? null,
    dailyMinutes: found?.dailyMinutes ?? 20,
    placementDismissed: found?.placementDismissed ?? false,
  };
}

/**
 * The student's positions, one per book they have said anything about.
 *
 * This is the planner's read path: it needs to know where the student is
 * without also pulling the whole library's contents down with it.
 */
export type StudyPosition = {
  textbookId: string;
  chapterId: string | null;
  topicPath: string | null;
};

export async function readPositions(owner: string): Promise<StudyPosition[]> {
  const rows = await db()
    .select({
      textbookId: studyPosition.textbookId,
      chapterId: studyPosition.chapterId,
      topicPath: studyPosition.topicPath,
    })
    .from(studyPosition)
    .innerJoin(textbook, eq(studyPosition.textbookId, textbook.id))
    .where(eq(textbook.ownerId, owner));
  return rows.map((row) => ({
    textbookId: row.textbookId,
    chapterId: row.chapterId,
    topicPath: row.chapterId ? row.topicPath : null,
  }));
}

/**
 * A calendar date, as the student typed it.
 *
 * A plain `YYYY-MM-DD`, checked rather than parsed: `new Date("2026-13-01")`
 * is a date in March, and a student who mistypes their exam month should be
 * told so, not given a different exam.
 */
const calendarDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-07-15.")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return false;
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }, "That date doesn't exist.");

const preferencesSchema = z.object({
  reviewPreference: z.enum(REVIEW_PREFERENCES).optional(),
  examDate: calendarDate.nullable().optional(),
  dailyMinutes: z.number().int().min(MINUTES_MIN).max(MINUTES_MAX).optional(),
  placementDismissed: z.boolean().optional(),
});

router.get("/placement", async (req, res) => {
  const owner = ownerId(req);
  const preferences = await readPreferences(owner);

  const books = await db()
    .select({
      id: textbook.id,
      title: textbook.title,
      subject: textbook.subject,
    })
    .from(textbook)
    .where(eq(textbook.ownerId, owner))
    .orderBy(asc(textbook.createdAt));

  const positions = books.length
    ? await db()
        .select({
          textbookId: studyPosition.textbookId,
          chapterId: studyPosition.chapterId,
          topicPath: studyPosition.topicPath,
        })
        .from(studyPosition)
        .where(
          inArray(
            studyPosition.textbookId,
            books.map((book) => book.id),
          ),
        )
    : [];

  const positionByBook = new Map(
    positions.map((position) => [position.textbookId, position]),
  );

  const chapters = books.length
    ? await db()
        .select({
          id: chapter.id,
          textbookId: chapter.textbookId,
          title: chapter.title,
          topics: chapter.topics,
        })
        .from(chapter)
        .where(
          inArray(
            chapter.textbookId,
            books.map((book) => book.id),
          ),
        )
        .orderBy(asc(chapter.createdAt))
    : [];

  const chaptersByBook = new Map<string, typeof chapters>();
  for (const row of chapters) {
    const list = chaptersByBook.get(row.textbookId) ?? [];
    list.push(row);
    chaptersByBook.set(row.textbookId, list);
  }

  ok(res, {
    preferences,
    books: books.map((book) => {
      const position = positionByBook.get(book.id);
      return {
        id: book.id,
        title: book.title,
        subject: book.subject,
        // The section only means something next to its chapter. A chapter
        // that was deleted takes its position with it, so the path that is
        // reported always has a chapter behind it.
        currentChapterId: position?.chapterId ?? null,
        currentTopicPath: position?.chapterId ? position.topicPath : null,
        chapters: (chaptersByBook.get(book.id) ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          topics: row.topics ?? [],
        })),
      };
    }),
  });
});

router.put("/placement/preferences", async (req, res) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success)
    return err(res, parsed.error.issues[0]?.message ?? "That won't work.");

  const owner = ownerId(req);
  const patch = parsed.data;
  const values: Record<string, unknown> = {};
  if (patch.reviewPreference !== undefined)
    values.reviewPreference = patch.reviewPreference;
  if (patch.examDate !== undefined) values.examDate = patch.examDate;
  if (patch.dailyMinutes !== undefined)
    values.dailyMinutes = patch.dailyMinutes;
  if (patch.placementDismissed !== undefined)
    values.placementDismissed = patch.placementDismissed;

  if (Object.keys(values).length > 0) {
    await db().update(user).set(values).where(eq(user.id, owner));
  }

  ok(res, { preferences: await readPreferences(owner) });
});

const positionSchema = z.object({
  textbookId: z.string().trim().min(1, "Choose a book."),
  chapterId: z.string().trim().min(1, "Choose a chapter."),
  /**
   * The section within that chapter, as the book prints it ("3.2").
   *
   * Optional, because a book read from a manual page range has no printed
   * sections to choose from, and a chapter on its own is still a real place
   * to be.
   */
  topicPath: z.string().trim().max(300).nullable().optional(),
});

router.put("/placement/position", async (req, res) => {
  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success)
    return err(res, parsed.error.issues[0]?.message ?? "That won't work.");

  const owner = ownerId(req);
  const { textbookId, chapterId, topicPath } = parsed.data;

  // The book must be the student's, and the chapter must be a chapter of that
  // book — a position that points at someone else's chapter is not a position.
  const owned = await db()
    .select({ id: textbook.id })
    .from(textbook)
    .where(and(eq(textbook.id, textbookId), eq(textbook.ownerId, owner)))
    .limit(1);
  if (!owned[0]) return err(res, "That book isn't yours.", 404);

  const target = await db()
    .select({ id: chapter.id, topics: chapter.topics })
    .from(chapter)
    .where(and(eq(chapter.id, chapterId), eq(chapter.textbookId, textbookId)))
    .limit(1);
  if (!target[0]) return err(res, "That chapter isn't in this book.", 404);

  // A section that the chapter does not have would be a position the student
  // can never be shown again, because the book has no such line.
  const wanted = topicPath ?? null;
  if (wanted) {
    const known = (target[0].topics ?? []).some(
      (topic) => topic.path === wanted,
    );
    if (!known) return err(res, "This book has no section like that.", 400);
  }

  await db()
    .insert(studyPosition)
    .values({
      id: crypto.randomUUID(),
      textbookId,
      chapterId,
      topicPath: wanted,
    })
    .onConflictDoUpdate({
      target: studyPosition.textbookId,
      set: { chapterId, topicPath: wanted, updatedAt: new Date() },
    });

  ok(res, { textbookId, chapterId, topicPath: wanted });
});

export default router;
