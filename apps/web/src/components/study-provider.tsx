import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";

import { useLanguage } from "@/components/language-provider";
import { useOnline } from "@/hooks/use-online";
import { ApiError, api, apiError } from "@/lib/api";
import { clearDemoUser } from "@/lib/demo";
import { enqueueOutbox, flushOutbox, hasQueuedForSession } from "@/lib/outbox";
import {
  type ChecklistRow,
  cacheChapters,
  cacheChecklist,
  cacheQuestions,
  cacheStudyPlan,
  getCachedChapters,
  getCachedQuestions,
  getCachedStudyPlan,
} from "@/lib/store";

export type Phase =
  | "recall"
  | "targeted"
  | "gaps"
  | "lesson"
  | "retest"
  | "result";

export type ChapterInfo = {
  id: string;
  title: string;
  subject: string;
  textbookTitle: string;
  unitId?: string | null;
};

export type MasteryLevel = 0 | 1 | 2 | 3;

/** The five-level cognitive standard a question is tagged with, mirrored from
 *  the server so the UI can label it. Kept as a loose string union on purpose:
 *  a question missing a level (an older cached one) still renders. */
export type CognitiveLevel =
  | "knowledge"
  | "comprehension"
  | "application"
  | "critical_thinking"
  | "compare_contrast";

/** How the student chose to recall before the session's recall began. */
export type RecallMode = "blurting" | "targeted" | "both";

export type Gaps = {
  covered: string[];
  missing: string[];
  misconceptions: string[];
  score: number;
  /** Phase 11: per-concept levels. 0 = not addressed, 1 = raised but not
   *  explained, 2 = explained wrong, 3 = explained correctly. The three lists
   *  above derive from this. Absent on attempts graded before phase 11. */
  mastery?: Record<string, MasteryLevel>;
  /** True when the grade came from the server's lexical fallback, which cannot
   *  judge correctness — the score is then an estimate, capped well below full
   *  credit, and must be labelled as one. */
  estimated?: boolean;
};

/** One concept's section, in this student's study order (phase 11, step 3b).
 *  Content is shared by every student on the chapter; the ORDER is per-student
 *  and computed from mastery, which is why this arrives as an array. */
export type GuideSection = {
  conceptText: string;
  /** The concept's importance, 1-5. */
  weight: number;
  level: MasteryLevel;
  /** The idea itself, 1-2 sentences. */
  what: string;
  why?: string | null;
  /** The say-it-back prompt. */
  recall?: string | null;
  /** Character offset of this concept in the chapter's raw text, so the guide
   *  can hand the student back to their own book. */
  sourceOffset?: number | null;
  sourceQuote?: string | null;
  estimated: boolean;
  needsWork: boolean;
};

export type Guide = {
  sections: GuideSection[];
  estimated: boolean;
  language: "en" | "am";
};

/** A studyable section of the chapter, as the scope picker lists it (phase 11,
 *  step 4). Same coverage units the recall sweep and the verdict use, so "2.3"
 *  means one thing everywhere. */
export type ScopeUnit = {
  key: string;
  /** The book's own label ("2.3"), or "" for an unnumbered book — the UI then
   *  says "Part {n}". */
  label: string;
  conceptCount: number;
  weight: number;
};

/** One gap-specific study-plan step: a route, not a lesson. */
export type StudyPlanStep = {
  concept: string;
  gapType: "missing" | "misconception";
  weight: number;
  masteryLevel: MasteryLevel;
  estimatedMinutes: number;
  anchor: {
    chapter: string;
    heading: string | null;
    page: number | null;
    offset: number;
    excerpt: string;
  };
  whyFirst: string;
  action: string;
  searchQuery: string;
  studentWords: string | null;
};

/** A personalized roadmap over the student's gaps, shown in the lesson phase. */
export type StudyPlan = {
  steps: StudyPlanStep[];
  nextSession: string[];
  skippedKnown: { count: number; estimatedTimeSavedMinutes: number };
  budgetMinutes: number;
  estMinutes: number;
  estimated: boolean;
};

export type SessionVerdictSection = {
  key: string;
  label: string;
  concepts: number;
  probedConcepts: number;
  score: number;
  probed: boolean;
};

export type SessionVerdict = {
  passed: boolean;
  overall: number;
  threshold: number;
  sections: SessionVerdictSection[];
  unprobedSections: number;
};

export type SessionResult = {
  before: number | null;
  after: number | null;
  delta: number | null;
  durationMs?: number | null;
  verdict?: SessionVerdict | null;
};

export type SessionQuestion = {
  question: string;
  focus: string[];
  /** The cognitive level the writer tagged this question with. Absent on
   *  questions cached before levels existed. */
  level?: CognitiveLevel;
  /** A retest question that asks the student to reason beyond the textbook. */
  beyondText?: boolean;
  /** The book objective the question serves, when it serves one. */
  targetObjective?: string;
  /** Format for recall questions; absent for retest and older cached rows. */
  format?: "multiple_choice" | "fill_blank" | "short_answer";
  /** Options for multiple choice recall questions. */
  options?: string[];
  // answer is never sent to the client; server-side only.
  /** The book's own section this recall question covers ("2.3"), when the
   *  chapter carried numbering. Lets the UI name the lesson being checked. */
  lesson?: string;
  /** Recall only: whether the question probes a gap the student flagged, or was
   *  added to sweep the rest of the chapter. */
  origin?: "gap" | "coverage";
};

export type AnswerRecord = {
  question: string;
  answer: string;
  correct: boolean;
  score: number;
  gaps: Gaps;
};

