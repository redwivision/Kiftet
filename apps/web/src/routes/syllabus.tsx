import { Button } from "@kiftet/ui/components/button";
import { Skeleton } from "@kiftet/ui/components/skeleton";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { setChapter, setSession } from "@/components/assistant";
import { api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getDemoUser } from "@/lib/demo";
import type { Route } from "./+types/syllabus";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Study by syllabus — Kiftet" },
		{
			name: "description",
			content:
				"See your progress unit by unit against the national syllabus — study the chapters that map to each unit.",
		},
	];
}

type SyllabusRow = {
	id: string;
	subject: string;
	grade: number;
	title: string;
	source: string;
};

type UnitChapter = {
	id: string;
	title: string;
	textbookTitle: string;
	coverage: { before: number | null; after: number | null; delta: number | null } | null;
};

type Unit = {
	id: string;
	unitNumber: number;
	title: string;
	description: string | null;
	chapters: UnitChapter[];
	covered: number;
	total: number;
};

type SyllabusDetail = {
	id: string;
	subject: string;
	grade: number;
	title: string;
	source: string;
	units: Unit[];
	unassigned: { id: string; title: string; textbookTitle: string }[];
};

export default function Syllabus() {
	const navigate = useNavigate();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const demo = Boolean(getDemoUser());

	const [catalog, setCatalog] = useState<SyllabusRow[] | null>(null);
	const [detail, setDetail] = useState<SyllabusDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [starting, setStarting] = useState<string | null>(null);
	const [savingUnit, setSavingUnit] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		if (!sessionPending && !session && !getDemoUser()) {
			navigate("/login");
			return;
		}
		if (sessionPending || (!session && !getDemoUser())) return;
		let cancelled = false;
		api<SyllabusRow[]>("/syllabus")
			.then(async (rows) => {
				if (cancelled) return;
				setCatalog(rows);
				if (rows.length === 0) {
					setLoading(false);
					return;
				}
				const first = rows[0];
				const detail = await api<SyllabusDetail>(
					`/syllabus/${encodeURIComponent(first.subject)}/${first.grade}`,
				);
				if (!cancelled) {
					setDetail(detail);
					setLoading(false);
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setError(apiError(err));
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [navigate, session, sessionPending]);

	const current = useMemo(
		() =>
			catalog?.find((r) => r.subject === detail?.subject && r.grade === detail?.grade) ?? null,
		[catalog, detail],
	);

	const selectSyllabus = async (subject: string, grade: number) => {
		setDetail(null);
		setLoading(true);
		setError(null);
		try {
			const detail = await api<SyllabusDetail>(
				`/syllabus/${encodeURIComponent(subject)}/${grade}`,
			);
			setDetail(detail);
		} catch (err) {
			setError(apiError(err));
		} finally {
			setLoading(false);
		}
	};

	const start = async (chapter: { id: string; title: string }) => {
		setStarting(chapter.id);
		setError(null);
		try {
			const { sessionId } = await api<{ sessionId: string }>("/sessions/start", {
				method: "POST",
				body: JSON.stringify({ chapterId: chapter.id }),
			});
			setSession(sessionId);
			setChapter(chapter.id);
			navigate(`/study/${sessionId}`, { replace: true });
		} catch (err) {
			setError(apiError(err));
			setStarting(null);
		}
	};

	const assignUnit = async (chapterId: string, unitId: string | null) => {
		setSavingUnit(chapterId);
		setError(null);
		setNotice(null);
		try {
			await api(`/chapters/${chapterId}/unit`, {
				method: "PATCH",
				body: JSON.stringify({ unitId }),
			});
			setNotice(unitId ? "Chapter moved to that unit." : "Chapter unassigned.");
			if (detail) {
				const fresh = await api<SyllabusDetail>(
					`/syllabus/${encodeURIComponent(detail.subject)}/${detail.grade}`,
				);
				setDetail(fresh);
			}
		} catch (err) {
			setError(apiError(err));
		} finally {
			setSavingUnit(null);
		}
	};

	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
			<header className="mb-8 space-y-4">
				<div className="flex items-start justify-between gap-4">
					<div className="max-w-2xl space-y-2">
						<p className="k-label">Study by syllabus</p>
						<h1 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
							The units, not just the chapters.
						</h1>
						<p className="text-muted-foreground text-sm leading-6">
							Match the chapters you have to the national syllabus, then see
							which units are solid and which still have gaps — one study
							session at a time.
						</p>
					</div>
					<Link
						to="/"
						className="hidden shrink-0 sm:block"
					>
						<Button variant="outline" size="sm">
							← Dashboard
						</Button>
					</Link>
				</div>

				{catalog && catalog.length > 0 && current && (
					<div className="flex flex-wrap items-center gap-2">
						{catalog.map((row) => (
							<button
								key={row.id}
								type="button"
								onClick={() => selectSyllabus(row.subject, row.grade)}
								className={
									row.subject === current.subject && row.grade === current.grade
										? "rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[0.72rem] font-medium text-gold"
										: "rounded-full border border-border/70 px-3 py-1 text-[0.72rem] text-muted-foreground hover:border-gold/40 hover:text-gold"
								}
							>
								{row.title}
							</button>
						))}
					</div>
				)}
			</header>

			{error && (
				<div className="inner-surface mb-8 border border-rust/40 p-4 text-sm">
					<p className="font-medium text-rust">Couldn&apos;t load the syllabus</p>
					<p className="mt-1 text-muted-foreground">{error}</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-3"
						onClick={() => window.location.reload()}
					>
						Retry
					</Button>
				</div>
			)}

			{notice && !error && (
				<p className="inner-surface mb-8 border border-sage/30 p-3 text-sm text-sage">
					{notice}
				</p>
			)}

			{!catalog && !error && (
				<div className="space-y-4">
					{[0, 1].map((i) => (
						<Skeleton
							key={i}
							className="h-40 w-full rounded-3xl bg-muted/60 dark:bg-white/[0.05]"
						/>
					))}
				</div>
			)}

			{catalog && catalog.length === 0 && (
				<div className="surface p-10 text-center text-sm text-muted-foreground">
					No syllabuses are set up yet. The Biology, Grade 12 seed arrives with
					the next server deploy.
				</div>
			)}

			{catalog && catalog.length > 0 && (
				<>
					{detail?.source === "provisional" && (
						<p className="inner-surface mb-6 border border-gold/30 bg-gold/5 p-3 text-xs text-muted-foreground">
							<span className="font-medium text-gold">Provisional units.</span>{" "}
							The unit list here is a stand-in until it&apos;s verified against the
							official EHEEE syllabus — the structure is real, the names aren&apos;t final.
						</p>
					)}

					{loading && (
						<div className="space-y-4">
							{[0, 1, 2].map((i) => (
								<Skeleton
									key={i}
									className="h-40 w-full rounded-3xl bg-muted/60 dark:bg-white/[0.05]"
								/>
							))}
						</div>
					)}

					{!loading && detail && detail.units.length === 0 && (
						<div className="surface p-10 text-center text-sm text-muted-foreground">
							This syllabus has no units on the server yet.
						</div>
					)}

					{!loading &&
						detail &&
						detail.units.map((unit, i) => (
							<section
								key={unit.id}
								className="animate-fade-up mb-6"
								style={{ animationDelay: `${i * 0.05}s` }}
							>
								<UnitCard
								unit={unit}
								units={detail.units}
								starting={starting}
								savingUnit={savingUnit}
								onStart={start}
								onAssign={assignUnit}
							/>
							</section>
						))}

					{!loading && detail && detail.unassigned.length > 0 && (
						<section className="animate-fade-up inner-surface border border-dashed border-border/70 p-5">
							<h2 className="font-display font-semibold text-lg tracking-tight">
								Unassigned chapters
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								These {detail.subject} chapters aren&apos;t matched to a unit yet.
								Pick one below to slot them in.
							</p>
							<ul className="mt-4 space-y-2">
								{detail.unassigned.map((ch) => (
									<li
										key={ch.id}
										className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 p-3"
									>
										<div className="min-w-0">
											<p className="truncate font-medium text-foreground/90 text-sm">
												{ch.title}
											</p>
											<p className="truncate text-[0.72rem] text-muted-foreground">
												{ch.textbookTitle}
											</p>
										</div>
										<UnitSelect
											units={detail.units}
											saving={savingUnit === ch.id}
											onChange={(unitId) => assignUnit(ch.id, unitId)}
										/>
									</li>
								))}
							</ul>
						</section>
					)}
				</>
			)}
		</main>
	);
}

function UnitCard({
	unit,
	units,
	starting,
	savingUnit,
	onStart,
	onAssign,
}: {
	unit: Unit;
	units: Unit[];
	starting: string | null;
	savingUnit: string | null;
	onStart: (chapter: { id: string; title: string }) => void;
	onAssign: (chapterId: string, unitId: string | null) => void;
}) {
	const pct = unit.total > 0 ? Math.round((unit.covered / unit.total) * 100) : 0;

	return (
		<div className="surface overflow-hidden">
			<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-5">
				<div className="space-y-1">
					<p className="k-label">
						Unit {String(unit.unitNumber).padStart(2, "0")}
					</p>
					<h2 className="font-display font-semibold text-xl tracking-tight">
						{unit.title}
					</h2>
					{unit.description && (
						<p className="max-w-lg text-muted-foreground text-sm">
							{unit.description}
						</p>
					)}
				</div>
				<div className="flex items-center gap-3">
					{unit.total > 0 ? (
						<p className="text-right">
							<span
								className={`font-medium text-sm ${
									pct >= 100 ? "text-sage" : pct > 0 ? "text-gold" : "text-muted-foreground"
								}`}
							>
								{unit.covered}/{unit.total} chapters covered
							</span>
							<span className="block text-[0.72rem] text-muted-foreground">
								{pct}% of this unit
							</span>
						</p>
					) : (
						<p className="text-[0.72rem] text-muted-foreground">
							No chapters mapped yet
						</p>
					)}
				</div>
			</div>

			{unit.chapters.length === 0 ? (
				<div className="p-5 text-sm text-muted-foreground">
					Map a chapter to this unit from the unassigned list below, or study it
					once it&apos;s in.
				</div>
			) : (
				<ul className="divide-y divide-border/50">
					{unit.chapters.map((ch) => {
						const covered = ch.coverage?.after != null;
						return (
							<li
								key={ch.id}
								className="flex flex-wrap items-center justify-between gap-3 p-4"
							>
								<div className="min-w-0">
									<p className="truncate font-medium text-foreground/90 text-sm">
										{ch.title}
									</p>
									<p className="truncate text-[0.72rem] text-muted-foreground">
										{ch.textbookTitle}
									</p>
								</div>
								<div className="flex items-center gap-2">
									{covered ? (
										<span className="rounded-full border border-sage/30 bg-sage/10 px-2.5 py-0.5 text-[0.72rem] font-medium text-sage">
											{ch.coverage?.before ?? "—"}% → {ch.coverage?.after}%
										</span>
									) : (
										<span className="px-2.5 py-0.5 text-[0.72rem] text-muted-foreground">
											not studied yet
										</span>
									)}
									<Button
										variant="outline"
										size="sm"
										onClick={() => onStart(ch)}
										disabled={starting === ch.id}
									>
										{starting === ch.id ? "Opening…" : "Study"}
									</Button>
									<UnitSelect
										units={units}
										saving={savingUnit === ch.id}
										currentUnit={unit.id}
										onChange={(unitId) => onAssign(ch.id, unitId)}
									/>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function UnitSelect({
	units,
	currentUnit,
	saving,
	onChange,
}: {
	units: Unit[];
	currentUnit?: string;
	saving: boolean;
	onChange: (unitId: string | null) => void;
}) {
	return (
		<select
			value={saving ? "" : currentUnit ?? ""}
			disabled={saving}
			aria-label="Map this chapter to a unit"
			onChange={(e) => onChange(e.target.value || null)}
			className="rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-[0.72rem] text-foreground outline-none focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 disabled:opacity-50"
		>
			<option value="">No unit</option>
			{units.map((u) => (
				<option key={u.id} value={u.id}>
					Unit {u.unitNumber} — {u.title}
				</option>
			))}
		</select>
	);
}