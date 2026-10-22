import { chapter, studyPosition, textbook } from "@kiftet/db/schema";
import { desc, eq } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import {
  type BookSection,
  nextSection,
  reviewCandidates,
  reviewCount,
} from "../lib/daily-plan";
import { masteryHistory } from "../lib/mastery-history";
import { readMasteryRows } from "../lib/mastery-store";
import { getDb } from "../services";
import { type ReviewPreference, readPreferences } from "./placement";

const router = Router();

/**
 * Today's plan.
 *
 * A day is one review and one new thing, and it ends. That is the whole
 * point: a planner that hands over a backlog has not planned anything, and
 * tomorrow's plan is not a debt.
 *
 * Everything here is deterministic and this route does not call a model. The
 * order the student reaches for past material is the order they are weakest
 * in; the new thing is the next line in their own book's contents.
 */

function db() {
  return getDb();
}

function ownerId(req: Request): string {
  const id = req.authSession?.user.id;
  if (!id) throw new Error("Authenticated user missing from request");
  return id;
}

function ok<T>(res: Response, data: T) {
  res.json(data);
}

type PositionRow = {
  textbookId: string;
  bookTitle: string;
  subject: string;
  chapterId: string | null;
  chapterTitle: string | null;
  topicPath: string | null;
  topics: { path: string; title: string }[] | null;
};

/**
 * Where the student is, per book, with the book's own contents alongside.
 *
 * The most recently moved position is the book being worked on now — a
 * student who placed themselves in Biology last week and in Economics
 * yesterday is in Economics.
 */
async function readPositionRows(owner: string): Promise<PositionRow[]> {
  const rows = await db()
    .select({
      textbookId: studyPosition.textbookId,
      bookTitle: textbook.title,
      subject: textbook.subject,
      chapterId: studyPosition.chapterId,
      topicPath: studyPosition.topicPath,
      chapterTitle: chapter.title,
      topics: chapter.topics,
    })
    .from(studyPosition)
    .innerJoin(textbook, eq(studyPosition.textbookId, textbook.id))
    .leftJoin(chapter, eq(studyPosition.chapterId, chapter.id))
    .where(eq(textbook.ownerId, owner))
    .orderBy(desc(studyPosition.updatedAt));

  return rows.map((row) => ({
    textbookId: row.textbookId,
    bookTitle: row.bookTitle,
    subject: row.subject,
    chapterId: row.chapterId,
    chapterTitle: row.chapterTitle,
    topicPath: row.topicPath,
    topics: (row.topics ?? []) as { path: string; title: string }[] | null,
  }));
}

export type PlanReviewItem = {
  chapterId: string;
  chapterTitle: string;
  concept: string;
  /** 1 shaky, 2 wrong, 3 solid — the level last recorded. */
  level: number;
  lastCheckedAt: string;
};

export type DailyPlan = {
  /** The day's length, as the student set it. */
  minutes: number;
  /** The book being worked on, when we know which one. */
  book: { textbookId: string; title: string; subject: string } | null;
  /** The new thing. Null when there is no book, or the chapter is finished. */
  learn: {
    chapterId: string;
    chapterTitle: string;
    sectionPath: string | null;
    sectionTitle: string | null;
    remainingInChapter: number;
  } | null;
  /** What to bring back. Empty when the student said none and has no exam. */
  review: PlanReviewItem[];
  /**
   * Why review is in the plan.
   *
   * "exam" means the student said none, and an exam date gave forgetting a
   * consequence — so the plan says so rather than quietly overriding them.
   */
  reviewReason: "preference" | "exam" | null;
  /** The exam date, when the student has given one. */
  examDate: string | null;
  /** Whether we know where the student is. */
  positioned: boolean;
};

router.get("/plan/today", async (req, res) => {
  const owner = ownerId(req);
  const preferences = await readPreferences(owner);
  const reviewPreference: ReviewPreference = preferences.reviewPreference;
  const hasExamDate = Boolean(preferences.examDate);

  const [positions, masteryRows] = await Promise.all([
    readPositionRows(owner),
    readMasteryRows(owner),
  ]);

  const history = masteryHistory(masteryRows);
  const titleByChapter = new Map(
    masteryRows.map((row) => [row.chapterId, row.chapterTitle]),
  );
  const textbookByChapter = new Map(
    masteryRows.map((row) => [row.chapterId, row.textbookId]),
  );

  // The book being worked on now. A stated position wins; without one, the
  // book they last studied is the honest guess, because a plan that starts
  // from "we do not know" helps nobody.
  const position = positions[0] ?? null;
  const activeTextbookId =
    position?.textbookId ??
    (masteryRows[0]
      ? (textbookByChapter.get(masteryRows[0].chapterId) ?? null)
      : null);

  let activeBook: DailyPlan["book"] = null;
  if (position) {
    activeBook = {
      textbookId: position.textbookId,
      title: position.bookTitle,
      subject: position.subject,
    };
  } else if (activeTextbookId) {
    const book = await db()
      .select({
        id: textbook.id,
        title: textbook.title,
        subject: textbook.subject,
      })
      .from(textbook)
      .where(eq(textbook.id, activeTextbookId))
      .limit(1);
    const found = book[0];
    if (found) {
      activeBook = {
        textbookId: found.id,
        title: found.title,
        subject: found.subject,
      };
    }
  }

  // The new thing: the next line in the book's own contents.
  let learn: DailyPlan["learn"] = null;
  if (position?.chapterId && position.chapterTitle) {
    const sections: BookSection[] = (position.topics ?? []).map((topic) => ({
      path: topic.path,
      title: topic.title,
    }));
    const target = nextSection(sections, position.topicPath);
    learn = {
      chapterId: position.chapterId,
      chapterTitle: position.chapterTitle,
      sectionPath: target.path,
      sectionTitle: target.title,
      remainingInChapter: target.remaining,
    };
  }

  // The past: what is due for another look.
  const wanted = reviewCount(
    reviewPreference,
    hasExamDate,
    preferences.dailyMinutes,
  );

  // The book being advanced comes first among equals — a student in Biology
  // is better served by Biology's due concept than by one from a book they
  // are not touching today.
  const activeChapters = new Set(
    masteryRows
      .filter((row) => row.textbookId === activeTextbookId)
      .map((row) => row.chapterId),
  );

  const candidates = reviewCandidates(history, new Date(), activeChapters);

  const review: PlanReviewItem[] = candidates.slice(0, wanted).map((entry) => ({
    chapterId: entry.chapterId,
    chapterTitle: titleByChapter.get(entry.chapterId) ?? "",
    concept: entry.concept,
    level: entry.level,
    lastCheckedAt: entry.lastCheckedAt.toISOString(),
  }));

  const reviewReason: DailyPlan["reviewReason"] =
    review.length === 0
      ? null
      : reviewPreference === "none"
        ? "exam"
        : "preference";

  ok(res, {
    minutes: preferences.dailyMinutes,
    book: activeBook,
    learn,
    review,
    reviewReason,
    examDate: preferences.examDate,
    positioned: Boolean(position?.chapterId),
  } satisfies DailyPlan);
});

export default router;
