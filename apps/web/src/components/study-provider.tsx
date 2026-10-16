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

export type SessionResult = {
  before: number | null;
  after: number | null;
  delta: number | null;
  durationMs?: number | null;
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
  questionStage: "recall" | "retest";
  result: SessionResult | null;
  resultLoading: boolean;
  attempts: number;
  busy: boolean;
  error: string | null;
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
};

export type StudyAction =
  | { type: "LOAD_START" }
  | { type: "LOAD_OK"; chapter: ChapterInfo }
  | { type: "LOAD_NOT_FOUND" }
  | { type: "BUSY"; busy: boolean }
  | { type: "ERROR"; message: string | null; demoExpired?: boolean }
  | { type: "NOTICE"; message: string | null }
  | { type: "RECALL"; gaps: Gaps }
  | { type: "RECALL_FULL"; gaps: Gaps }
  | { type: "SET_RECALL_MODE"; mode: RecallMode }
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
  | { type: "QUESTIONS"; questions: SessionQuestion[] }
  | {
      type: "RESTORE_RETEST";
      questions: SessionQuestion[];
      answered: AnswerRecord[];
    }
  | { type: "ANSWER"; record: AnswerRecord }
  | { type: "RESULT"; result: SessionResult }
  | { type: "RETRY_CYCLE" }
  | { type: "GO_PHASE"; phase: Phase }
  | { type: "QUEUED"; queued: StudyState["queued"] };

type SessionAttemptRow = {
  id: string;
  stage: "recall" | "retest";
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
    result: null,
    resultLoading: false,
    attempts: 0,
    busy: false,
    error: null,
    demoExpired: false,
    notice: null,
    queued: null,
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
}): SessionQuestion {
  return {
    question: q.question,
    focus: q.focus,
    level: asCognitiveLevel(q.level),
    beyondText: q.beyondText === true ? true : undefined,
    targetObjective:
      typeof q.targetObjective === "string" ? q.targetObjective : undefined,
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
        result: {
          before: Math.round(action.gaps.score),
          after: null,
          delta: null,
        },
        error: null,
        notice: null,
        queued: null,
      };
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
        questionStage: "retest",
        questions: action.questions,
        currentQuestion: 0,
        answered: [],
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
        allCovered: false,
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
    default:
      return state;
  }
}

interface StudyContextValue {
  state: StudyState;
  beginRecall: () => void;
  viewGaps: () => void;
  setRecallMode: (mode: RecallMode) => void;
  startRecallQuestions: (scope: "gaps" | "chapter") => Promise<void>;
  submitRecallAnswer: (text: string) => Promise<void>;
  viewTargetedGaps: () => void;
  submitRecall: (text: string) => Promise<void>;
  fetchLesson: (budgetMinutes?: 10 | 20 | 40) => Promise<void>;
  goLesson: () => void;
  startRetest: () => Promise<void>;
  submitAnswer: (text: string) => Promise<void>;
  fetchResult: () => Promise<void>;
  retryAgain: () => void;
  retryLast: () => Promise<void>;
  completeSession: () => Promise<void>;
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
    dispatch({
      type: "ERROR",
      message: apiError(err),
      demoExpired,
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
            { method: "POST", body: JSON.stringify(body) },
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

  const fetchLesson = useCallback(
    (budgetMinutes: 10 | 20 | 40 = 20) => {
      const gaps = stateRef.current.gaps;
      const chapterId = stateRef.current.chapter?.id;
      if (!gaps) return Promise.resolve();

      if (!chapterId) return Promise.resolve();
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
    [run, sessionId, lang, t],
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
        })
          .then(({ questions }) => {
            const normalized = questions.map(toSessionQuestion);
            // Bet 3: keep the questions on the phone — a student who loses
            // the connection mid-retest can still answer them, and the
            // answers queue in the outbox to be graded on reconnect.
            void cacheQuestions(sessionId, normalized, lang);
            dispatch({ type: "QUESTIONS", questions: normalized });
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

  const submitAnswer = useCallback(
    (text: string) => {
      const { gaps, questions, currentQuestion } = stateRef.current;
      const question = questions[currentQuestion];
      if (!gaps || !question) return Promise.resolve();
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
              }),
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

  // Opens the session: loads it + the chapter list (caching both), pre-caches
  // the current chapter's checklist (bet 3 — conservatively, one chapter, not
  // the whole library), then restores where the loop left off from the attempt
  // history instead of silently restarting at "Speak".
  const loadSession = useCallback(() => {
    const token = ++loadTokenRef.current;
    dispatch({ type: "LOAD_START" });
    (async () => {
      try {
        const session = await api<{
          chapterId: string;
          status: string;
          attempts: SessionAttemptRow[];
          recallMode?: RecallMode;
          recallQuestions: SessionQuestion[] | null;
          recallIndex: number;
          retestQuestions: SessionQuestion[] | null;
          retestIndex: number;
        }>(`/sessions/${sessionId}`);
        const chapters = await api<ChapterInfo[]>("/chapters");
        if (token !== loadTokenRef.current) return;
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
        const chapter =
          chapters.find((c) => c.id === session.chapterId) ?? null;
        if (!chapter) {
          dispatch({ type: "LOAD_NOT_FOUND" });
          return;
        }
        dispatch({ type: "LOAD_OK", chapter });
        if (session.recallMode) {
          dispatch({ type: "SET_RECALL_MODE", mode: session.recallMode });
        }
        // Pre-cache this chapter's checklist for offline study. Non-fatal:
        // the gaps view re-fetches and caches it too.
        void api<ChecklistRow[]>(`/chapters/${chapter.id}/concepts`)
          .then((rows) => void cacheChecklist(chapter.id, rows))
          .catch(() => {});

        const recalls = session.attempts.filter((a) => a.stage === "recall");
        const retests = session.attempts.filter((a) => a.stage === "retest");
        const targetedInProgress =
          session.recallMode &&
          session.recallMode !== "blurting" &&
          session.status === "in_progress" &&
          !!session.recallQuestions?.length &&
          session.recallIndex > 0;

        if (targetedInProgress) {
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
        } else if (retests.length && session.status === "completed") {
          if (token === loadTokenRef.current) void fetchResult();
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
      await api(`/sessions/${sessionId}/complete`, { method: "POST" });
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
        startRecallQuestions,
        submitRecallAnswer,
        viewTargetedGaps,
        submitRecall,
        fetchLesson,
        goLesson,
        startRetest,
        submitAnswer,
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