export type StudyState = {
  phase: Phase;
  chapter: ChapterInfo | null;
  chapterLoading: boolean;
  sessionNotFound: boolean;
  /** How the student chose to recall (chosen upfront, before recall starts). */
  recallMode: RecallMode;
  /** The sections this session covers (phase 11, step 4). Null = whole chapter,
   *  which is also what every session written before the picker existed means. */
  scopeKeys: string[] | null;
  /** The chapter's selectable sections, for the picker. Null while loading or
   *  when the chapter's checklist could not be read. */
  scopeUnits: ScopeUnit[] | null;
  gaps: Gaps | null;
  /** The running merged gap analysis from targeted-recall answers, held until
   *  the student moves on to the gaps view. */
  recallGaps: Gaps | null;
  allCovered: boolean;
  lessonText: string | null;
  lessonLoading: boolean;
  /** The ordered guide (phase 11, step 3b). Populated alongside lessonText; the
   *  text is the flattened read-aloud, the sections are what the student
   *  actually reads. */
  guide: GuideSection[] | null;
  guideEstimated: boolean;
  /** The study plan — the roadmap shown in the lesson phase. Fetched alongside
   *  the lesson, best-effort: absent means the classic lesson view renders. */
  plan: StudyPlan | null;
  retestLoading: boolean;
  questions: SessionQuestion[];
  currentQuestion: number;
  answered: AnswerRecord[];
  /** Which family the shared question UI is showing: a diagnostic recall set or
   *  the exam-readiness retest. Drives where an answer is submitted and what
   *  happens when the set is finished. */
  questionStage: "recall" | "pretest" | "retest";
  hasPretest: boolean;
  result: SessionResult | null;
  resultLoading: boolean;
  attempts: number;
  busy: boolean;
  error: string | null;
  quotaResetAt: number | null;
  demoExpired: boolean;
  notice: string | null;
  // One submission is parked in the outbox awaiting a connection. The study
  // UI shows this state honestly — never a score — until a reconnect syncs
  // it and the session reloads to its graded position.
  queued:
    | { kind: "recall" }
    | { kind: "answer"; questionIndex: number }
    | { kind: "recall-answer"; questionIndex: number }
    | null;
  /** The next chapter in the student's queue (phase 11, step 4c), so the result
   *  screen can offer the handoff. Null when the session was not queued. */
  queueNext: { sessionId: string; chapterTitle: string } | null;
  /** This session is a queued chapter the student has not opened yet. The
   *  server refuses answers on a pending session, so the UI says so instead of
   *  letting the student talk into a 409. */
  queueWaiting: boolean;
};

export type StudyAction =
  | { type: "LOAD_START" }
  | { type: "LOAD_OK"; chapter: ChapterInfo }
  | { type: "LOAD_NOT_FOUND" }
  | { type: "BUSY"; busy: boolean }
  | {
      type: "ERROR";
      message: string | null;
      demoExpired?: boolean;
      quotaResetAt?: number | null;
    }
  | { type: "NOTICE"; message: string | null }
  | { type: "RECALL"; gaps: Gaps }
  | { type: "RECALL_FULL"; gaps: Gaps }
  | { type: "SET_RECALL_MODE"; mode: RecallMode }
  | { type: "SET_SCOPE"; scopeKeys: string[] | null }
  | { type: "SCOPE_UNITS"; units: ScopeUnit[] }
  | { type: "RECALL_QUESTIONS"; questions: SessionQuestion[] }
  | {
      type: "RESTORE_TARGETED";
      questions: SessionQuestion[];
      answered: AnswerRecord[];
      gaps: Gaps | null;
    }
  | { type: "RECALL_ANSWER"; record: AnswerRecord; gaps: Gaps }
  | { type: "LESSON"; text: string }
  | { type: "GUIDE"; guide: GuideSection[]; estimated: boolean }
  | { type: "PLAN"; plan: StudyPlan }
  | {
      type: "QUESTIONS";
      questions: SessionQuestion[];
      stage: "pretest" | "retest";
    }
  | {
      type: "RESTORE_PRETEST";
      questions: SessionQuestion[];
      answered: AnswerRecord[];
    }
  | { type: "PRETEST_STATUS"; hasPretest: boolean }
  | { type: "CONTINUE_AFTER_PRETEST" }
  | {
      type: "RESTORE_RETEST";
      questions: SessionQuestion[];
      answered: AnswerRecord[];
    }
  | { type: "ANSWER"; record: AnswerRecord }
  | { type: "RESULT"; result: SessionResult }
  | { type: "RETRY_CYCLE" }
  | { type: "GO_PHASE"; phase: Phase }
  | { type: "QUEUED"; queued: StudyState["queued"] }
  | {
      type: "QUEUE_NEXT";
      next: { sessionId: string; chapterTitle: string } | null;
    }
  | { type: "QUEUE_WAITING" };

type SessionAttemptRow = {
  id: string;
  stage: "recall" | "pretest" | "retest";
  score: number | null;
  gapsIdentified: unknown;
  transcriptText: string | null;
};

// The `sessionId` is the useReducer init argument, but the study state starts
// empty on purpose — the session's real shape arrives with the first fetch.
function initialState(_sessionId: string): StudyState {
  return {
    phase: "recall",
    chapter: null,
    chapterLoading: true,
    sessionNotFound: false,
    recallMode: "blurting",
    scopeKeys: null,
    scopeUnits: null,
    gaps: null,
    recallGaps: null,
    allCovered: false,
    lessonText: null,
    lessonLoading: false,
    guide: null,
    guideEstimated: false,
    plan: null,
    retestLoading: false,
    questions: [],
    currentQuestion: 0,
    answered: [],
    questionStage: "retest",
    hasPretest: false,
    result: null,
    resultLoading: false,
    attempts: 0,
    busy: false,
    error: null,
    quotaResetAt: null,
    demoExpired: false,
    notice: null,
    queued: null,
    queueNext: null,
    queueWaiting: false,
  };
}

// gapsIdentified was originally stored as a bare array of missing concepts;
// newer rows store {covered, missing, misconceptions}. Tolerate both so a
// refresh mid-loop on an older session still restores correctly.
function attemptGaps(raw: unknown): Gaps {
  const stringList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : [];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return {
      covered: stringList(o.covered),
      missing: stringList(o.missing),
      misconceptions: stringList(o.misconceptions),
      score: 0,
    };
  }
  return {
    covered: [],
    missing: stringList(raw),
    misconceptions: [],
    score: 0,
  };
}

