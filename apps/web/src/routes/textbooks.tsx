import { Button } from "@kiftet/ui/components/button";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { Skeleton } from "@kiftet/ui/components/skeleton";
import { Textarea } from "@kiftet/ui/components/textarea";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { setChapter, setSession } from "@/components/assistant";
import { ConceptGraph } from "@/components/concept-graph";
import { HierarchyReport } from "@/components/hierarchy-report";
import { InkPage } from "@/components/ink-page";
import { useLanguage } from "@/components/language-provider";
import { TocPicker } from "@/components/toc-picker";
import { api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getDemoUser } from "@/lib/demo";
import { getLocalTextbookSource, saveLocalTextbookSource } from "@/lib/store";
import {
  fileSizeError,
  type ImportChunk,
  type ImportDiagnostics,
  type ImportTocNode,
  importTocTree,
  indexToc,
  MAX_FILE_MB,
  type OcrChunkReader,
  type PageRange,
  type PdfUnreadableReason,
  pageOffsetForPrintedOne,
  pageRangeJobs,
  pageRangesFromToc,
  pageRangeTree,
  planImport,
  type TocJob,
  tocJobs,
  topicLabel,
  visibleChapterTitle,
  withPartSplits,
} from "@/lib/textbook";
import { readContentsWithModel } from "@/lib/toc-model";
import type { Route } from "./+types/textbooks";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Your textbooks — Kiftet" },
    {
      name: "description",
      content:
        "Save your textbook's table of contents to your account, then choose chapters to add to your study library. The original PDF stays on your device.",
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
  sourceName: string | null;
  sourceSize: number | null;
  toc: ImportTocNode[] | null;
  chapters: LibraryChapter[];
};

type SourceMode = "pdf" | "text";

/**
 * How far one visible line of the book has got.
 *
 * Keyed by TOC node id rather than chunk index, because the two views now let a
 * student tick a *topic* — "1.1.1 The nucleus" — which is not a chunk at all. It
 * is a page range, and its progress has to be tracked the same way a unit's is or
 * the badge beside it would flicker between states it never passed through.
 */
type NodeStage = {
  id: string;
  title: string;
  state: "skip" | "queued" | "reading" | "ingesting" | "done" | "error";
};

type ImportStep = "form" | "planning" | "review" | "importing";

function groupLibraryChapters(chapters: LibraryChapter[]) {
  const groups = new Map<string, LibraryChapter[]>();
  for (const chapter of chapters) {
    const title = visibleChapterTitle(chapter.title).title;
    const group = groups.get(title) ?? [];
    group.push(chapter);
    groups.set(title, group);
  }
  return [...groups].map(([title, rows]) => ({ title, chapters: rows }));
}

// Progress of the on-device reader, for the one chapter being read.
type OcrProgressView = { done: number; total: number } | null;

// The import flow is visible and real: chapters are found on-device, OCR runs
// on-device, and each chapter is ingested under the same per-minute request
// budget and daily book cap as everything else. Open. Reverting this to false
// hides the flow without removing any code.
const TEXTBOOK_IMPORT_ENABLED = true;

// "Printed page 1 is on PDF page N" is the picker's field; the offset the
// planner and the saved ranges speak in is the inverse. Keeping the conversion
// in one place is what lets the field, a restored book, and the planner's seed
// agree on where page one falls.
function offsetForPageOneAt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? pageOffsetForPrintedOne(n) : -1;
}

function pageOneAtForOffset(offset: number | null): string {
  return offset === null ? "1" : String(offset + 2);
}

