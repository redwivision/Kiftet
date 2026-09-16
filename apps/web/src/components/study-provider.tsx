import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import {
	setChapter,
	setSession,
	setStudyContext,
} from "@/components/assistant";
import { api, apiError } from "@/lib/api";

export interface ChapterInfo {
	id: string;
	title: string;
	textbookTitle: string;
	subject: string;
}

export interface Gaps {
	covered: string[];
	missing: string[];
	misconceptions: string[];
	score: number;
}

export interface SessionResult {
	before: number | null;
	after: number | null;
	delta: number | null;
}

export type Phase = "recall" | "gaps" | "lesson" | "retest" | "result";

export interface AnswerRecord {
	question: string;
	answer: string;
	correct: boolean;
	score: number;
}

interface StudyState {
	phase: Phase;
	chapter: ChapterInfo | null;
	chapterLoading: boolean;
	sessionNotFound: boolean;
	gaps: Gaps | null;
	allCovered: boolean;
	lessonText: string | null;
	lessonLoading: boolean;
	retestLoading: boolean;
	questions: string[];
	currentQuestion: number;
	answered: AnswerRecord[];
	result: SessionResult | null;
	resultLoading: boolean;
	attempts: number;
	busy: boolean;
	error: string | null;
	notice: string | null;
}

type StudyAction =
	| { type: "LOAD_START" }
	| { type: "LOAD_OK"; chapter: ChapterInfo }
	| { type: "LOAD_NOT_FOUND" }
	| { type: "BUSY"; busy: boolean }
	| { type: "ERROR"; message: string | null }
	| { type: "NOTICE"; message: string | null }
	| { type: "RECALL"; gaps: Gaps }
	| { type: "RECALL_FULL"; gaps: Gaps }
	| { type: "LESSON"; text: string }
	| { type: "QUESTIONS"; questions: string[] }
	| { type: "ANSWER"; record: AnswerRecord }
	| { type: "RESULT"; result: SessionResult }
	| { type: "RETRY_CYCLE" }
	| { type: "GO_PHASE"; phase: Phase };

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
					before: Math.round(action.gaps.score * 100),
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
					attempts: { stage: string; score: number | null }[];
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
			} catch {
				if (!cancelled) dispatch({ type: "LOAD_NOT_FOUND" });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [sessionId]);

	// Keep the voice agent grounded in the running phase and chapter, so its
	// replies stay inside the study loop instead of answering mid-recall.
	useEffect(() => {
		const ch = state.chapter;
		setStudyContext(
			ch
				? {
						phase: state.phase,
						chapterTitle: ch.title,
						subject: ch.subject,
						attempts: state.attempts,
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
										: "Summarize where the student landed and wait.",
					}
				: null,
		);
	}, [
		state.chapter,
		state.phase,
		state.attempts,
		state.currentQuestion,
		state.questions.length,
	]);

	const submitRecall = useCallback(
		(text: string) =>
			run(
				() =>
					api<{ gaps: Gaps }>(`/sessions/${sessionId}/recall`, {
						method: "POST",
						body: JSON.stringify({ transcriptText: text }),
					}).then(({ gaps }) => {
						if (gaps.missing.length === 0) {
							dispatch({ type: "RECALL_FULL", gaps });
						} else {
							dispatch({ type: "RECALL", gaps });
						}
					}),
				undefined,
			),
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

	const startRetest = useCallback(() => {
		const gaps = stateRef.current.gaps;
		if (!gaps) return Promise.resolve();
		return run(
			() =>
				api<{ questions: { question: string }[] }>(
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
						questions: questions.map((q) => q.question),
					}),
				),
			undefined,
		);
	}, [run, sessionId]);

	const submitAnswer = useCallback(
		(text: string) => {
			const { gaps, questions, currentQuestion } = stateRef.current;
			const question = questions[currentQuestion] ?? "";
			if (!gaps || !question) return Promise.resolve();
			return run(
				() =>
					api<{ score: number }>(`/sessions/${sessionId}/retest/answer`, {
						method: "POST",
						body: JSON.stringify({
							transcriptText: text,
							missing: gaps.missing,
							misconceptions: gaps.misconceptions,
						}),
					}).then(({ score }) =>
						dispatch({
							type: "ANSWER",
							record: { question, answer: text, correct: score >= 50, score },
						}),
					),
				undefined,
			);
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
		} catch {
			// Non-fatal: an unfinished session simply stays open.
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