const COGNITIVE_LEVELS = [
  "knowledge",
  "comprehension",
  "application",
  "critical_thinking",
  "compare_contrast",
] as const;

function asCognitiveLevel(value: unknown): CognitiveLevel | undefined {
  return typeof value === "string" &&
    (COGNITIVE_LEVELS as readonly string[]).includes(value)
    ? (value as CognitiveLevel)
    : undefined;
}

/** Normalise a server question (level arrives as a plain string) into the
 *  client shape, dropping an unrecognised level rather than mislabelling it. */
export function toSessionQuestion(q: {
  question: string;
  focus: string[];
  level?: unknown;
  beyondText?: unknown;
  targetObjective?: unknown;
  format?: unknown;
  options?: unknown;
  lesson?: unknown;
  origin?: unknown;
}): SessionQuestion {
  const options = Array.isArray(q.options)
    ? q.options.filter(
        (o): o is string => typeof o === "string" && o.length > 0,
      )
    : undefined;
  const format =
    q.format === "multiple_choice" ||
    q.format === "fill_blank" ||
    q.format === "short_answer"
      ? q.format
      : undefined;
  const origin =
    q.origin === "gap" || q.origin === "coverage" ? q.origin : undefined;
  return {
    question: q.question,
    focus: q.focus,
    level: asCognitiveLevel(q.level),
    beyondText: q.beyondText === true ? true : undefined,
    targetObjective:
      typeof q.targetObjective === "string" ? q.targetObjective : undefined,
    ...(format ? { format } : {}),
    ...(options?.length ? { options } : {}),
    ...(typeof q.lesson === "string" && q.lesson.trim()
      ? { lesson: q.lesson.trim() }
      : {}),
    ...(origin ? { origin } : {}),
  };
}

/**
 * Serialise the mastery map for the guide's query string.
 *
 * The guide is ordered per-student, so the server needs the levels. The map is
 * a plain object of concept name → level, so a concept name containing a comma
 * or a colon would corrupt the encoding; those are percent-encoded here rather
 * than trusted, because concept names come from a model.
 */
export function masteryQuery(gaps: Gaps): string {
  const entries = Object.entries(gaps.mastery ?? {});
  if (!entries.length) return "mastery=";
  return `mastery=${entries
    .map(
      ([name, level]) =>
        `${encodeURIComponent(name)}:${encodeURIComponent(String(level))}`,
    )
    .join(",")}`;
}

// Maps a stored cache language to its readable label in the current script.
// Runs inside the provider (needs `t`), so it's a small hook-local helper.
function languageLabel(
  code: "en" | "am",
  t: (key: "lang-en" | "lang-am") => string,
): string {
  return code === "am" ? t("lang-am") : t("lang-en");
}

function reducer(state: StudyState, action: StudyAction): StudyState {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, chapterLoading: true, sessionNotFound: false };
    case "LOAD_OK":
      return {
        ...state,
        chapterLoading: false,
        chapter: action.chapter,
        queued: null,
      };
    case "LOAD_NOT_FOUND":
      return { ...state, chapterLoading: false, sessionNotFound: true };
    case "BUSY":
      return { ...state, busy: action.busy };
    case "ERROR":
      return {
        ...state,
        error: action.message,
        quotaResetAt: action.message ? (action.quotaResetAt ?? null) : null,
        demoExpired: action.demoExpired ?? false,
      };
    case "NOTICE":
      return { ...state, notice: action.message };
    case "RECALL":
      return {
        ...state,
        phase: "gaps",
        gaps: action.gaps,
        recallGaps: null,
        lessonText: null,
        plan: null,
        guide: null,
        guideEstimated: false,
        questions: [],
        answered: [],
        questionStage: "retest",
        result: null,
        error: null,
        notice: null,
        queued: null,
      };
    case "RECALL_FULL":
      return {
        ...state,
        phase: "result",
        gaps: action.gaps,
        allCovered: true,
        plan: null,
        guide: null,
        guideEstimated: false,
        result: {
          before: Math.round(action.gaps.score),
          after: null,
          delta: null,
        },
        error: null,
        notice: null,
        queued: null,
      };
    case "SET_SCOPE":
      return { ...state, scopeKeys: action.scopeKeys };
    case "SCOPE_UNITS":
      return { ...state, scopeUnits: action.units };
    case "SET_RECALL_MODE":
      return { ...state, recallMode: action.mode };
    case "RECALL_QUESTIONS":
      return {
        ...state,
        phase: "targeted",
        questionStage: "recall",
        questions: action.questions,
        currentQuestion: 0,
        answered: [],
        recallGaps: null,
        error: null,
        notice: null,
        queued: null,
      };
    case "RESTORE_TARGETED":
      return {
        ...state,
        phase: "targeted",
        questionStage: "recall",
        questions: action.questions,
        currentQuestion: action.answered.length,
        answered: action.answered,
        recallGaps: action.gaps,
        error: null,
        notice: null,
        queued: null,
      };
    case "RECALL_ANSWER":
      return {
        ...state,
        answered: [...state.answered, action.record],
        currentQuestion: state.currentQuestion + 1,
        recallGaps: action.gaps,
        error: null,
        notice: null,
        queued: null,
      };
    case "LESSON":
      return {
        ...state,
        phase: "lesson",
        lessonText: action.text,
        error: null,
        notice: null,
        queued: null,
      };
    case "GUIDE":
      return {
        ...state,
        guide: action.guide,
        guideEstimated: action.estimated,
      };
    case "PLAN":
      return { ...state, plan: action.plan, error: null, notice: null };
    case "QUESTIONS":
      return {
        ...state,
        phase: "retest",
        questionStage: action.stage,
        hasPretest: state.hasPretest || action.stage === "pretest",
        allCovered: false,
        questions: action.questions,
        currentQuestion: 0,
        answered: [],
        error: null,
        notice: null,
        queued: null,
      };
    case "RESTORE_PRETEST":
      return {
        ...state,
        phase: "retest",
        questionStage: "pretest",
        hasPretest: true,
        questions: action.questions,
        currentQuestion: action.answered.length,
        answered: action.answered,
        error: null,
        notice: null,
        queued: null,
      };
    case "PRETEST_STATUS":
      return { ...state, hasPretest: action.hasPretest };
    case "CONTINUE_AFTER_PRETEST":
      return {
        ...state,
        phase: "recall",
        questions: [],
        currentQuestion: 0,
        answered: [],
        questionStage: "recall",
        error: null,
        notice: null,
        queued: null,
      };
    case "RESTORE_RETEST":
      return {
        ...state,
        phase: "retest",
        questionStage: "retest",
        questions: action.questions,
        currentQuestion: action.answered.length,
        answered: action.answered,
        error: null,
        notice: null,
        queued: null,
      };
    case "ANSWER":
      return {
        ...state,
        answered: [...state.answered, action.record],
        currentQuestion: state.currentQuestion + 1,
        error: null,
        notice: null,
        queued: null,
      };
    case "RESULT": {
      // A repeating another-pass result increments the retry counter so the
      // exit hatch ("come back later") appears after two consecutive misses.
      const anotherPass = !action.result.delta || action.result.delta <= 0;
      return {
        ...state,
        phase: "result",
        result: action.result,
        attempts: anotherPass ? state.attempts + 1 : 0,
        error: null,
        notice: null,
        queued: null,
      };
    }
    case "RETRY_CYCLE":
      return {
        ...state,
        phase: "recall",
        gaps: null,
        recallGaps: null,
        allCovered: false,
        lessonText: null,
        plan: null,
        questions: [],
        currentQuestion: 0,
        answered: [],
        questionStage: "retest",
        result: null,
        error: null,
        notice: null,
        queued: null,
      };
    case "GO_PHASE":
      return { ...state, phase: action.phase, error: null, notice: null };
    case "QUEUED":
      return { ...state, queued: action.queued, error: null };
    case "QUEUE_NEXT":
      return { ...state, queueNext: action.next };
    case "QUEUE_WAITING":
      return { ...state, queueWaiting: true, chapterLoading: false };
    default:
      return state;
  }
}

