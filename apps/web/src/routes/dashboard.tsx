import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { Skeleton } from "@kiftet/ui/components/skeleton";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { setChapter, setSession } from "@/components/assistant";
import { ConceptGraph } from "@/components/concept-graph";
import { useLanguage } from "@/components/language-provider";
import type { ChapterInfo } from "@/components/study-provider";
import { ApiError, api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getDemoUser } from "@/lib/demo";
import {
	type CachedChapter,
	cacheChapters,
	getCachedChapters,
} from "@/lib/store";
import type { Route } from "./+types/dashboard";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Dashboard — Kiftet" },
		{
			name: "description",
			content:
				"Pick a chapter and keep closing the gap — every session's score is saved and waiting.",
		},
	];
}

type SessionHistory = {
	id: string;
	chapterId: string;
	status: "in_progress" | "completed";
	before: number | null;
	after: number | null;
	delta: number | null;
	durationMs: number | null;
};

type AiBudget = {
	demo: boolean;
	limitPerMinute: number;
	callsThisMinute: number;
	remaining: number;
	textbooksPerDay: number;
};

type MisconceptionRow = {
	conceptText: string;
	count: number;
	unitNumber: number | null;
	unitTitle: string | null;
};

type MisconceptionMap = {
	threshold: number;
	subject: string | null;
	rows: MisconceptionRow[];
};