export default function Textbooks() {
  const navigate = useNavigate();
  const { data: auth, isPending: sessionPending } = authClient.useSession();
  const { t } = useLanguage();
  const [textbooks, setTextbooks] = useState<LibraryTextbook[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bookTitle, setBookTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("en");
  const [mode, setMode] = useState<SourceMode>("pdf");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [tocSelection, setTocSelection] = useState<Set<string>>(new Set());
  const [pageRanges, setPageRanges] = useState<PageRange[]>([]);
  // "Printed page 1 is on PDF page N" — entered as 1-based N, like a viewer.
  const [pageOneAt, setPageOneAt] = useState("1");
  const [savedTextbookId, setSavedTextbookId] = useState<string | null>(null);
  const [pendingResumeBook, setPendingResumeBook] =
    useState<LibraryTextbook | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("form");
  const [planned, setPlanned] = useState<ImportChunk[] | null>(null);
  const [nodeStages, setNodeStages] = useState<NodeStage[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Held for the life of the review screen: it keeps the PDF loaded so pages
  // can be rendered on demand, and it is the only thing that knows how to turn
  // a chapter's pages into text.
  const readerRef = useRef<OcrChunkReader | null>(null);
  const [ocrReason, setOcrReason] = useState<PdfUnreadableReason | null>(null);
  const [report, setReport] = useState<ImportDiagnostics | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgressView>(null);

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
    const sourceName = mode === "pdf" ? pdfFile?.name : "pasted-text.txt";
    const sourceSize =
      mode === "pdf"
        ? pdfFile?.size
        : pastedText
          ? new Blob([pastedText]).size
          : undefined;
    if (
      book?.sourceName &&
      sourceName &&
      book.sourceSize !== null &&
      sourceSize !== undefined &&
      (book.sourceName !== sourceName || book.sourceSize !== sourceSize)
    ) {
      return new Set<string>();
    }
    return new Set((book?.chapters ?? []).map((c) => c.title));
  }, [textbooks, bookTitle, mode, pdfFile, pastedText]);
  const activeToc = useMemo(
    () => (planned ? importTocTree(planned) : []),
    [planned],
  );

  // The printed→PDF shift every typed page range is placed with. The offset
  // itself is data the planner already derived (diagnostics.pageOffset); the
  // field just lets the student confirm or correct it.
  const pageOffset = useMemo(() => offsetForPageOneAt(pageOneAt), [pageOneAt]);
  const pageCount = report?.pageCount ?? 0;
  // Page numbers need pages: pasted text has none, so the tab is not offered.
  const pagesAvailable = pageCount > 0;
  const rangeJobs = useMemo(
    () => pageRangeJobs(pageRanges, pageOffset, pageCount),
    [pageRanges, pageOffset, pageCount],
  );

  const addPageRange = () =>
    setPageRanges((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        title: "",
        start: null,
        end: null,
      },
    ]);
  const updatePageRange = (id: string, patch: Partial<Omit<PageRange, "id">>) =>
    setPageRanges((prev) =>
      prev.map((range) => (range.id === id ? { ...range, ...patch } : range)),
    );
  const removePageRange = (id: string) =>
    setPageRanges((prev) => prev.filter((range) => range.id !== id));

  const applyPlan = (
    result: Awaited<ReturnType<typeof planImport>>,
    imported: Set<string>,
    savedId: string | null = null,
  ) => {
    readerRef.current = result.reader;
    setOcrReason(result.ocrReason);
    setReport(result.diagnostics);
    setOcrProgress(null);
    setPlanned(result.chunks);
    // A fresh plan starts with no typed ranges, and seeds the offset from
    // whatever the planner managed to work out (often nothing on a book with no
    // contents) so the common case is one less number to type.
    setPageRanges([]);
    setPageOneAt(pageOneAtForOffset(result.diagnostics.pageOffset));
    const toc = importTocTree(result.chunks);
    // One stage per visible line, keyed by node id, and one for *every* line —
    // not just the six units. A topic is importable on its own now, and a stage
    // array without its row cannot be updated by setNodeState, so its badge
    // would sit on "queued" forever and its retry button would never appear.
    // A unit is "skip" only when every chunk it covers is already in the
    // library; a half-imported unit is still worth offering, and its missing
    // parts are what the student wants.
    const flat = indexToc(toc);
    setNodeStages(
      flat.order.flatMap((id) => {
        const node = flat.byId.get(id);
        if (!node) return [];
        const landed = (node.chunkIndexes ?? []).every((chunkIndex) =>
          imported.has((result.chunks[chunkIndex]?.title ?? "").trim()),
        );
        return [
          {
            id,
            title: node.title,
            state: node.chunkIndexes && landed ? "skip" : "queued",
          },
        ];
      }),
    );
    setTocSelection(new Set());
    setSavedTextbookId(savedId);
    setStep("review");
  };

  const canPlan =
    (mode === "pdf" && pdfFile !== null) ||
    (mode === "text" && pastedText.trim().length > 0);

  const plan = async () => {
    setStep("planning");
    setError(null);
    try {
      const result = await planImport(
        mode === "pdf" && pdfFile
          ? { kind: "pdf", name: pdfFile.name, file: pdfFile }
          : { kind: "text", name: "pasted", text: pastedText },
        language,
        readContentsWithModel,
      );
      if (!result.chunks.length) throw new Error(t("nothing-to-import"));
      // A second plan replaces the first reader, so close the old one rather
      // than leaking a loaded PDF and its WASM heaps.
      await readerRef.current?.close();
      applyPlan(result, existingChapters);
    } catch (err) {
      setError(apiError(err));
      setStep("form");
    }
  };

  const saveBook = async () => {
    if (!planned) return;
    setError(null);
    try {
      const sourceName = mode === "pdf" ? pdfFile?.name : "pasted-text.txt";
      const sourceSize =
        mode === "pdf" ? pdfFile?.size : new Blob([pastedText]).size;
      const existingBook = textbooks?.find(
        (book) => book.title === bookTitle.trim(),
      );
      if (
        existingBook?.chapters.length &&
        existingBook.sourceName &&
        existingBook.sourceSize !== null &&
        (existingBook.sourceName !== sourceName ||
          existingBook.sourceSize !== sourceSize)
      ) {
        setError(t("textbook-source-conflict"));
        return;
      }
      const { textbookId } = await api<{ textbookId: string }>("/textbooks", {
        method: "POST",
        body: JSON.stringify({
          title: bookTitle.trim(),
          subject: subject.trim(),
          language,
          sourceName,
          sourceSize,
          toc: [
            ...activeToc,
            ...pageRangeTree(pageRanges, pageOffset, pageCount),
          ],
        }),
      });
      setSavedTextbookId(textbookId);
      const source =
        mode === "pdf"
          ? pdfFile
          : new Blob([pastedText], { type: "text/plain" });
      if (source) {
        try {
          await saveLocalTextbookSource(
            textbookId,
            sourceName ?? "textbook",
            source,
            pageOneAt,
          );
        } catch (storageError) {
          setError(
            `${t("textbook-saved-local-error")} ${apiError(storageError)}`,
          );
        }
      }
      fetchLibrary();
      toast.success(t("textbook-saved"));
    } catch (err) {
      setError(apiError(err));
    }
  };

  const openSavedBook = async (book: LibraryTextbook) => {
    setPendingResumeBook(null);
    setError(null);
    try {
      setStep("planning");
      const source = await getLocalTextbookSource(book.id);
      if (!source) {
        setBookTitle(book.title);
        setSubject(book.subject);
        setLanguage(book.language);
        setSavedTextbookId(null);
        if (book.sourceName === "pasted-text.txt") {
          setMode("text");
          setPastedText("");
          setStep("form");
          setError(t("reselect-textbook-text"));
          return;
        }
        setStep("form");
        setError(t("reselect-textbook-source"));
        setPendingResumeBook(book);
        resumeInputRef.current?.click();
        return;
      }
      const imported = new Set(book.chapters.map((chapter) => chapter.title));
      setBookTitle(book.title);
      setSubject(book.subject);
      setLanguage(book.language);
      const file =
        source.type === "application/pdf"
          ? new File([source.blob], source.name, { type: source.type })
          : null;
      await readerRef.current?.close();
      const result =
        file !== null
          ? await planImport(
              { kind: "pdf", name: file.name, file },
              book.language,
              readContentsWithModel,
            )
          : await planImport({
              kind: "text",
              name: source.name,
              text: await source.blob.text(),
            });
      setPdfFile(file);
      setMode(file ? "pdf" : "text");
      applyPlan(result, imported, book.id);
      // Ranges come back out of the saved contents; the offset that places them
      // is the one stored beside the file, falling back to what the planner
      // found. Without it the pages would still read right — the offset cancels
      // when a range is re-expanded — but the student's numbers would be off.
      const oneAt =
        source.pageOneAt ?? pageOneAtForOffset(result.diagnostics.pageOffset);
      setPageOneAt(oneAt);
      setPageRanges(
        pageRangesFromToc(book.toc ?? [], offsetForPageOneAt(oneAt)),
      );
    } catch (err) {
      setError(apiError(err));
      setStep("form");
    }
  };

  const resumeWithFile = async (file: File | undefined) => {
    const book = pendingResumeBook;
    setPendingResumeBook(null);
    if (!file || !book) return;
    if (
      (book.sourceSize !== null && book.sourceSize !== file.size) ||
      (book.sourceName !== null && book.sourceName !== file.name)
    ) {
      setError(t("textbook-file-mismatch"));
      return;
    }
    setBookTitle(book.title);
    setSubject(book.subject);
    setLanguage(book.language);
    setPdfFile(file);
    setMode("pdf");
    setStep("planning");
    try {
      await readerRef.current?.close();
      const result = await planImport(
        { kind: "pdf", name: file.name, file },
        book.language,
        readContentsWithModel,
      );
      applyPlan(
        result,
        new Set(book.chapters.map((chapter) => chapter.title)),
        book.id,
      );
      // The source was re-picked on this device, so there is no stored offset
      // to lean on; the planner's own read of the file is the best one there is.
      const oneAt = pageOneAtForOffset(result.diagnostics.pageOffset);
      setPageOneAt(oneAt);
      setPageRanges(
        pageRangesFromToc(book.toc ?? [], offsetForPageOneAt(oneAt)),
      );
    } catch (err) {
      setError(apiError(err));
      setStep("form");
    }
  };

  // Upsert, not update: a typed page range is never in the tree the stages were
  // seeded from, so its first state has to create its row as well as set it.
  const setNodeState = (id: string, state: NodeStage["state"]) =>
    setNodeStages((prev) =>
      prev.some((s) => s.id === id)
        ? prev.map((s) => (s.id === id ? { ...s, state } : s))
        : [...prev, { id, title: id, state }],
    );

  /**
   * Read one ticked line and ingest it.
   *
   * A unit goes through its chunks in order. A topic goes through the pages
   * between its own number and the next one, carried as a synthetic chunk with
   * `needsOcr` set — so the on-device reader reads exactly the pages of "1.1.1
   * The nucleus" and never a page more.
   *
   * The chapter is titled with its unit, because a chapter called only "1.1.1 The
   * nucleus" would land on the shelf with no way to tell which of the six units
   * it came from.
   *
   * A typed page range is the same synthetic chunk without a number to hang off:
   * the reader reads exactly its pages under whatever name the student gave it.
   */
  const importJob = async (job: TocJob): Promise<void> => {
    const reader = readerRef.current;
    setNodeState(job.nodeId, "reading");
    try {
      if (job.kind === "unit") {
        for (const index of job.chunkIndexes) {
          const chunk = planned?.[index];
          if (!chunk) continue;
          if (existingChapters.has(chunk.title.trim())) {
            setNodeState(job.nodeId, "skip");
            continue;
          }
          await sendChunk(job.nodeId, chunk, chunk.rawText);
        }
        return;
      }
      const slice: ImportChunk = {
        title: job.kind === "topic" ? `${job.unit} · ${job.title}` : job.title,
        rawText: "",
        pages: job.pages,
        needsOcr: Boolean(reader),
      };
      const rawText = reader
        ? await reader.read(slice, ({ done, total }) =>
            setOcrProgress({ done, total }),
          )
        : "";
      if (!rawText.trim()) throw new Error(t("ocr-read-nothing"));
      await sendChunk(job.nodeId, slice, rawText);
    } catch (err) {
      setNodeState(job.nodeId, "error");
      throw err instanceof Error ? err : new Error(t("ocr-unavailable"));
    }
  };

  const sendChunk = async (
    nodeId: string,
    chapter: ImportChunk,
    rawText: string,
  ) => {
    setNodeState(nodeId, "ingesting");
    try {
      // A recognised chapter is no longer bounded by the readable headings that
      // carved it up: 59 OCR'd pages of dense biology runs well past what the
      // server accepts in one request (200k of text, 256kb of body). Split on
      // the same boundary the readable path uses, so a long unit arrives as
      // "(part 1)", "(part 2)" instead of being rejected outright.
      for (const part of withPartSplits(
        chapter.title,
        rawText,
        chapter.topics,
      )) {
        await api("/chapters/ingest", {
          method: "POST",
          body: JSON.stringify({
            textbookTitle: bookTitle.trim(),
            subject: subject.trim(),
            language,
            title: part.title,
            rawText: part.rawText,
            topics: part.topics?.map(topicLabel),
          }),
        });
      }
      setNodeState(nodeId, "done");
    } catch (err) {
      setNodeState(nodeId, "error");
      throw apiError(err);
    }
  };

  const runImport = async () => {
    if (!planned || !savedTextbookId || !TEXTBOOK_IMPORT_ENABLED) return;
    setStep("importing");
    const jobs = [...tocJobs(activeToc, tocSelection), ...rangeJobs].filter(
      (job) => nodeStages.find((s) => s.id === job.nodeId)?.state !== "skip",
    );
    let failed = 0;
    for (const job of jobs) {
      try {
        await importJob(job);
      } catch {
        failed += 1;
      }
    }
    fetchLibrary();
    if (failed === 0) {
      toast.success(t("book-on-shelf", { title: bookTitle.trim() }));
      resetForm();
    } else {
      setStep("review");
      toast.error(
        failed === 1
          ? t("chunk-failed", { n: failed })
          : t("chunks-failed", { n: failed }),
      );
    }
  };

  const retryOne = async (nodeId: string) => {
    if (!planned || !TEXTBOOK_IMPORT_ENABLED) return;
    setStep("importing");
    try {
      const job =
        tocJobs(activeToc, new Set([nodeId]))[0] ??
        rangeJobs.find((candidate) => candidate.nodeId === nodeId);
      if (job) await importJob(job);
      fetchLibrary();
    } catch {
      // The stage is already "error"; the badge and its retry button say so.
    }
    setStep("review");
  };

  const resetForm = () => {
    // Free the loaded PDF before dropping it on the floor.
    void readerRef.current?.close();
    readerRef.current = null;
    setOcrReason(null);
    setReport(null);
    setOcrProgress(null);
    setBookTitle("");
    setSubject("");
    setLanguage("en");
    setMode("pdf");
    setPdfFile(null);
    setPastedText("");
    setPlanned(null);
    setNodeStages([]);
    setTocSelection(new Set());
    setPageRanges([]);
    setPageOneAt("1");
    setSavedTextbookId(null);
    setPendingResumeBook(null);
    setError(null);
    setStep("form");
  };

  // Navigating away mid-review must not leave an 11 MB document loaded.
  useEffect(
    () => () => {
      void readerRef.current?.close();
    },
    [],
  );

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

  // Progress is counted over jobs, not over units, so ticking three topics
  // inside one unit reports 3 of 3 and not 1 of 1. A unit that is already in the
  // library counts as settled the moment it is picked, matching the badge beside
  // it — otherwise the bar would sit at zero while the screen says "Already here".
  const pendingJobs = [...tocJobs(activeToc, tocSelection), ...rangeJobs];
  const settled = (nodeId: string) => {
    const state = nodeStages.find((s) => s.id === nodeId)?.state;
    return state === "done" || state === "skip";
  };
  const progress = pendingJobs.filter((job) => settled(job.nodeId)).length;
  const total = pendingJobs.length;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 max-w-2xl space-y-2">
        <p className="k-label">{t("your-textbooks")}</p>
        <h1 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
          {t("byob-title-full")}
        </h1>
        <p className="text-muted-foreground text-sm leading-6">
          {t("textbooks-text")}
        </p>
      </header>

      {loadError && !textbooks && (
        <div className="inner-surface mb-8 border border-rust/40 p-4 text-sm">
          <p className="font-medium text-rust">{t("room-unreachable")}</p>
          <p className="mt-1 text-muted-foreground">{loadError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={fetchLibrary}
          >
            {t("retry")}
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
              {/* A book title is whatever the filename said, so it can be any
                  length. justify-between with nothing shrinkable on the left
                  pushed the chapter-count pill past the card edge. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[0.78rem] text-gold">
                    {book.subject}
                  </p>
                  <h2 className="truncate font-display font-semibold text-xl tracking-tight">
                    {book.title}
                  </h2>
                </div>
                <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold opacity-90">
                  {t("imported-chapters", { n: book.chapters.length })}
                </span>
              </div>
              {book.toc?.length ? (
                <>
                  <details className="mt-3 border-border/60 border-t pt-3">
                    <summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
                      {t("view-book-contents", { n: book.toc.length })}
                    </summary>
                    <ul className="mt-3 space-y-1 border-gold/25 border-l pl-3">
                      {book.toc.map((node) => (
                        <TocPreview
                          key={node.id}
                          node={node}
                          chapters={book.chapters}
                        />
                      ))}
                    </ul>
                  </details>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => void openSavedBook(book)}
                    >
                      {t("choose-chapters")}
                    </Button>
                  </div>
                </>
              ) : null}
              {book.chapters.length > 0 ? (
                <ul className="mt-4 divide-y divide-border/60">
                  {groupLibraryChapters(book.chapters).map((group, i) => (
                    <li key={group.title} className="py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[0.78rem] text-muted-foreground">
                            {String(i + 1).padStart(2, "0")}
                          </p>
                          <p className="truncate text-sm">{group.title}</p>
                        </div>
                        {group.chapters.length === 1 && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              const chapter = group.chapters[0];
                              if (chapter) startChapter(chapter.id);
                            }}
                          >
                            {t("start-review")}
                          </Button>
                        )}
                      </div>
                      {group.chapters.length > 1 && (
                        <ul className="mt-2 space-y-1 border-gold/25 border-l pl-3">
                          {group.chapters.map((chapter) => {
                            const section = visibleChapterTitle(
                              chapter.title,
                            ).section;
                            return (
                              <li
                                key={chapter.id}
                                className="flex items-center justify-between gap-3 py-1"
                              >
                                <span className="text-muted-foreground text-xs">
                                  {t("study-section", {
                                    n: section ?? 1,
                                    total: group.chapters.length,
                                  })}
                                </span>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => startChapter(chapter.id)}
                                >
                                  {t("start-review")}
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 flex items-center gap-3">
                  <ConceptGraph className="h-9 w-16 shrink-0 text-gold" />
                  <p className="text-muted-foreground text-sm">
                    {t("no-chapters-imported")}
                  </p>
                </div>
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
        toc={activeToc}
        selection={tocSelection}
        onToggleSelection={(id, checked) =>
          setTocSelection((prev) => {
            const next = new Set(prev);
            checked ? next.add(id) : next.delete(id);
            return next;
          })
        }
        onSaveBook={saveBook}
        onSelectAll={() =>
          setTocSelection(
            new Set(
              activeToc
                .filter(
                  (node) =>
                    nodeStages.find((s) => s.id === node.id)?.state !== "skip",
                )
                .map((node) => node.id),
            ),
          )
        }
        onClearSelection={() => setTocSelection(new Set())}
        savedTextbookId={savedTextbookId}
        nodeStages={nodeStages}
        ocrReason={ocrReason}
        report={report}
        ocrProgress={ocrProgress}
        error={error}
        setError={setError}
        onImport={runImport}
        onRetryOne={retryOne}
        progress={progress}
        total={total}
        onCancel={resetForm}
        pageRanges={pageRanges}
        onAddRange={addPageRange}
        onUpdateRange={updatePageRange}
        onRemoveRange={removePageRange}
        pageOffset={pageOffset}
        pageOneAt={pageOneAt}
        onPageOneAtChange={setPageOneAt}
        pageCount={pageCount}
        pagesAvailable={pagesAvailable}
        pickedJobs={pendingJobs}
      />
      <input
        ref={resumeInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          void resumeWithFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </main>
  );
}

function TocPreview({
  node,
  chapters,
}: {
  node: ImportTocNode;
  chapters: LibraryChapter[];
}) {
  const { t } = useLanguage();
  const imported = chapters.some(
    (chapter) =>
      chapter.title === node.title ||
      chapter.title.startsWith(`${node.title} (part `),
  );
  return (
    <li className="text-sm leading-6">
      {/* TOC titles arrive from a scanned PDF, so they are as long as the
          textbook's own headings run. min-w-0 + break-words lets them wrap
          instead of shoving the "already here" pill off the row. */}
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 break-words">{node.title}</span>
        {imported && (
          <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 font-medium text-[0.7rem] text-gold">
            {t("already-here")}
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <ul className="mt-1 space-y-1 border-border/60 border-l pl-3">
          {node.children.map((child) => (
            <TocPreview key={child.id} node={child} chapters={chapters} />
          ))}
        </ul>
      )}
    </li>
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
  toc,
  selection,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  savedTextbookId,
  onSaveBook,
  nodeStages,
  ocrReason,
  report,
  ocrProgress,
  error,
  setError,
  onImport,
  onRetryOne,
  progress,
  total,
  onCancel,
  pageRanges,
  onAddRange,
  onUpdateRange,
  onRemoveRange,
  pageOffset,
  pageOneAt,
  onPageOneAtChange,
  pageCount,
  pagesAvailable,
  pickedJobs,
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
  toc: ImportTocNode[];
  selection: Set<string>;
  onToggleSelection: (id: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  savedTextbookId: string | null;
  onSaveBook: () => void;
  nodeStages: NodeStage[];
  ocrReason: PdfUnreadableReason | null;
  report: ImportDiagnostics | null;
  ocrProgress: OcrProgressView;
  error: string | null;
  setError: (e: string | null) => void;
  onImport: () => void;
  onRetryOne: (nodeId: string) => void;
  progress: number;
  total: number;
  onCancel: () => void;
  pageRanges: PageRange[];
  onAddRange: () => void;
  onUpdateRange: (id: string, patch: Partial<Omit<PageRange, "id">>) => void;
  onRemoveRange: (id: string) => void;
  pageOffset: number;
  pageOneAt: string;
  onPageOneAtChange: (value: string) => void;
  pageCount: number;
  pagesAvailable: boolean;
  pickedJobs: TocJob[];
}) {
  const { t } = useLanguage();
  if (step === "planning") {
    return (
      <section className="surface flex flex-col items-center gap-5 p-10 text-center">
        <InkPage />
        <p className="text-muted-foreground text-sm">{t("reading-device")}</p>
      </section>
    );
  }

  if (step === "review" || step === "importing") {
    if (!planned) return null;
    const importing = step === "importing";
    const stateOf = (node: ImportTocNode) =>
      nodeStages.find((s) => s.id === node.id)?.state ?? "queued";
    const selectedIds = new Set(pickedJobs.map((job) => job.nodeId));
    const newChapters = [...selectedIds].filter(
      (id) => nodeStages.find((s) => s.id === id)?.state !== "skip",
    ).length;
    const failed = [...selectedIds].filter(
      (id) => nodeStages.find((s) => s.id === id)?.state === "error",
    ).length;
    const isImported = (node: ImportTocNode) =>
      stateOf(node) === "skip" && (node.chunkIndexes ?? []).length > 0;

    return (
      <section className="surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="k-label">
              {importing ? t("importing-room") : t("textbook-contents")}
            </p>
            <h2 className="truncate font-display font-semibold text-lg tracking-tight">
              {bookTitle.trim()}
            </h2>
          </div>
          {!importing && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={onCancel}
            >
              {t("cancel")}
            </Button>
          )}
        </div>

        {ocrReason && (
          <p className="mt-4 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-gold text-xs leading-5">
            {t("ocr-notice")}
          </p>
        )}

        {report &&
          (report.source === "pdf-text-layer" ||
            report.source === "ocr-headings") && (
            <p className="mt-4 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-gold text-xs leading-5">
              {report.modelRead === "refused"
                ? t("toc-fallback-refused", {
                    reason: report.modelReason ?? "",
                  })
                : t("toc-fallback-guessed")}
            </p>
          )}

        {importing && total > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-muted-foreground text-xs">
              <span>{t("chapter-progress", { progress, total })}</span>
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

        <TocPicker
          className="mt-5"
          toc={toc}
          selection={selection}
          onToggle={onToggleSelection}
          onSelectAll={onSelectAll}
          onClear={onClearSelection}
          stageFor={stateOf}
          isImported={isImported}
          importing={importing}
          onRetry={onRetryOne}
          ocrProgress={ocrProgress}
          pageRanges={pageRanges}
          onAddRange={onAddRange}
          onUpdateRange={onUpdateRange}
          onRemoveRange={onRemoveRange}
          pageOffset={pageOffset}
          pageOneAt={pageOneAt}
          onPageOneAtChange={onPageOneAtChange}
          pageCount={pageCount}
          pagesAvailable={pagesAvailable}
        />

        <HierarchyReport report={report} className="mt-3" />

        {error && (
          <p className="mt-4 rounded-lg border border-rust/40 bg-rust/10 px-3 py-2 text-rust text-sm">
            {error}
          </p>
        )}

        {!importing && (
          <>
            <p className="mt-4 text-muted-foreground text-xs leading-5">
              {t("saved-book-device-note")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!savedTextbookId ? (
                <Button onClick={onSaveBook} disabled={!enabled}>
                  {t("save-textbook")}
                </Button>
              ) : enabled ? (
                <Button onClick={onImport} disabled={newChapters === 0}>
                  {newChapters === 0
                    ? t("select-to-import")
                    : failed > 0
                      ? failed === 1
                        ? t("retry-failed", { n: failed })
                        : t("retry-failed-many", { n: failed })
                      : newChapters === 1
                        ? t("import-entry-n", { n: newChapters })
                        : t("import-entries-n", { n: newChapters })}
                </Button>
              ) : (
                <Button disabled title="Preview mode — import is coming soon.">
                  {t("preview-coming")}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onCancel}>
                {t("start-over-import")}
              </Button>
            </div>
            {!enabled && (
              <p className="mt-3 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-gold text-xs leading-5">
                {t("preview-mode-text")}
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
          <strong className="font-medium">{t("preview-mode")}</strong>{" "}
          {t("preview-mode-note")}
        </p>
      )}
      <p className="k-label">{t("add-textbook-label")}</p>
      <h2 className="font-display font-semibold text-lg tracking-tight">
        {t("next-book")}
      </h2>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="book-title">{t("book-title")}</Label>
          <Input
            id="book-title"
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            placeholder={t("grade-example")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="book-subject">{t("subject-label")}</Label>
          <Input
            id="book-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("physics-example")}
          />
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="book-language">{t("chapter-language")}</Label>
        {/* Native <select> kept — it gives the OS picker, which is the
				    right call on the low-end phones this is built for — but it now
				    wears the control layer's shape language. It was `rounded-none`
				    with `focus-visible:border-primary`, which in every dark room
				    put a candle-coloured border on a candle-coloured field. */}
        <div className="relative">
          <select
            id="book-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-11 w-full appearance-none rounded-full border border-input bg-card/60 px-4 text-[0.95rem] outline-none transition-[color,border-color] duration-200 focus-visible:border-gold/50 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 dark:bg-input/30"
          >
            <option value="en">{t("lang-en")}</option>
            <option value="am">{t("lang-am")}</option>
            <option value="om">{t("lang-om")}</option>
            <option value="other">{t("lang-other")}</option>
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 font-medium text-muted-foreground text-xs">
          {t("where-content")}
        </p>
        <div className="flex gap-2">
          {(["pdf", "text"] as const).map((m) => (
            <Button
              key={m}
              variant={mode === m ? "default" : "outline"}
              size="sm"
              onClick={() => setMode(m)}
            >
              {m === "pdf" ? t("pdf-file") : t("paste-text")}
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
                  {t("pdf-chosen", {
                    size: (pdfFile.size / 1_000_000).toFixed(1),
                    max: MAX_FILE_MB,
                  })}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium text-gold text-sm">
                  {t("choose-pdf")}
                </span>
                <span className="max-w-xs text-muted-foreground text-xs leading-5">
                  {t("pdf-scan-note", { max: MAX_FILE_MB })}
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
              placeholder={t("paste-placeholder")}
            />
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>
                {t("characters", {
                  n: pastedText.trim().length.toLocaleString(),
                })}
              </span>
              <span>{t("headings-detect")}</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-rust/40 bg-rust/10 px-3 py-2 text-rust text-sm">
          {error}
        </p>
      )}

      {/* Stacks under sm. A nowrap primary button beside a two-sentence
          explainer left it 60px wide and wrapped the copy into a narrow
          ribbon four lines deep. */}
      <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button onClick={onPlan} disabled={!canPlan}>
          {t("scan-chunks")}
        </Button>
        <p className="min-w-0 text-muted-foreground text-xs leading-5">
          {t("plan-confirm")}
        </p>
      </div>
      <p className="mt-4 border-border/60 border-t pt-3 text-[0.78rem] text-muted-foreground leading-5">
        {t("demo-budget")}
      </p>
    </section>
  );
}
