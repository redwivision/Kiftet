import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  attempt,
  chapter,
  studySession,
  syllabus,
  syllabusUnit,
  textbook,
} from "@kiftet/db/schema";
import { getDb } from "../services";

// Bet 1 (STRATEGY.md): browse-by-syllabus, smallest proof.
//
// Chapters are matched to a syllabus by textbook subject only for now — the
// textbook table has no grade yet, so a "Biology Grade 12" syllabus picks up
// every Biology chapter the owner has. When textbooks get a grade column the
// join narrows. The seeded units are PROVISIONAL until a teacher verifies the
// real EHEEE list (see packages/db/src/seed.ts) — that flag rides along in the
// payload so the UI can label it honestly.

const router = Router();

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

// The syllabus the seeded reference list, one row per subject/grade.
router.get("/syllabus", async (_req, res) => {
  const rows = await db()
    .select({
      id: syllabus.id,
      subject: syllabus.subject,
      grade: syllabus.grade,
      title: syllabus.title,
      source: syllabus.source,
    })
    .from(syllabus)
    .orderBy(syllabus.subject, syllabus.grade);

  ok(res, rows);
});

type ChapterCoverage = { before: number | null; after: number | null; delta: number | null };

async function coverageForSessions(
  sessionIds: string[],
): Promise<Map<string, ChapterCoverage>> {
  const out = new Map<string, ChapterCoverage>();
  if (sessionIds.length === 0) return out;

  const attemptsRows = await db()
    .select({ sessionId: attempt.sessionId, stage: attempt.stage, score: attempt.score })
    .from(attempt)
    .where(inArray(attempt.sessionId, sessionIds));

  for (const sessionId of sessionIds) {
    const own = attemptsRows.filter((a) => a.sessionId === sessionId);
    const recall = own.find((a) => a.stage === "recall" && a.score !== null)?.score ?? null;
    const retestScores = own
      .filter(
        (a): a is { sessionId: string; stage: "retest"; score: number } =>
          a.stage === "retest" && a.score !== null,
      )
      .map((a) => a.score);
    const after = retestScores.length
      ? Math.round(retestScores.reduce((sum, s) => sum + s, 0) / retestScores.length)
      : null;
    out.set(sessionId, {
      before: recall,
      after,
      delta: recall != null && after != null ? after - recall : null,
    });
  }
  return out;
}

router.get("/syllabus/:subject/:grade", async (req, res) => {
  const subject = decodeURIComponent(req.params.subject);
  const grade = Number(req.params.grade);
  if (!Number.isInteger(grade) || grade < 1 || grade > 14) {
    return err(res, "Grade should be a whole number between 1 and 14.", 400);
  }

  const owner = ownerId(req);
  const row = await db()
    .select()
    .from(syllabus)
    .where(and(eq(syllabus.subject, subject), eq(syllabus.grade, grade)))
    .limit(1);
  if (!row[0]) return err(res, "That syllabus doesn't exist yet.", 404);

  const units = await db()
    .select()
    .from(syllabusUnit)
    .where(eq(syllabusUnit.syllabusId, row[0].id))
    .orderBy(syllabusUnit.sortOrder);

  const ownerChapters = await db()
    .select({
      id: chapter.id,
      title: chapter.title,
      textbookTitle: textbook.title,
      unitId: chapter.unitId,
    })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(and(eq(textbook.ownerId, owner), eq(textbook.subject, subject)))
    .orderBy(chapter.createdAt);

  const mapped = ownerChapters.filter((c) => c.unitId !== null);
  const chapterIds = mapped.map((c) => c.id);

  // Latest session per chapter (startedAt desc gives newest first).
  const sessions = await db()
    .select({ id: studySession.id, chapterId: studySession.chapterId })
    .from(studySession)
    .where(
      and(eq(studySession.userId, owner), inArray(studySession.chapterId, chapterIds)),
    )
    .orderBy(desc(studySession.startedAt));

  const latestByChapter = new Map<string, string>();
  for (const s of sessions) {
    if (!latestByChapter.has(s.chapterId)) latestByChapter.set(s.chapterId, s.id);
  }
  const coverage = await coverageForSessions([...latestByChapter.values()]);

  const chaptersByUnit = new Map<string, typeof mapped>();
  for (const c of mapped) {
    const list = chaptersByUnit.get(c.unitId!) ?? [];
    list.push(c);
    chaptersByUnit.set(c.unitId!, list);
  }

  const unitRows = units.map((u) => {
    const cs = chaptersByUnit.get(u.id) ?? [];
    const covered = cs.filter(
      (c) => coverage.get(latestByChapter.get(c.id) ?? "")?.after != null,
    ).length;
    return {
      id: u.id,
      unitNumber: u.unitNumber,
      title: u.title,
      description: u.description,
      chapters: cs.map((c) => ({
        id: c.id,
        title: c.title,
        textbookTitle: c.textbookTitle,
        coverage: coverage.get(latestByChapter.get(c.id) ?? "") ?? null,
      })),
      covered,
      total: cs.length,
    };
  });

  const unassigned = ownerChapters.filter((c) => c.unitId === null);

  ok(res, {
    ...row[0],
    units: unitRows,
    unassigned: unassigned.map(({ id, title, textbookTitle }) => ({
      id,
      title,
      textbookTitle,
    })),
  });
});

const mapChapterSchema = z.object({
  unitId: z.string().nullable(),
});

router.patch("/chapters/:id/unit", async (req, res) => {
  const parsed = mapChapterSchema.safeParse(req.body);
  if (!parsed.success) return err(res, "Pick a unit to move the chapter to.", 400);

  const owner = ownerId(req);
  const { unitId } = parsed.data;

  const owned = await db()
    .select({ id: chapter.id })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(and(eq(chapter.id, req.params.id), eq(textbook.ownerId, owner)))
    .limit(1);
  if (!owned[0]) return err(res, "That chapter isn't yours.", 404);

  if (unitId !== null) {
    const unit = await db()
      .select({ id: syllabusUnit.id })
      .from(syllabusUnit)
      .where(eq(syllabusUnit.id, unitId))
      .limit(1);
    if (!unit[0]) return err(res, "That unit doesn't exist.", 404);
  }

  await db().update(chapter).set({ unitId }).where(eq(chapter.id, req.params.id));
  ok(res, { id: req.params.id, unitId });
});

export default router;