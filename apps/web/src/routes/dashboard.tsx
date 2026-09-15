import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@kiftet/ui/components/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@kiftet/ui/components/empty";
import { Skeleton } from "@kiftet/ui/components/skeleton";

import { api, apiError } from "@/lib/api";
import type { ChapterInfo } from "@/components/study-provider";
import { setChapter, setSession } from "@/components/assistant";

export default function Dashboard() {
  const navigate = useNavigate();
  const [chapters, setChapters] = useState<ChapterInfo[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<ChapterInfo[]>("/chapters")
      .then((rows) => {
        if (!cancelled) setChapters(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async (chapter: ChapterInfo) => {
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

  return (
    <main className="mx-auto grid w-full max-w-md content-start gap-8 px-6 py-10">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-manuscript">
          Choose a chapter
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick one and tell the ring everything you remember. No preparation — that&apos;s the point.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rust/50 bg-rust/10 px-4 py-3 text-sm text-manuscript/85">
          <p className="font-medium mb-1">Something went wrong</p>
          <p className="text-manuscript/60">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      {chapters === null && !error && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg bg-night-raised" />
          ))}
        </div>
      )}

      {chapters && chapters.length === 0 && (
        <Empty className="border-manuscript/15 bg-night-raised">
          <EmptyContent>
            <p className="font-display text-5xl" aria-hidden="true">
              📖
            </p>
            <EmptyHeader>
              <EmptyTitle>No chapters yet</EmptyTitle>
              <EmptyDescription>
                Ingest a chapter before you can study it. From the repo root:
              </EmptyDescription>
            </EmptyHeader>
            <code className="block w-full rounded bg-night-deep px-2 py-1 text-left text-xs text-manuscript/70">
              curl -X POST localhost:3000/api/chapters/ingest -H
              &quot;Content-Type: application/json&quot; -d
              &apos;{"{ \"textbookTitle\": \"…\", \"subject\": \"…\", \"title\": \"…\", \"rawText\": \"…\" }"}&apos;
            </code>
          </EmptyContent>
        </Empty>
      )}

      {chapters && chapters.length > 0 && (
        <ul className="space-y-3">
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <button
                type="button"
                onClick={() => start(chapter)}
                disabled={starting === chapter.id}
                className="w-full rounded-lg border border-manuscript/15 bg-night-raised p-4 text-left transition-colors hover:border-gold/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                <span className="mb-1 inline-block rounded-sm bg-night-deep px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-widest text-gold/90">
                  {chapter.subject}
                </span>
                <span className="block font-display text-lg font-medium tracking-tight text-manuscript">
                  {chapter.title}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {chapter.textbookTitle} · {starting === chapter.id ? "Starting…" : "Start studying"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}