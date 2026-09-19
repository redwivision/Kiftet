import { Button } from "@kiftet/ui/components/button";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { Skeleton } from "@kiftet/ui/components/skeleton";
import { Textarea } from "@kiftet/ui/components/textarea";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { setChapter, setSession } from "@/components/assistant";
import { api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getDemoUser } from "@/lib/demo";
import { type ImportChunk, MAX_FILE_MB, fileSizeError, planChunks } from "@/lib/textbook";
import type { Route } from "./+types/textbooks";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Your textbooks — Kiftet" },
		{
			name: "description",
			content:
				"Bring your own textbook. It's read on your device — the file never uploads — and each TOC chunk becomes a study loop.",
		},
	];
}

type LibraryChapter = { id: string; title: string; createdAt: string };
type LibraryTextbook = {
	id: string;
	title: string;
	subject: string;
	language: string;
	createdAt: string;
	chapters: LibraryChapter[];
};

type SourceMode = "pdf" | "text";

type Stage = {
	key: number;
	title: string;
	state: "skip" | "queued" | "ingesting" | "done" | "error";
};

type ImportStep = "form" | "planning" | "review" | "importing";

// UI-only push: the import flow is fully visible (device-side splitting
// preview included) but the actual ingest + AI extraction stays off until the
// scale/limits story is settled. Flip to true when we open the doors.
const TEXTBOOK_IMPORT_ENABLED = false;

