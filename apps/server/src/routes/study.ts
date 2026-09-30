import {
  attempt,
  chapter,
  conceptNode,
  guideSection,
  misconceptionHit,
  studySession,
  syllabusUnit,
  textbook,
} from "@kiftet/db/schema";
import { and, count, desc, eq, gte, ne } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { mergeConcepts } from "../ai/concepts";
import {
  ai,
  aiTelemetrySnapshot,
  focusScore,
  type GuideSection,
  gapAnalysisFrom,
  levelOf,
  type MasteryLevel,
  type MasteryMap,
  triageConcepts,
} from "../ai/gemini";
import { getDb } from "../services";
import { DEMO_SEED_TITLE } from "./demo";

const router = Router();
const aiWindows = new Map<string, number[]>();

// Our per-user allowance is deliberately set BELOW the provider's per-project
// ceiling. Gemini's free tier is per *project* (~10 req/min, ~1-1.5k req/day),
// shared by every user — not per key, and not per user. An allowance above that
// number does not buy capacity, it just manufactures 429s, which used to be
// swallowed silently into the deterministic fallback. Staying under it is what
// keeps the real model answering. Demo is stingier still, and shares the same
// ceiling: demo traffic is the first thing to shed when a real student is
// waiting. Raise these when/if we move to a paid tier, and re-read the actual
// limits in AI Studio rather than trusting a comment.
const AI_REQUESTS_PER_MINUTE = { signedIn: 8, demo: 3 };
const DEMO_TEXTBOOKS_PER_DAY = 3;

function isDemo(req: Request): boolean {
  return Boolean(req.get("x-demo-user-id"));
}

