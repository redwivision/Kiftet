import {
  attempt,
  chapter,
  chapterObjective,
  conceptNode,
  guideSection,
  misconceptionHit,
  type StoredQuestion,
  studyQueue,
  studySession,
  syllabusUnit,
  type TextbookTocNode,
  textbook,
  user,
} from "@kiftet/db/schema";
import { and, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  AI_PROVIDERS,
  type AiProvider,
  allAdmissionSnapshots,
  isAiBusy,
} from "../ai/admission";
import { mergeConcepts } from "../ai/concepts";
import {
  ai,
  aiLastProbes,
  aiProviderConfig,
  aiTelemetrySnapshot,
  buildStudyPlan,
  type ChapterExtraction,
  type ContentsImage,
  focusScore,
  type GeneratedQuestion,
  type GuideSection,
  gapAnalysisFrom,
  levelOf,
  type MasteryLevel,
  type MasteryMap,
  probeProvider,
  providerHealth,
  triageConcepts,
} from "../ai/gemini";
import {
  GUIDE_CONTENT_BUDGET_MS,
  REVIEW_DUE_DAYS,
  STUDY_PLAN_BUDGETS,
  STUDY_PLAN_CONTENT_BUDGET_MS,
  STUDY_PLAN_DEFAULT_BUDGET,
} from "../ai/plan-config";
import { enforceRecallMix, judgeClosedAnswer } from "../ai/questions";
import {
  buildCoverageUnits,
  type RecallUnit,
  scopedConcepts,
  scopedUnits,
} from "../ai/recall-coverage";
import {
  deriveSessionVerdict,
  masteryFromStudyAttempts,
  type SessionVerdict,
} from "../ai/retest-verdict";
import { summarizeStudyScores } from "../ai/study-result";
import { minuteBucket, quotaState } from "../lib/ai-quota";
import {
  consumeAiRequest,
  pruneAiUsage,
  readAiUsage,
} from "../lib/ai-quota-store";
import { nextQueueSlot, orderedQueueSlots } from "../lib/study-queue";
import { getDb } from "../services";
import { DEMO_SEED_TITLE } from "./demo";

const router = Router();

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

function aiLimitFor(req: Request): number {
  return isDemo(req)
    ? AI_REQUESTS_PER_MINUTE.demo
    : AI_REQUESTS_PER_MINUTE.signedIn;
}

// Non-consuming read of the current-minute budget for an owner. The counter
// lives in `ai_usage` (one row per owner per clock-minute) rather than in this
// process, so it is shared across instances and survives a restart — the old
// in-memory window forgot every count the moment the process recycled, which is
// exactly when a burst is most likely to slip through.
async function aiBudgetFor(req: Request) {
  const owner = ownerId(req);
  const now = new Date();
  const callsThisMinute = await readAiUsage(db(), owner, now);
  return {
    demo: isDemo(req),
    ...quotaState({
      count: callsThisMinute,
      limitPerMinute: aiLimitFor(req),
      bucket: minuteBucket(now),
      now: now.getTime(),
    }),
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

// Consume one AI request from the owner's minute, atomically. `consumeAiRequest`
// does the check and the increment as a single statement, so the answer it
// returns is the one that counts — a caller that runs concurrently with another
// cannot both be told "allowed" for the same last slot.
async function allowAiRequest(req: Request): Promise<boolean> {
  const owner = ownerId(req);
  const { allowed } = await consumeAiRequest(db(), owner, aiLimitFor(req));
  if (allowed) {
    // Opportunistic cleanup: this owner's older buckets are scratch nobody will
    // read again. Pruning here keeps the table from accumulating one dead row
    // per student per minute without a scheduled job.
    void pruneAiUsage(db(), owner).catch(() => {});
  }
  return allowed;
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

async function chapterSubject(chapterId: string): Promise<string | undefined> {
  const row = await db()
    .select({ subject: textbook.subject })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(eq(chapter.id, chapterId))
    .limit(1)
    .then((r) => r[0]);
  return row?.subject || undefined;
}

/** The chapter's raw text — handed to the recall writer only so its
 *  deterministic, no-model fallback can ground closed questions in the book's
 *  own sentences rather than inventing them. */
async function chapterRawText(chapterId: string): Promise<string> {
  const row = await db()
    .select({ rawText: chapter.rawText })
    .from(chapter)
    .where(eq(chapter.id, chapterId))
    .limit(1)
    .then((r) => r[0]);
  return row?.rawText ?? "";
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
async function aiBudgetError(res: Response, req: Request) {
  const { retryAfterSeconds } = await aiBudgetFor(req);
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
    return "Something required is missing or too short. Check the form and try again.";
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

/** The chapter's stated learning objectives, in the book's own order. Fed to
 *  both question writers so a retest can hold the student to the author's
 *  contract, not only to the extracted concept list. */
async function chapterObjectiveText(chapterId: string): Promise<string[]> {
  const rows = await db()
    .select({ objectiveText: chapterObjective.objectiveText })
    .from(chapterObjective)
    .where(eq(chapterObjective.chapterId, chapterId))
    .orderBy(chapterObjective.sortOrder);
  return rows.map((r) => r.objectiveText);
}

const byName = (value: string) => value.trim().toLowerCase();

/**
 * The concept rows a question is graded against, given its `focus` strings.
 * Focus is matched against the stored checklist tolerantly (case/whitespace);
 * a focus that has no stored counterpart (e.g. a beyond-textbook question's
 * objective, or a freshly graded misconception) is synthesized so the answer
 * can still be graded against that idea alone.
 */
async function focusSubset(chapterId: string, focus: string[]) {
  const allConcepts = await chapterConcepts(chapterId);
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
  return [...graded, ...extras];
}

/**
 * Merge every "recall" attempt on a session into ONE gap analysis. In blurting
 * mode there is a single attempt, so this is that attempt; in targeted mode
 * each answered question contributes the levels for its own concept, and the
 * union is what the plan/lesson/retest run on. Levels from any attempt win for
 * the concepts that attempt judged; the lists are de-duplicated and the score
 * is the mean of the per-attempt scores.
 */
async function mergeRecallGaps(sessionId: string): Promise<{
  covered: string[];
  missing: string[];
  misconceptions: string[];
  unprobed: string[];
  mastery: MasteryMap;
  score: number;
  estimated: boolean;
}> {
  const session = await db()
    .select({
      chapterId: studySession.chapterId,
      scopeKeys: studySession.scopeKeys,
    })
    .from(studySession)
    .where(eq(studySession.id, sessionId))
    .limit(1)
    .then((r) => r[0]);

  const rows = await db()
    .select({
      score: attempt.score,
      gapsIdentified: attempt.gapsIdentified,
    })
    .from(attempt)
    .where(and(eq(attempt.sessionId, sessionId), eq(attempt.stage, "recall")))
    .orderBy(attempt.createdAt);

  const mastery: MasteryMap = {};
  const covered = new Set<string>();
  const missing = new Set<string>();
  const misconceptions = new Set<string>();
  const scores: number[] = [];
  let estimated = false;

  for (const row of rows) {
    const raw = row.gapsIdentified;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const g = raw as Record<string, unknown>;
      if (g.mastery && typeof g.mastery === "object") {
        for (const [concept, level] of Object.entries(
          g.mastery as Record<string, number>,
        )) {
          mastery[concept] = level as MasteryLevel;
        }
      }
      for (const key of ["covered", "missing", "misconceptions"] as const) {
        const list = g[key];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          if (typeof item !== "string") continue;
          if (key === "covered") covered.add(item);
          else if (key === "missing") missing.add(item);
          else misconceptions.add(item);
        }
      }
      if (g.estimated === true) estimated = true;
    }
    if (typeof row.score === "number") scores.push(row.score);
  }

  // A concept is "covered" if it was judged correct; drop it from missing. The
  // lists are derived from mastery where available so they cannot contradict.
  for (const [concept, level] of Object.entries(mastery)) {
    if (level === 3) {
      covered.add(concept);
      missing.delete(concept);
      misconceptions.delete(concept);
    } else if (level === 2) {
      misconceptions.add(concept);
      covered.delete(concept);
    } else {
      missing.add(concept);
      covered.delete(concept);
    }
  }
  for (const concept of covered) missing.delete(concept);

  const score = scores.length
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : 0;

  const unprobed: string[] = [];
  if (session?.chapterId) {
    const allConcepts = await db()
      .select({
        conceptText: conceptNode.conceptText,
        sortOrder: conceptNode.sortOrder,
      })
      .from(conceptNode)
      .where(eq(conceptNode.chapterId, session.chapterId))
      .orderBy(conceptNode.sortOrder);
    // Out-of-scope sections are not "leftovers" — the student chose not to
    // study them, so the retest writer must not be told to cover them.
    const inScope = scopedConcepts(allConcepts, session.scopeKeys);
    const judged = new Set<string>();
    for (const c of covered) judged.add(c.toLowerCase());
    for (const m of missing) judged.add(m.toLowerCase());
    for (const x of misconceptions) judged.add(x.toLowerCase());
    for (const k of Object.keys(mastery)) judged.add(k.toLowerCase());
    for (const c of inScope) {
      if (judged.has(c.conceptText.toLowerCase())) continue;
      unprobed.push(c.conceptText);
    }
  }

  return {
    covered: [...covered],
    missing: [...missing],
    misconceptions: [...misconceptions],
    unprobed,
    mastery,
    score,
    estimated,
  };
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

const ingestTopicSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1, "A topic name came through empty.")
    .max(300, "That topic name is too long."),
  title: z
    .string()
    .trim()
    .min(1, "A topic name came through empty.")
    .max(300, "That topic name is too long."),
  page: z.number().int().min(0).nullable(),
});

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
   * The chapter's own topics, in the order the book lays them out, as printed:
   * "2.3.1 The internal structure of a leaf", with the page each begins on.
   *
   * When the import could read a contents page these arrive with the chapter
   * and are used verbatim. A model re-inferring a table of contents from prose
   * gets the *ideas* right and the *structure* wrong — it will happily return
   * twelve unrelated bullets where the book had three nested sections, and it
   * will reorder them. The book already knows. They are stored whole (not just
   * the label) so a later read can tell where each topic sits in the book.
   */
  topics: z
    .array(ingestTopicSchema)
    .max(200, "Too many topics in one chapter.")
    .optional(),
});

