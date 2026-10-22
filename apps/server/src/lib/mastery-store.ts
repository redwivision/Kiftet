import { attempt, chapter, studySession } from "@kiftet/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../services";
import type { MasterySample } from "./mastery-history";

/**
 * The student's attempts, as the planner reads them.
 *
 * The pretest is left out on purpose. A pretest is a baseline: it says what
 * the student knew *before* studying, and the point of the planner is what
 * they know *now*. Counting it would make a freshly-pretested chapter look
 * like one they are about to forget.
 *
 * The row limit is the same one `/review-due` uses, and for the same reason:
 * a student with thousands of attempts should not make the planner's own read
 * unbounded. The newest attempts are the ones that carry the current state,
 * because a later attempt replaces the level of everything it probed.
 */
const MAX_SAMPLES = 500;

export type MasteryRow = MasterySample & {
  chapterTitle: string;
  textbookId: string;
};

export async function readMasteryRows(owner: string): Promise<MasteryRow[]> {
  const rows = await getDb()
    .select({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      textbookId: chapter.textbookId,
      createdAt: attempt.createdAt,
      gapsIdentified: attempt.gapsIdentified,
    })
    .from(attempt)
    .innerJoin(studySession, eq(attempt.sessionId, studySession.id))
    .innerJoin(chapter, eq(studySession.chapterId, chapter.id))
    .where(and(eq(studySession.userId, owner), ne(attempt.stage, "pretest")))
    .orderBy(desc(attempt.createdAt))
    .limit(MAX_SAMPLES);

  return rows.flatMap((row) => {
    const gaps = row.gapsIdentified;
    if (!gaps || typeof gaps !== "object" || Array.isArray(gaps)) return [];
    const data = gaps as Record<string, unknown>;
    const mastery =
      data.mastery &&
      typeof data.mastery === "object" &&
      !Array.isArray(data.mastery)
        ? (data.mastery as Record<string, number>)
        : null;
    if (!mastery) return [];
    return [
      {
        chapterId: row.chapterId,
        chapterTitle: row.chapterTitle,
        textbookId: row.textbookId,
        createdAt: row.createdAt,
        mastery,
      },
    ];
  });
}