// Non-consuming read of the current-minute budget for an owner.
function aiBudgetFor(req: Request) {
  const owner = ownerId(req);
  const now = Date.now();
  const recent = (aiWindows.get(owner) ?? []).filter(
    (time) => now - time < 60_000,
  );
  const limitPerMinute = isDemo(req)
    ? AI_REQUESTS_PER_MINUTE.demo
    : AI_REQUESTS_PER_MINUTE.signedIn;
  const remaining = Math.max(0, limitPerMinute - recent.length);
  // The window is a rolling 60s filter, not a bucket that empties on the hour,
  // so "when does it restart" has a real answer: the oldest call in the window
  // ages out 60s after it happened. Only meaningful when the student is
  // actually blocked — that's the moment they ask.
  const oldest = recent.at(0) ?? null;
  const resetAt = oldest === null ? null : oldest + 60_000;
  return {
    demo: isDemo(req),
    limitPerMinute,
    callsThisMinute: recent.length,
    remaining,
    windowSeconds: 60,
    resetAt,
    retryAfterSeconds:
      remaining > 0 || resetAt === null
        ? 0
        : Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

// The daily book cap is derived from real rows rather than a counter, so it
// survives a restart — the AI window above does not. Signed-in students have no
// book cap today, which is reported as `limit: null` rather than a fake number.
async function dailyBookUsageFor(req: Request) {
  const demo = isDemo(req);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(dayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const today = await db()
    .select({ id: textbook.id })
    .from(textbook)
    .where(
      and(
        eq(textbook.ownerId, ownerId(req)),
        gte(textbook.createdAt, dayStart),
        ne(textbook.title, DEMO_SEED_TITLE),
      ),
    );
  return {
    demo,
    used: today.length,
    limit: demo ? DEMO_TEXTBOOKS_PER_DAY : null,
    // Server-local midnight, the same boundary textbookIdFor enforces — telling
    // the student a time the server doesn't use would be worse than none.
    resetAt: demo ? tomorrow.toISOString() : null,
  };
}

function allowAiRequest(req: Request): boolean {
  const owner = ownerId(req);
  const budget = aiBudgetFor(req);
  if (budget.remaining <= 0) return false;
  const now = Date.now();
  const recent = (aiWindows.get(owner) ?? []).filter(
    (time) => now - time < 60_000,
  );
  recent.push(now);
  aiWindows.set(owner, recent);
  return true;
}

class DailyBookLimitError extends Error {
  constructor(
    message: string,
    readonly resetAt: string,
  ) {
    super(message);
  }
}

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

// `resetAt` travels as an ISO timestamp rather than a pre-rendered hour: the
// server's clock is not the student's (Ethiopia is UTC+3), so naming an hour
// server-side would tell them to come back at the wrong time. The client
// renders it in their own zone.
function err(
  res: Response,
  message: string,
  status = 400,
  resetAt: string | null = null,
) {
  res
    .status(status)
    .json(resetAt ? { error: message, resetAt } : { error: message });
}

// A 429 that says what to do and how long to wait. "Try again later" leaves a
// student guessing, and guessing means hammering retry, which is how the
// shared free-tier quota gets drained in the first place. The count comes from
// the same rolling window the check just used, so it is not a guess either.
// The reassurance matters: a cached guide costs nothing, so a student who is
// blocked on generation can still reopen everything they have already read.
function aiBudgetError(res: Response, req: Request) {
  const { retryAfterSeconds } = aiBudgetFor(req);
  const wait =
    retryAfterSeconds > 0
      ? `${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`
      : "a moment";
  res.setHeader("Retry-After", String(Math.max(1, retryAfterSeconds)));
  return err(
    res,
    `You've used all your AI requests for this minute. Wait ${wait} and try again — anything you've already studied stays available.`,
    429,
  );
}

// Zod's default messages are written for developers ("Invalid input: expected
// string, received undefined"). Schemas carry their own friendly messages for
// the fields a student actually touches; this is the last-resort mapper for
// anything that still slips through.
function friendlyIssue(issue: z.ZodIssue): string {
  const message = issue.message ?? "Invalid request";
  if (
    /Invalid input|invalid_type|invalid_string|invalid_literal/i.test(message)
  ) {
    return "That request doesn't look right. Check the highlighted field and try again.";
  }
  if (/too big|too large|more than/i.test(message)) {
    return "That's too long. Trim it down and try again.";
  }
  if (/too small|less than|below minimum/i.test(message)) {
    return "That's too short. Add a little more and try again.";
  }
  return message;
}

function firstIssue(issues: z.ZodIssue[]): string {
  return issues[0] ? friendlyIssue(issues[0]) : "Invalid request";
}

async function sessionChapterId(
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const rows = await db()
    .select({ chapterId: studySession.chapterId })
    .from(studySession)
    .where(and(eq(studySession.id, sessionId), eq(studySession.userId, userId)))
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

/** A chapter the caller actually owns. The guide is generated content, so
 *  ownership is checked here rather than inherited from a session id. */
async function chapterOwned(
  chapterId: string,
  userId: string,
): Promise<string | null> {
  const rows = await db()
    .select({ id: chapter.id })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(and(eq(chapter.id, chapterId), eq(textbook.ownerId, userId)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Parse `?mastery=photosynthesis:2,osmosis:1` into a level map. */
function readMasteryParam(raw: unknown): MasteryMap {
  const out: MasteryMap = {};
  if (typeof raw !== "string" || !raw.trim()) return out;
  for (const pair of raw.split(",")) {
    const [name, level] = pair.split(":");
    if (!name?.trim()) continue;
    const n = Math.round(Number(level));
    if (!Number.isFinite(n) || n < 0 || n > 3) continue;
    out[name.trim()] = n as MasteryLevel;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// Chapters
// ────────────────────────────────────────────────────────────────

const ingestSchema = z.object({
  textbookTitle: z
    .string({ message: "Name the textbook first." })
    .trim()
    .min(1, "Name the textbook first."),
  subject: z
    .string({ message: "Which subject is it?" })
    .trim()
    .min(1, "Which subject is it?"),
  language: z.string().default("en"),
  title: z
    .string({ message: "Name this chunk." })
    .trim()
    .min(1, "Name this chunk."),
  rawText: z
    .string({ message: "This chunk has no text — the section looks empty." })
    .min(1, "This chunk has no text — the section looks empty.")
    .max(200_000, "That chunk is too large. Pick a smaller section."),
  /**
   * The chapter's own topics, in the order the book teaches them, as printed:
   * "2.3.1 The internal structure of a leaf".
   *
   * When the import could read a contents page these arrive with the chapter
   * and are used verbatim. A model re-inferring a table of contents from prose
   * gets the *ideas* right and the *structure* wrong — it will happily return
   * twelve unrelated bullets where the book had three nested sections, and it
   * will reorder them. The book already knows.
   */
  topics: z
    .array(z.string().trim().min(1).max(300))
    .max(200, "Too many topics in one chapter.")
    .optional(),
});

async function textbookIdFor(
  owner: string,
  title: string,
  subject: string,
  language: string,
  demo: boolean,
) {
  const [existing] = await db()
    .select({ id: textbook.id })
    .from(textbook)
    .where(and(eq(textbook.ownerId, owner), eq(textbook.title, title)))
    .limit(1);
  if (existing) return existing.id;

  // The per-day book cap (demo only) only applies when a *new* textbook row is
  // about to be created — re-ingesting chunks of an existing book is free. The
  // curated demo seed (created by /demo/start) doesn't count against it.
  if (demo) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today = await db()
      .select({ id: textbook.id })
      .from(textbook)
      .where(
        and(
          eq(textbook.ownerId, owner),
          gte(textbook.createdAt, dayStart),
          ne(textbook.title, DEMO_SEED_TITLE),
        ),
      );
    if (today.length >= DEMO_TEXTBOOKS_PER_DAY) {
      const tomorrow = new Date(dayStart);
      tomorrow.setDate(tomorrow.getDate() + 1);
      throw new DailyBookLimitError(
        `That's ${DEMO_TEXTBOOKS_PER_DAY} new textbooks for today — today's limit. You can still add chapters to books you already have, as many as you like.`,
        tomorrow.toISOString(),
      );
    }
  }

  const id = crypto.randomUUID();
  await db().insert(textbook).values({
    id,
    ownerId: owner,
    title,
    subject,
    language,
  });
  return id;
}

router.post("/chapters/ingest", async (req, res) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const { textbookTitle, subject, language, title, rawText, topics } =
    parsed.data;
  const owner = ownerId(req);
  const demo = isDemo(req);

  // One textbook row per (owner, title) — re-ingesting chunks of the same
  // book attaches to the existing row instead of spawning a new textbook.
  let textbookId: string;
  try {
    textbookId = await textbookIdFor(
      owner,
      textbookTitle,
      subject,
      language,
      demo,
    );
  } catch (e) {
    if (e instanceof DailyBookLimitError)
      return err(res, e.message, 429, e.resetAt);
    throw e;
  }

  // Resume-safety: a chunk whose title already exists in this book is
  // already ingested. Return it without spending an AI call.
  const [existingChapter] = await db()
    .select({ id: chapter.id })
    .from(chapter)
    .where(and(eq(chapter.textbookId, textbookId), eq(chapter.title, title)))
    .limit(1);
  if (existingChapter) {
    return ok(res, {
      textbookId,
      chapterId: existingChapter.id,
      conceptsExtracted: 0,
      reused: true,
    });
  }

  if (!allowAiRequest(req)) return aiBudgetError(res, req);

  const chapterId = crypto.randomUUID();
  await db().insert(chapter).values({
    id: chapterId,
    textbookId,
    title,
    rawText,
  });

  const extracted = await ai.extractConcepts(rawText);
  // A chapter read from a contents page carries the author's own structure;
  // the model is still asked, because it finds misconceptions and detail the
  // contents left out, but it no longer decides what the chapter contains or
  // what order it goes in.
  const concepts = mergeConcepts(topics, extracted);
  if (concepts.length) {
    await db()
      .insert(conceptNode)
      .values(
        concepts.map((c, i) => ({
          id: crypto.randomUUID(),
          chapterId,
          conceptText: c.conceptText,
          isMisconception: c.isMisconception,
          weight: c.weight,
          sortOrder: i,
        })),
      );
  }

  ok(
    res,
    {
      textbookId,
      chapterId,
      conceptsExtracted: concepts.length,
      // Worth showing: it tells the student the checklist came from the book.
      seededFromContents: (topics?.length ?? 0) > 0,
      reused: false,
    },
    201,
  );
});

// What the visitor can still spend — the UI paints this as a small pill so
// nobody is surprised by a 429 mid-session, and so "when does it restart?" has
// an answer with a number on it instead of "soon".
router.get("/ai/budget", async (req, res) => {
  const [ai, books] = await Promise.all([
    Promise.resolve(aiBudgetFor(req)),
    dailyBookUsageFor(req),
  ]);
  ok(res, { ...ai, books });
});

// Process-wide counters for how the AI seam is actually behaving: attempts,
// retries, and the four ways a student ends up on a deterministic fallback
// instead of a real model answer. This is the "usage visibility" the money
// decision needs — in-memory for now, so it resets on restart, but it is what
// tells us whether we are quietly serving fallbacks and not real generations.
router.get("/ai/telemetry", async (_req, res) => {
  ok(res, aiTelemetrySnapshot());
});

// Each textbook with its chapters, in import order — the library view and the
// resume-import logic (skip chapters whose title already exists) both read this.
router.get("/textbooks", async (req, res) => {
  const owner = ownerId(req);
  const textbooks = await db()
    .select()
    .from(textbook)
    .where(eq(textbook.ownerId, owner))
    .orderBy(desc(textbook.createdAt));

  const chapterRows = await db()
    .select({
      id: chapter.id,
      textbookId: chapter.textbookId,
      title: chapter.title,
      createdAt: chapter.createdAt,
    })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(eq(textbook.ownerId, owner))
    .orderBy(chapter.createdAt);

  ok(
    res,
    textbooks.map((t) => ({
      ...t,
      chapters: chapterRows.filter((c) => c.textbookId === t.id),
    })),
  );
});

router.get("/chapters", async (req, res) => {
  const owner = ownerId(req);
  const rows = await db()
    .select({
      id: chapter.id,
      title: chapter.title,
      textbookTitle: textbook.title,
      subject: textbook.subject,
      unitId: chapter.unitId,
      createdAt: chapter.createdAt,
    })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .leftJoin(syllabusUnit, eq(chapter.unitId, syllabusUnit.id))
    .where(eq(textbook.ownerId, owner))
    .orderBy(desc(chapter.createdAt));

  ok(res, rows);
});

router.get("/chapters/:id/concepts", async (req, res) => {
  const owner = ownerId(req);
  const rows = await db()
    .select()
    .from(conceptNode)
    .innerJoin(chapter, eq(conceptNode.chapterId, chapter.id))
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(
      and(
        eq(conceptNode.chapterId, req.params.id),
        eq(textbook.ownerId, owner),
      ),
    )
    .orderBy(conceptNode.sortOrder);

  ok(res, rows);
});

// ────────────────────────────────────────────────────────────────
// Study sessions
// ────────────────────────────────────────────────────────────────

const startSessionSchema = z.object({
  chapterId: z
    .string({ message: "Choose a chapter to start." })
    .min(1, "Choose a chapter to start."),
});

router.post("/sessions/start", async (req, res) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const sessionId = crypto.randomUUID();
  const { chapterId } = parsed.data;
  const userId = ownerId(req);
  const chapterExists = await db()
    .select({ id: chapter.id })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(and(eq(chapter.id, chapterId), eq(textbook.ownerId, userId)))
    .limit(1);
  if (!chapterExists.length) return err(res, "Chapter not found", 404);

  await db()
    .insert(studySession)
    .values({
      id: sessionId,
      chapterId,
      userId: userId ?? null,
    });

  ok(res, { sessionId }, 201);
});

async function findSession(sessionId: string, userId?: string) {
  const rows = await db()
    .select()
    .from(studySession)
    .where(
      userId
        ? and(eq(studySession.id, sessionId), eq(studySession.userId, userId))
        : eq(studySession.id, sessionId),
    )
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
async function resultSummary(
  sessionId: string,
  userId?: string,
): Promise<SessionResultSummary | null> {
  const session = await findSession(sessionId, userId);
  if (!session) return null;

  const attemptsRows = await db()
    .select({ stage: attempt.stage, score: attempt.score })
    .from(attempt)
    .where(eq(attempt.sessionId, sessionId))
    .orderBy(attempt.createdAt);

  const recallAttempt = attemptsRows.find(
    (a) => a.stage === "recall" && a.score !== null,
  );
  const retestScores = attemptsRows
    .filter(
      (a): a is { stage: "retest"; score: number } =>
        a.stage === "retest" && a.score !== null,
    )
    .map((a) => a.score);
  const before = recallAttempt?.score ?? null;
  const after = retestScores.length
    ? Math.round(
        retestScores.reduce((sum, s) => sum + s, 0) / retestScores.length,
      )
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
router.get("/sessions", async (req, res) => {
  const userId = ownerId(req);
  const rows = await db()
    .select()
    .from(studySession)
    .where(eq(studySession.userId, userId))
    .orderBy(desc(studySession.startedAt))
    .limit(20);
  const out = [];
  for (const row of rows) {
    const summary = await resultSummary(row.id, userId);
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
  const userId = ownerId(req);
  const rows = await db()
    .select()
    .from(studySession)
    .where(
      and(eq(studySession.id, req.params.id), eq(studySession.userId, userId)),
    )
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
  gapsIdentified: {
    covered: string[];
    missing: string[];
    misconceptions: string[];
    /** Phase 11: per-concept levels, the source the three lists derive from.
     *  Optional so attempts written before this change still read back. */
    mastery?: Record<string, number>;
    /** True when the grade came from the lexical fallback, which cannot judge
     *  correctness. The UI must not present such a score as a real one. */
    estimated?: boolean;
  };
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
  await db()
    .insert(attempt)
    .values({ ...record, id })
    .onConflictDoNothing();
  return true;
}

// ────────────────────────────────────────────────────────────────
// Bet 2: misconception hits (the national misconception map)
// ────────────────────────────────────────────────────────────────

// Aggregates are only shown when a cluster clears this floor; below it a
// handful of students could be identified. Aggregate-only, no user ids ever
// returned, no transcripts anywhere near the response.
const MISCONCEPTION_K_ANON = 5;

function normalizePhrase(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// Graders flag misconceptions as free text ("they think mitochondria make
// glucose"). The chapter's checklist carries the known misconceptions, so we
// resolve each flagged phrase to its concept row — exact match first, then a
// containment match — and write one hit per (session, concept). The unique
// index makes a retried grading a no-op instead of a double count.
async function recordMisconceptionHits(
  chapterId: string,
  sessionId: string,
  userId: string,
  flaggedTexts: string[],
): Promise<void> {
  if (flaggedTexts.length === 0) return;
  const flagged = [...new Set(flaggedTexts.map(normalizePhrase))].filter(
    Boolean,
  );
  if (flagged.length === 0) return;

  const candidates = await db()
    .select({ id: conceptNode.id, conceptText: conceptNode.conceptText })
    .from(conceptNode)
    .where(
      and(
        eq(conceptNode.chapterId, chapterId),
        eq(conceptNode.isMisconception, true),
      ),
    );

  const normalized = candidates.map((c) => ({
    id: c.id,
    text: normalizePhrase(c.conceptText),
  }));

  const matchedIds = new Set<string>();
  for (const text of flagged) {
    const hit =
      normalized.find((c) => c.text === text) ??
      normalized.find((c) => c.text.includes(text) || text.includes(c.text));
    if (hit) matchedIds.add(hit.id);
  }
  if (matchedIds.size === 0) return;

  await db()
    .insert(misconceptionHit)
    .values(
      [...matchedIds].map((conceptNodeId) => ({
        id: crypto.randomUUID(),
        conceptNodeId,
        sessionId,
        userId,
      })),
    )
    .onConflictDoNothing();
}

// The aggregate map. Optional ?subject= Biology filter; otherwise nationwide.
// Only clusters at or above the k-anonymity floor come back, newest-first by
// how common they are.
router.get("/misconceptions", async (req, res) => {
  const subject =
    typeof req.query.subject === "string" ? req.query.subject.trim() : null;

  const rows = await db()
    .select({
      conceptText: conceptNode.conceptText,
      count: count(misconceptionHit.id),
      unitNumber: syllabusUnit.unitNumber,
      unitTitle: syllabusUnit.title,
    })
    .from(misconceptionHit)
    .innerJoin(conceptNode, eq(misconceptionHit.conceptNodeId, conceptNode.id))
    .innerJoin(chapter, eq(conceptNode.chapterId, chapter.id))
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .leftJoin(syllabusUnit, eq(chapter.unitId, syllabusUnit.id))
    .where(and(subject ? eq(textbook.subject, subject) : undefined))
    .groupBy(
      conceptNode.conceptText,
      syllabusUnit.unitNumber,
      syllabusUnit.title,
    )
    .having(gte(count(misconceptionHit.id), MISCONCEPTION_K_ANON))
    .orderBy(desc(count(misconceptionHit.id)))
    .limit(20);

  ok(res, {
    threshold: MISCONCEPTION_K_ANON,
    subject: subject ?? null,
    rows,
  });
});

// ────────────────────────────────────────────────────────────────
// Recall → gap analysis
// ────────────────────────────────────────────────────────────────

const recallSchema = z.object({
  transcriptText: z
    .string({ message: "Say a little something so we can grade your recall." })
    .trim()
    .min(1, "Say a little something so we can grade your recall.")
    .max(20_000, "That answer is too long — try again in shorter chunks."),
  attemptId: z.string().optional(),
});

router.post("/sessions/:id/recall", async (req, res) => {
  if (!allowAiRequest(req)) return aiBudgetError(res, req);
  const parsed = recallSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const sessionId = req.params.id;

  const chapterId = await sessionChapterId(sessionId, ownerId(req));
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
      mastery: gaps.mastery,
      estimated: gaps.estimated,
    },
    score,
  });

  // Bet 2: surface the misconceptions this student showed into the aggregate
  // map (no-op when nothing matched a known misconception, and deduped by the
  // unique index so retries don't double-count).
  await recordMisconceptionHits(
    chapterId,
    sessionId,
    ownerId(req),
    gaps.misconceptions,
  );

  ok(res, {
    transcriptText: parsed.data.transcriptText,
    gaps: { ...gaps, score },
  });
});

// ────────────────────────────────────────────────────────────────
// Micro-lesson
// ────────────────────────────────────────────────────────────────

const microlessonSchema = z.object({
  missing: z.array(z.string().trim().min(1).max(500)).max(50),
  misconceptions: z.array(z.string().trim().min(1).max(500)).max(50),
  language: z.enum(["en", "am"]).optional(),
});

router.post("/sessions/:id/microlesson", async (req, res) => {
  if (!allowAiRequest(req)) return aiBudgetError(res, req);
  const parsed = microlessonSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);

  const concepts = await chapterConcepts(chapterId);

  const gapAnalysis = gapAnalysisFrom(
    {
      missing: parsed.data.missing,
      misconceptions: parsed.data.misconceptions,
    },
    concepts,
  );

  const lesson = await ai.generateMicroLesson(
    gapAnalysis,
    concepts,
    parsed.data.language,
  );
  ok(res, lesson);
});

// ────────────────────────────────────────────────────────────────
// Guide
// ────────────────────────────────────────────────────────────────

/** Load cached sections for a chapter in one query, keyed by concept. */
async function cachedSections(
  chapterId: string,
  language: "en" | "am",
): Promise<Map<string, typeof guideSection.$inferSelect>> {
  const rows = await db()
    .select()
    .from(guideSection)
    .where(
      and(
        eq(guideSection.chapterId, chapterId),
        eq(guideSection.language, language),
      ),
    );
  return new Map(rows.map((r) => [r.conceptText.trim().toLowerCase(), r]));
}

/** Insert a section, treating a concurrent insert as success. */
async function storeSection(
  chapterId: string,
  conceptText: string,
  language: "en" | "am",
  section: GuideSection,
): Promise<void> {
  await db()
    .insert(guideSection)
    .values({
      id: crypto.randomUUID(),
      chapterId,
      conceptText,
      language,
      whatText: section.what,
      whyText: section.why ?? null,
      recallText: section.recall ?? null,
      sourceOffset: section.sourceOffset ?? null,
      sourceQuote: section.sourceQuote ?? null,
      estimated: section.estimated,
    })
    .onConflictDoNothing();
}

/**
 * The guide: sections in the order THIS student needs, built from mastery.
 *
 * Ordering is deterministic and costs nothing — it is not asked of a model.
 * "Explained wrong" first, because a wrong belief is the one thing a student
 * cannot revise by re-reading alone; then "raised but not explained", the
 * cheapest win; then untouched concepts by importance. Solid concepts are
 * listed last as a one-line confirmation rather than a section to read.
 *
 * Content is cached per (chapter, concept, language), so this call spends AI
 * calls only for concepts nobody has generated yet — the second student on a
 * chapter spends none at all.
 */
router.get("/chapters/:id/guide", async (req, res) => {
  const chapterId = await chapterOwned(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Chapter not found", 404);

  const language = req.query.language === "am" ? "am" : "en";
  const concepts = await chapterConcepts(chapterId);
  const [row] = await db()
    .select({ rawText: chapter.rawText })
    .from(chapter)
    .where(eq(chapter.id, chapterId))
    .limit(1);
  const rawText = row?.rawText ?? "";

  const mastery = readMasteryParam(req.query.mastery);
  const cache = await cachedSections(chapterId, language);

  // The concepts worth generating: everything not already solid. Solid ones
  // need no AI call and no stored row.
  const targets = triageConcepts(concepts, mastery).filter(
    (c) => levelOf(mastery, c.conceptText) !== 3,
  );

  let estimated = false;
  // A cold chapter is ~10 uncached concepts, so this loop is the one place that
  // can spend a whole minute of the student's budget in a single click. Each
  // generation is charged individually; once the window is spent the remaining
  // concepts fall back to the lexical section rather than failing the request,
  // because a chapter full of fallbacks is a far better answer than a 429 and
  // nothing at all. Fallbacks produced *because of* the budget are deliberately
  // not stored — otherwise a busy minute would poison the cache and every later
  // visitor would read them as if they had been written properly.
  let throttled = false;
  for (const concept of targets) {
    const key = concept.conceptText.trim().toLowerCase();
    if (cache.has(key)) continue;
    const skipAi = !allowAiRequest(req);
    if (skipAi) throttled = true;
    const section = await ai.generateGuideSection(
      concept.conceptText,
      rawText,
      language,
      { skipAi },
    );
    if (!skipAi) {
      await storeSection(chapterId, concept.conceptText, language, section);
    }
    // Always in the map for this response, so a budget-capped chapter still
    // shows the section it just built rather than collapsing to the skeleton.
    cache.set(key, {
      id: "",
      chapterId,
      conceptText: concept.conceptText,
      language,
      whatText: section.what,
      whyText: section.why ?? null,
      recallText: section.recall ?? null,
      sourceOffset: section.sourceOffset ?? null,
      sourceQuote: section.sourceQuote ?? null,
      estimated: section.estimated,
      createdAt: new Date(),
    });
  }

  const sections = triageConcepts(concepts, mastery)
    .map((concept) => {
      const level = levelOf(mastery, concept.conceptText);
      const cached = cache.get(concept.conceptText.trim().toLowerCase());
      if (level === 3) {
        return {
          conceptText: concept.conceptText,
          weight: concept.weight,
          level,
          what: language === "am" ? "ይህን በጠንክር ታደርግሃለህ።" : "You have this one.",
          why: null,
          recall: null,
          sourceOffset: null,
          sourceQuote: null,
          estimated: false,
          needsWork: false,
        };
      }
      if (!cached) {
        // Nothing cached and nothing generated: the checklist itself is the
        // skeleton, so a chapter with no prose is still a usable revision list.
        return {
          conceptText: concept.conceptText,
          weight: concept.weight,
          level,
          what:
            language === "am"
              ? `“${concept.conceptText}” — ከዚህ ታች ባለው ክፍል ይሸፍናል።`
              : `“${concept.conceptText}” — the part of your book below covers it.`,
          why: null,
          recall: null,
          sourceOffset: null,
          sourceQuote: null,
          estimated: true,
          needsWork: true,
        };
      }
      if (cached.estimated) estimated = true;
      return {
        conceptText: concept.conceptText,
        weight: concept.weight,
        level,
        what: cached.whatText,
        why: cached.whyText,
        recall: cached.recallText,
        sourceOffset: cached.sourceOffset,
        sourceQuote: cached.sourceQuote,
        estimated: cached.estimated,
        needsWork: true,
      };
    })
    .filter((s) => s.needsWork || s.level === 3);

  ok(res, {
    sections,
    estimated,
    throttled,
    retryAfterSeconds: throttled ? aiBudgetFor(req).retryAfterSeconds : 0,
    language,
  });
});

// ────────────────────────────────────────────────────────────────
// Retest
// ────────────────────────────────────────────────────────────────

const retestSchema = z.object({
  missing: z.array(z.string().trim().min(1).max(500)).max(50),
  misconceptions: z.array(z.string().trim().min(1).max(500)).max(50),
  language: z.enum(["en", "am"]).optional(),
});

router.post("/sessions/:id/retest", async (req, res) => {
  if (!allowAiRequest(req)) return aiBudgetError(res, req);
  const parsed = retestSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);

  const concepts = await chapterConcepts(chapterId);

  const gapAnalysis = gapAnalysisFrom(
    {
      missing: parsed.data.missing,
      misconceptions: parsed.data.misconceptions,
    },
    concepts,
  );

  // Echo the student's own recall: hand the question writer their latest
  // spoken/written recall for this session so it mirrors how they phrased
  // things, instead of sounding like a canned quiz.
  const recallRows = await db()
    .select({ transcriptText: attempt.transcriptText })
    .from(attempt)
    .where(
      and(eq(attempt.sessionId, req.params.id), eq(attempt.stage, "recall")),
    )
    .orderBy(desc(attempt.createdAt))
    .limit(1);

  const questions = await ai.generateRetestQuestions(
    gapAnalysis,
    concepts,
    recallRows[0]?.transcriptText ?? undefined,
    parsed.data.language,
  );

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
      const wanted = q.targetConcept;
      const canonical = concepts.find(
        (c) => byName(c.conceptText) === byName(wanted),
      );
      if (canonical) target = canonical.conceptText;
    }
    if (!target && canonicalGapItems.length) {
      const fallback = canonicalGapItems[i % canonicalGapItems.length];
      if (fallback) target = fallback;
    }
    return { question: q.question, focus: target ? [target] : [] };
  });

  await db()
    .update(studySession)
    .set({ retestQuestions: withFocus, retestIndex: 0 })
    .where(
      and(
        eq(studySession.id, req.params.id),
        eq(studySession.userId, ownerId(req)),
      ),
    );

  ok(res, { questions: withFocus });
});

const answerSchema = z.object({
  transcriptText: z
    .string({ message: "Say a little something so we can grade your answer." })
    .trim()
    .min(1, "Say a little something so we can grade your answer.")
    .max(20_000, "That answer is too long — try again in shorter chunks."),
  questionIndex: z
    .number({ message: "That retest question can't be found." })
    .int()
    .min(0, "That retest question can't be found."),
  attemptId: z.string().optional(),
});

router.post("/sessions/:id/retest/answer", async (req, res) => {
  if (!allowAiRequest(req)) return aiBudgetError(res, req);
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);

  const session = await findSession(req.params.id, ownerId(req));
  const question = session?.retestQuestions?.[parsed.data.questionIndex];
  if (!session || !question) return err(res, "Retest question not found", 400);
  if (parsed.data.questionIndex !== session.retestIndex) {
    return err(res, "That retest question is out of order", 409);
  }
  const allConcepts = await chapterConcepts(chapterId);
  const focus = question.focus;
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
      isMisconception: false,
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

  const currentSession = session;
  const inserted = await insertAttemptOnce({
    id: parsed.data.attemptId,
    sessionId: req.params.id,
    stage: "retest",
    transcriptText: parsed.data.transcriptText,
    gapsIdentified: {
      covered: gaps.covered,
      missing: gaps.missing,
      misconceptions: gaps.misconceptions,
      mastery: gaps.mastery,
      estimated: gaps.estimated,
    },
    score,
  });
  if (inserted) {
    await db()
      .update(studySession)
      .set({ retestIndex: (currentSession?.retestIndex ?? 0) + 1 })
      .where(
        and(
          eq(studySession.id, req.params.id),
          eq(studySession.userId, ownerId(req)),
        ),
      );
  }

  ok(res, { score, gaps: { ...gaps, score } });
});

// ────────────────────────────────────────────────────────────────
// Result → before / after delta
// ────────────────────────────────────────────────────────────────

router.get("/sessions/:id/result", async (req, res) => {
  const summary = await resultSummary(req.params.id, ownerId(req));
  if (!summary) return err(res, "Session not found", 404);
  ok(res, summary);
});

// ────────────────────────────────────────────────────────────────
// Complete session
// ────────────────────────────────────────────────────────────────

router.post("/sessions/:id/complete", async (req, res) => {
  const session = await findSession(req.params.id, ownerId(req));
  if (!session) return err(res, "Session not found", 404);

  await db()
    .update(studySession)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(studySession.id, req.params.id),
        eq(studySession.userId, ownerId(req)),
      ),
    );

  const durationMs = session.startedAt
    ? Math.max(0, Date.now() - session.startedAt.getTime())
    : null;

  ok(res, { ok: true, durationMs });
});

export default router;