export default function Textbooks() {
	const navigate = useNavigate();
	const { data: auth, isPending: sessionPending } = authClient.useSession();
	const [textbooks, setTextbooks] = useState<LibraryTextbook[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [bookTitle, setBookTitle] = useState("");
	const [subject, setSubject] = useState("");
	const [language, setLanguage] = useState("en");
	const [mode, setMode] = useState<SourceMode>("pdf");
	const [pdfFile, setPdfFile] = useState<File | null>(null);
	const [pastedText, setPastedText] = useState("");

	const [step, setStep] = useState<ImportStep>("form");
	const [planned, setPlanned] = useState<ImportChunk[] | null>(null);
	const [stages, setStages] = useState<Stage[]>([]);
	const [error, setError] = useState<string | null>(null);

	const fetchLibrary = useCallback(() => {
		api<LibraryTextbook[]>("/textbooks")
			.then(setTextbooks)
			.catch((err) => setLoadError(apiError(err)));
	}, []);

	useEffect(() => {
		if (!sessionPending && !auth && !getDemoUser()) {
			navigate("/login");
			return;
		}
		if (sessionPending || (!auth && !getDemoUser())) return;
		fetchLibrary();
	}, [auth, sessionPending, navigate, fetchLibrary]);

	// Chunks that already exist under a textbook with this exact title are
	// skipped on import — that's what makes re-entering the flow a resume.
	const existingChapters = useMemo(() => {
		const book = textbooks?.find((t) => t.title === bookTitle.trim());
		return new Set((book?.chapters ?? []).map((c) => c.title));
	}, [textbooks, bookTitle]);

	const canPlan =
		(mode === "pdf" && pdfFile !== null) ||
		(mode === "text" && pastedText.trim().length > 0);

	const plan = async () => {
		setStep("planning");
		setError(null);
		try {
			const chunks =
				mode === "pdf" && pdfFile
					? await planChunks({
							kind: "pdf",
							name: pdfFile.name,
							file: pdfFile,
						})
					: await planChunks({
							kind: "text",
							name: "pasted",
							text: pastedText,
						});
			if (!chunks.length)
				throw new Error("Nothing to import — the text looks empty.");
			setPlanned(chunks);
			setStages(
				chunks.map((c, i) => ({
					key: i,
					title: c.title,
					state: existingChapters.has(c.title.trim()) ? "skip" : "queued",
				})),
			);
			setStep("review");
		} catch (err) {
			setError(apiError(err));
			setStep("form");
		}
	};

	const importChapter = async (
		chapter: { title: string; rawText: string },
		key: number,
	): Promise<void> => {
		setStages((prev) =>
			prev.map((s) => (s.key === key ? { ...s, state: "ingesting" } : s)),
		);
		try {
			await api("/chapters/ingest", {
				method: "POST",
				body: JSON.stringify({
					textbookTitle: bookTitle.trim(),
					subject: subject.trim(),
					language,
					title: chapter.title,
					rawText: chapter.rawText,
				}),
			});
			setStages((prev) =>
				prev.map((s) => (s.key === key ? { ...s, state: "done" } : s)),
			);
		} catch (err) {
			setStages((prev) =>
				prev.map((s) => (s.key === key ? { ...s, state: "error" } : s)),
			);
			throw apiError(err);
		}
	};

	const runImport = async () => {
		if (!planned || !TEXTBOOK_IMPORT_ENABLED) return;
		setStep("importing");
		const snapshot = planned.map((c, i) => ({ ...c, key: i }));
		let failed = 0;
		for (const chapter of snapshot) {
			if (existingChapters.has(chapter.title.trim())) {
				setStages((prev) =>
					prev.map((s) =>
						s.key === chapter.key ? { ...s, state: "skip" } : s,
					),
				);
				continue;
			}
			try {
				await importChapter(chapter, chapter.key);
			} catch {
				failed += 1;
			}
		}
		fetchLibrary();
		if (failed === 0) {
			toast.success(`"${bookTitle.trim()}" is on the shelf.`);
			resetForm();
		} else {
			toast.error(
				`${failed} chunk${failed > 1 ? "s" : ""} didn't land. Retry to finish.`,
			);
		}
	};

	const retryOne = async (key: number) => {
		if (!planned || !TEXTBOOK_IMPORT_ENABLED) return;
		const chapter = planned[key];
		if (!chapter) return;
		setStep("importing");
		try {
			await importChapter(chapter, key);
			fetchLibrary();
			setStep("review");
		} catch {
			setStep("review");
		}
	};

	const resetForm = () => {
		setBookTitle("");
		setSubject("");
		setLanguage("en");
		setMode("pdf");
		setPdfFile(null);
		setPastedText("");
		setPlanned(null);
		setStages([]);
		setError(null);
		setStep("form");
	};

	const startChapter = async (chapterId: string) => {
		try {
			const { sessionId } = await api<{ sessionId: string }>(
				"/sessions/start",
				{
					method: "POST",
					body: JSON.stringify({ chapterId }),
				},
			);
			setSession(sessionId);
			setChapter(chapterId);
			navigate(`/study/${sessionId}`, { replace: true });
		} catch (err) {
			toast.error(apiError(err));
		}
	};

	const progress = !stages.length
		? 0
		: stages.reduce(
				(acc, s) => acc + (s.state === "done" || s.state === "skip" ? 1 : 0),
				0,
			);
	const total = planned?.length ?? 0;

	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
			<header className="mb-8 max-w-2xl space-y-2">
				<p className="k-label">Your textbooks</p>
				<h1 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
					Bring your own book.
				</h1>
				<p className="text-muted-foreground text-sm leading-6">
					Upload a PDF (up to {MAX_FILE_MB} MB) or paste text. It&apos;s read on
					your device — the file never leaves your phone — and the book&apos;s own
					table of contents is split into chunks, each becoming its own study
					loop.
				</p>
			</header>

			{loadError && !textbooks && (
				<div className="inner-surface mb-8 border border-rust/40 p-4 text-sm">
					<p className="font-medium text-rust">
						Couldn&apos;t reach the study room
					</p>
					<p className="mt-1 text-muted-foreground">{loadError}</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-3"
						onClick={fetchLibrary}
					>
						Retry
					</Button>
				</div>
			)}

			{textbooks === null && !loadError && (
				<div className="grid gap-4 md:grid-cols-2">
					{[0, 1].map((i) => (
						<Skeleton
							key={i}
							className="h-40 w-full rounded-3xl bg-muted/60 dark:bg-white/[0.05]"
						/>
					))}
				</div>
			)}

			{textbooks && textbooks.length > 0 && (
				<section className="mb-10 space-y-4">
					{textbooks.map((book) => (
						<div key={book.id} className="surface p-5 sm:p-6">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="font-medium text-[0.72rem] text-gold">
										{book.subject}
									</p>
									<h2 className="font-display font-semibold text-xl tracking-tight">
										{book.title}
									</h2>
								</div>
								<span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.72rem] text-gold opacity-90">
									{book.chapters.length}{" "}
									{book.chapters.length === 1 ? "chunk" : "chunks"}
								</span>
							</div>
							{book.chapters.length > 0 ? (
								<ul className="mt-4 divide-y divide-border/60">
									{book.chapters.map((chapter, i) => (
										<li
											key={chapter.id}
											className="flex items-center justify-between gap-3 py-2.5"
										>
											<div className="min-w-0">
												<p className="font-medium text-[0.7rem] text-muted-foreground">
													{String(i + 1).padStart(2, "0")}
												</p>
												<p className="truncate text-sm">{chapter.title}</p>
											</div>
											<Button
												variant="outline"
												size="xs"
												onClick={() => startChapter(chapter.id)}
											>
												Start review
											</Button>
										</li>
									))}
								</ul>
							) : (
								<p className="mt-4 text-muted-foreground text-sm">
									No chunks yet.
								</p>
							)}
						</div>
					))}
				</section>
			)}

			<AddTextbook
				step={step}
				enabled={TEXTBOOK_IMPORT_ENABLED}
				bookTitle={bookTitle}
				setBookTitle={setBookTitle}
				subject={subject}
				setSubject={setSubject}
				language={language}
				setLanguage={setLanguage}
				mode={mode}
				setMode={setMode}
				pdfFile={pdfFile}
				setPdfFile={setPdfFile}
				pastedText={pastedText}
				setPastedText={setPastedText}
				canPlan={canPlan}
				onPlan={plan}
				planned={planned}
				setPlanned={setPlanned}
				stages={stages}
				setStages={setStages}
				error={error}
				setError={setError}
				onImport={runImport}
				onRetryOne={retryOne}
				progress={progress}
				total={total}
				skipped={existingChapters}
				onCancel={resetForm}
			/>
		</main>
	);
}

