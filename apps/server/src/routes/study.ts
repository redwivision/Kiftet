import { Router } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { chapter, textbook, studySession, attempt, conceptNode } from "@kiftet/db/schema";
import { getDb } from "../services";
import { ai, focusScore } from "../ai/gemini";

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

async function findSession(sessionId: string) {
  const rows = await db()
    .select()
    .from(studySession)
    .where(eq(studySession.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

type SessionResultSummary = {
  before: number | null;
  after: number | null;
  delta: number | null;
  durationMs: number | null;
};

// One canonical "how did this session go" number: before comes from the first
// recall attempt, after from the AVERAGE of the retest answers (the delta is
// the product's metric, so it should reflect the whole retest, not whichever
// question was answered last).
async function resultSummary(sessionId: string): Promise<SessionResultSummary | null> {
  const session = await findSession(sessionId);
  if (!session) return null;

  const attemptsRows = await db()
    .select({ stage: attempt.stage, score: attempt.score })
    .from(attempt)
    .where(eq(attempt.sessionId, sessionId))
    .orderBy(attempt.createdAt);

  const recallAttempt = attemptsRows.find((a) => a.stage === "recall" && a.score !== null);
  const retestScores = attemptsRows
    .filter((a): a is { stage: "retest"; score: number } => a.stage === "retest" && a.score !== null)
    .map((a) => a.score);
  const before = recallAttempt?.score ?? null;
  const after = retestScores.length
    ? Math.round(retestScores.reduce((sum, s) => sum + s, 0) / retestScores.length)
    : null;
  const durationMs = session.startedAt
    ? session.completedAt
      ? Math.max(0, session.completedAt.getTime() - session.startedAt.getTime())
      : Math.max(0, Date.now() - session.startedAt.getTime())
    : null;

  return {
    before,
    after,
    delta: before != null && after != null ? after - before : null,
    durationMs,
  };
}

// Recent session history for the dashboard, with each session's result folded
// in so cards can show "62% → 81% · 12 min" without a second round-trip.
router.get("/sessions", async (_req, res) => {
  const rows = await db().select().from(studySession).orderBy(desc(studySession.startedAt)).limit(20);
  const out = [];
  for (const row of rows) {
    const summary = await resultSummary(row.id);
    if (!summary) continue;
    out.push({
      id: row.id,
      chapterId: row.chapterId,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      ...summary,
    });
  }
  ok(res, out);
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

// Idempotent attempt insert: the client sends a UUID per submission so a
// double-posted recall/answer (animation retry, voice race, network replay)
// lands exactly one row instead of polluting the history with phantom
// attempts. Idempotency is scoped to the session: the same attemptId may be
// reused across different sessions and must only dedupe within its own.
type AttemptInsert = {
  id?: string;
  sessionId: string;
  stage: "recall" | "retest";
  transcriptText: string;
  gapsIdentified: { covered: string[]; missing: string[]; misconceptions: string[] };
  score: number;
};

async function insertAttemptOnce(record: AttemptInsert): Promise<boolean> {
  let id = record.id ?? crypto.randomUUID();
  const existing = await db()
    .select({ id: attempt.id, sessionId: attempt.sessionId })
    .from(attempt)
    .where(eq(attempt.id, id))
    .limit(1);
  if (existing.length) {
    const existingRow = existing[0];
    // Already stored by this session → replay, drop it.
    if (existingRow && existingRow.sessionId === record.sessionId) return false;
    // Same id recycled from another session → new id, keep the row.
    id = crypto.randomUUID();
  }
  await db().insert(attempt).values({ ...record, id }).onConflictDoNothing();
  return true;
}

// ────────────────────────────────────────────────────────────────
// Recall → gap analysis
// ────────────────────────────────────────────────────────────────

const recallSchema = z.object({
  transcriptText: z.string().min(1),
  attemptId: z.string().optional(),
});

router.post("/sessions/:id/recall", async (req, res) => {
  const parsed = recallSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const sessionId = req.params.id;

  const chapterId = await sessionChapterId(sessionId);
  if (!chapterId) return err(res, "Session not found", 404);

  const concepts = await chapterConcepts(chapterId);

  const gaps = await ai.gradeRecall(parsed.data.transcriptText, concepts);
  const score = Math.round(gaps.score * 100);

  await insertAttemptOnce({
    id: parsed.data.attemptId,
    sessionId,
    stage: "recall",
    transcriptText: parsed.data.transcriptText,
    gapsIdentified: {
      covered: gaps.covered,
      missing: gaps.missing,
      misconceptions: gaps.misconceptions,
    },
    score,
  });

  ok(res, { transcriptText: parsed.data.transcriptText, gaps: { ...gaps, score } });
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

  // Each question is pinned to exactly one gap item so the answer can be
  // graded against that idea alone. The model's targetConcept is reconciled
  // against the stored checklist; anything unverifiable falls back to the
  // gap list in order.
const gapItems = [...parsed.data.missing, ...parsed.data.misconceptions];
  const byName = (value: string) => value.trim().toLowerCase();
  // Reconcile the gap strings against the stored checklist so the focus a
  // question gets is the canonical conceptText (case/whitespace tolerant).
  const canonicalGapItems = gapItems.map((gap) => {
    const hit = concepts.find((c) => byName(c.conceptText) === byName(gap));
    return hit ? hit.conceptText : gap;
  });
  const withFocus = questions.map((q, i) => {
    let target: string | null = null;
    if (q.targetConcept) {
      const canonical = concepts.find(
        (c) => byName(c.conceptText) === byName(q.targetConcept!),
      );
      if (canonical) target = canonical.conceptText;
    }
    if (!target && canonicalGapItems.length) {
      const fallback = canonicalGapItems[i % canonicalGapItems.length];
      if (fallback) target = fallback;
    }
    return { question: q.question, focus: target ? [target] : [] };
  });

  ok(res, { questions: withFocus });
});

const answerSchema = z.object({
  transcriptText: z.string().min(1),
  missing: z.array(z.string()).default([]),
  misconceptions: z.array(z.string()).default([]),
  focus: z.array(z.string()).default([]),
  attemptId: z.string().optional(),
});

router.post("/sessions/:id/retest/answer", async (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id);
  if (!chapterId) return err(res, "Session not found", 404);

  const allConcepts = await chapterConcepts(chapterId);
  const focus = parsed.data.focus;
  const byName = (value: string) => value.trim().toLowerCase();
  // Match focus against the stored checklist tolerantly; a focus string that
  // has no stored counterpart (e.g. a freshly graded misconception text) is
  // synthesized so the question can still be graded against that idea alone.
  const graded = allConcepts.filter((c) =>
    focus.some((f) => byName(f) === byName(c.conceptText)),
  );
  const gradedNames = new Set(graded.map((c) => byName(c.conceptText)));
  const extras = focus
    .filter((f) => !gradedNames.has(byName(f)))
    .map((f) => ({
      id: crypto.randomUUID(),
      chapterId,
      conceptText: f,
      isMisconception: parsed.data.misconceptions.includes(f),
      weight: 1,
      sortOrder: 0,
      createdAt: new Date(),
    }));
  const subset = [...graded, ...extras];
  if (!subset.length) return err(res, "No concepts matched that question", 400);

  const gaps = await ai.gradeRecall(parsed.data.transcriptText, subset);
  // For a single question, a misconception counts as handled when the student
  // does NOT restate the wrong belief; real concepts count when covered. This
  // is the per-question verdict the UI's "right/still open" actually means.
  const score = Math.round(focusScore(gaps, subset) * 100);

  await insertAttemptOnce({
    id: parsed.data.attemptId,
    sessionId: req.params.id,
    stage: "retest",
    transcriptText: parsed.data.transcriptText,
    gapsIdentified: {
      covered: gaps.covered,
      missing: gaps.missing,
      misconceptions: gaps.misconceptions,
    },
    score,
  });

  ok(res, { score, gaps: { ...gaps, score } });
});

// ────────────────────────────────────────────────────────────────
// Result → before / after delta
// ────────────────────────────────────────────────────────────────

router.get("/sessions/:id/result", async (req, res) => {
  const summary = await resultSummary(req.params.id);
  if (!summary) return err(res, "Session not found", 404);
  ok(res, summary);
});

// ────────────────────────────────────────────────────────────────
// Complete session
// ────────────────────────────────────────────────────────────────

router.post("/sessions/:id/complete", async (req, res) => {
  const session = await findSession(req.params.id);
  if (!session) return err(res, "Session not found", 404);

  await db()
    .update(studySession)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(studySession.id, req.params.id));

  const durationMs = session.startedAt
    ? Math.max(0, Date.now() - session.startedAt.getTime())
    : null;

  ok(res, { ok: true, durationMs });
});

export default router;