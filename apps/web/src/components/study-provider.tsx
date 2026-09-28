import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";

import {
  setChapter,
  setSession,
  setStudyContext,
} from "@/components/assistant";
import { useLanguage } from "@/components/language-provider";
import { useOnline } from "@/hooks/use-online";
import { ApiError, api, apiError } from "@/lib/api";
import { enqueueOutbox, flushOutbox, hasQueuedForSession } from "@/lib/outbox";
import {
  type ChecklistRow,
  cacheChapters,
  cacheChecklist,
  cacheLesson,
  cacheQuestions,
  getCachedLesson,
  getCachedQuestions,
} from "@/lib/store";

export type Phase = "recall" | "gaps" | "lesson" | "retest" | "result";

export type ChapterInfo = {
  id: string;
  title: string;
  subject: string;
  textbookTitle: string;
  unitId?: string | null;
};

export type MasteryLevel = 0 | 1 | 2 | 3;

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

export type SessionResult = {
  before: number | null;
  after: number | null;
  delta: number | null;
  durationMs?: number | null;
};

export type SessionQuestion = {
  question: string;
  focus: string[];
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
  gaps: Gaps | null;
  allCovered: boolean;
  lessonText: string | null;
  lessonLoading: boolean;
  /** The ordered guide (phase 11, step 3b). Populated alongside lessonText; the
   *  text is the flattened read-aloud, the sections are what the student
   *  actually reads. */
  guide: GuideSection[] | null;
  guideEstimated: boolean;
  retestLoading: boolean;
  questions: SessionQuestion[];
  currentQuestion: number;
  answered: AnswerRecord[];
  result: SessionResult | null;
  resultLoading: boolean;
  attempts: number;
  busy: boolean;
  error: string | null;
  notice: string | null;
  // One submission is parked in the outbox awaiting a connection. The study
  // UI shows this state honestly — never a score — until a reconnect syncs
  // it and the session reloads to its graded position.
  queued: { kind: "recall" } | { kind: "answer"; questionIndex: number } | null;
};

export type StudyAction =
  | { type: "LOAD_START" }
  | { type: "LOAD_OK"; chapter: ChapterInfo }
  | { type: "LOAD_NOT_FOUND" }
  | { type: "BUSY"; busy: boolean }
  | { type: "ERROR"; message: string | null }
  | { type: "NOTICE"; message: string | null }
  | { type: "RECALL"; gaps: Gaps }
  | { type: "RECALL_FULL"; gaps: Gaps }
  | { type: "LESSON"; text: string }
  | { type: "GUIDE"; guide: GuideSection[]; estimated: boolean }
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
    gaps: null,
    allCovered: false,
    lessonText: null,
    lessonLoading: false,
    guide: null,
    guideEstimated: false,
    retestLoading: false,
    questions: [],
    currentQuestion: 0,
    answered: [],
    result: null,
    resultLoading: false,
    attempts: 0,
    busy: false,
    error: null,
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

