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
import { InkPage } from "@/components/ink-page";
import { useLanguage } from "@/components/language-provider";
import { api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getDemoUser } from "@/lib/demo";
import { getLocalTextbookSource, saveLocalTextbookSource } from "@/lib/store";
import {
  fileSizeError,
  type ImportChunk,
  type ImportTocNode,
  importTocTree,
  MAX_FILE_MB,
  type OcrChunkReader,
  type PdfUnreadableReason,
  planImport,
  visibleChapterTitle,
  withPartSplits,
} from "@/lib/textbook";
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

type Stage = {
  key: number;
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
  const [savedTextbookId, setSavedTextbookId] = useState<string | null>(null);
  const [pendingResumeBook, setPendingResumeBook] =
    useState<LibraryTextbook | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("form");
  const [planned, setPlanned] = useState<ImportChunk[] | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Held for the life of the review screen: it keeps the PDF loaded so pages
  // can be rendered on demand, and it is the only thing that knows how to turn
  // a chapter's pages into text.
  const readerRef = useRef<OcrChunkReader | null>(null);
  const [ocrReason, setOcrReason] = useState<PdfUnreadableReason | null>(null);
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

  const applyPlan = (
    result: Awaited<ReturnType<typeof planImport>>,
    imported: Set<string>,
    savedId: string | null = null,
  ) => {
    readerRef.current = result.reader;
    setOcrReason(result.ocrReason);
    setOcrProgress(null);
    setPlanned(result.chunks);
    setStages(
      result.chunks.map((c, i) => ({
        key: i,
        title: c.title,
        state: imported.has(c.title.trim()) ? "skip" : "queued",
      })),
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
          toc: importTocTree(planned),
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
            )
          : await planImport({
              kind: "text",
              name: source.name,
              text: await source.blob.text(),
            });
      setPdfFile(file);
      setMode(file ? "pdf" : "text");
      applyPlan(result, imported, book.id);
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
      );
      applyPlan(
        result,
        new Set(book.chapters.map((chapter) => chapter.title)),
        book.id,
      );
    } catch (err) {
      setError(apiError(err));
      setStep("form");
    }
  };

  const importChapter = async (
    chapter: ImportChunk,
    key: number,
  ): Promise<void> => {
    const reader = readerRef.current;
    // A chapter from a book whose text layer is broken carries no text yet —
    // read it from the page image on this device before sending anything.
    let rawText = chapter.rawText;
    if (chapter.needsOcr && reader) {
      setStages((prev) =>
        prev.map((s) => (s.key === key ? { ...s, state: "reading" } : s)),
      );
      try {
        rawText = await reader.read(chapter, ({ done, total }) =>
          setOcrProgress({ done, total }),
        );
      } catch {
        setStages((prev) =>
          prev.map((s) => (s.key === key ? { ...s, state: "error" } : s)),
        );
        throw new Error(t("ocr-unavailable"));
      } finally {
        setOcrProgress(null);
      }
      if (!rawText.trim()) {
        setStages((prev) =>
          prev.map((s) => (s.key === key ? { ...s, state: "error" } : s)),
        );
        throw new Error(t("ocr-read-nothing"));
      }
    }

    setStages((prev) =>
      prev.map((s) => (s.key === key ? { ...s, state: "ingesting" } : s)),
    );
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
            topics: part.topics,
          }),
        });
      }
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
    if (!planned || !savedTextbookId || !TEXTBOOK_IMPORT_ENABLED) return;
    setStep("importing");
    const selectedIndexes = new Set(
      activeToc
        .filter((node) => tocSelection.has(node.id))
        .flatMap((node) => node.chunkIndexes ?? []),
    );
    const snapshot = planned
      .map((c, i) => ({ ...c, key: i }))
      .filter((chapter) => selectedIndexes.has(chapter.key));
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
    // Free the loaded PDF before dropping it on the floor.
    void readerRef.current?.close();
    readerRef.current = null;
    setOcrReason(null);
    setOcrProgress(null);
    setBookTitle("");
    setSubject("");
    setLanguage("en");
    setMode("pdf");
    setPdfFile(null);
    setPastedText("");
    setPlanned(null);
    setStages([]);
    setTocSelection(new Set());
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

  const selectedRoots = activeToc.filter((node) => tocSelection.has(node.id));
  const progress = selectedRoots.filter((node) =>
    (node.chunkIndexes ?? []).every((index) => {
      const state = stages[index]?.state;
      return state === "done" || state === "skip";
    }),
  ).length;
  const total = selectedRoots.length;

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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[0.78rem] text-gold">
                    {book.subject}
                  </p>
                  <h2 className="font-display font-semibold text-xl tracking-tight">
                    {book.title}
                  </h2>
                </div>
                <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold opacity-90">
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
                .filter((node) =>
                  (node.chunkIndexes ?? []).some(
                    (index) =>
                      !existingChapters.has(
                        planned?.[index]?.title.trim() ?? "",
                      ),
                  ),
                )
                .map((node) => node.id),
            ),
          )
        }
        onClearSelection={() => setTocSelection(new Set())}
        savedTextbookId={savedTextbookId}
        stages={stages}
        ocrReason={ocrReason}
        ocrProgress={ocrProgress}
        error={error}
        setError={setError}
        onImport={runImport}
        onRetryOne={retryOne}
        progress={progress}
        total={total}
        skipped={existingChapters}
        onCancel={resetForm}
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

