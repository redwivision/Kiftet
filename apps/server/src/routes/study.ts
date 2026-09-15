import { Router } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { chapter, textbook, studySession, attempt, conceptNode } from "@kiftet/db/schema";
import { getDb } from "../services";
import { ai } from "../ai/gemini";

const router = Router();

function db() {
  return getDb();
}

function ok<T>(res: any, data: T, status = 200) {
  res.status(status).json(data);
}

function err(res: any, message: string, status = 400) {
  res.status(status).json({ error: message });
}

function firstIssue(issues: z.ZodIssue[]): string {
  return issues[0]?.message ?? "Invalid request";
}

async function sessionChapterId(sessionId: string): Promise<string | null> {
  const rows = await db()
    .select({ chapterId: studySession.chapterId })
    .from(studySession)
    .where(eq(studySession.id, sessionId))
    .limit(1);
  return rows[0]?.chapterId ?? null;
}

async function chapterConcepts(chapterId: string) {
  return db()
    .select()
    .from(conceptNode)
    .where(eq(conceptNode.chapterId, chapterId))
    .orderBy(conceptNode.sortOrder);
}

// ────────────────────────────────────────────────────────────────
// Chapters
// ────────────────────────────────────────────────────────────────

const ingestSchema = z.object({
  textbookTitle: z.string().min(1),
  subject: z.string().min(1),
  language: z.string().default("en"),
  title: z.string().min(1),
  rawText: z.string().min(1),
});

router.post("/chapters/ingest", async (req, res) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const { textbookTitle, subject, language, title, rawText } = parsed.data;
  const textbookId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();

  await db().insert(textbook).values({
    id: textbookId,
    title: textbookTitle,
    subject,
    language,
  });

  await db().insert(chapter).values({
    id: chapterId,
    textbookId,
    title,
    rawText,
  });

  const extracted = await ai.extractConcepts(rawText);
  if (extracted.length) {
    await db().insert(conceptNode).values(
      extracted.map((c, i) => ({
        id: crypto.randomUUID(),
        chapterId,
        conceptText: c.conceptText,
        isMisconception: c.isMisconception,
        weight: c.weight,
        sortOrder: i,
      })),
    );
  }

  ok(res, { textbookId, chapterId, conceptsExtracted: extracted.length }, 201);
});

router.get("/chapters", async (_req, res) => {
  const rows = await db()
    .select({
      id: chapter.id,
      title: chapter.title,
      textbookTitle: textbook.title,
      subject: textbook.subject,
      createdAt: chapter.createdAt,
    })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .orderBy(desc(chapter.createdAt));

  ok(res, rows);
});

router.get("/chapters/:id/concepts", async (req, res) => {
  const rows = await db()
    .select()
    .from(conceptNode)
    .where(eq(conceptNode.chapterId, req.params.id))
    .orderBy(conceptNode.sortOrder);

  ok(res, rows);
});

// ────────────────────────────────────────────────────────────────
// Study sessions
// ────────────────────────────────────────────────────────────────

const startSessionSchema = z.object({
  chapterId: z.string().min(1),
  userId: z.string().optional(),
});

router.post("/sessions/start", async (req, res) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const sessionId = crypto.randomUUID();
  const { chapterId, userId } = parsed.data;

  await db().insert(studySession).values({
    id: sessionId,
    chapterId,
    userId: userId ?? null,
  });

  ok(res, { sessionId }, 201);
});

router.get("/sessions/:id", async (req, res) => {
  const rows = await db()
    .select()
    .from(studySession)
    .where(eq(studySession.id, req.params.id))
    .limit(1);

  if (!rows.length) return err(res, "Session not found", 404);

  const attemptsRows = await db()
    .select()
    .from(attempt)
    .where(eq(attempt.sessionId, req.params.id))
    .orderBy(attempt.createdAt);

  ok(res, { ...rows[0], attempts: attemptsRows });
});

// ────────────────────────────────────────────────────────────────
// Recall → gap analysis
// ────────────────────────────────────────────────────────────────

const recallSchema = z.object({ transcriptText: z.string().min(1) });