// Order-insensitive concept-set comparison, used to decide how honest the copy
// on a cached lesson can be ("covers the same gaps" vs "gaps have changed").
function sameConceptSet(a: string[], b: string[]): boolean {
  return (
    a.length === b.length && [...a].every((concept) => b.includes(concept))
  );
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
      return { ...state, error: action.message };
    case "NOTICE":
      return { ...state, notice: action.message };
    case "RECALL":
      return {
        ...state,
        phase: "gaps",
        gaps: action.gaps,
        lessonText: null,
        questions: [],
        answered: [],
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
        result: {
          before: Math.round(action.gaps.score),
          after: null,
          delta: null,
        },
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
    case "QUESTIONS":
      return {
        ...state,
        phase: "retest",
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
        allCovered: false,
        lessonText: null,
        questions: [],
        currentQuestion: 0,
        answered: [],
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
  submitRecall: (text: string) => Promise<void>;
  fetchLesson: () => Promise<void>;
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

  const run = useCallback(
    async (op: () => Promise<void>, onReplay?: () => Promise<void>) => {
      replayRef.current = onReplay ?? op;
      dispatch({ type: "BUSY", busy: true });
      dispatch({ type: "ERROR", message: null });
      try {
        await op();
      } catch (err) {
        dispatch({ type: "ERROR", message: apiError(err) });
      } finally {
        dispatch({ type: "BUSY", busy: false });
      }
    },
    [],
  );

  // loadSession (below, after fetchResult) opens the session, caches the
  // chapter list + current checklist, and restores where the loop left off.
  // The mount + reconnect effects that drive it live with it.

  // Keep the voice agent grounded in WHAT the student is studying (topic
  // only — never the lesson content or score breakdown, that's the Gemini
  // grader's job) and WHERE in the loop they are right now, so its replies
  // stay specific to the subject and never re-ask which chapter is open.
  useEffect(() => {
    const ch = state.chapter;
    if (!ch) {
      setStudyContext(null);
      return;
    }
    const step: Record<Phase, string> = {
      recall:
        "listen as the student speaks what they remember about the chapter",
      gaps: "look at the gap analysis the student is seeing on screen",
      lesson: "read back the short lesson that fixes the student's gaps",
      retest: state.questions.length
        ? `wait for the student to answer retest question ${Math.min(
            state.currentQuestion + 1,
            state.questions.length,
          )} of ${state.questions.length}`
        : "prepare the retest questions",
      result: "review the student's before/after score",
    };
    setStudyContext({
      overview: `A ${ch.subject} student is reviewing "${ch.title}" from the textbook "${ch.textbookTitle}".`,
      chapterTitle: ch.title,
      subject: ch.subject,
      phase: state.phase,
      step:
        state.phase === "gaps"
          ? "show the student the gap analysis on screen; do not summarize details"
          : state.phase === "result"
            ? "wait while the student reviews the result on screen"
            : step[state.phase],
      attempts: state.attempts,
      boundary:
        "You know the topic, but you do NOT have the lesson text, the concept list, or the score breakdown — never invent specifics you were not given. Stay quiet while the student speaks and only answer at the prompt.",
      studentHint:
        state.phase === "recall"
          ? "Listening for the student's recall. Stay quiet while they speak; when they finish, run the gap analysis."
          : state.phase === "lesson"
            ? "The student is reading the short lesson. Offer follow-ups on the missing ideas."
            : state.phase === "retest"
              ? `Question ${Math.min(
                  state.currentQuestion + 1,
                  state.questions.length,
                )} of ${state.questions.length} is on screen. Wait for the student's answer, don't read the question back.`
              : "Wait while the student reviews the screen.",
    });
  }, [
    state.chapter,
    state.phase,
    state.attempts,
    state.currentQuestion,
    state.questions.length,
  ]);

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

  const fetchLesson = useCallback(() => {
    const gaps = stateRef.current.gaps;
    const chapterId = stateRef.current.chapter?.id;
    if (!gaps) return Promise.resolve();

    // The guide is the ordered sections; the microlesson is the single
    // read-aloud script built from them. Two requests, not one: the sections
    // are what the student reads and they come from the shared cache, while the
    // read-aloud is still per-session because it stitches this student's
    // concepts into one continuous script.
    const fetchGuide = chapterId
      ? api<Guide>(
          `/chapters/${chapterId}/guide?language=${lang}&${masteryQuery(gaps)}`,
        )
      : Promise.resolve<Guide | null>(null);

    return run(
      () =>
        Promise.all([
          api<{ text: string }>(`/sessions/${sessionId}/microlesson`, {
            method: "POST",
            body: JSON.stringify({
              missing: gaps.missing,
              misconceptions: gaps.misconceptions,
              language: lang,
            }),
          }),
          fetchGuide,
        ])
          .then(([lesson, guide]) => {
            // Bet 3: keep the freshly generated lesson on the phone so it
            // can be re-read (honestly flagged) if the connection drops
            // later in the loop.
            void cacheLesson(
              sessionId,
              lesson.text,
              gaps.missing,
              gaps.misconceptions,
              lang,
            );
            dispatch({ type: "LESSON", text: lesson.text });
            if (guide) {
              dispatch({
                type: "GUIDE",
                guide: guide.sections,
                estimated: guide.estimated,
              });
            }
          })
          .catch(async (err: unknown) => {
            // Offline: fall back to the lesson saved on this phone — it
            // covers the same gaps unless the grading changed since. A
            // cached lesson is content, not a score, so this needs no
            // reconnect reload.
            if (err instanceof ApiError && err.status === 0) {
              const cached = await getCachedLesson(sessionId);
              if (!cached?.text) throw err;
              dispatch({ type: "LESSON", text: cached.text });
              const language = cached.language ?? "en";
              const sameGaps =
                sameConceptSet(cached.missing, gaps.missing) &&
                sameConceptSet(cached.misconceptions, gaps.misconceptions);
              const message =
                language !== lang
                  ? t("lesson-cached-lang", {
                      lang: languageLabel(language, t),
                    })
                  : sameGaps
                    ? t("lesson-cached-same")
                    : t("lesson-cached-changed");
              dispatch({ type: "NOTICE", message });
              return;
            }
            throw err;
          }),
      undefined,
    );
  }, [run, sessionId, lang, t]);

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
            const normalized = questions.map((q) => ({
              question: q.question,
              focus: q.focus,
            }));
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
    setSession(sessionId);
    (async () => {
      try {
        const session = await api<{
          chapterId: string;
          status: string;
          attempts: SessionAttemptRow[];
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
        setChapter(chapter.id);
        dispatch({ type: "LOAD_OK", chapter });
        // Pre-cache this chapter's checklist for offline study. Non-fatal:
        // the gaps view re-fetches and caches it too.
        void api<ChecklistRow[]>(`/chapters/${chapter.id}/concepts`)
          .then((rows) => void cacheChecklist(chapter.id, rows))
          .catch(() => {});

        const recalls = session.attempts.filter((a) => a.stage === "recall");
        const retests = session.attempts.filter((a) => a.stage === "retest");
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
          dispatch({ type: "ERROR", message: apiError(err) });
        }
      }
    })();
  }, [sessionId, fetchResult, t]);

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
      .catch((err: unknown) =>
        dispatch({ type: "ERROR", message: apiError(err) }),
      )
      .finally(() => dispatch({ type: "BUSY", busy: false }));
  }, []);

  const completeSession = useCallback(async () => {
    try {
      await api(`/sessions/${sessionId}/complete`, { method: "POST" });
    } catch (err) {
      dispatch({ type: "ERROR", message: apiError(err) });
      throw err;
    }
  }, [sessionId]);

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