function TocChild({ node }: { node: ImportTocNode }) {
  return (
    <li className="text-muted-foreground text-xs leading-5">
      {node.children.length > 0 ? (
        <details>
          <summary className="cursor-pointer hover:text-foreground">
            {node.title}
          </summary>
          <ul className="mt-1 space-y-1 border-border/60 border-l pl-3">
            {node.children.map((child) => (
              <TocChild key={child.id} node={child} />
            ))}
          </ul>
        </details>
      ) : (
        node.title
      )}
    </li>
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
      <div className="flex items-start justify-between gap-3">
        <span>{node.title}</span>
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
  stages,
  ocrReason,
  ocrProgress,
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
  toc: ImportTocNode[];
  selection: Set<string>;
  onToggleSelection: (id: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  savedTextbookId: string | null;
  onSaveBook: () => void;
  stages: Stage[];
  ocrReason: PdfUnreadableReason | null;
  ocrProgress: OcrProgressView;
  error: string | null;
  setError: (e: string | null) => void;
  onImport: () => void;
  onRetryOne: (key: number) => void;
  progress: number;
  total: number;
  skipped: Set<string>;
  onCancel: () => void;
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
    const selectedChapters = toc.filter((node) => selection.has(node.id));
    const newChapters = selectedChapters.filter((node) =>
      (node.chunkIndexes ?? []).some((index) => {
        const chunk = planned[index];
        return chunk !== undefined && !skipped.has(chunk.title.trim());
      }),
    ).length;
    const importing = step === "importing";
    const selectedChunkIndexes = new Set(
      selectedChapters.flatMap((node) => node.chunkIndexes ?? []),
    );
    const failed = stages.filter(
      (stage) => selectedChunkIndexes.has(stage.key) && stage.state === "error",
    ).length;

    return (
      <section className="surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="k-label">
              {importing ? t("importing-room") : t("textbook-contents")}
            </p>
            <h2 className="font-display font-semibold text-lg tracking-tight">
              {bookTitle.trim()}
            </h2>
          </div>
          {!importing && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("cancel")}
            </Button>
          )}
        </div>

        {ocrReason && (
          <p className="mt-4 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-gold text-xs leading-5">
            {t("ocr-notice")}
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

        <div className="mt-5 rounded-2xl border border-border/70 bg-card/40 p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-border/60 border-b pb-3">
            <p className="font-medium text-sm">{t("choose-from-toc")}</p>
            {!importing && (
              <div className="flex gap-2">
                <Button variant="ghost" size="xs" onClick={onSelectAll}>
                  {t("select-available")}
                </Button>
                <Button variant="ghost" size="xs" onClick={onClearSelection}>
                  {t("clear-selection")}
                </Button>
              </div>
            )}
          </div>
          <ul className="space-y-1">
            {toc.map((node, i) => {
              const chunkIndexes = node.chunkIndexes ?? [i];
              const partStages = chunkIndexes.map(
                (index) => stages[index]?.state ?? "queued",
              );
              const stage = partStages.includes("error")
                ? "error"
                : partStages.includes("reading")
                  ? "reading"
                  : partStages.includes("ingesting")
                    ? "ingesting"
                    : partStages.every(
                          (state) => state === "done" || state === "skip",
                        )
                      ? partStages.every((state) => state === "skip")
                        ? "skip"
                        : "done"
                      : "queued";
              const isNew = chunkIndexes.some((index) => {
                const chunk = planned[index];
                return chunk !== undefined && !skipped.has(chunk.title.trim());
              });
              const retryKey =
                chunkIndexes.find(
                  (index) => stages[index]?.state === "error",
                ) ??
                chunkIndexes[0] ??
                i;
              return (
                <li
                  key={node.id}
                  className="rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-gold"
                      checked={!isNew || selection.has(node.id)}
                      disabled={!isNew || importing}
                      onChange={(event) =>
                        onToggleSelection(node.id, event.currentTarget.checked)
                      }
                      aria-label={t("select-chapter", { title: node.title })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm leading-6">
                        {node.title}
                      </p>
                      {node.children.length > 0 && (
                        <ul className="mt-1 space-y-1 border-gold/25 border-l pl-3">
                          {node.children.map((child) => (
                            <TocChild key={child.id} node={child} />
                          ))}
                        </ul>
                      )}
                    </div>
                    {stage === "done" || (!isNew && stage === "skip") ? (
                      <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold">
                        {importing ? t("already-in") : t("already-here")}
                      </span>
                    ) : stage === "skip" ? (
                      <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-[0.78rem] text-muted-foreground">
                        {t("landed")}
                      </span>
                    ) : stage === "error" ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full border border-rust/40 bg-rust/10 px-2.5 py-1 font-medium text-[0.78rem] text-rust">
                          {t("failed")}
                        </span>
                        {!importing && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => onRetryOne(retryKey)}
                          >
                            {t("retry")}
                          </Button>
                        )}
                      </div>
                    ) : stage === "reading" ? (
                      <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold">
                        {ocrProgress
                          ? t("ocr-reading-page", ocrProgress)
                          : t("ocr-read-chapter")}
                      </span>
                    ) : stage === "ingesting" ? (
                      <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold">
                        {t("building-checklist")}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-[0.78rem] text-muted-foreground">
                        {t("new-label")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

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
                        ? t("import-chapter-n", { n: newChapters })
                        : t("import-chapters-n", { n: newChapters })}
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

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={onPlan} disabled={!canPlan}>
          {t("scan-chunks")}
        </Button>
        <p className="text-muted-foreground text-xs leading-5">
          {t("plan-confirm")}
        </p>
      </div>
      <p className="mt-4 border-border/60 border-t pt-3 text-[0.78rem] text-muted-foreground leading-5">
        {t("demo-budget")}
      </p>
    </section>
  );
}