function AddTextbook({
	step,
	enabled,
	bookTitle,
	setBookTitle,
	subject,
	setSubject,
	language,
	setLanguage,
	mode,
	setMode,
	pdfFile,
	setPdfFile,
	pastedText,
	setPastedText,
	canPlan,
	onPlan,
	planned,
	setPlanned,
	stages,
	setStages,
	error,
	setError,
	onImport,
	onRetryOne,
	progress,
	total,
	skipped,
	onCancel,
}: {
	step: ImportStep;
	enabled: boolean;
	bookTitle: string;
	setBookTitle: (v: string) => void;
	subject: string;
	setSubject: (v: string) => void;
	language: string;
	setLanguage: (v: string) => void;
	mode: SourceMode;
	setMode: (v: SourceMode) => void;
	pdfFile: File | null;
	setPdfFile: (f: File | null) => void;
	pastedText: string;
	setPastedText: (v: string) => void;
	canPlan: boolean;
	onPlan: () => void;
	planned: ImportChunk[] | null;
	setPlanned: (c: ImportChunk[] | null) => void;
	stages: Stage[];
	setStages: (s: Stage[]) => void;
	error: string | null;
	setError: (e: string | null) => void;
	onImport: () => void;
	onRetryOne: (key: number) => void;
	progress: number;
	total: number;
	skipped: Set<string>;
	onCancel: () => void;
}) {
	if (step === "planning") {
		return (
			<section className="surface flex flex-col items-center gap-4 p-10 text-center">
				<div className="size-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
				<p className="text-muted-foreground text-sm">
					Reading your book on this device…
				</p>
			</section>
		);
	}

	if (step === "review" || step === "importing") {
		if (!planned) return null;
		const newChapters = planned.filter(
			(c) => !skipped.has(c.title.trim()),
		).length;
		const importing = step === "importing";
		const failed = stages.filter((s) => s.state === "error").length;

		return (
			<section className="surface p-5 sm:p-6">
				<div className="flex items-center justify-between gap-3">
					<div>
						<p className="k-label">
							{importing ? "Importing into your study room" : "Ready to import"}
						</p>
						<h2 className="font-display font-semibold text-lg tracking-tight">
							{bookTitle.trim()}
						</h2>
					</div>
					{!importing && (
						<Button variant="ghost" size="sm" onClick={onCancel}>
							Cancel
						</Button>
					)}
				</div>

				{importing && total > 0 && (
					<div className="mt-4">
						<div className="mb-2 flex items-center justify-between text-muted-foreground text-xs">
							<span>
								{progress} of {total} chunk{total > 1 ? "s" : ""}
							</span>
							<span>{Math.round((progress / total) * 100)}%</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-gold/15">
							<div
								className="h-full rounded-full bg-gold transition-[width] duration-300"
								style={{ width: `${(progress / total) * 100}%` }}
							/>
						</div>
					</div>
				)}

				<ul className="mt-4 divide-y divide-border/60">
					{planned.map((chapter, i) => {
						const stage = stages[i]?.state ?? "queued";
						const isNew = !skipped.has(chapter.title.trim());
						return (
							<li key={i} className="flex items-center gap-3 py-3">
								<div className="min-w-0 flex-1">
									{importing ? (
										<p className="truncate text-sm">{chapter.title}</p>
									) : (
										<Input
											value={chapter.title}
											onChange={(e) => {
												const next = [...planned];
												next[i] = { ...chapter, title: e.target.value };
												setPlanned(next);
												setStages(
													stages.map((s, si) =>
														si === i
															? {
																	...s,
																	title: e.target.value,
																	state: isNew ? "queued" : "skip",
																}
															: s,
													),
												);
											}}
											className="h-9 text-sm"
											aria-label={`Chunk ${i + 1} title`}
										/>
									)}
								</div>

								{stage === "done" || (!isNew && stage === "skip") ? (
									<span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.7rem] text-gold">
										{importing ? "In" : "Already here"}
									</span>
								) : stage === "skip" ? (
									<span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-[0.7rem] text-muted-foreground">
										Landed
									</span>
								) : stage === "error" ? (
									<div className="flex shrink-0 items-center gap-2">
										<span className="rounded-full border border-rust/40 bg-rust/10 px-2.5 py-1 font-medium text-[0.7rem] text-rust">
											Failed
										</span>
										{!importing && (
											<Button
												variant="outline"
												size="xs"
												onClick={() => onRetryOne(i)}
											>
												Retry
											</Button>
										)}
									</div>
								) : stage === "ingesting" ? (
									<span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.7rem] text-gold">
										Building checklist…
									</span>
								) : (
									<span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-[0.7rem] text-muted-foreground">
										New
									</span>
								)}
							</li>
						);
					})}
				</ul>

				{error && (
					<p className="mt-4 rounded-lg border border-rust/40 bg-rust/10 px-3 py-2 text-rust text-sm">
						{error}
					</p>
				)}

				{!importing && (
					<>
						<p className="mt-4 text-muted-foreground text-xs leading-5">
							Chunks import one at a time, and finished ones are skipped if
							you leave and come back. Weak connection? Small text only — never
							the file.
						</p>
						<div className="mt-4 flex flex-wrap items-center gap-3">
							{enabled ? (
								<Button onClick={onImport} disabled={newChapters === 0}>
									{newChapters === 0
										? "Nothing new to import"
										: failed > 0
											? `Retry ${failed} failed chunk${failed > 1 ? "s" : ""}`
											: `Import ${newChapters} chunk${newChapters > 1 ? "s" : ""}`}
								</Button>
							) : (
								<Button disabled title="Preview mode — import is coming soon.">
									Preview — import coming soon
								</Button>
							)}
							<Button variant="ghost" size="sm" onClick={onCancel}>
								Start over
							</Button>
						</div>
						{!enabled && (
							<p className="mt-3 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-gold text-xs leading-5">
								Preview mode: this split happened on your device and nothing was
								saved or sent to the AI. Turning the import on is the next step.
							</p>
						)}
					</>
				)}
			</section>
		);
	}

	return (
		<section className="surface p-5 sm:p-6">
			{!enabled && (
				<p className="mb-4 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-gold text-xs leading-5">
					<strong className="font-medium">Preview mode.</strong> You can try the
					on-device chapter split below — nothing is saved and nothing is sent.
					Live import is the next step.
				</p>
			)}
			<p className="k-label">Add a textbook</p>
			<h2 className="font-display font-semibold text-lg tracking-tight">
				The next book you study could be yours.
			</h2>

			<div className="mt-5 grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="book-title">Book title</Label>
					<Input
						id="book-title"
						value={bookTitle}
						onChange={(e) => setBookTitle(e.target.value)}
						placeholder="e.g. Grade 9 Physics"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="book-subject">Subject</Label>
					<Input
						id="book-subject"
						value={subject}
						onChange={(e) => setSubject(e.target.value)}
						placeholder="e.g. Physics"
					/>
				</div>
			</div>

			<div className="mt-4 space-y-1.5">
				<Label htmlFor="book-language">Chapter language</Label>
				<select
					id="book-language"
					value={language}
					onChange={(e) => setLanguage(e.target.value)}
					className="h-9 w-full rounded-none border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary"
				>
					<option value="en">English</option>
					<option value="am">Amharic</option>
					<option value="om">Afaan Oromoo</option>
					<option value="other">Other</option>
				</select>
			</div>

			<div className="mt-5">
				<p className="mb-2 font-medium text-muted-foreground text-xs">
					Where is the content?
				</p>
				<div className="flex gap-2">
					{(["pdf", "text"] as const).map((m) => (
						<Button
							key={m}
							variant={mode === m ? "default" : "outline"}
							size="sm"
							onClick={() => setMode(m)}
						>
							{m === "pdf" ? "PDF file" : "Paste text"}
						</Button>
					))}
				</div>

				{mode === "pdf" ? (
					<label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-border border-dashed p-6 text-center transition-colors hover:border-gold/50">
						<input
							type="file"
							accept="application/pdf,application/x-pdf"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0] ?? null;
								const sizeError = file ? fileSizeError(file) : null;
								if (file && sizeError) {
									setPdfFile(null);
									setError(sizeError);
									return;
								}
								setError(null);
								setPdfFile(file);
							}}
						/>
						{pdfFile ? (
							<>
								<span className="font-medium text-sm">{pdfFile.name}</span>
								<span className="text-muted-foreground text-xs">
									{(pdfFile.size / 1_000_000).toFixed(1)} MB — read on this
									device, up to {MAX_FILE_MB} MB
								</span>
							</>
						) : (
							<>
								<span className="font-medium text-gold text-sm">
									Choose a PDF
								</span>
								<span className="max-w-xs text-muted-foreground text-xs leading-5">
									PDFs up to {MAX_FILE_MB} MB. Scanned (image-only) PDFs have
									no text to study — paste the text instead.
								</span>
							</>
						)}
					</label>
				) : (
					<div className="mt-3 space-y-2">
						<Textarea
							value={pastedText}
							onChange={(e) => setPastedText(e.target.value)}
							rows={8}
							placeholder="Paste the book's text here (a few chunks' worth at a time). Headings like “Unit 1” or “ምዕራፍ 2” split it into study chunks for you."
						/>
						<div className="flex items-center justify-between text-muted-foreground text-xs">
							<span>
								{pastedText.trim().length.toLocaleString()} characters
							</span>
							<span>
								Chapter headings like “Unit 1” or “ምዕራፍ 2” are detected
								automatically.
							</span>
						</div>
					</div>
				)}
			</div>

			{error && (
				<p className="mt-4 rounded-lg border border-rust/40 bg-rust/10 px-3 py-2 text-rust text-sm">
					{error}
				</p>
			)}

			<div className="mt-5 flex items-center gap-3">
				<Button onClick={onPlan} disabled={!canPlan}>
					Scan into chunks
				</Button>
				<p className="text-muted-foreground text-xs leading-5">
					You&apos;ll confirm the chunks before anything is imported.
				</p>
			</div>
			<p className="mt-4 border-border/60 border-t pt-3 text-[0.7rem] text-muted-foreground leading-5">
				Demo rooms run on a small daily budget — your dashboard shows what&apos;s
				left. Signed-in users get more when we open the doors.
			</p>
		</section>
	);
}