const saveTextbookSchema = z.object({
  title: z.string().trim().min(1, "Name the textbook first.").max(200),
  subject: z.string().trim().min(1, "Which subject is it?").max(120),
  language: z.string().trim().min(1).max(24).default("en"),
  sourceName: z.string().trim().min(1).max(255).optional(),
  sourceSize: z.number().int().positive().optional(),
  toc: z
    .array(z.unknown())
    .min(
      1,
      "No chapters were found in this book. Add a page range, or paste more of the book, then try again.",
    )
    .max(200, "That book has too many contents entries."),
});

function isTocPage(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0)
  );
}

function isTextbookToc(value: unknown): value is TextbookTocNode[] {
  if (!Array.isArray(value)) return false;
  const pending = value.map((node) => ({ node, depth: 1 }));
  const ids = new Set<string>();
  let nodeCount = 0;
  while (pending.length) {
    const item = pending.pop();
    if (!item || item.depth > 12 || ++nodeCount > 2_000) return false;
    if (
      typeof item.node !== "object" ||
      item.node === null ||
      Array.isArray(item.node)
    ) {
      return false;
    }
    const node = item.node as Record<string, unknown>;
    if (
      typeof node.id !== "string" ||
      !node.id.trim() ||
      node.id.length > 200 ||
      ids.has(node.id) ||
      typeof node.title !== "string" ||
      !node.title.trim() ||
      node.title.length > 300 ||
      !isTocPage(node.start) ||
      !isTocPage(node.end) ||
      !Array.isArray(node.children) ||
      node.children.length > 100
    ) {
      return false;
    }
    ids.add(node.id);
    pending.push(
      ...node.children.map((child) => ({ node: child, depth: item.depth + 1 })),
    );
  }
  return true;
}

function saveableTextbookToc(nodes: TextbookTocNode[]): TextbookTocNode[] {
  return nodes.map(({ id, title, start, end, children }) => ({
    id,
    title,
    start,
    end,
    children: saveableTextbookToc(children),
  }));
}

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
      objectivesExtracted: 0,
      reused: true,
    });
  }

  const chapterId = crypto.randomUUID();
  await db()
    .insert(chapter)
    .values({
      id: chapterId,
      textbookId,
      title,
      rawText,
      topics: topics ?? null,
      // Left null on purpose: the model read is deferred to the moment the
      // chapter is actually studied (see `ensureChapterExtraction`). Importing a
      // whole book used to spend one free-tier call per chapter up front, most of
      // them on chapters the student would never open — which is what ran the
      // shared quota dry before the student reached the chapter they came for.
      extractedAt: null,
    });

  // The book's own contents is enough to seed the checklist now: those topics
  // are the author's structure, needing no model. Concepts the model finds in
  // the prose (and the objectives the book states) are added later, once, when
  // a session or the opener asks for them.
  const concepts = mergeConcepts(
    topics?.map((topic) => topic.path),
    [],
  );
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
      objectivesExtracted: 0,
      // Worth showing: it tells the student the checklist came from the book.
      seededFromContents: (topics?.length ?? 0) > 0,
      reused: false,
    },
    201,
  );
});

// The model reads that are underway on *this* process, keyed by chapter. Two
// requests that arrive together on the same instance share one call instead of
// spending two. This is only a fast-path coalescer: correctness does not depend
// on it (another instance has its own map), which is why the write below is
// made idempotent at the database.
const extractionInFlight = new Map<string, Promise<void>>();

// Advisory-lock namespace for chapter extraction. `pg_advisory_xact_lock` is
// scoped to the transaction, so the lock releases on commit or rollback without
// a separate unlock path that a crash could skip.
const EXTRACTION_LOCK_NAMESPACE = 1729;

/**
 * Bring a chapter's checklist up to date with the model — once.
 *
 * Import writes only the book's own contents (its topics). The model read that
 * adds the concepts the prose holds and the objectives the book states is
 * deferred to here, and runs at most once per chapter: the first session start
 * or checklist open for an un-read chapter pays for it, every later one is
 * free. On success the chapter is stamped `extractedAt`, so the read never
 * happens twice.
 *
 * Best-effort by design. This rides along with a request the student made for
 * something else (their session, their checklist), so a chapter read that is
 * busy, throttled, or simply wrong must never fail that request, and must never
 * hand back the deterministic fallback as though it were the model's read: a
 * `degraded` rethrow of `AiBusyError` is caught here and the chapter is left
 * un-stamped so a calmer moment can try again.
 *
 * The write is safe under concurrency at any instance count. The model call
 * happens outside any lock (it can take twenty seconds and must not hold a
 * connection), then the replace runs in one transaction holding a per-chapter
 * advisory lock. The lock makes two writers serialize; the `extractedAt`
 * re-check inside it makes the second one a no-op, so a competing instance's
 * work is discarded rather than interleaved. The delete-then-insert and the
 * stamp are in the same transaction, so a crash cannot leave a chapter with no
 * concepts, and the `(chapter_id, sort_order)` unique constraints turn any
 * residual duplicate write into a loud failure instead of silent doubling.
 */