router.post("/sessions/:id/recall", async (req, res) => {
  const parsed = recallSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const sessionId = req.params.id;

  // Retrieve concept list for the chapter attached to this session
  const chapterId = await sessionChapterId(sessionId);
  if (!chapterId) return err(res, "Session not found", 404);

  const concepts = await chapterConcepts(chapterId);

  const gaps = await ai.gradeRecall(parsed.data.transcriptText, concepts);

  await db().insert(attempt).values({
    id: crypto.randomUUID(),
    sessionId,
    stage: "recall",
    transcriptText: parsed.data.transcriptText,
    gapsIdentified: gaps.missing,
    score: Math.round(gaps.score * 100),
  });

  ok(res, { transcriptText: parsed.data.transcriptText, gaps });
});

// ────────────────────────────────────────────────────────────────
// Micro-lesson
// ────────────────────────────────────────────────────────────────

const microlessonSchema = z.object({
  missing: z.array(z.string()),
  misconceptions: z.array(z.string()),
});

router.post("/sessions/:id/microlesson", async (req, res) => {
  const parsed = microlessonSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id);
  if (!chapterId) return err(res, "Session not found", 404);

  const concepts = await chapterConcepts(chapterId);

  const gapAnalysis = {
    covered: [],
    missing: parsed.data.missing,
    misconceptions: parsed.data.misconceptions,
    score: 0,
  };

  const lesson = await ai.generateMicroLesson(gapAnalysis, concepts);
  ok(res, lesson);
});

// ────────────────────────────────────────────────────────────────
// Retest
// ────────────────────────────────────────────────────────────────

const retestSchema = z.object({
  missing: z.array(z.string()),
  misconceptions: z.array(z.string()),
});

router.post("/sessions/:id/retest", async (req, res) => {
  const parsed = retestSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id);
  if (!chapterId) return err(res, "Session not found", 404);

  const concepts = await chapterConcepts(chapterId);

  const gapAnalysis = {
    covered: [],
    missing: parsed.data.missing,
    misconceptions: parsed.data.misconceptions,
    score: 0,
  };

  const questions = await ai.generateRetestQuestions(gapAnalysis, concepts);
  ok(res, { questions });
});

const answerSchema = z.object({
  transcriptText: z.string().min(1),
  missing: z.array(z.string()),
  misconceptions: z.array(z.string()),
});

router.post("/sessions/:id/retest/answer", async (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id);
  if (!chapterId) return err(res, "Session not found", 404);

  const concepts = await chapterConcepts(chapterId);

  const gapAnalysis = await ai.gradeRecall(parsed.data.transcriptText, concepts);

  await db().insert(attempt).values({
    id: crypto.randomUUID(),
    sessionId: req.params.id,
    stage: "retest",
    transcriptText: parsed.data.transcriptText,
    gapsIdentified: gapAnalysis.missing,
    score: Math.round(gapAnalysis.score * 100),
  });

  ok(res, { score: Math.round(gapAnalysis.score * 100), gaps: gapAnalysis });
});

// ────────────────────────────────────────────────────────────────
// Result → before / after delta
// ────────────────────────────────────────────────────────────────

router.get("/sessions/:id/result", async (req, res) => {
  const attemptsRows = await db()
    .select({ stage: attempt.stage, score: attempt.score })
    .from(attempt)
    .where(eq(attempt.sessionId, req.params.id))
    .orderBy(attempt.createdAt);

  const recallAttempt = attemptsRows.find((a) => a.stage === "recall" && a.score !== null);
  const retestAttempt = [...attemptsRows]
    .reverse()
    .find((a) => a.stage === "retest" && a.score !== null);

  ok(res, {
    before: recallAttempt?.score ?? null,
    after: retestAttempt?.score ?? null,
    delta:
      recallAttempt?.score != null && retestAttempt?.score != null
        ? retestAttempt.score - recallAttempt.score
        : null,
  });
});

// ────────────────────────────────────────────────────────────────
// Complete session
// ────────────────────────────────────────────────────────────────

router.post("/sessions/:id/complete", async (req, res) => {
  await db()
    .update(studySession)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(studySession.id, req.params.id));

  ok(res, { ok: true });
});

export default router;