interface StudyContextValue {
  state: StudyState;
  beginRecall: () => void;
  viewGaps: () => void;
  setRecallMode: (mode: RecallMode) => void;
  setScope: (scopeKeys: string[] | null) => void;
  startRecallQuestions: (scope: "gaps" | "chapter") => Promise<void>;
  submitRecallAnswer: (text: string) => Promise<void>;
  viewTargetedGaps: () => void;
  submitRecall: (text: string) => Promise<void>;
  fetchLesson: (budgetMinutes?: 10 | 20 | 40) => Promise<void>;
  goLesson: () => void;
  startRetest: () => Promise<void>;
  startPretest: () => Promise<void>;
  submitAnswer: (text: string) => Promise<void>;
  continueAfterPretest: () => void;
  skipRetest: () => Promise<void>;
  fetchResult: () => Promise<void>;
  retryAgain: () => void;
  retryLast: () => Promise<void>;
  completeSession: () => Promise<{
    next: { sessionId: string; chapterTitle: string } | null;
  }>;
  setNotice: (message: string | null) => void;
  clearNotice: () => void;
  clearError: () => void;
}

const StudyContext = createContext<StudyContextValue | null>(null);

export function StudyProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, sessionId, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const replayRef = useRef<(() => Promise<void>) | null>(null);
  const scopeWriteRef = useRef(0);
  // Guards against two submissions racing to grade the same recall/answer.
  const submittingRef = useRef(false);
  // Set the first time a submission (or the initial load) can't reach the
  // server. A reconnect uses it to decide whether to flush the outbox and
  // reload the session onto its graded position.
  const offlineHitRef = useRef(false);
  const online = useOnline();
  // Bet 4 / slice C: generated lessons and retest questions follow the app's
  // language pref; cached (offline) reads stay honest about which language
  // they were written in.
  const { t, lang } = useLanguage();

  const reportError = useCallback((err: unknown) => {
    const demoExpired = err instanceof ApiError && err.demoExpired;
    if (demoExpired) clearDemoUser();
    const quotaResetAt =
      err instanceof ApiError &&
      err.code === "AI_QUOTA_EXCEEDED" &&
      err.retryAfterSeconds !== null
        ? Date.now() + err.retryAfterSeconds * 1000
        : null;
    dispatch({
      type: "ERROR",
      message: apiError(err),
      demoExpired,
      quotaResetAt,
    });
  }, []);

  const run = useCallback(
    async (op: () => Promise<void>, onReplay?: () => Promise<void>) => {
      replayRef.current = onReplay ?? op;
      dispatch({ type: "BUSY", busy: true });
      dispatch({ type: "ERROR", message: null });
      try {
        await op();
      } catch (err) {
        reportError(err);
      } finally {
        dispatch({ type: "BUSY", busy: false });
      }
    },
    [reportError],
  );

  // loadSession (below, after fetchResult) opens the session, caches the
  // chapter list + current checklist, and restores where the loop left off.
  // The mount + reconnect effects that drive it live with it.

  const submitRecall = useCallback(
    (text: string) => {
      if (submittingRef.current) return Promise.resolve();
      submittingRef.current = true;
      // A random id per submission makes replay/retry idempotent on the
      // server (one attempt row), while still deduping double-posts.
      const attemptId = crypto.randomUUID();
      return run(
        () =>
          api<{ gaps: Gaps }>(`/sessions/${sessionId}/recall`, {
            method: "POST",
            body: JSON.stringify({ transcriptText: text, attemptId }),
            timeoutMs: 45_000,
          })
            .then(({ gaps }) => {
              if (gaps.missing.length === 0) {
                dispatch({ type: "RECALL_FULL", gaps });
              } else {
                dispatch({ type: "RECALL", gaps });
              }
            })
            .catch((err: unknown) => {
              // A network failure parks the recall in the outbox — honest
              // "saved, will be graded" — instead of dropping the words a
              // student just said. Grading still happens online, on sync.
              if (err instanceof ApiError && err.status === 0) {
                offlineHitRef.current = true;
                void enqueueOutbox({
                  id: attemptId,
                  kind: "recall",
                  sessionId,
                  attemptId,
                  payload: { transcriptText: text },
                  createdAt: Date.now(),
                });
                dispatch({ type: "QUEUED", queued: { kind: "recall" } });
                dispatch({
                  type: "NOTICE",
                  message: t("queued-recall"),
                });
                return;
              }
              throw err;
            }),
        undefined,
      ).finally(() => {
        submittingRef.current = false;
      });
    },
    [run, sessionId, t],
  );

  const setRecallMode = useCallback(
    (mode: RecallMode) => {
      dispatch({ type: "SET_RECALL_MODE", mode });
      // Persist best-effort: a failed write must not block the choice, it only
      // means a reload falls back to the previous mode.
      void api(`/sessions/${sessionId}/recall-mode`, {
        method: "PATCH",
        body: JSON.stringify({ recallMode: mode }),
      }).catch(() => {});
    },
    [sessionId],
  );

  const setScope = useCallback(
    (scopeKeys: string[] | null) => {
      const requestId = ++scopeWriteRef.current;
      const previous = stateRef.current.scopeKeys;
      dispatch({ type: "SET_SCOPE", scopeKeys });
      // Persist the choice before the student starts; a rejected write must not
      // leave the picker showing a scope the server will ignore.
      void api<{ scopeKeys: string[] | null }>(`/sessions/${sessionId}/scope`, {
        method: "PATCH",
        body: JSON.stringify({ scopeKeys }),
      })
        .then((res) => {
          if (requestId === scopeWriteRef.current) {
            dispatch({ type: "SET_SCOPE", scopeKeys: res.scopeKeys });
          }
        })
        .catch((err: unknown) => {
          if (requestId !== scopeWriteRef.current) return;
          dispatch({ type: "SET_SCOPE", scopeKeys: previous });
          reportError(err);
        });
    },
    [sessionId, reportError],
  );

  const startRecallQuestions = useCallback(
    (scope: "gaps" | "chapter") => {
      const gaps = stateRef.current.gaps;
      const body = {
        scope,
        missing: scope === "gaps" ? (gaps?.missing ?? []) : [],
        misconceptions: scope === "gaps" ? (gaps?.misconceptions ?? []) : [],
        language: lang,
      };
      return run(
        () =>
          api<{ questions: SessionQuestion[] }>(
            `/sessions/${sessionId}/recall-questions`,
            {
              method: "POST",
              body: JSON.stringify(body),
              timeoutMs: 45_000,
            },
          ).then(({ questions }) =>
            dispatch({
              type: "RECALL_QUESTIONS",
              questions: questions.map(toSessionQuestion),
            }),
          ),
        undefined,
      );
    },
    [run, sessionId, lang],
  );

  const submitRecallAnswer = useCallback(
    (text: string) => {
      const { questions, currentQuestion } = stateRef.current;
      const question = questions[currentQuestion];
      if (!question) return Promise.resolve();
      if (submittingRef.current) return Promise.resolve();
      submittingRef.current = true;
      const attemptId = crypto.randomUUID();
      return run(
        () =>
          api<{ score: number; gaps: Gaps; merged: Gaps }>(
            `/sessions/${sessionId}/recall-questions/answer`,
            {
              method: "POST",
              body: JSON.stringify({
                transcriptText: text,
                questionIndex: currentQuestion,
                attemptId,
              }),
              timeoutMs: 45_000,
            },
          )
            .then(({ score, gaps: answerGaps, merged }) =>
              dispatch({
                type: "RECALL_ANSWER",
                record: {
                  question: question.question,
                  answer: text,
                  correct: score >= 50,
                  score,
                  gaps: answerGaps,
                },
                gaps: merged,
              }),
            )
            .catch((err: unknown) => {
              if (err instanceof ApiError && err.status === 0) {
                offlineHitRef.current = true;
                void enqueueOutbox({
                  id: attemptId,
                  kind: "recall-answer",
                  sessionId,
                  attemptId,
                  payload: {
                    transcriptText: text,
                    questionIndex: currentQuestion,
                  },
                  createdAt: Date.now(),
                });
                dispatch({
                  type: "QUEUED",
                  queued: {
                    kind: "recall-answer",
                    questionIndex: currentQuestion,
                  },
                });
                dispatch({ type: "NOTICE", message: t("queued-answer") });
                return;
              }
              throw err;
            }),
        undefined,
      ).finally(() => {
        submittingRef.current = false;
      });
    },
    [run, sessionId, t],
  );

  const viewTargetedGaps = useCallback(() => {
    const gaps = stateRef.current.recallGaps;
    if (!gaps) return;
    if (gaps.missing.length === 0 && gaps.misconceptions.length === 0) {
      dispatch({ type: "RECALL_FULL", gaps });
    } else {
      dispatch({ type: "RECALL", gaps });
    }
  }, []);

  /**
   * The guide (phase 11, step 3b): per-concept sections, ordered for this
   * student, content cached per chapter. Fetched alongside the plan so the
   * lesson phase has both the route and the reading — and deliberately never
   * through `run`: a throttled or offline guide must not surface as an error
   * over a lesson that is already there.
   */
  const fetchGuide = useCallback(
    (gaps: Gaps, chapterId: string) => {
      const scope = stateRef.current.scopeKeys;
      const scopeParam = scope?.length
        ? `&scope=${encodeURIComponent(scope.join(","))}`
        : "";
      void api<Guide>(
        `/chapters/${chapterId}/guide?language=${lang}&${masteryQuery(gaps)}${scopeParam}`,
        { timeoutMs: 30_000 },
      )
        .then((guide) => {
          if (!guide.sections?.length) return;
          dispatch({
            type: "GUIDE",
            guide: guide.sections,
            estimated: guide.estimated,
          });
        })
        .catch(() => {
          /* additive: the plan and the checklist already carry this phase */
        });
    },
    [lang],
  );

  const fetchLesson = useCallback(
    (budgetMinutes: 10 | 20 | 40 = 20) => {
      const gaps = stateRef.current.gaps;
      const chapterId = stateRef.current.chapter?.id;
      if (!gaps) return Promise.resolve();

      if (!chapterId) return Promise.resolve();
      // The guide is content the student can start reading while the plan is
      // still being built; both come back in the same phase.
      fetchGuide(gaps, chapterId);
      return run(async () => {
        try {
          const plan = await api<StudyPlan>(`/sessions/${sessionId}/plan`, {
            method: "POST",
            body: JSON.stringify({
              missing: gaps.missing,
              misconceptions: gaps.misconceptions,
              mastery: gaps.mastery ?? {},
              budgetMinutes,
              language: lang,
            }),
            timeoutMs: 60_000,
          });
          dispatch({ type: "PLAN", plan });
          await cacheStudyPlan({
            sessionId,
            chapterId,
            language: lang,
            budgetMinutes,
            plan,
            cachedAt: Date.now(),
          });
          dispatch({ type: "LESSON", text: "" });
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 0) throw error;
          const cached = await getCachedStudyPlan(
            sessionId,
            lang,
            budgetMinutes,
          );
          if (!cached) throw error;
          dispatch({ type: "PLAN", plan: cached.plan });
          dispatch({ type: "LESSON", text: "" });
          dispatch({ type: "NOTICE", message: t("plan-cached-offline") });
        }
      }, undefined);
    },
    [run, sessionId, lang, t, fetchGuide],
  );

  const goLesson = useCallback(() => {
    // Back into the lesson without a fresh API call when it's already loaded.
    if (stateRef.current.lessonText) {
      dispatch({ type: "GO_PHASE", phase: "lesson" });
      return;
    }
    void fetchLesson();
  }, [fetchLesson]);

  const startRetest = useCallback(() => {
    const gaps = stateRef.current.gaps;
    if (!gaps) return Promise.resolve();
    return run(
      () =>
        api<{ questions: SessionQuestion[] }>(`/sessions/${sessionId}/retest`, {
          method: "POST",
          body: JSON.stringify({
            missing: gaps.missing,
            misconceptions: gaps.misconceptions,
            language: lang,
          }),
          timeoutMs: 45_000,
        })
          .then(({ questions }) => {
            const normalized = questions.map(toSessionQuestion);
            // Bet 3: keep the questions on the phone — a student who loses
            // the connection mid-retest can still answer them, and the
            // answers queue in the outbox to be graded on reconnect.
            void cacheQuestions(sessionId, normalized, lang);
            dispatch({
              type: "QUESTIONS",
              questions: normalized,
              stage: "retest",
            });
          })
          .catch(async (err: unknown) => {
            // Offline: reuse the questions saved earlier for this session.
            // Answering them still grades server-side once the outbox
            // flushes, so nothing about the verdict is implied locally.
            if (err instanceof ApiError && err.status === 0) {
              const cached = await getCachedQuestions(sessionId);
              if (!cached?.questions.length) throw err;
              dispatch({
                type: "QUESTIONS",
                questions: cached.questions,
                stage: "retest",
              });
              const language = cached.language ?? "en";
              dispatch({
                type: "NOTICE",
                message:
                  language !== lang
                    ? t("questions-cached-lang", {
                        lang: languageLabel(language, t),
                      })
                    : t("questions-cached"),
              });
              return;
            }
            throw err;
          }),
      undefined,
    );
  }, [run, sessionId, lang, t]);

  const startPretest = useCallback(
    () =>
      run(
        () =>
          api<{ questions: SessionQuestion[] }>(
            `/sessions/${sessionId}/pretest`,
            {
              method: "POST",
              body: JSON.stringify({
                missing: [],
                misconceptions: [],
                language: lang,
              }),
              timeoutMs: 45_000,
            },
          ).then(({ questions }) =>
            dispatch({
              type: "QUESTIONS",
              questions: questions.map(toSessionQuestion),
              stage: "pretest",
            }),
          ),
        undefined,
      ),
    [run, sessionId, lang],
  );

  const continueAfterPretest = useCallback(() => {
    dispatch({ type: "CONTINUE_AFTER_PRETEST" });
    if (stateRef.current.recallMode === "targeted") {
      void startRecallQuestions("chapter");
    }
  }, [startRecallQuestions]);

  const submitAnswer = useCallback(
    (text: string) => {
      const { questions, currentQuestion, questionStage } = stateRef.current;
      const question = questions[currentQuestion];
      if (
        !question ||
        (questionStage !== "pretest" && questionStage !== "retest")
      ) {
        return Promise.resolve();
      }
      if (submittingRef.current) return Promise.resolve();
      submittingRef.current = true;
      const attemptId = crypto.randomUUID();
      return run(
        () =>
          api<{ score: number; gaps: Gaps }>(
            `/sessions/${sessionId}/retest/answer`,
            {
              method: "POST",
              body: JSON.stringify({
                transcriptText: text,
                questionIndex: currentQuestion,
                attemptId,
                stage: questionStage,
              }),
              timeoutMs: 45_000,
            },
          )
            .then(({ score, gaps: answerGaps }) =>
              dispatch({
                type: "ANSWER",
                record: {
                  question: question.question,
                  answer: text,
                  correct: score >= 50,
                  score,
                  gaps: answerGaps,
                },
              }),
            )
            .catch((err: unknown) => {
              // Same park-and-sync as the recall: a dropped connection
              // must not lose the answer, and nothing gets graded while
              // it's still queued (no score is shown for it).
              if (err instanceof ApiError && err.status === 0) {
                offlineHitRef.current = true;
                void enqueueOutbox({
                  id: attemptId,
                  kind: "answer",
                  sessionId,
                  attemptId,
                  payload: {
                    transcriptText: text,
                    questionIndex: currentQuestion,
                    stage: questionStage,
                  },
                  createdAt: Date.now(),
                });
                dispatch({
                  type: "QUEUED",
                  queued: { kind: "answer", questionIndex: currentQuestion },
                });
                dispatch({
                  type: "NOTICE",
                  message: t("queued-answer"),
                });
                return;
              }
              throw err;
            }),
        undefined,
      ).finally(() => {
        submittingRef.current = false;
      });
    },
    [run, sessionId, t],
  );

  const fetchResult = useCallback(
    () =>
      run(
        () =>
          api<SessionResult>(`/sessions/${sessionId}/result`).then((result) =>
            dispatch({ type: "RESULT", result }),
          ),
        undefined,
      ),
    [run, sessionId],
  );

  const skipRetest = useCallback(() => fetchResult(), [fetchResult]);

  // Opens the session: loads it + the chapter list (caching both), pre-caches
  // the current chapter's checklist (bet 3 — conservatively, one chapter, not
  // the whole library), then restores where the loop left off from the attempt
  // history instead of silently restarting at "Speak".
  const loadSession = useCallback(() => {
    const token = ++loadTokenRef.current;
    dispatch({ type: "LOAD_START" });
    (async () => {
      try {
        // The session and the chapter list are independent. Waiting for one
        // before asking for the other doubled the opening time on a slow link,
        // which read as a freeze. If the list can't be reached, the local copy
        // is enough to open the chapter the session already names.
        const sessionPromise = api<{
          chapterId: string;
          status: string;
          attempts: SessionAttemptRow[];
          recallMode?: RecallMode;
          scopeKeys?: string[] | null;
          pretestQuestions?: SessionQuestion[] | null;
          pretestIndex: number;
          recallQuestions: SessionQuestion[] | null;
          recallIndex: number;
          retestQuestions: SessionQuestion[] | null;
          retestIndex: number;
          queueNext?: { sessionId: string; chapterTitle: string } | null;
        }>(`/sessions/${sessionId}`, { timeoutMs: 20_000 });
        const chaptersPromise = api<ChapterInfo[]>("/chapters")
          .then((rows) => ({ rows, fromCache: false }))
          .catch(async (error: unknown) => {
            if (!(error instanceof ApiError) || error.status !== 0) throw error;
            const cached = await getCachedChapters();
            if (!cached?.length) throw error;
            return {
              rows: cached.map(
                ({ id, title, subject, textbookTitle, unitId }) => ({
                  id,
                  title,
                  subject,
                  textbookTitle,
                  unitId,
                }),
              ),
              fromCache: true,
            };
          });
        const [session, chapterList] = await Promise.all([
          sessionPromise,
          chaptersPromise,
        ]);
        const chapters = chapterList.rows;
        if (token !== loadTokenRef.current) return;
        if (!chapterList.fromCache) {
          void cacheChapters(
            chapters.map(({ id, title, subject, textbookTitle, unitId }) => ({
              id,
              title,
              subject,
              textbookTitle,
              unitId,
              cachedAt: Date.now(),
            })),
          );
        }
        const chapter =
          chapters.find((c) => c.id === session.chapterId) ?? null;
        if (!chapter) {
          dispatch({ type: "LOAD_NOT_FOUND" });
          return;
        }
        dispatch({ type: "LOAD_OK", chapter });
        dispatch({ type: "QUEUE_NEXT", next: session.queueNext ?? null });
        // A queued chapter has been planned but not opened. Every write to it is
        // refused server-side ("not open for answers"), so the student is shown
        // that plainly instead of being dropped into a recall screen whose first
        // submission would come back as a 409.
        if (session.status === "pending") {
          dispatch({ type: "QUEUE_WAITING" });
          return;
        }
        if (session.recallMode) {
          dispatch({ type: "SET_RECALL_MODE", mode: session.recallMode });
        }
        // Restore the chosen scope so a reload keeps studying the same topics.
        dispatch({ type: "SET_SCOPE", scopeKeys: session.scopeKeys ?? null });
        const pretests = session.attempts.filter(
          (attempt) => attempt.stage === "pretest",
        );
        dispatch({
          type: "PRETEST_STATUS",
          hasPretest: Boolean(session.pretestQuestions?.length),
        });
        // Pre-cache this chapter's checklist for offline study. Non-fatal:
        // the gaps view re-fetches and caches it too.
        void api<ChecklistRow[]>(`/chapters/${chapter.id}/concepts`, {
          timeoutMs: 60_000,
        })
          .then((rows) => void cacheChecklist(chapter.id, rows))
          .catch(() => {});
        // The chapter's selectable sections, for the scope picker. Non-fatal:
        // without them the picker simply does not appear and the session stays
        // whole-chapter.
        void api<{ units: ScopeUnit[] }>(`/chapters/${chapter.id}/units`, {
          timeoutMs: 60_000,
        })
          .then(({ units }) => {
            if (token !== loadTokenRef.current) return;
            dispatch({ type: "SCOPE_UNITS", units });
          })
          .catch(() => {});

        const recalls = session.attempts.filter((a) => a.stage === "recall");
        const retests = session.attempts.filter((a) => a.stage === "retest");
        if (
          session.status === "in_progress" &&
          session.pretestQuestions?.length &&
          session.pretestIndex < session.pretestQuestions.length
        ) {
          const restored = pretests
            .slice(0, session.pretestIndex)
            .map((attempt, index) => ({
              question:
                session.pretestQuestions?.[index]?.question ??
                t("previously-answered"),
              answer: attempt.transcriptText ?? "",
              correct: (attempt.score ?? 0) >= 50,
              score: attempt.score ?? 0,
              gaps: attemptGaps(attempt.gapsIdentified),
            }));
          if (token !== loadTokenRef.current) return;
          dispatch({
            type: "RESTORE_PRETEST",
            questions: session.pretestQuestions,
            answered: restored,
          });
          dispatch({ type: "NOTICE", message: t("pretest-restored") });
          return;
        }
        const targetedInProgress =
          session.recallMode &&
          session.recallMode !== "blurting" &&
          session.status === "in_progress" &&
          !!session.recallQuestions?.length &&
          session.recallIndex > 0;

        if (session.status === "completed") {
          if (token === loadTokenRef.current) void fetchResult();
        } else if (targetedInProgress) {
          const questions = session.recallQuestions ?? [];
          const restored = recalls
            .slice(0, session.recallIndex)
            .map((attempt, index) => ({
              question: questions[index]?.question ?? t("previously-answered"),
              answer: attempt.transcriptText ?? "",
              correct: (attempt.score ?? 0) >= 50,
              score: attempt.score ?? 0,
              gaps: attemptGaps(attempt.gapsIdentified),
            }));
          if (token !== loadTokenRef.current) return;
          if (session.recallIndex < questions.length) {
            dispatch({
              type: "RESTORE_TARGETED",
              questions,
              answered: restored,
              gaps: null,
            });
          } else {
            // All questions answered: jump straight to the merged gaps.
            try {
              const merged = await api<Gaps>(
                `/sessions/${sessionId}/recall-gaps`,
              );
              if (token !== loadTokenRef.current) return;
              if (merged.missing.length || merged.misconceptions.length) {
                dispatch({ type: "RECALL", gaps: merged });
              } else {
                dispatch({ type: "RECALL_FULL", gaps: merged });
              }
            } catch {
              if (token !== loadTokenRef.current) return;
              dispatch({
                type: "RESTORE_TARGETED",
                questions,
                answered: restored,
                gaps: null,
              });
            }
          }
          return;
        }

        if (
          retests.length &&
          session.status === "in_progress" &&
          session.retestQuestions?.length
        ) {
          const restored = retests
            .slice(0, session.retestIndex)
            .map((attempt, index) => {
              const gaps = attemptGaps(attempt.gapsIdentified);
              return {
                question:
                  session.retestQuestions?.[index]?.question ??
                  t("previously-answered"),
                answer: attempt.transcriptText ?? "",
                correct: (attempt.score ?? 0) >= 50,
                score: attempt.score ?? 0,
                gaps,
              };
            });
          if (token !== loadTokenRef.current) return;
          dispatch({
            type: "RESTORE_RETEST",
            questions: session.retestQuestions,
            answered: restored,
          });
          dispatch({ type: "NOTICE", message: t("retest-restored") });
        } else if (recalls.length) {
          const last = recalls[recalls.length - 1];
          const stored = attemptGaps(last.gapsIdentified);
          const gaps: Gaps = {
            covered: stored.covered,
            missing: stored.missing,
            misconceptions: stored.misconceptions,
            score: last.score ?? 0,
          };
          if (token !== loadTokenRef.current) return;
          if (gaps.missing.length) {
            dispatch({ type: "RECALL", gaps });
          } else {
            dispatch({ type: "RECALL_FULL", gaps });
          }
        }
      } catch (err) {
        if (token !== loadTokenRef.current) return;
        if (err instanceof ApiError && err.status === 404) {
          dispatch({ type: "LOAD_NOT_FOUND" });
        } else {
          if (err instanceof ApiError && err.status === 0) {
            offlineHitRef.current = true;
          }
          reportError(err);
        }
      }
    })();
  }, [sessionId, fetchResult, reportError, t]);

  const loadTokenRef = useRef(0);

  // Open the session on mount.
  useEffect(() => {
    loadSession();
    return () => {
      loadTokenRef.current++;
    };
  }, [loadSession]);

  // Reconnect: if a submission (or the load itself) couldn't reach the server,
  // flush the outbox now (idempotent — each item reuses its original
  // attemptId, so a replay lands exactly once) and reload the session onto
  // its just-graded position.
  useEffect(() => {
    if (!online) return;
    if (!offlineHitRef.current) return;
    offlineHitRef.current = false;
    void (async () => {
      await flushOutbox();
      const stillQueued = await hasQueuedForSession(sessionId);
      if (!stillQueued) loadSession();
    })();
  }, [online, sessionId, loadSession]);

  const retryAgain = useCallback(() => dispatch({ type: "RETRY_CYCLE" }), []);
  const retryLast = useCallback(() => {
    const replay = replayRef.current;
    if (!replay) return Promise.resolve();
    dispatch({ type: "ERROR", message: null });
    dispatch({ type: "BUSY", busy: true });
    return replay()
      .catch((err: unknown) => reportError(err))
      .finally(() => dispatch({ type: "BUSY", busy: false }));
  }, [reportError]);

  const completeSession = useCallback(async () => {
    try {
      const res = await api<{
        next: { sessionId: string; chapterTitle: string } | null;
      }>(`/sessions/${sessionId}/complete`, { method: "POST" });
      return res;
    } catch (err) {
      reportError(err);
      throw err;
    }
  }, [reportError, sessionId]);

  const setNotice = useCallback(
    (message: string | null) => dispatch({ type: "NOTICE", message }),
    [],
  );
  const clearNotice = useCallback(
    () => dispatch({ type: "NOTICE", message: null }),
    [],
  );
  const clearError = useCallback(
    () => dispatch({ type: "ERROR", message: null }),
    [],
  );
  const beginRecall = useCallback(
    () => dispatch({ type: "GO_PHASE", phase: "recall" }),
    [],
  );
  const viewGaps = useCallback(
    () => dispatch({ type: "GO_PHASE", phase: "gaps" }),
    [],
  );

  return (
    <StudyContext.Provider
      value={{
        state,
        beginRecall,
        viewGaps,
        setRecallMode,
        setScope,
        startRecallQuestions,
        submitRecallAnswer,
        viewTargetedGaps,
        submitRecall,
        fetchLesson,
        goLesson,
        startRetest,
        startPretest,
        submitAnswer,
        continueAfterPretest,
        skipRetest,
        fetchResult,
        retryAgain,
        retryLast,
        completeSession,
        setNotice,
        clearNotice,
        clearError,
      }}
    >
      {children}
    </StudyContext.Provider>
  );
}

export function useStudy(): StudyContextValue {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error("useStudy must be used within a StudyProvider");
  return ctx;
}