async function ensureChapterExtraction(
  req: Request,
  chapterId: string,
): Promise<void> {
  const inFlight = extractionInFlight.get(chapterId);
  if (inFlight) return inFlight;

  const run = (async () => {
    const [row] = await db()
      .select({
        rawText: chapter.rawText,
        topics: chapter.topics,
        extractedAt: chapter.extractedAt,
      })
      .from(chapter)
      .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
      .where(and(eq(chapter.id, chapterId), eq(textbook.ownerId, ownerId(req))))
      .limit(1);
    // A missing chapter, one already read, or a moment with no AI budget left:
    // none of these is the caller's problem to report.
    if (!row || row.extractedAt) return;
    if (!(await allowAiRequest(req))) return;

    let extraction: ChapterExtraction;
    try {
      extraction = await ai.extractChapter(row.rawText);
    } catch {
      return;
    }
    // A fallback read is not worth writing: leave the chapter un-stamped so the
    // model can be tried again at a calmer moment.
    if (extraction.estimated) return;

    const concepts = mergeConcepts(
      row.topics?.map((topic) => topic.path),
      extraction.concepts,
    );

    await db().transaction(async (tx) => {
      // Serialize writers for this chapter. Released automatically when the
      // transaction ends.
      await tx.execute(
        sql`select pg_advisory_xact_lock(${EXTRACTION_LOCK_NAMESPACE}, hashtext(${chapterId}))`,
      );
      // Re-check under the lock: an instance that won the race has already
      // stamped the chapter, so this instance's (equally valid) read is
      // dropped rather than replacing a completed one.
      const [fresh] = await tx
        .select({ extractedAt: chapter.extractedAt })
        .from(chapter)
        .where(eq(chapter.id, chapterId))
        .limit(1);
      if (!fresh || fresh.extractedAt) return;

      // Replace, do not append: the rows written at import were the topic-only
      // seed, and this read is the fuller version of the same list.
      await tx.delete(conceptNode).where(eq(conceptNode.chapterId, chapterId));
      if (concepts.length) {
        await tx.insert(conceptNode).values(
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

      await tx
        .delete(chapterObjective)
        .where(eq(chapterObjective.chapterId, chapterId));
      if (extraction.objectives.length) {
        await tx.insert(chapterObjective).values(
          extraction.objectives.map((o, i) => ({
            id: crypto.randomUUID(),
            chapterId,
            objectiveText: o.objectiveText,
            sortOrder: i,
            sourceOffset: o.sourceOffset ?? null,
            sourceQuote: o.sourceQuote ?? null,
            estimated: extraction.estimated,
          })),
        );
      }

      await tx
        .update(chapter)
        .set({ extractedAt: new Date() })
        .where(eq(chapter.id, chapterId));
    });
  })();

  extractionInFlight.set(chapterId, run);
  try {
    await run;
  } finally {
    extractionInFlight.delete(chapterId);
  }
}

// What the visitor can still spend — the UI paints this as a small pill so
// nobody is surprised by a 429 mid-session, and so "when does it restart?" has
// an answer with a number on it instead of "soon".
router.get("/ai/budget", async (req, res) => {
  const [ai, books] = await Promise.all([
    aiBudgetFor(req),
    dailyBookUsageFor(req),
  ]);
  ok(res, { ...ai, books });
});

// Process-wide counters for how the AI seam is actually behaving: attempts,
// retries, and the four ways a student ends up on a deterministic fallback
// instead of a real model answer. This is the "usage visibility" the money
// decision needs — in-memory for now, so it resets on restart, but it is what
// tells us whether we are quietly serving fallbacks and not real generations.
//
// `config` and `health` keep two different claims apart: whether a key exists
// in this process's environment, and what we have observed since. Neither is a
// statement about the provider's own quota — only /ai/probe can establish that.
router.get("/ai/telemetry", async (_req, res) => {
  const providers = allAdmissionSnapshots();
  ok(res, {
    ...aiTelemetrySnapshot(),
    providers,
    config: aiProviderConfig(),
    health: {
      gemini: providerHealth("gemini"),
      groq: providerHealth("groq"),
    },
    probes: aiLastProbes(),
  });
});

// One real request per provider, spent only when a human asks, to answer the
// question /ai/telemetry cannot: is this key working right now? The cooldown is
// the abuse control — this route is reachable by any signed-in student, and
// without it a loop would drain the shared per-project quota that the whole
// product depends on.
const PROBE_COOLDOWN_MS = 60_000;
const probeCooldownUntil: Record<AiProvider, number> = { gemini: 0, groq: 0 };
const probeBodySchema = z.object({
  provider: z
    .enum(["gemini", "groq"], {
      message: "Specify which provider to probe, or send {} for both.",
    })
    .optional(),
});

router.post("/ai/probe", async (req, res) => {
  const parsed = probeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const targets: AiProvider[] = parsed.data.provider
    ? [parsed.data.provider]
    : [...AI_PROVIDERS];

  const now = Date.now();
  const blocked = targets.find((p) => probeCooldownUntil[p] > now);
  if (blocked) {
    const wait = Math.ceil((probeCooldownUntil[blocked] - now) / 1000);
    res.setHeader("Retry-After", String(wait));
    return err(
      res,
      `The ${blocked} probe spends a real request from the shared quota, so it runs at most once a minute. Try again in ${wait} second${wait === 1 ? "" : "s"}.`,
      429,
    );
  }

  // Claim the window before awaiting: a probe that hangs for ten seconds has
  // still spent (or is about to spend) the request, and a second click arriving
  // during it must not double the cost.
  for (const p of targets) probeCooldownUntil[p] = now + PROBE_COOLDOWN_MS;

  const probes = await Promise.all(targets.map((p) => probeProvider(p)));
  ok(res, { probes, cooldownSeconds: PROBE_COOLDOWN_MS / 1000 });
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

router.post("/textbooks", async (req, res) => {
  const parsed = saveTextbookSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const submittedToc = parsed.data.toc;
  if (!isTextbookToc(submittedToc))
    return err(res, "The table of contents is too large or invalid.");
  const { title, subject, language, sourceName, sourceSize } = parsed.data;
  const toc = saveableTextbookToc(submittedToc);
  const owner = ownerId(req);
  let textbookId: string;
  try {
    textbookId = await textbookIdFor(
      owner,
      title,
      subject,
      language,
      isDemo(req),
    );
  } catch (e) {
    if (e instanceof DailyBookLimitError)
      return err(res, e.message, 429, e.resetAt);
    throw e;
  }
  await db()
    .update(textbook)
    .set({ subject, language, sourceName, sourceSize, toc })
    .where(and(eq(textbook.id, textbookId), eq(textbook.ownerId, owner)));

  ok(res, { textbookId }, 201);
});

// The opening pages the browser already extracted, sent only when the
// deterministic contents parse came up empty. 24 pages x 1200 characters is
// about 29kb — comfortably inside the 256kb body, and small enough that one
// free-tier request is not paying to read half the book.
const contentsSchema = z.object({
  pages: z
    .array(
      z.object({
        index: z.number().int().min(0).max(10_000),
        text: z.string().max(4_000),
      }),
    )
    .min(1)
    .max(30),
});

/**
 * Read a textbook's table of contents with the model.
 *
 * This exists because the deterministic parser needs the word "contents" on
 * one of the first 15 pages to know where to look, and a book that does not
 * say it there falls through to the running-header scan — which, on the Grade
 * 10 History textbook, promoted every "Part I: Choose the best answer" exam
 * section to a chapter and lost Units 2-4.
 *
 * Answers `found: false` rather than an error when there is nothing to read or
 * no call to spend: the client falls back to exactly the scan it would have
 * used anyway, so a busy minute costs the student the model read and nothing
 * else.
 */
router.post("/textbooks/contents", async (req, res) => {
  const parsed = contentsSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  if (!(await allowAiRequest(req))) return aiBudgetError(res, req);
  try {
    return ok(res, await ai.parseContents(parsed.data.pages));
  } catch (error) {
    if (isAiBusy(error)) return await aiBudgetError(res, req);
    throw error;
  }
});

// A rendered contents page, sent only as the very last rung: the text layer
// would not come out and the on-device OCR was unusable. The client draws the
// page to an image on the device, so this stays the same privacy promise as
// the text read — the bytes are of the page, never the file. The ~4MB base64
// cap is roughly a 300 DPI page, past which the payload itself is the problem.
const contentsImageSchema = z.object({
  image: z.object({
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    dataBase64: z.string().min(1).max(6_000_000),
  }),
});

/**
 * Read a textbook's table of contents from a picture of its page.
 *
 * The last rung, reached only after the text layer, the deterministic parse
 * and the text reader have all failed. Gemini-only: the text-only provider is
 * never tried, and a deployment without that key answers `refused` so the
 * screen offers the Pages tab rather than blaming the book.
 */
router.post("/textbooks/contents-image", async (req, res) => {
  const parsed = contentsImageSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  if (!(await allowAiRequest(req))) return aiBudgetError(res, req);
  try {
    const image: ContentsImage = parsed.data.image;
    return ok(res, await ai.parseImageContents(image));
  } catch (error) {
    if (isAiBusy(error)) return await aiBudgetError(res, req);
    throw error;
  }
});

router.post("/textbooks/title", async (req, res) => {
  const parsed = contentsSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  if (!(await allowAiRequest(req))) return aiBudgetError(res, req);
  try {
    return ok(res, await ai.parseTitle(parsed.data.pages));
  } catch (error) {
    if (isAiBusy(error)) return await aiBudgetError(res, req);
    throw error;
  }
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
  // Opening the checklist is a good moment to bring it up to date: the student
  // is looking right at it, and if it only holds the book's contents we read
  // the prose now rather than serving a thinner list. Best-effort — a chapter
  // that cannot be read today still returns what it has.
  await ensureChapterExtraction(req, req.params.id);
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

/**
 * The chapter's studyable sections, as the scope picker shows them (phase 11,
 * step 4). These are the same coverage units the recall sweep and the exam
 * verdict use, so "2.3" means the same thing to the student, the question
 * planner and the pass/fail breakdown. Keys are stable section numbers, or
 * "w1"/"w2" for a book whose concepts carry no numbering.
 */
router.get("/chapters/:id/units", async (req, res) => {
  const chapterId = await chapterOwned(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Chapter not found", 404);
  await ensureChapterExtraction(req, chapterId);
  const concepts = (await chapterConcepts(chapterId)).filter(
    (concept) => !concept.isMisconception,
  );
  const weightOf = new Map(concepts.map((c) => [c.conceptText, c.weight]));
  const units = buildCoverageUnits(concepts, []).map((unit) => ({
    key: unit.key,
    label: unit.label,
    conceptCount: unit.concepts.length,
    weight: unit.concepts.reduce(
      (sum, name) => sum + (weightOf.get(name) ?? 1),
      0,
    ),
    concepts: unit.concepts,
  }));
  ok(res, { units });
});

// The chapter's own stated learning objectives, in book order. Empty for a
// chapter that does not list any — which is an answer, not a failure.
router.get("/chapters/:id/objectives", async (req, res) => {
  const owner = ownerId(req);
  // Objectives arrive with the concepts in the same deferred read; a student
  // asking for one is a student the other is due for too.
  await ensureChapterExtraction(req, req.params.id);
  const rows = await db()
    .select({
      id: chapterObjective.id,
      objectiveText: chapterObjective.objectiveText,
      sortOrder: chapterObjective.sortOrder,
      sourceOffset: chapterObjective.sourceOffset,
      sourceQuote: chapterObjective.sourceQuote,
      estimated: chapterObjective.estimated,
    })
    .from(chapterObjective)
    .innerJoin(chapter, eq(chapterObjective.chapterId, chapter.id))
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(
      and(
        eq(chapterObjective.chapterId, req.params.id),
        eq(textbook.ownerId, owner),
      ),
    )
    .orderBy(chapterObjective.sortOrder);

  ok(res, rows);
});

// ────────────────────────────────────────────────────────────────
// Study sessions
// ────────────────────────────────────────────────────────────────

const startSessionSchema = z.object({
  chapterId: z
    .string({ message: "Choose a chapter to start." })
    .min(1, "Choose a chapter to start."),
  /** How the student wants to recall. Chosen before recall begins; defaults to
   *  free blurting, which is the behaviour every existing client expects. */
  recallMode: z.enum(["blurting", "targeted", "both"]).default("blurting"),
});

router.post("/sessions/start", async (req, res) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const sessionId = crypto.randomUUID();
  const { chapterId, recallMode } = parsed.data;
  const userId = ownerId(req);
  const chapterExists = await db()
    .select({ id: chapter.id })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(and(eq(chapter.id, chapterId), eq(textbook.ownerId, userId)))
    .limit(1);
  if (!chapterExists.length) return err(res, "Chapter not found", 404);

  // The session is about to need a real checklist; if this chapter has not been
  // read yet, read it now, before the student is dropped into recall.
  await ensureChapterExtraction(req, chapterId);

  await db()
    .insert(studySession)
    .values({
      id: sessionId,
      chapterId,
      userId: userId ?? null,
      recallMode,
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

// Registered before `GET /sessions/:id` on purpose: Express matches in
// declaration order, and a param route would otherwise swallow `/sessions/queue`
// as a session whose id is the word "queue".
// ────────────────────────────────────────────────────────────────
// The study queue (phase 11, step 4c)
// ────────────────────────────────────────────────────────────────

/** The next chapter still pending in a queue, with its title for the handoff. */
async function nextInQueue(
  queueId: string,
): Promise<{ sessionId: string; chapterTitle: string } | null> {
  const rows = await db()
    .select({
      id: studySession.id,
      status: studySession.status,
      position: studySession.queuePosition,
      chapterTitle: chapter.title,
    })
    .from(studySession)
    .innerJoin(chapter, eq(studySession.chapterId, chapter.id))
    .where(eq(studySession.queueId, queueId));
  const slot = nextQueueSlot(rows);
  return slot ? { sessionId: slot.id, chapterTitle: slot.chapterTitle } : null;
}

const queueSchema = z.object({
  chapterIds: z
    .array(z.string({ message: "Choose at least one chapter." }).min(1))
    .min(1, "Choose at least one chapter.")
    .max(12, "A queue of more than 12 chapters is too long to plan."),
});

/**
 * Plan an ordered queue: several chapters, one session each, walked in the
 * order they were picked.
 *
 * The sessions are created up front and durably — the first `in_progress`, the
 * rest `pending` — so the plan survives a reload, a restart and a closed tab,
 * and "which chapter is next" is a row rather than client state. Each row is a
 * complete one-chapter session with its own scope, so the queue composes with
 * everything else instead of forking the study loop.
 */
router.post("/sessions/queue", async (req, res) => {
  const parsed = queueSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));
  const userId = ownerId(req);
  if (!userId) return err(res, "You must be signed in.", 401);

  // Duplicates are dropped, not rejected: the same chapter twice would create
  // two identical sessions the student cannot tell apart.
  const chapterIds = [...new Set(parsed.data.chapterIds)];
  const owned = await db()
    .select({ id: chapter.id, title: chapter.title })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(and(inArray(chapter.id, chapterIds), eq(textbook.ownerId, userId)));
  const titleOf = new Map(owned.map((row) => [row.id, row.title]));
  if (owned.length !== chapterIds.length) {
    return err(res, "One of those chapters was not found", 404);
  }

  const queueId = crypto.randomUUID();
  const now = new Date();
  await db().insert(studyQueue).values({ id: queueId, userId });
  const rows = chapterIds.map((chapterId, position) => ({
    id: crypto.randomUUID(),
    chapterId,
    userId,
    queueId,
    queuePosition: position,
    startedAt: now,
    status: position === 0 ? ("in_progress" as const) : ("pending" as const),
  }));
  await db().insert(studySession).values(rows);

  ok(
    res,
    {
      queueId,
      sessions: rows.map((row) => ({
        sessionId: row.id,
        chapterId: row.chapterId,
        chapterTitle: titleOf.get(row.chapterId) ?? "",
        position: row.queuePosition,
        status: row.status,
      })),
    },
    201,
  );
});

/** The student's open queue, in order. Empty when there is nothing left to do. */
router.get("/sessions/queue", async (req, res) => {
  const userId = ownerId(req);
  if (!userId) return ok(res, { queueId: null, items: [], done: 0 });

  // The newest queue that still has something unfinished in it. A finished
  // queue is history, so a student who has just cleared their plan does not
  // keep seeing an empty queue card.
  const [active] = await db()
    .select({ queueId: studySession.queueId })
    .from(studySession)
    .innerJoin(studyQueue, eq(studySession.queueId, studyQueue.id))
    .where(
      and(
        eq(studySession.userId, userId),
        ne(studySession.status, "completed"),
      ),
    )
    .orderBy(desc(studyQueue.createdAt))
    .limit(1);
  const queueId = active?.queueId ?? null;
  if (!queueId) return ok(res, { queueId: null, items: [], done: 0 });

  const rows = await db()
    .select({
      id: studySession.id,
      chapterId: studySession.chapterId,
      status: studySession.status,
      position: studySession.queuePosition,
      chapterTitle: chapter.title,
    })
    .from(studySession)
    .innerJoin(chapter, eq(studySession.chapterId, chapter.id))
    .where(eq(studySession.queueId, queueId));
  const ordered = orderedQueueSlots(rows);

  ok(res, {
    queueId,
    items: ordered
      .filter((row) => row.status !== "completed")
      .map((row) => ({
        sessionId: row.id,
        chapterId: row.chapterId,
        chapterTitle: row.chapterTitle,
        position: row.position,
        status: row.status,
      })),
    done: ordered.filter((row) => row.status === "completed").length,
  });
});

/** Drop a chapter the student has not opened yet. */
router.delete("/sessions/:id/queue", async (req, res) => {
  const session = await findSession(req.params.id, ownerId(req));
  if (!session) return err(res, "Session not found", 404);
  if (session.status !== "pending") {
    return err(
      res,
      "Only a chapter that has not been opened can be removed from the queue",
      409,
    );
  }
  await db()
    .delete(studySession)
    .where(
      and(eq(studySession.id, session.id), eq(studySession.status, "pending")),
    );
  ok(res, { ok: true });
});

type SessionResultSummary = {
  before: number | null;
  after: number | null;
  delta: number | null;
  durationMs: number | null;
  /** The chapter-wide exam-readiness verdict, derived from every judged idea
   *  (recall and retest alike) and every section, including the ones nobody
   *  probed. Null when the chapter has no checklist to judge against. */
  verdict: SessionVerdict | null;
};

async function sessionVerdict(
  chapterId: string,
  rows: readonly { stage: string; gapsIdentified: unknown }[],
  scopeKeys?: readonly string[] | null,
): Promise<SessionVerdict | null> {
  const [concepts, objectives] = await Promise.all([
    chapterConcepts(chapterId),
    chapterObjectiveText(chapterId),
  ]);
  const real = concepts.filter((c) => !c.isMisconception);
  if (real.length === 0) return null;
  // Only the sections the student actually scoped are judged; a section they
  // chose not to study must not read as an unchecked failure.
  const units: RecallUnit[] = scopedUnits(
    buildCoverageUnits(real, objectives),
    scopeKeys,
  );
  const inScope = new Set(units.flatMap((unit) => unit.concepts));
  const weights: Record<string, number> = {};
  for (const concept of real) {
    if (inScope.has(concept.conceptText)) {
      weights[concept.conceptText] = concept.weight;
    }
  }
  return deriveSessionVerdict(units, masteryFromStudyAttempts(rows), weights);
}

// One canonical "how did this session go" number: before comes from the
// baseline when present, otherwise the mean recall score; after is the mean of
// retest answers, so the delta reflects the whole retest.
async function resultSummary(
  sessionId: string,
  userId?: string,
  options: { withVerdict?: boolean } = {},
): Promise<SessionResultSummary | null> {
  const session = await findSession(sessionId, userId);
  if (!session) return null;

  const attemptsRows = await db()
    .select({
      stage: attempt.stage,
      score: attempt.score,
      gapsIdentified: attempt.gapsIdentified,
    })
    .from(attempt)
    .where(eq(attempt.sessionId, sessionId))
    .orderBy(attempt.createdAt);

  const { before, after } = summarizeStudyScores(attemptsRows);
  const durationMs = session.startedAt
    ? session.completedAt
      ? Math.max(0, session.completedAt.getTime() - session.startedAt.getTime())
      : Math.max(0, Date.now() - session.startedAt.getTime())
    : null;

  const retestComplete =
    (session.retestQuestions?.length ?? 0) > 0 &&
    session.retestIndex >= (session.retestQuestions?.length ?? 0);
  const verdict =
    options.withVerdict && retestComplete && session.chapterId
      ? await sessionVerdict(session.chapterId, attemptsRows, session.scopeKeys)
      : null;

  return {
    before,
    after,
    delta: before != null && after != null ? after - before : null,
    durationMs,
    verdict,
  };
}

// Recent session history for the dashboard, with each session's result folded
// in so cards can show "62% → 81% · 12 min" without a second round-trip.
router.get("/sessions", async (req, res) => {
  const userId = ownerId(req);
  const rows = await db()
    .select()
    .from(studySession)
    // A queued chapter is not history yet: it has no answers and the student
    // has not opened it. Showing it here would both pad the list and hand the
    // "resume where you left off" card a session that never started.
    .where(
      and(eq(studySession.userId, userId), ne(studySession.status, "pending")),
    )
    .orderBy(desc(studySession.startedAt))
    .limit(20);
  if (rows.length === 0) {
    ok(res, []);
    return;
  }

  // One query for every attempt across all 20 sessions, rather than a
  // per-session round-trip. The dashboard used to issue ~41 sequential
  // queries here (a findSession plus an attempt scan per row) against a
  // 5-connection pool — the single slowest thing a returning student touches.
  // Responses are a fixed shape, so grouping is safe: no verdict is computed
  // on the dashboard path, only the score summary.
  const attemptRows = await db()
    .select({
      sessionId: attempt.sessionId,
      stage: attempt.stage,
      score: attempt.score,
      gapsIdentified: attempt.gapsIdentified,
    })
    .from(attempt)
    .where(
      inArray(
        attempt.sessionId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(attempt.createdAt);

  const attemptsBySession = new Map<string, typeof attemptRows>();
  for (const row of attemptRows) {
    const list = attemptsBySession.get(row.sessionId);
    if (list) list.push(row);
    else attemptsBySession.set(row.sessionId, [row]);
  }

  const out = rows.map((row) => {
    const { before, after } = summarizeStudyScores(
      attemptsBySession.get(row.id) ?? [],
    );
    const durationMs = row.startedAt
      ? row.completedAt
        ? Math.max(0, row.completedAt.getTime() - row.startedAt.getTime())
        : Math.max(0, Date.now() - row.startedAt.getTime())
      : null;
    return {
      id: row.id,
      chapterId: row.chapterId,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      before,
      after,
      delta: before != null && after != null ? after - before : null,
      durationMs,
    };
  });
  ok(res, out);
});

router.get("/review-due", async (req, res) => {
  const rows = await db()
    .select({
      chapterId: studySession.chapterId,
      chapterTitle: chapter.title,
      createdAt: attempt.createdAt,
      gapsIdentified: attempt.gapsIdentified,
    })
    .from(attempt)
    .innerJoin(studySession, eq(attempt.sessionId, studySession.id))
    .innerJoin(chapter, eq(studySession.chapterId, chapter.id))
    .where(eq(studySession.userId, ownerId(req)))
    .orderBy(desc(attempt.createdAt))
    .limit(500);
  const threshold = Date.now() - REVIEW_DUE_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const due: {
    chapterId: string;
    chapterTitle: string;
    concept: string;
    lastCheckedAt: Date;
  }[] = [];
  for (const row of rows) {
    const gaps = row.gapsIdentified;
    if (!gaps || typeof gaps !== "object" || Array.isArray(gaps)) continue;
    const data = gaps as Record<string, unknown>;
    const mastery =
      data.mastery &&
      typeof data.mastery === "object" &&
      !Array.isArray(data.mastery)
        ? (data.mastery as Record<string, unknown>)
        : {};
    const concepts = Object.keys(mastery);
    for (const concept of concepts) {
      const key = `${row.chapterId}\u0000${concept.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (row.createdAt.getTime() <= threshold) {
        due.push({
          chapterId: row.chapterId,
          chapterTitle: row.chapterTitle,
          concept,
          lastCheckedAt: row.createdAt,
        });
      }
    }
  }
  ok(res, due.slice(0, 20));
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
  const session = rows[0] as (typeof rows)[number];

  const attemptsRows = await db()
    .select()
    .from(attempt)
    .where(eq(attempt.sessionId, req.params.id))
    .orderBy(attempt.createdAt);

  // The chapter after this one in the student's queue, so the result screen can
  // offer the handoff before the session is even marked complete (it is
  // promoted when this session completes, not when the button is drawn).
  const queueNext = session.queueId ? await nextInQueue(session.queueId) : null;

  ok(res, { ...session, queueNext, attempts: attemptsRows });
});

// Idempotent attempt insert: the client sends a UUID per submission so a
// double-posted recall/answer (animation retry, voice race, network replay)
// lands exactly one row instead of polluting the history with phantom
// attempts. Idempotency is scoped to the session: the same attemptId may be
// reused across different sessions and must only dedupe within its own.
type AttemptInsert = {
  id?: string;
  sessionId: string;
  stage: "recall" | "pretest" | "retest";
  transcriptText: string;
  gapsIdentified: {
    covered: string[];
    missing: string[];
    misconceptions: string[];
    /** Phase 11: per-concept levels, the source the three lists derive from.
     *  Optional so attempts written before this change still read back. */
    mastery?: Record<string, number>;
    /** Matched student wording for near-misses; absent in older attempts. */
    evidence?: Record<string, string | null>;
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
//
// Real students only. A demo visitor runs the same grader and writes the same
// misconception_hit rows, but a throwaway room is not a signal about the
// national misconception map (Bet 2), so the demo owner is excluded here at the
// source rather than left to be filtered by whoever reads the map.
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
    .innerJoin(user, eq(misconceptionHit.userId, user.id))
    .leftJoin(syllabusUnit, eq(chapter.unitId, syllabusUnit.id))
    .where(
      and(
        subject ? eq(textbook.subject, subject) : undefined,
        eq(user.kind, "student"),
      ),
    )
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
  if (!(await allowAiRequest(req))) return aiBudgetError(res, req);
  const parsed = recallSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const sessionId = req.params.id;

  const chapterId = await sessionChapterId(sessionId, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);

  const session = await findSession(sessionId, ownerId(req));
  if (
    session?.pretestQuestions?.length &&
    session.pretestIndex < session.pretestQuestions.length
  ) {
    return err(res, "Finish the baseline test before starting recall", 409);
  }
  const concepts = scopedConcepts(
    await chapterConcepts(chapterId),
    session?.scopeKeys,
  );
  const subjectForRecall = await chapterSubject(chapterId);

  const gaps = await ai.gradeRecall(
    parsed.data.transcriptText,
    concepts,
    subjectForRecall,
  );
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
      evidence: gaps.evidence ?? {},
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
  if (!(await allowAiRequest(req))) return aiBudgetError(res, req);
  const parsed = microlessonSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);

  const sessionRow = await findSession(req.params.id, ownerId(req));
  const concepts = scopedConcepts(
    await chapterConcepts(chapterId),
    sessionRow?.scopeKeys,
  );

  const gapAnalysis = gapAnalysisFrom(
    {
      missing: parsed.data.missing,
      misconceptions: parsed.data.misconceptions,
    },
    concepts,
  );

  const subject = await chapterSubject(chapterId);
  const lesson = await ai.generateMicroLesson(
    gapAnalysis,
    concepts,
    parsed.data.language,
    { subject },
  );
  ok(res, lesson);
});

// ────────────────────────────────────────────────────────────────
// Study plan
// ────────────────────────────────────────────────────────────────

const planSchema = z.object({
  missing: z.array(z.string().trim().min(1).max(500)).max(50),
  misconceptions: z.array(z.string().trim().min(1).max(500)).max(50),
  mastery: z.record(z.string(), z.number().int().min(0).max(3)).optional(),
  budgetMinutes: z
    .union([
      z.literal(STUDY_PLAN_BUDGETS[0]),
      z.literal(STUDY_PLAN_BUDGETS[1]),
      z.literal(STUDY_PLAN_BUDGETS[2]),
    ])
    .default(STUDY_PLAN_DEFAULT_BUDGET),
  language: z.enum(["en", "am"]).optional(),
});

router.post("/sessions/:id/plan", async (req, res) => {
  const contentDeadline = Date.now() + STUDY_PLAN_CONTENT_BUDGET_MS;
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);

  const sessionRow = await findSession(req.params.id, ownerId(req));
  // A scoped session plans only its chosen sections; the rest of the chapter
  // is not "known", it is simply out of scope.
  const concepts = scopedConcepts(
    await chapterConcepts(chapterId),
    sessionRow?.scopeKeys,
  );
  const [chapterRow] = await db()
    .select({
      title: chapter.title,
      rawText: chapter.rawText,
      subject: textbook.subject,
    })
    .from(chapter)
    .innerJoin(textbook, eq(chapter.textbookId, textbook.id))
    .where(eq(chapter.id, chapterId))
    .limit(1);
  if (!chapterRow) return err(res, "Chapter not found", 404);

  const gaps = gapAnalysisFrom(
    {
      missing: parsed.data.missing,
      misconceptions: parsed.data.misconceptions,
    },
    concepts,
  );
  for (const concept of concepts) {
    const key = concept.conceptText.trim().toLowerCase();
    const matching = Object.entries(parsed.data.mastery ?? {}).find(
      ([name]) => name.trim().toLowerCase() === key,
    );
    gaps.mastery[concept.conceptText] = matching
      ? (matching[1] as MasteryLevel)
      : parsed.data.misconceptions.some(
            (name) => name.trim().toLowerCase() === key,
          )
        ? 2
        : parsed.data.missing.some((name) => name.trim().toLowerCase() === key)
          ? 0
          : 3;
  }
  const [latestRecall] = await db()
    .select({ gapsIdentified: attempt.gapsIdentified })
    .from(attempt)
    .where(
      and(eq(attempt.sessionId, req.params.id), eq(attempt.stage, "recall")),
    )
    .orderBy(desc(attempt.createdAt))
    .limit(1);
  const storedGaps = latestRecall?.gapsIdentified;
  if (
    storedGaps &&
    typeof storedGaps === "object" &&
    !Array.isArray(storedGaps)
  ) {
    const storedEvidence = (storedGaps as Record<string, unknown>).evidence;
    if (
      storedEvidence &&
      typeof storedEvidence === "object" &&
      !Array.isArray(storedEvidence)
    ) {
      gaps.evidence = Object.fromEntries(
        Object.entries(storedEvidence).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
  }

  const language = parsed.data.language ?? "en";
  // The plan is built from the diagnosis and the chapter text alone — no
  // generated teaching, because a plan is a route, not a lesson. The only
  // model call is the orienting "why this is yours" line, and that is one
  // batched request priced like a recall grade, not a per-step flurry that
  // empties the shared free-tier bucket behind a single click.
  const initial = buildStudyPlan(
    gaps,
    concepts,
    chapterRow.title,
    chapterRow.rawText,
    new Map(),
    chapterRow.subject,
    language,
    parsed.data.budgetMinutes,
  );
  let whyFirstByConcept = new Map<string, string>();
  if (initial.steps.length > 0) {
    const timeoutMs = contentDeadline - Date.now();
    const skipAi = timeoutMs <= 0 || !(await allowAiRequest(req));
    try {
      whyFirstByConcept = await ai.generatePlanWhyFirst(
        chapterRow.rawText,
        initial.steps.map((step) => ({
          conceptText: step.concept,
          gapType: step.gapType,
          masteryLevel: step.masteryLevel,
          studentWords: step.studentWords,
          excerpt: step.anchor.excerpt,
        })),
        language,
        { skipAi, timeoutMs, subject: chapterRow.subject },
      );
    } catch (error) {
      if (!isAiBusy(error)) throw error;
      console.warn(
        "[study-plan] AI capacity unavailable; using the diagnosis lines",
      );
      whyFirstByConcept = new Map();
    }
  }
  const plan = buildStudyPlan(
    gaps,
    concepts,
    chapterRow.title,
    chapterRow.rawText,
    whyFirstByConcept,
    chapterRow.subject,
    language,
    parsed.data.budgetMinutes,
  );
  ok(res, plan);
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
  // Sections the session is scoped to, if any. Only unit keys travel here —
  // never concept names — so the query is short and cannot be spoofed into
  // reading another chapter.
  const scopeKeys =
    typeof req.query.scope === "string"
      ? req.query.scope
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean)
      : [];
  const concepts = scopedConcepts(await chapterConcepts(chapterId), scopeKeys);
  const [row] = await db()
    .select({ rawText: chapter.rawText })
    .from(chapter)
    .where(eq(chapter.id, chapterId))
    .limit(1);
  const rawText = row?.rawText ?? "";
  const chapterSubjectCache = await chapterSubject(chapterId);

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
  // The whole loop shares one wall-clock ceiling. Whatever is left when a
  // concept comes up is that concept's provider cap, so the last section cannot
  // overrun the response; once the ceiling is spent the remaining concepts fall
  // to the lexical skeleton. This is the guide's answer to "the client is gone
  // and the server is still calling the model".
  const contentDeadline = Date.now() + GUIDE_CONTENT_BUDGET_MS;
  // ...and this is the other half of that answer: if the student's tab is
  // actually gone, stop rather than generate prose nobody will ever receive.
  // Checked at concept boundaries, so an in-flight call still finishes and is
  // cached for the next student — only the *next* call is skipped.
  let clientGone = false;
  req.on("close", () => {
    clientGone = true;
  });
  for (const concept of targets) {
    if (clientGone) break;
    const key = concept.conceptText.trim().toLowerCase();
    if (cache.has(key)) continue;
    const remainingMs = contentDeadline - Date.now();
    const skipAi = remainingMs <= 0 || !(await allowAiRequest(req));
    if (skipAi) {
      if (remainingMs <= 0) estimated = true;
      else throttled = true;
    }
    const section = await ai.generateGuideSection(
      concept.conceptText,
      rawText,
      language,
      { skipAi, subject: chapterSubjectCache, timeoutMs: remainingMs },
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
  if (clientGone) {
    console.warn(
      `[guide] client disconnected during generation; stopped early for chapter ${chapterId}`,
    );
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
    retryAfterSeconds: throttled
      ? (await aiBudgetFor(req)).retryAfterSeconds
      : 0,
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

router.post("/sessions/:id/pretest", async (req, res) => {
  const parsed = retestSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const session = await findSession(req.params.id, ownerId(req));
  if (!session) return err(res, "Session not found", 404);
  if (session.status !== "in_progress") {
    return err(res, "This study session is already complete", 409);
  }
  if (session.pretestQuestions?.length) {
    return ok(res, { questions: session.pretestQuestions });
  }
  const [priorAttempt] = await db()
    .select({ id: attempt.id })
    .from(attempt)
    .where(eq(attempt.sessionId, req.params.id))
    .limit(1);
  if (priorAttempt) {
    return err(res, "A baseline test must come before study answers", 409);
  }
  if (!(await allowAiRequest(req))) return aiBudgetError(res, req);

  const chapterId = session.chapterId;
  const concepts = scopedConcepts(
    await chapterConcepts(chapterId),
    session.scopeKeys,
  );
  if (concepts.length === 0) return err(res, "No concepts to test", 400);
  const objectives = await chapterObjectiveText(chapterId);
  const subject = await chapterSubject(chapterId);
  const rawText = await chapterRawText(chapterId);
  const questions = await ai.generateRetestQuestions(
    gapAnalysisFrom(
      {
        missing: concepts.map((concept) => concept.conceptText),
        misconceptions: [],
      },
      concepts,
    ),
    concepts,
    objectives,
    parsed.data.language,
    {
      subject,
      chapterText: rawText,
      unprobed: concepts.map((concept) => concept.conceptText),
    },
  );
  const prepared = spreadByFocus(
    reconcileQuestions(
      questions,
      concepts,
      objectives,
      concepts.map((concept) => concept.conceptText),
    ),
  );
  if (prepared.length === 0) {
    return err(res, "Could not prepare a baseline test for this scope", 502);
  }

  await db()
    .update(studySession)
    .set({ pretestQuestions: prepared, pretestIndex: 0 })
    .where(
      and(
        eq(studySession.id, req.params.id),
        eq(studySession.userId, ownerId(req)),
        eq(studySession.status, "in_progress"),
      ),
    );

  ok(res, { questions: prepared });
});

/**
 * Reconcile a writer's questions against the stored chapter. The model's
 * targetConcept/targetObjective are matched tolerantly (case/whitespace) to the
 * canonical rows — never trusted as-is. A question with no verifiable target
 * falls back to its target objective (when it is a beyond-textbook question),
 * then to the gap list in order, so every question can still be graded against
 * something real. `level` and `beyondText` are carried through for the UI.
 */
function reconcileQuestions(
  questions: GeneratedQuestion[],
  concepts: { conceptText: string }[],
  objectives: string[],
  gapItems: string[],
): StoredQuestion[] {
  const canonicalGapItems = gapItems.map((gap) => {
    const hit = concepts.find((c) => byName(c.conceptText) === byName(gap));
    return hit ? hit.conceptText : gap;
  });
  const objectiveByText = new Map(objectives.map((o) => [byName(o), o]));
  return questions.map((q, i) => {
    let target: string | null = null;
    if (q.targetConcept) {
      const canonical = concepts.find(
        (c) => byName(c.conceptText) === byName(q.targetConcept as string),
      );
      if (canonical) target = canonical.conceptText;
    }
    const targetObjective = q.targetObjective
      ? (objectiveByText.get(byName(q.targetObjective)) ??
        q.targetObjective.trim())
      : undefined;
    if (!target && q.beyondText && targetObjective) target = targetObjective;
    if (!target && canonicalGapItems.length) {
      const fallback = canonicalGapItems[i % canonicalGapItems.length];
      if (fallback) target = fallback;
    }
    return {
      question: q.question,
      focus: target ? [target] : [],
      level: q.level,
      targetObjective,
      beyondText: q.beyondText ? true : undefined,
      format: q.format,
      options: q.options,
      answer: q.answer,
      lesson: q.lesson,
      origin: q.origin,
    };
  });
}

/**
 * The order the student meets a recall set in: the questions that probe their
 * own flagged gaps first, then the ones added to sweep the rest of the chapter.
 * Both halves are still spread by focus, and the mix is spaced last, so "quiz
 * my gaps, then broaden" never becomes a clump of look-alike questions.
 */
function orderRecallSet(questions: StoredQuestion[]): StoredQuestion[] {
  const gap = questions.filter((q) => q.origin === "gap");
  const coverage = questions.filter((q) => q.origin !== "gap");
  if (gap.length === 0 || coverage.length === 0) {
    return enforceRecallMix(spreadByFocus(questions));
  }
  return enforceRecallMix([...spreadByFocus(gap), ...spreadByFocus(coverage)]);
}

/** Interleave questions so consecutive ones do not share a target idea. */
function spreadByFocus(questions: StoredQuestion[]): StoredQuestion[] {
  const byFocus = new Map<string, StoredQuestion[]>();
  for (const question of questions) {
    const key = question.focus[0] ?? "";
    const group = byFocus.get(key) ?? [];
    group.push(question);
    byFocus.set(key, group);
  }
  if (byFocus.size <= 1) return questions;
  const spread: StoredQuestion[] = [];
  while ([...byFocus.values()].some((group) => group.length > 0)) {
    for (const group of byFocus.values()) {
      const next = group.shift();
      if (next) spread.push(next);
    }
  }
  return spread;
}

router.post("/sessions/:id/retest", async (req, res) => {
  const parsed = retestSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const session = await findSession(req.params.id, ownerId(req));
  if (!session) return err(res, "Session not found", 404);
  if (session.status !== "in_progress") {
    return err(res, "This study session is already complete", 409);
  }
  if (session.retestQuestions?.length) {
    return ok(res, { questions: session.retestQuestions });
  }
  if (session.pretestQuestions?.length) {
    if (session.pretestIndex < session.pretestQuestions.length) {
      return err(res, "Finish the baseline test before the post-test", 409);
    }
    await db()
      .update(studySession)
      .set({
        retestQuestions: session.pretestQuestions,
        retestIndex: 0,
      })
      .where(eq(studySession.id, req.params.id));
    return ok(res, { questions: session.pretestQuestions });
  }
  if (!(await allowAiRequest(req))) return aiBudgetError(res, req);

  const chapterId = session.chapterId;
  const concepts = scopedConcepts(
    await chapterConcepts(chapterId),
    session.scopeKeys,
  );
  if (concepts.length === 0) return err(res, "No concepts to test", 400);
  const missing =
    parsed.data.missing.length || parsed.data.misconceptions.length
      ? parsed.data.missing
      : concepts.map((concept) => concept.conceptText);

  const gapAnalysis = gapAnalysisFrom(
    {
      missing,
      misconceptions: parsed.data.misconceptions,
    },
    concepts,
  );

  const objectives = await chapterObjectiveText(chapterId);
  const retestSubject = await chapterSubject(chapterId);
  const rawText = await chapterRawText(chapterId);
  // The recall sweep's honest leftovers: ideas no answer has judged. The retest
  // writer is told to cover them rather than quietly skip half the chapter.
  const { unprobed } = await mergeRecallGaps(req.params.id);
  const questions = await ai.generateRetestQuestions(
    gapAnalysis,
    concepts,
    objectives,
    parsed.data.language,
    { subject: retestSubject, chapterText: rawText, unprobed },
  );

  const orderedQuestions = spreadByFocus(
    reconcileQuestions(questions, concepts, objectives, [
      ...missing,
      ...parsed.data.misconceptions,
    ]),
  );

  await db()
    .update(studySession)
    .set({ retestQuestions: orderedQuestions, retestIndex: 0 })
    .where(
      and(
        eq(studySession.id, req.params.id),
        eq(studySession.userId, ownerId(req)),
      ),
    );

  ok(res, { questions: orderedQuestions });
});

/**
 * Targeted recall: unlike the retest, these questions are diagnostic — they
 * exist to expose gaps and feed the same gap analysis the free-recall path
 * feeds, and the writer is told to keep them a different (non-exam) shape.
 *
 * Two scopes:
 *  - "gaps"    (default): probe the items the student already missed (used by
 *              "both" mode, after blurting surfaces the gaps).
 *  - "chapter": the student skipped free recall, so there is nothing to
 *              diagnose yet — cover the WHOLE chapter (every concept marked
 *              unaddressed, plus the stated objectives).
 */
const recallQuestionsSchema = z.object({
  scope: z.enum(["gaps", "chapter"]).default("gaps"),
  missing: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  misconceptions: z
    .array(z.string().trim().min(1).max(500))
    .max(50)
    .default([]),
  language: z.enum(["en", "am"]).optional(),
});

router.post("/sessions/:id/recall-questions", async (req, res) => {
  if (!(await allowAiRequest(req))) return aiBudgetError(res, req);
  const parsed = recallQuestionsSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);

  const sessionRow = await findSession(req.params.id, ownerId(req));
  if (
    sessionRow?.pretestQuestions?.length &&
    sessionRow.pretestIndex < sessionRow.pretestQuestions.length
  ) {
    return err(res, "Finish the baseline test before starting recall", 409);
  }
  const concepts = scopedConcepts(
    await chapterConcepts(chapterId),
    sessionRow?.scopeKeys,
  );
  const wholeChapter = parsed.data.scope === "chapter";
  const gapAnalysis = gapAnalysisFrom(
    wholeChapter
      ? { missing: concepts.map((c) => c.conceptText), misconceptions: [] }
      : {
          missing: parsed.data.missing,
          misconceptions: parsed.data.misconceptions,
        },
    concepts,
  );

  const objectives = await chapterObjectiveText(chapterId);
  const subject = await chapterSubject(chapterId);
  const rawText = await chapterRawText(chapterId);
  const questions = await ai.generateRecallQuestions(
    gapAnalysis,
    concepts,
    objectives,
    parsed.data.language,
    {
      subject,
      chapterText: rawText,
      scopeKeys: sessionRow?.scopeKeys ?? undefined,
    },
  );

  // `orderRecallSet` puts the student's own flagged gaps first, then the
  // coverage questions; `spreadByFocus` keeps consecutive questions on different
  // ideas; `enforceRecallMix` spaces the spoken short answers among the closed
  // ones so a run of downgraded "explain…" prompts can never bunch at the end.
  const orderedQuestions = orderRecallSet(
    reconcileQuestions(
      questions,
      concepts,
      objectives,
      wholeChapter
        ? concepts.map((c) => c.conceptText)
        : [...parsed.data.missing, ...parsed.data.misconceptions],
    ),
  );

  await db()
    .update(studySession)
    .set({ recallQuestions: orderedQuestions, recallIndex: 0 })
    .where(
      and(
        eq(studySession.id, req.params.id),
        eq(studySession.userId, ownerId(req)),
      ),
    );

  ok(res, { questions: orderedQuestions });
});

/**
 * Answer one targeted-recall question. The answer is graded against the
 * question's own focus (same idea-alone rule as the retest), stored as a
 * "recall" attempt so it counts toward the session's *before* score, and then
 * every recall attempt so far is merged into the single gap analysis the rest
 * of the loop runs on.
 */
const recallAnswerSchema = z.object({
  transcriptText: z
    .string({ message: "Say a little something so we can grade your answer." })
    .trim()
    .min(1, "Say a little something so we can grade your answer.")
    .max(20_000, "That answer is too long — try again in shorter chunks."),
  questionIndex: z
    .number({ message: "That question can't be found." })
    .int()
    .min(0, "That question can't be found."),
  attemptId: z.string().optional(),
});

router.post("/sessions/:id/recall-questions/answer", async (req, res) => {
  // Note: the AI admission check is deliberately NOT first. A multiple-choice or
  // fill-in-the-blank answer is graded deterministically and needs no model, so
  // only the short-answer path below asks for (and spends) the AI budget.
  const parsed = recallAnswerSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);

  const session = await findSession(req.params.id, ownerId(req));
  const question = session?.recallQuestions?.[parsed.data.questionIndex];
  if (!session || !question) return err(res, "Question not found", 400);
  if (parsed.data.questionIndex !== session.recallIndex) {
    return err(res, "That question is out of order", 409);
  }

  const subject = await chapterSubject(chapterId);
  const subset = await focusSubset(chapterId, question.focus);
  if (!subset.length) return err(res, "No concepts matched that question", 400);

  // A closed question (multiple choice or fill-in-the-blank) is graded
  // deterministically against its stored answer — no model call and no request
  // budget. A short answer (or a question from before formats existed) keeps the
  // model grading it always got.
  let single: Awaited<ReturnType<typeof ai.gradeRecall>>;
  const fmt = question.format;
  if (fmt === "multiple_choice" || fmt === "fill_blank") {
    const correct = judgeClosedAnswer(
      question.answer ?? "",
      parsed.data.transcriptText,
    );
    const miscNames = new Set(
      subset
        .filter((c) => c.isMisconception)
        .map((c) => c.conceptText.trim().toLowerCase()),
    );
    if (correct) {
      // Everything the question targets is right. A misconception target is
      // credited to `covered`, which focusScore reads as "did not restate it".
      single = gapAnalysisFrom(
        { covered: question.focus.slice(), missing: [], misconceptions: [] },
        subset,
      );
    } else {
      // A wrong answer to a misconception question is the strongest signal
      // there is: the student still holds the belief, so it is recorded as a
      // misconception, not a mere missing idea.
      const isMisc = (f: string) => miscNames.has(f.trim().toLowerCase());
      single = gapAnalysisFrom(
        {
          covered: [],
          missing: question.focus.filter((f) => !isMisc(f)),
          misconceptions: question.focus.filter(isMisc),
        },
        subset,
      );
    }
  } else {
    // Only an open, spoken answer reaches the model — so only it spends budget.
    if (!(await allowAiRequest(req))) return aiBudgetError(res, req);
    single = await ai.gradeRecall(parsed.data.transcriptText, subset, subject);
  }
  const score = Math.round(focusScore(single, subset) * 100);

  const inserted = await insertAttemptOnce({
    id: parsed.data.attemptId,
    sessionId: req.params.id,
    stage: "recall",
    transcriptText: parsed.data.transcriptText,
    gapsIdentified: {
      covered: single.covered,
      missing: single.missing,
      misconceptions: single.misconceptions,
      mastery: single.mastery,
      evidence: single.evidence ?? {},
      estimated: single.estimated,
    },
    score,
  });
  if (inserted) {
    await db()
      .update(studySession)
      .set({ recallIndex: (session.recallIndex ?? 0) + 1 })
      .where(
        and(
          eq(studySession.id, req.params.id),
          eq(studySession.userId, ownerId(req)),
        ),
      );
  }

  const merged = await mergeRecallGaps(req.params.id);
  ok(res, { score, gaps: single, merged });
});

/** Persist the student's recall-mode choice so a reload restores the same flow. */
const recallModeSchema = z.object({
  recallMode: z.enum(["blurting", "targeted", "both"]),
});

/**
 * Pick the sections this session covers (phase 11, step 4). Keys are validated
 * against the chapter's current coverage units, so a stale picker cannot shrink
 * a session to nothing; an empty selection means the whole chapter.
 */
const scopeSchema = z.object({
  scopeKeys: z.array(z.string().trim().min(1).max(120)).max(200).nullable(),
});

router.patch("/sessions/:id/scope", async (req, res) => {
  const parsed = scopeSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));
  const session = await findSession(req.params.id, ownerId(req));
  if (!session) return err(res, "Session not found", 404);
  if (
    session.pretestQuestions?.length ||
    session.recallQuestions?.length ||
    session.retestQuestions?.length
  ) {
    return err(
      res,
      "The study scope cannot change after a test is prepared",
      409,
    );
  }
  const [existingAttempt] = await db()
    .select({ id: attempt.id })
    .from(attempt)
    .where(eq(attempt.sessionId, req.params.id))
    .limit(1);
  if (existingAttempt) {
    return err(res, "The study scope cannot change after answering", 409);
  }

  const concepts = (await chapterConcepts(session.chapterId)).filter(
    (c) => !c.isMisconception,
  );
  const valid = new Set(buildCoverageUnits(concepts, []).map((u) => u.key));
  const picked =
    parsed.data.scopeKeys === null
      ? []
      : [...new Set(parsed.data.scopeKeys)].filter((key) => valid.has(key));
  const scopeKeys = picked.length > 0 ? picked : null;

  await db()
    .update(studySession)
    .set({ scopeKeys })
    .where(eq(studySession.id, req.params.id));

  ok(res, { scopeKeys });
});

router.patch("/sessions/:id/recall-mode", async (req, res) => {
  const parsed = recallModeSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));
  const updated = await db()
    .update(studySession)
    .set({ recallMode: parsed.data.recallMode })
    .where(
      and(
        eq(studySession.id, req.params.id),
        eq(studySession.userId, ownerId(req)),
      ),
    )
    .returning({ id: studySession.id });
  if (!updated.length) return err(res, "Session not found", 404);
  ok(res, { recallMode: parsed.data.recallMode });
});

/** The merged gap analysis from every recall attempt so far, so a reloaded
 *  targeted-recall session can jump straight to its gaps. */
router.get("/sessions/:id/recall-gaps", async (req, res) => {
  const chapterId = await sessionChapterId(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);
  ok(res, await mergeRecallGaps(req.params.id));
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
  stage: z.enum(["pretest", "retest"]).default("retest"),
});

router.post("/sessions/:id/retest/answer", async (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return err(res, firstIssue(parsed.error.issues));

  const chapterId = await sessionChapterId(req.params.id, ownerId(req));
  if (!chapterId) return err(res, "Session not found", 404);

  const session = await findSession(req.params.id, ownerId(req));
  if (!session) return err(res, "Session not found", 404);
  if (parsed.data.attemptId) {
    const [prior] = await db()
      .select({
        sessionId: attempt.sessionId,
        stage: attempt.stage,
        score: attempt.score,
        gapsIdentified: attempt.gapsIdentified,
      })
      .from(attempt)
      .where(eq(attempt.id, parsed.data.attemptId))
      .limit(1);
    if (prior) {
      if (
        prior.sessionId !== req.params.id ||
        prior.stage !== parsed.data.stage
      ) {
        return err(res, "That answer id has already been used", 409);
      }
      const score = prior.score ?? 0;
      return ok(res, {
        score,
        gaps: { ...prior.gapsIdentified, score },
      });
    }
  }
  if (!(await allowAiRequest(req))) return aiBudgetError(res, req);
  const questions =
    parsed.data.stage === "pretest"
      ? session.pretestQuestions
      : session.retestQuestions;
  const index =
    parsed.data.stage === "pretest"
      ? session.pretestIndex
      : session.retestIndex;
  const question = questions?.[parsed.data.questionIndex];
  if (!question) return err(res, "Retest question not found", 400);
  if (parsed.data.questionIndex !== index) {
    return err(res, "That retest question is out of order", 409);
  }
  const subject = await chapterSubject(chapterId);
  const subset = await focusSubset(chapterId, question.focus);
  if (!subset.length) return err(res, "No concepts matched that question", 400);

  const gaps = await ai.gradeRecall(
    parsed.data.transcriptText,
    subset,
    subject,
  );
  // For a single question, a misconception counts as handled when the student
  // does NOT restate the wrong belief; real concepts count when covered. This
  // is the per-question verdict the UI's "right/still open" actually means.
  const score = Math.round(focusScore(gaps, subset) * 100);

  const currentSession = session;
  const inserted = await insertAttemptOnce({
    id: parsed.data.attemptId,
    sessionId: req.params.id,
    stage: parsed.data.stage,
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
      .set(
        parsed.data.stage === "pretest"
          ? { pretestIndex: (currentSession?.pretestIndex ?? 0) + 1 }
          : { retestIndex: (currentSession?.retestIndex ?? 0) + 1 },
      )
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
  const summary = await resultSummary(req.params.id, ownerId(req), {
    withVerdict: true,
  });
  if (!summary) return err(res, "Session not found", 404);
  ok(res, summary);
});

// ────────────────────────────────────────────────────────────────
// Complete session
// ────────────────────────────────────────────────────────────────

router.post("/sessions/:id/complete", async (req, res) => {
  const session = await findSession(req.params.id, ownerId(req));
  if (!session) return err(res, "Session not found", 404);
  if (session.status === "pending") {
    return err(res, "This chapter has not been started yet", 409);
  }

  await db()
    .update(studySession)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(studySession.id, req.params.id),
        eq(studySession.userId, ownerId(req)),
      ),
    );

  // Open the next chapter in the queue, if this session came from one. The row
  // already exists — creating it now would lose the plan if the student closed
  // the tab — so "moving on" is a status flip and a fresh `startedAt` (the one
  // from planning time would count the days spent on the earlier chapters
  // toward this session's duration). The `status = 'pending'` guard makes two
  // concurrent completions promote the same chapter once.
  const next = session.queueId ? await nextInQueue(session.queueId) : null;
  if (next) {
    await db()
      .update(studySession)
      .set({ status: "in_progress", startedAt: new Date() })
      .where(
        and(
          eq(studySession.id, next.sessionId),
          eq(studySession.status, "pending"),
        ),
      );
  }

  const durationMs = session.startedAt
    ? Math.max(0, Date.now() - session.startedAt.getTime())
    : null;

  ok(res, { ok: true, durationMs, next });
});

export default router;