export default function Dashboard() {
	const navigate = useNavigate();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const { t } = useLanguage();
	const [chapters, setChapters] = useState<ChapterInfo[] | null>(null);
	// Bet 3: the chapter list came from the phone's cache, not the server — flag
	// it so the room never pretends a saved list is live data.
	const [offlineList, setOfflineList] = useState(false);
	const [history, setHistory] = useState<SessionHistory[]>([]);
	const [starting, setStarting] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [budget, setBudget] = useState<AiBudget | null>(null);
	const [misconceptions, setMisconceptions] = useState<MisconceptionMap | null>(
		null,
	);

	const demo = Boolean(getDemoUser());

	useEffect(() => {
		if (!demo) return;
		const poll = () =>
			api<AiBudget>("/ai/budget")
				.then(setBudget)
				.catch(() => {});
		poll();
		const id = setInterval(poll, 15_000);
		return () => clearInterval(id);
	}, [demo]);

	useEffect(() => {
		if (!sessionPending && !session && !getDemoUser()) {
			navigate("/login");
			return;
		}
		if (sessionPending || (!session && !getDemoUser())) return;
		let cancelled = false;
		// Bet 2: the national misconception map. Show the wrong turns that
		// cleared the k-anonymity floor for the subject the student reads most
		// — the panel only renders when other students have actually hit them.
		api<ChapterInfo[]>("/chapters")
			.then(async (rows) => {
				if (cancelled) return;
				setChapters(rows);
				setOfflineList(false);
				// Bet 3: keep the last known chapter list on the phone so the study
				// room still renders (honestly flagged) without a connection.
				void cacheChapters(
					rows.map(({ id, title, subject, textbookTitle, unitId }) => ({
						id,
						title,
						subject,
						textbookTitle,
						unitId,
						cachedAt: Date.now(),
					})),
				);
				if (rows.length === 0) return;
				const subjects = new Map<string, number>();
				for (const row of rows) {
					subjects.set(row.subject, (subjects.get(row.subject) ?? 0) + 1);
				}
				const subject = [...subjects.entries()].sort(
					(a, b) => b[1] - a[1],
				)[0]?.[0];
				if (!subject) return;
				const map = await api<MisconceptionMap>(
					`/misconceptions?subject=${encodeURIComponent(subject)}`,
				);
				if (!cancelled && map.rows.length > 0) setMisconceptions(map);
			})
			.catch(async (err) => {
				if (!cancelled && err instanceof ApiError && err.status === 0) {
					const cached: CachedChapter[] | null = await getCachedChapters();
					if (!cancelled && cached?.length) {
						setChapters(
							cached.map(({ id, title, subject, textbookTitle, unitId }) => ({
								id,
								title,
								subject,
								textbookTitle,
								unitId,
							})),
						);
						setOfflineList(true);
						return;
					}
				}
				if (!cancelled) setError(apiError(err));
			});
		// Most recent study sessions (server returns newest first) so each
		// chapter card can show what the last run did.
		api<SessionHistory[]>("/sessions")
			.then((rows) => {
				if (!cancelled) setHistory(rows);
			})
			.catch(() => {
				// Non-fatal: cards just render without a history line.
			});
		return () => {
			cancelled = true;
		};
	}, [navigate, session, sessionPending]);

	const lastFor = (chapterId: string): SessionHistory | undefined =>
		history.find((h) => h.chapterId === chapterId);

	const start = async (chapter: ChapterInfo) => {
		setStarting(chapter.id);
		setError(null);
		try {
			const { sessionId } = await api<{ sessionId: string }>(
				"/sessions/start",
				{
					method: "POST",
					body: JSON.stringify({ chapterId: chapter.id }),
				},
			);
			setSession(sessionId);
			setChapter(chapter.id);
			navigate(`/study/${sessionId}`, { replace: true });
		} catch (err) {
			setError(apiError(err));
			setStarting(null);
		}
	};

	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
			<header className="mb-8 flex items-start justify-between gap-4">
				<div className="max-w-2xl space-y-2">
					<p className="k-label">{t("study-room")}</p>
					<h1 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
						{t("dash-title")}
					</h1>
					<p className="text-muted-foreground text-sm leading-6">
						{t("dash-text")}
					</p>
				</div>
				{chapters && chapters.length > 0 && (
					<div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
						<Link
							to="/syllabus"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							{t("study-by-syllabus")}
						</Link>
						<Link
							to="/textbooks"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							{t("add-textbook")}
						</Link>
					</div>
				)}
			</header>

			{!session && getDemoUser() && (
				<div className="surface mb-8 flex animate-border-fade flex-wrap items-center justify-between gap-3 border p-4 text-sm">
					<p className="text-muted-foreground">
						<span className="font-medium text-gold">{t("demo-label")}</span>
						{t("demo-banner")}
					</p>
					<Link
						to="/login"
						className="font-medium text-gold text-xs underline underline-offset-4 hover:text-gold-soft"
					>
						{t("create-free-account")}
					</Link>
				</div>
			)}

			{budget && (
				<div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground text-xs">
					<span>
						{t("ai-calls-minute")}{" "}
						<strong className="font-medium text-foreground">
							{t("of-left", {
								remaining: budget.remaining,
								limitPerMinute: budget.limitPerMinute,
							})}
						</strong>
						{budget.remaining === 0
							? t("budget-out")
							: budget.remaining <= 2
								? t("budget-careful")
								: ""}
					</span>
					<span>
						{t("new-textbooks-today")}{" "}
						<strong className="font-medium text-foreground">
							{t("textbooks-max", { n: budget.textbooksPerDay })}
						</strong>
					</span>
				</div>
			)}

			{misconceptions && (
				<div className="inner-surface mb-8 border p-5">
					<div className="flex items-start justify-between gap-3">
						<div className="space-y-1">
							<p className="k-label">{t("misconception-map")}</p>
							<h2 className="font-display font-semibold text-lg tracking-tight">
								{t("misconception-title", {
									subject: misconceptions.subject ?? "",
								})}
							</h2>
							<p className="text-muted-foreground text-sm">
								{t("misconception-text", {
									threshold: misconceptions.threshold,
								})}
							</p>
						</div>
					</div>
					<ul className="mt-4 flex flex-wrap gap-2">
						{misconceptions.rows.map((row) => (
							<li
								key={row.conceptText}
								className="rounded-full border border-rust/30 bg-rust/10 px-3 py-1.5 text-sm"
							>
								<span className="text-rust">{row.count}×</span>{" "}
								<span className="text-foreground/90">{row.conceptText}</span>
								{row.unitTitle && (
									<span className="ml-1 text-[0.72rem] text-muted-foreground">
										{t("unit-of", { n: row.unitNumber ?? "-" })}
									</span>
								)}
							</li>
						))}
					</ul>
				</div>
			)}

			{error && (
				<div className="inner-surface mb-8 border border-rust/40 p-4 text-sm">
					<p className="font-medium text-rust">{t("room-unreachable")}</p>
					<p className="mt-1 text-muted-foreground">{error}</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-3"
						onClick={() => window.location.reload()}
					>
						{t("retry")}
					</Button>
				</div>
			)}

			{chapters === null && !error && (
				<div className="grid gap-4 md:grid-cols-2">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton
							key={i}
							className="h-44 w-full rounded-3xl bg-muted/60 dark:bg-white/[0.05]"
						/>
					))}
				</div>
			)}

			{offlineList && (
				<div className="inner-surface mb-6 border border-rust/40 px-4 py-3 text-sm">
					<p className="font-medium text-rust">{t("offline-saved")}</p>
					<p className="mt-0.5 text-muted-foreground leading-6">
						{t("offline-saved-text")}
					</p>
				</div>
			)}

			{chapters && chapters.length === 0 && (
				<div className="surface flex flex-col items-center gap-5 p-10 text-center">
					<ConceptGraph className="h-28 w-auto text-gold" />
					<div className="space-y-1">
						<h2 className="font-display font-semibold text-xl tracking-tight">
							{t("empty-none")}
						</h2>
						<p className="mx-auto max-w-sm text-muted-foreground text-sm leading-6">
							{t("empty-none-text")}
						</p>
					</div>
					<Link to="/textbooks" className={buttonVariants({ size: "sm" })}>
						{t("add-book-device")}
					</Link>
				</div>
			)}

			{chapters && chapters.length > 0 && (
				<ul className="grid gap-4 md:grid-cols-2">
					{chapters.map((chapter, i) => {
						const last = lastFor(chapter.id);
						return (
							<li
								key={chapter.id}
								className="animate-fade-up"
								style={{ animationDelay: `${i * 0.06}s` }}
							>
								<div className="space-y-2">
									<ChapterCard
										chapter={chapter}
										starting={starting === chapter.id}
										onStart={() => start(chapter)}
									/>
									<ChapterHistory last={last} />
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</main>
	);
}

function ChapterCard({
	chapter,
	starting,
	onStart,
}: {
	chapter: ChapterInfo;
	starting: boolean;
	onStart: () => void;
}) {
	const { t } = useLanguage();
	return (
		<button
			type="button"
			onClick={onStart}
			disabled={starting}
			className="group w-full rounded-3xl border border-border/70 bg-card/70 p-6 text-left backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-gold/45 hover:shadow-[0_20px_50px_-24px_rgba(242,239,233,0.18)] focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 dark:border-white/10 dark:bg-[#14151a]/80"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1.5">
					<p className="font-medium text-[0.72rem] text-gold">
						{chapter.subject}
					</p>
					<h2 className="font-display font-semibold text-foreground text-xl tracking-tight sm:text-2xl">
						{chapter.title}
					</h2>
				</div>
				<span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.72rem] text-gold opacity-90 transition-opacity group-hover:opacity-100">
					{starting ? t("opening-ellipsis") : t("start-review")}
				</span>
			</div>

			<p className="mt-3 text-muted-foreground text-sm">
				{chapter.textbookTitle}
			</p>

			<p className="mt-5 font-medium text-foreground/90 text-xs">
				{t("card-promise")}
			</p>
		</button>
	);
}

function ChapterHistory({ last }: { last?: SessionHistory }) {
	const { t } = useLanguage();
	if (!last) return null;
	const minutes =
		typeof last.durationMs === "number"
			? Math.round(last.durationMs / 60000)
			: null;
	const duration =
		minutes == null
			? ""
			: minutes < 1
				? t("under-a-minute")
				: minutes === 1
					? t("minute", { n: minutes })
					: t("minutes", { n: minutes });

	if (last.status === "in_progress") {
		return (
			<div className="flex items-center justify-between px-1 text-[0.72rem] text-muted-foreground">
				<span>{t("session-open")}</span>
				<Link
					to={`/study/${last.id}`}
					className="font-medium text-gold underline underline-offset-4 hover:text-gold-soft"
				>
					{t("resume")}
				</Link>
			</div>
		);
	}

	const deltaText =
		last.before != null && last.after != null && last.delta != null
			? `${last.before}% → ${last.after}%${
					last.delta > 0
						? ` · +${last.delta}%`
						: last.delta < 0
							? ` · ${last.delta}%`
							: ""
				}`
			: t("completed");

	return (
		<p className="px-1 text-[0.72rem] text-muted-foreground">
			{t("last-session", { delta: deltaText })}
			{duration ? ` · ${duration}` : ""}
		</p>
	);
}
