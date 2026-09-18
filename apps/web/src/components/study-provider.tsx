import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useReducer,
	useRef,
} from "react";

import { setChapter, setSession, setStudyContext } from "@/components/assistant";
import { api, apiError, ApiError } from "@/lib/api";

export type Phase = "recall" | "gaps" | "lesson" | "retest" | "result";

export type ChapterInfo = {
	id: string;
	title: string;
	subject: string;
	textbookTitle: string;
};

export type Gaps = {
	covered: string[];
	missing: string[];
	misconceptions: string[];
	score: number;
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
	| { type: "QUESTIONS"; questions: SessionQuestion[] }
	| {
			type: "RESTORE_RETEST";
			questions: SessionQuestion[];
			answered: AnswerRecord[];
	  }
	| { type: "ANSWER"; record: AnswerRecord }
	| { type: "RESULT"; result: SessionResult }
	| { type: "RETRY_CYCLE" }
	| { type: "GO_PHASE"; phase: Phase };

type SessionAttemptRow = {
	id: string;
	stage: "recall" | "retest";
	score: number | null;
	gapsIdentified: unknown;
	transcriptText: string | null;
};

function initialState(sessionId: string): StudyState {
	return {
		phase: "recall",
		chapter: null,
		chapterLoading: true,
		sessionNotFound: false,
		gaps: null,
		allCovered: false,
		lessonText: null,
		lessonLoading: false,
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
	};
}

// gapsIdentified was originally stored as a bare array of missing concepts;
// newer rows store {covered, missing, misconceptions}. Tolerate both so a
// refresh mid-loop on an older session still restores correctly.
function attemptGaps(raw: unknown): Gaps {
	const stringList = (value: unknown): string[] =>
		Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
	if (raw && typeof raw === "object" && !Array.isArray(raw)) {
		const o = raw as Record<string, unknown>;
		return {
			covered: stringList(o.covered),
			missing: stringList(o.missing),
			misconceptions: stringList(o.misconceptions),
			score: 0,
		};
	}
	return { covered: [], missing: stringList(raw), misconceptions: [], score: 0 };
}

function reducer(state: StudyState, action: StudyAction): StudyState {
	switch (action.type) {
		case "LOAD_START":
			return { ...state, chapterLoading: true, sessionNotFound: false };
		case "LOAD_OK":
			return { ...state, chapterLoading: false, chapter: action.chapter };
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
			};
		case "LESSON":
			return {
				...state,
				phase: "lesson",
				lessonText: action.text,
				error: null,
				notice: null,
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
			};
		case "RESTORE_RETEST":
			return {
				...state,
				phase: "retest",
				questions: action.questions,
				currentQuestion: action.answered.length,
				answered: action.answered,
				error: null,
				notice: "Your retest progress was restored.",
			};
		case "ANSWER":
			return {
				...state,
				answered: [...state.answered, action.record],
				currentQuestion: state.currentQuestion + 1,
				error: null,
				notice: null,
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
			};
		case "GO_PHASE":
			return { ...state, phase: action.phase, error: null, notice: null };
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

	useEffect(() => {
		let cancelled = false;
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
				if (cancelled) return;
				const chapter =
					chapters.find((c) => c.id === session.chapterId) ?? null;
				if (!chapter) {
					dispatch({ type: "LOAD_NOT_FOUND" });
					return;
				}
				setChapter(chapter.id);
				dispatch({ type: "LOAD_OK", chapter });

				// Restore where the loop left off from the attempt history instead
				// of silently restarting at "Speak" (a refresh mid-loop used to
				// dump the student back into a second cold recall).
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
									"Previously answered retest question",
								answer: attempt.transcriptText ?? "",
								correct: (attempt.score ?? 0) >= 50,
								score: attempt.score ?? 0,
								gaps,
							};
						});
					dispatch({
						type: "RESTORE_RETEST",
						questions: session.retestQuestions,
						answered: restored,
					});
				} else if (retests.length && session.status === "completed") {
					if (!cancelled) void fetchResult();
				} else if (recalls.length) {
					const last = recalls[recalls.length - 1];
					const stored = attemptGaps(last.gapsIdentified);
					const gaps: Gaps = {
						covered: stored.covered,
						missing: stored.missing,
						misconceptions: stored.misconceptions,
						score: last.score ?? 0,
					};
					if (cancelled) return;
					if (gaps.missing.length) {
						dispatch({ type: "RECALL", gaps });
					} else {
						dispatch({ type: "RECALL_FULL", gaps });
					}
				}
			} catch (err) {
				if (cancelled) return;
				if (err instanceof ApiError && err.status === 404) {
					dispatch({ type: "LOAD_NOT_FOUND" });
				} else {
					dispatch({ type: "ERROR", message: apiError(err) });
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [sessionId]);

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
			recall: "listen as the student speaks what they remember about the chapter",
			gaps: "look at the gap analysis the student is seeing on screen",
			lesson: "read back the short lesson that fixes the student's gaps",
			retest: state.questions.length
				? `wait for the student to answer retest question ${
						Math.min(state.currentQuestion + 1, state.questions.length)
					} of ${state.questions.length}`
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
					}).then(({ gaps }) => {
						if (gaps.missing.length === 0) {
							dispatch({ type: "RECALL_FULL", gaps });
						} else {
							dispatch({ type: "RECALL", gaps });
						}
					}),
				undefined,
			).finally(() => {
				submittingRef.current = false;
			});
		},
		[run, sessionId],
	);

	const fetchLesson = useCallback(() => {
		const gaps = stateRef.current.gaps;
		if (!gaps) return Promise.resolve();
		return run(
			() =>
				api<{ text: string }>(`/sessions/${sessionId}/microlesson`, {
					method: "POST",
					body: JSON.stringify({
						missing: gaps.missing,
						misconceptions: gaps.misconceptions,
					}),
				}).then((lesson) => dispatch({ type: "LESSON", text: lesson.text })),
			undefined,
		);
	}, [run, sessionId]);

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
				api<{ questions: SessionQuestion[] }>(
					`/sessions/${sessionId}/retest`,
					{
						method: "POST",
						body: JSON.stringify({
							missing: gaps.missing,
							misconceptions: gaps.misconceptions,
						}),
					},
				).then(({ questions }) =>
					dispatch({
						type: "QUESTIONS",
						questions: questions.map((q) => ({
							question: q.question,
							focus: q.focus,
						})),
					}),
				),
			undefined,
		);
	}, [run, sessionId]);

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
					).then(({ score, gaps: answerGaps }) =>
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
					),
				undefined,
			).finally(() => {
				submittingRef.current = false;
			});
		},
		[run, sessionId],
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