import { Button } from "@kiftet/ui/components/button";
import { Textarea } from "@kiftet/ui/components/textarea";
import { cn } from "@kiftet/ui/lib/utils";
import { useVoxideVoice, type VoxideStatus } from "@voxide/react";
import { Check, Loader2, MicOff, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { getVoxideClient, hasVoxideKey } from "@/components/assistant";
import { BrandMark } from "@/components/brand-mark";
import { CoverageView } from "@/components/gap-list";
import { StudyProvider, useStudy } from "@/components/study-provider";
import { VoxideRing } from "@/components/voxide-ring";
import type { Route } from "./+types/study.$sessionId";

const ACTIVE: VoxideStatus[] = [
	"connecting",
	"listening",
	"speaking",
	"thinking",
	"executing",
];

const RECALL_CAPTION: Record<string, string> = {
	idle: "Tap the ring, then say everything you remember about this chapter out loud. No notes — rough and honest is perfect. Tap again when you're done.",
	armed: "Wake word armed — tap to start.",
	connecting: "Connecting…",
	listening: "Listening… tap the ring when you're done.",
	thinking: "Thinking…",
	speaking: "Speaking…",
	executing: "Working…",
	error: "Couldn't reach the voice service. Tap to retry, or type below.",
};

const ANSWER_CAPTION: Record<string, string> = {
	idle: "Say your answer out loud in your own words — teaching it back is what proves it. Tap the ring when you're done.",
	armed: "Wake word armed — tap to start.",
	connecting: "Connecting…",
	listening: "Listening… tap the ring when you're done.",
	thinking: "Thinking…",
	speaking: "Speaking…",
	executing: "Working…",
	error: "Couldn't reach the voice service. Tap to retry, or type below.",
};

const STEPS = ["Speak", "Diagnose", "Relearn", "Retest"] as const;

export default function StudyRoute({ params }: Route.ComponentProps) {
	return (
		<StudyProvider sessionId={params.sessionId}>
			<StudyScreen />
		</StudyProvider>
	);
}

function StudyScreen() {
	const navigate = useNavigate();
	const { state, retryAgain, retryLast, completeSession, clearError } =
		useStudy();

	if (state.chapterLoading) {
		return (
			<main className="mx-auto grid w-full max-w-md content-center justify-items-center gap-4 px-6 py-24 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<p className="text-sm">Opening your study session…</p>
			</main>
		);
	}

	if (state.sessionNotFound || !state.chapter) {
		return (
			<main className="mx-auto grid w-full max-w-md content-center gap-4 px-6 py-24 text-center">
				<h1 className="font-display font-semibold text-2xl text-foreground tracking-tight">
					This session isn&apos;t here
				</h1>
				<p className="text-muted-foreground text-sm">
					It may have been created in another browser, or the link has a typo.
				</p>
				<Button variant="outline" onClick={() => navigate("/dashboard")}>
					Back to chapters
				</Button>
			</main>
		);
	}

	const done = async () => {
		await completeSession();
		navigate("/dashboard");
	};

	return (
		<main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
			<div className="surface overflow-hidden">
				<SessionHeader
					subject={state.chapter.subject}
					title={state.chapter.title}
					phase={state.phase}
				/>

				<div className="p-6 sm:p-8">
					{state.notice && (
						<div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-gold/25 bg-gold/[0.07] px-4 py-3 text-sm">
							<p className="text-foreground/90 leading-6">
								<span className="mr-1.5 font-medium text-gold">Notice:</span>
								{state.notice}
							</p>
							<button
								type="button"
								onClick={() => {
									const t = state.notice;
									if (t) void speak(t);
								}}
								aria-label="Read this notice out loud"
								className="mt-0.5 shrink-0 rounded-full border border-gold/30 bg-gold/10 p-1.5 text-gold hover:bg-gold/20"
							>
								<Volume2 className="size-4" aria-hidden="true" />
							</button>
						</div>
					)}

					{state.error && (
						<div className="mb-5 rounded-2xl border border-rust/40 bg-rust/10 px-4 py-3 text-sm">
							<p className="mb-1 font-medium text-rust">Something went wrong</p>
							<p className="text-muted-foreground">{state.error}</p>
							<div className="mt-2 flex gap-2">
								<Button size="sm" onClick={() => void retryLast()}>
									Retry
								</Button>
								<Button size="sm" variant="ghost" onClick={clearError}>
									Dismiss
								</Button>
							</div>
						</div>
					)}

					<div className="animate-fade-in" key={state.phase}>
						{state.phase === "recall" && <RecallPhase />}
						{state.phase === "gaps" && <GapsPhase />}
						{state.phase === "lesson" && <LessonPhase />}
						{state.phase === "retest" && <RetestPhase />}
						{state.phase === "result" && (
							<ResultPhase onDone={done} onTryAgain={retryAgain} />
						)}
					</div>
				</div>
			</div>
		</main>
	);
}

function speak(text: string) {
	const u = new SpeechSynthesisUtterance(text);
	u.lang = "en-US";
	window.speechSynthesis.cancel();
	window.speechSynthesis.speak(u);
}

function SessionHeader({
	subject,
	title,
	phase,
}: {
	subject: string;
	title: string;
	phase: string;
}) {
	const current =
		phase === "result"
			? STEPS.length
			: STEPS.indexOf(labelOf(phase) as (typeof STEPS)[number]) + 1;

	return (
		<header className="border-border/60 border-b px-6 pt-6 pb-5 dark:border-white/10">
			<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
				<div className="flex items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="k-label">{subject}</p>
						<h1 className="font-display font-semibold text-2xl text-foreground tracking-[-0.02em] sm:text-3xl">
							{title}
						</h1>
					</div>
					<div className="hidden h-9 w-9 shrink-0 rounded-full ring-1 ring-gold/40 sm:block">
						<BrandMark size={36} className="rounded-full" />
					</div>
				</div>
				<p className="font-medium text-[0.72rem] text-muted-foreground">
					Step {Math.max(1, current)} of {STEPS.length}
				</p>
			</div>

			<ol className="flex items-center gap-1" aria-label="Study loop">
				{STEPS.map((step, i) => {
					const done =
						i + 1 < current || (phase === "result" && i + 1 === current);
					const active = i + 1 === current && phase !== "result";
					return (
						<li key={step} className="flex flex-1 items-center gap-1">
							<span
								className={cn(
									"flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2 font-medium text-[0.72rem] transition-colors",
									active && "border border-gold/40 bg-gold/10 text-gold",
									done && "text-sage",
									!active && !done && "text-muted-foreground/70",
								)}
							>
								<span
									className={cn(
										"grid size-4 place-items-center rounded-full",
										done ? "bg-sage/15" : active ? "bg-gold/15" : "bg-muted/40",
									)}
								>
									{done ? (
										<Check className="size-2.5" aria-hidden="true" />
									) : (
										<span className="font-display font-semibold text-[0.62rem]">
											{i + 1}
										</span>
									)}
								</span>
								{step}
							</span>
							{i < STEPS.length - 1 && (
								<span
									className="h-px flex-1 bg-border/70 dark:bg-white/10"
									aria-hidden="true"
								/>
							)}
						</li>
					);
				})}
			</ol>
		</header>
	);
}

function labelOf(phase: string): string {
	switch (phase) {
		case "recall":
			return "Speak";
		case "gaps":
			return "Diagnose";
		case "lesson":
			return "Relearn";
		case "retest":
			return "Retest";
		default:
			return "Retest";
	}
}

// ── Voice capture ───────────────────────────────────────────────

function VoiceCapture({
	submit,
	textDefault,
	busy,
	placeholder,
}: {
	submit: (text: string) => Promise<void>;
	textDefault: boolean;
	busy: boolean;
	placeholder?: string;
}) {
	const { state, setNotice, clearNotice } = useStudy();
	const voice = useVoxideVoice(hasVoxideKey() ? getVoxideClient() : null);
	const [showText, setShowText] = useState(textDefault);

	// Voice "dead" conditions that force text mode: no key, init stuck, quota out.
	const [timedOut, setTimedOut] = useState(false);
	const client = hasVoxideKey() ? getVoxideClient() : null;
	useEffect(() => {
		if (!client) return;
		if (client.isInitialized) return;
		const timer = setTimeout(() => {
			if (!client.isInitialized) setTimedOut(true);
		}, 6000);
		const off = client.on("ready", () => setTimedOut(false));
		return () => {
			clearTimeout(timer);
			off();
		};
	}, [client]);

	const voiceDead = !client || timedOut || voice.errorCode === "usage_limit";
	const effectiveText = showText || voiceDead;

	// Capture window state: reset the transcript slice whenever we enter a fresh
	// listening session (new phase, or a new retest question).
	const baseRef = useRef<number | null>(null);
	const wasActiveRef = useRef(false);
	const busyRef = useRef(busy);
	busyRef.current = busy;
	const noticeRef = useRef<string | null>(state.notice);
	noticeRef.current = state.notice;

	const baseKey =
		state.phase === "retest"
			? `retest:${state.currentQuestion}`
			: `phase:${state.phase}`;

	useEffect(() => {
		baseRef.current = voice.messages.length;
		wasActiveRef.current = ACTIVE.includes(voice.status);
		clearNotice();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [baseKey]);

	// Listen → hang up: finalize the capture and send the last thing the student said.
	useEffect(() => {
		if (busyRef.current) return;
		const wasActive = wasActiveRef.current;
		const isActive = ACTIVE.includes(voice.status);
		wasActiveRef.current = isActive;
		if (!wasActive || isActive || baseRef.current === null || busyRef.current)
			return;
		const start = baseRef.current;

		const finalize = () => {
			const spoken = voice.messages
				.slice(start)
				.filter(
					(m) =>
						m.role === "user" && m.partial !== true && Boolean(m.text.trim()),
				);
			const last = spoken[spoken.length - 1];
			if (last?.text.trim()) {
				void submit(last.text.trim());
			} else if (voice.status !== "error") {
				setNotice(
					"I didn't catch that — no rush. Tap the ring and try again whenever you're ready.",
				);
			}
		};

		const spokenNow = voice.messages
			.slice(baseRef.current)
			.filter(
				(m) =>
					m.role === "user" && m.partial !== true && Boolean(m.text.trim()),
			);
		if (spokenNow[spokenNow.length - 1]?.text.trim()) {
			void submit(spokenNow[spokenNow.length - 1].text.trim());
			return;
		}

		const wholePhase = voice.messages
			.slice(baseRef.current)
			.filter(
				(m) =>
					m.role === "user" && m.partial !== true && Boolean(m.text.trim()),
			);
		const phaseFallback = wholePhase[wholePhase.length - 1];
		if (phaseFallback?.text.trim() && voice.status !== "error") {
			void submit(phaseFallback.text.trim());
			return;
		}

		const t = setTimeout(finalize, 1600);
		return () => clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [voice.status]);

	// Grace state: after a long stretch of no speech while listening, reassure the
	// student instead of timing them out. Never emits failure copy on our own.
	useEffect(() => {
		if (voice.status !== "listening" || baseRef.current === null) return;
		let lastCount = voice.messages.length;
		let lastChangedAt = Date.now();
		const timer = setInterval(() => {
			if (voice.messages.length !== lastCount) {
				if (noticeRef.current) clearNotice();
				lastCount = voice.messages.length;
				lastChangedAt = Date.now();
				return;
			}
			if (Date.now() - lastChangedAt >= 7000) {
				setNotice("Still listening — take your time.");
			}
		}, 1000);
		return () => clearInterval(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [voice.status, baseKey]);

	const captured = voice.messages
		.slice(baseRef.current ?? 0)
		.filter(
			(m) => m.role === "user" && m.partial !== true && Boolean(m.text.trim()),
		);
	const lastJustSaid = captured[captured.length - 1]?.text.trim();

	return (
		<div className="space-y-5">
			<div className="flex flex-col items-center gap-3">
				{effectiveText ? (
					<div className="grid size-40 place-items-center rounded-full border-2 border-border border-dashed text-muted-foreground/40 dark:border-white/20">
						<MicOff className="size-10" aria-hidden="true" />
					</div>
				) : (
					<VoxideRing />
				)}

				{!effectiveText && (
					<p
						className="max-w-md text-center font-medium text-foreground/80 text-sm leading-6"
						aria-live="polite"
					>
						{captureCaption(voice.status, state.phase)}
					</p>
				)}

				{voice.errorCode === "usage_limit" && (
					<p className="max-w-md rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-muted-foreground text-xs leading-5">
						The voice service is out of sessions right now — the typed version
						still works.
					</p>
				)}
			</div>

			{/* What you said, read back — rendered exactly once. */}
			{lastJustSaid && (
				<div className="mx-auto max-w-md rounded-2xl border border-sage/25 bg-sage/[0.06] px-4 py-3 text-sm">
					<p className="mb-1 font-medium text-[0.72rem] text-sage">
						What you said
					</p>
					<p className="text-foreground/90 leading-6">{lastJustSaid}</p>
					<button
						type="button"
						onClick={() => speak(lastJustSaid)}
						className="mt-2 inline-flex items-center gap-1.5 font-medium text-sage text-xs underline underline-offset-4 hover:text-sage-soft"
					>
						<Volume2 className="size-3.5" aria-hidden="true" />
						Read it back
					</button>
				</div>
			)}

			{effectiveText && (
				<TextRecorder busy={busy} submit={submit} placeholder={placeholder} />
			)}

			{!voiceDead && (
				<div className="text-center">
					<button
						type="button"
						className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
						onClick={() => setShowText((v) => !v)}
					>
						{showText ? "Try voice instead" : "Prefer typing?"}
					</button>
				</div>
			)}
		</div>
	);
}

function captureCaption(status: VoxideStatus, phase: string): string {
	const table = phase === "retest" ? ANSWER_CAPTION : RECALL_CAPTION;
	return table[status] ?? RECALL_CAPTION.idle;
}

function TextRecorder({
	busy,
	submit,
	placeholder,
	buttonLabel,
}: {
	busy: boolean;
	submit: (text: string) => Promise<void>;
	placeholder?: string;
	buttonLabel?: string;
}) {
	const [text, setText] = useState("");

	const doSubmit = async () => {
		const trimmed = text.trim();
		if (!trimmed || busy) return;
		setText("");
		await submit(trimmed);
	};

	return (
		<div className="mx-auto max-w-md space-y-2">
			<Textarea
				name="recall"
				aria-label="Type how much of the chapter you remember — this is graded exactly like a spoken recall"
				autoComplete="off"
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder={placeholder ?? "Type your answer…"}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void doSubmit();
				}}
				className="border-border/70 bg-background/60 text-foreground placeholder:text-muted-foreground dark:border-white/10 dark:bg-white/[0.05]"
			/>
			<Button
				className="w-full justify-center"
				onClick={() => void doSubmit()}
				disabled={!text.trim() || busy}
			>
				{buttonLabel ?? "Submit"}
			</Button>
		</div>
	);
}

// ── Phases ──────────────────────────────────────────────────────

function PhaseHeading({ title, text }: { title: string; text: string }) {
	return (
		<div className="mb-6 space-y-1.5">
			<h2 className="font-display font-semibold text-foreground text-xl tracking-[-0.01em] sm:text-2xl">
				{title}
			</h2>
			<p className="text-muted-foreground text-sm leading-6">{text}</p>
		</div>
	);
}

function RecallPhase() {
	const { submitRecall } = useStudy();

	return (
		<div className="space-y-6">
			<PhaseHeading
				title="Remember it out loud"
				text="This is the diagnosis. Say everything you know about the chapter in your own words — missing some is the whole point. Nobody covers a chapter cold."
			/>
			<VoiceCapture
				submit={(text) => submitRecall(text)}
				textDefault={!hasVoxideKey()}
				busy={false}
			/>
		</div>
	);
}

function GapsPhase() {
	const { state, fetchLesson, startRetest } = useStudy();
	const gaps = state.gaps;

	if (!gaps) return null;

	return (
		<div className="space-y-6">
			<PhaseHeading
				title="Your starting picture"
				text="The solid ideas stay. The open ones are exactly what the short version will fix."
			/>
			<CoverageView covered={gaps.covered} missing={gaps.missing} />
			<div className="space-y-2 pt-2">
				<Button
					className="w-full justify-center"
					disabled={state.busy}
					onClick={() => void fetchLesson()}
				>
					{state.busy
						? "Preparing the short version…"
						: "Hear the short version"}
				</Button>
				<button
					type="button"
					className="w-full text-center text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
					onClick={() => void startRetest()}
				>
					Skip the lesson, take the test
				</button>
			</div>
		</div>
	);
}

function LessonPhase() {
	const { state, startRetest, viewGaps } = useStudy();

	return (
		<div className="space-y-6">
			<PhaseHeading
				title="The short version"
				text="Just what you missed — nothing more. Read it now, or let Kiftet speak it."
			/>
			<div className="read-panel whitespace-pre-wrap px-5 py-5 text-[0.95rem] leading-7">
				{state.lessonText ?? "Writing it…"}
			</div>

			{state.lessonText && (
				<div className="flex items-center justify-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							const t = state.lessonText;
							if (t) void speak(t);
						}}
					>
						<Volume2 className="size-4" aria-hidden="true" />
						Read it to me
					</Button>
				</div>
			)}

			<div className="space-y-2 pt-1">
				<Button
					className="w-full justify-center"
					disabled={state.busy}
					onClick={() => void startRetest()}
				>
					I&apos;m ready to be tested
				</Button>
				<button
					type="button"
					className="w-full text-center text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
					onClick={viewGaps}
				>
					Back to my gaps
				</button>
			</div>
		</div>
	);
}

function RetestPhase() {
	const { state, submitAnswer, fetchResult } = useStudy();
	const { questions, currentQuestion, answered } = state;
	const done = currentQuestion >= questions.length;

	return (
		<div className="space-y-6">
			<PhaseHeading
				title="A short retest"
				text={
					done
						? "You made it through the set. See whether the short version closed the gaps."
						: "Questions are phrased differently from the lesson, so they test understanding — not your memory of wording."
				}
			/>

			<div className="flex items-center justify-between gap-3">
				<p className="k-label">
					{done
						? "All answered"
						: `Question ${currentQuestion + 1} of ${questions.length}`}
				</p>
				<div className="flex items-center gap-1.5" aria-hidden="true">
					{questions.map((q, i) => {
						const a = answered[i];
						return (
							<span
								key={q}
								className={cn(
									"size-2 rounded-full transition-colors",
									a
										? a.correct
											? "bg-sage"
											: "bg-rust"
										: i === currentQuestion
											? "animate-pulse-soft bg-gold"
											: "bg-border dark:bg-white/20",
								)}
							/>
						);
					})}
				</div>
			</div>

			{!done ? (
				<div className="inner-surface p-5">
					<p className="font-display font-medium text-foreground text-lg leading-7 tracking-[-0.01em] sm:text-xl">
						{questions[currentQuestion] ?? ""}
					</p>
					<div className="mt-5 border-border/60 border-t pt-5 dark:border-white/10">
						<VoiceCapture
							submit={(text) => submitAnswer(text)}
							textDefault={!hasVoxideKey()}
							busy={state.busy}
							placeholder="Type your answer out loud in your own words…"
						/>
					</div>
				</div>
			) : (
				<div className="space-y-3">
					{answered.length > 0 && (
						<ul className="space-y-2">
							{answered.map((a, i) => (
								<li
									key={i}
									className={cn(
										"inner-surface flex items-start gap-3 px-4 py-3",
										a.correct ? "dark:border-sage/25" : "dark:border-rust/30",
									)}
								>
									<span
										aria-hidden="true"
										className={cn(
											"mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
											a.correct
												? "bg-sage/15 text-sage"
												: "bg-rust/15 text-rust",
										)}
									>
										{a.correct ? (
											<Check className="size-3" />
										) : (
											<X className="size-3" />
										)}
									</span>
									<div className="min-w-0">
										<p className="font-medium text-[0.72rem] text-muted-foreground">
											Question {i + 1} · {a.correct ? "right" : "still open"}
										</p>
										<p className="mt-0.5 text-foreground/85 text-sm leading-6">
											{a.question}
										</p>
									</div>
								</li>
							))}
						</ul>
					)}
					<Button
						className="w-full justify-center"
						disabled={state.busy}
						onClick={() => void fetchResult()}
					>
						{state.busy ? "Grading…" : "See your result"}
					</Button>
				</div>
			)}
		</div>
	);
}

function ResultPhase({
	onDone,
	onTryAgain,
}: {
	onDone: () => Promise<void>;
	onTryAgain: () => void;
}) {
	const { state } = useStudy();
	const result = state.result;
	const busy = state.busy;

	if (!result) {
		return (
			<div className="grid min-h-40 place-items-center text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
			</div>
		);
	}

	const improved = (result.delta ?? 0) > 0;

	if (state.allCovered) {
		return (
			<ResultPanel
				tone="sage"
				headline="You covered everything."
				body="Every idea in this chapter came out solid, cold, no notes. That is exactly what this loop is for."
				actions={
					<Button
						className="w-full justify-center"
						disabled={busy}
						onClick={() => void onDone()}
					>
						Done for now
					</Button>
				}
				before={result.before ?? 0}
			/>
		);
	}

	if (improved) {
		return (
			<ResultPanel
				tone="gold"
				headline="Gap closed."
				body="The short version fixed what was missing, and the retest confirmed it with fresh wording — not echo. That's the whole point of Kiftet."
				actions={
					<Button
						className="w-full justify-center"
						disabled={busy}
						onClick={() => void onDone()}
					>
						Done for now
					</Button>
				}
				before={result.before ?? 0}
				after={result.after ?? 0}
				delta={result.delta ?? 0}
			/>
		);
	}

	return (
		<ResultPanel
			tone="rust"
			headline="A gap is still open."
			body="Not everything sticks on the first pass — now you know exactly which ideas, so the next pass is faster than the first."
			actions={
				<div className="space-y-3">
					<Button
						className="w-full justify-center"
						disabled={busy}
						onClick={onTryAgain}
					>
						Try again
					</Button>
					{state.attempts >= 2 && (
						<button
							type="button"
							className="w-full text-center text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
							onClick={() => void onDone()}
						>
							Come back to this later
						</button>
					)}
				</div>
			}
			before={result.before ?? 0}
			after={result.after ?? 0}
			delta={result.delta ?? 0}
		/>
	);
}

function ResultPanel({
	tone,
	headline,
	body,
	metric = [],
	actions,
	before,
	after,
	delta,
}: {
	tone: "sage" | "gold" | "rust";
	headline: string;
	body: string;
	metric?: { label: string; value: string }[];
	actions: React.ReactNode;
	before?: number;
	after?: number;
	delta?: number;
}) {
	const isGold = tone === "gold";

	return (
		<div className="space-y-6">
			<div
				className={cn(
					"relative overflow-hidden rounded-3xl border p-6",
					isGold && "border-gold/40 bg-gold/[0.08] dark:border-gold/30",
					tone === "sage" &&
						"border-sage/30 bg-sage/[0.07] dark:border-sage/25",
					tone === "rust" &&
						"border-rust/35 bg-rust/[0.07] dark:border-rust/30",
				)}
			>
				{isGold && (
					<div
						className="pointer-events-none absolute inset-0"
						style={{
							background:
								"radial-gradient(480px 240px at 85% -20%, rgba(232,163,61,0.18), transparent 60%)",
						}}
					/>
				)}
				<p
					className={cn(
						"inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium text-[0.72rem]",
						isGold && "bg-gold/15 text-gold",
						tone === "sage" && "bg-sage/15 text-sage",
						tone === "rust" && "bg-rust/15 text-rust",
					)}
				>
					{isGold ? (
						<BrandMark size={14} className="rounded-full" />
					) : tone === "sage" ? (
						<Check className="size-3.5" />
					) : (
						<X className="size-3.5" />
					)}
					{isGold
						? "gap closed"
						: tone === "sage"
							? after !== undefined
								? "gap covered"
								: "all solid"
							: "another pass"}
				</p>
				<h2
					className={cn(
						"mt-4 font-display font-semibold text-3xl tracking-[-0.02em]",
						isGold && "text-gold",
						tone === "sage" && "text-sage",
						tone === "rust" && "text-rust",
					)}
				>
					{headline}
				</h2>
				<p className="mt-2 max-w-md text-foreground/80 text-sm leading-6">
					{body}
				</p>
			</div>

			{(after !== undefined || metric.length > 0) && (
				<BeforeAfter
					before={before ?? 0}
					after={after}
					delta={delta}
					tone={tone}
					metric={metric}
				/>
			)}

			<div className="pt-1">{actions}</div>
		</div>
	);
}

function BeforeAfter({
	before,
	after,
	delta,
	tone,
	metric,
}: {
	before: number;
	after?: number;
	delta?: number;
	tone: "sage" | "gold" | "rust";
	metric: { label: string; value: string }[];
}) {
	const hasAfter = after !== undefined;
	const afterBar =
		tone === "gold" ? "bg-gold" : tone === "sage" ? "bg-sage" : "bg-rust";

	return (
		<div className="inner-surface p-5">
			<div className="mb-4 flex items-center justify-between">
				<p className="k-label">
					{hasAfter ? "Coverage, before and after" : "Coverage this session"}
				</p>
				{hasAfter && delta !== undefined && (
					<span
						className={cn(
							"font-display font-semibold text-lg tracking-tight",
							tone === "gold"
								? "text-gold"
								: tone === "sage"
									? "text-sage"
									: "text-muted-foreground",
						)}
					>
						{delta > 0 ? `+${delta} pts` : `${delta} pts`}
					</span>
				)}
			</div>

			<div className="space-y-3">
				{metric.length > 0 ? (
					metric.map((m) => (
						<div
							key={m.label}
							className="flex items-baseline justify-between gap-4 text-sm"
						>
							<span className="text-muted-foreground">{m.label}</span>
							<span className="font-display font-semibold text-foreground text-xl tracking-tight">
								{m.value}
							</span>
						</div>
					))
				) : (
					<>
						<ScoreBar label="Before" value={before} />
						{hasAfter && (
							<ScoreBar
								label="After"
								value={after ?? 0}
								active
								barColor={afterBar}
							/>
						)}
					</>
				)}
			</div>

			{hasAfter && (
				<div
					className="mt-4 h-px w-full origin-left animate-beam bg-gradient-to-r from-gold/60 to-transparent"
					aria-hidden="true"
				/>
			)}
		</div>
	);
}

function ScoreBar({
	label,
	value,
	active,
	barColor = "bg-sage",
}: {
	label: string;
	value: number;
	active?: boolean;
	barColor?: string;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between text-sm">
				<span
					className={cn(
						"font-medium text-[0.72rem]",
						active ? "text-foreground/90" : "text-muted-foreground",
					)}
				>
					{label}
				</span>
				<span className="font-display font-semibold text-foreground text-lg tracking-tight">
					{value}%
				</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-muted/60 dark:bg-white/10">
				<div
					className={cn(
						"h-full rounded-full transition-all duration-700",
						active ? barColor : "bg-muted-foreground/40",
					)}
					style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
				/>
			</div>
		</div>
	);
}
