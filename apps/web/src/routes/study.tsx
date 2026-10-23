import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { ArrowRight, Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { DemoExpiredNotice } from "@/components/demo-expired-notice";
import { useLanguage } from "@/components/language-provider";
import type { ChapterInfo } from "@/components/study-provider";
import { useOnline } from "@/hooks/use-online";
import { useReconnectGrace } from "@/hooks/use-reconnect-grace";
import { canContinueOffline } from "@/lib/account-hint";
import { ApiError, api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { clearDemoUser, getDemoUser } from "@/lib/demo";
import { SYLLABUS_ENABLED } from "@/lib/feature-flags";
import {
  type CachedChapter,
  cacheChapters,
  getCachedChapters,
} from "@/lib/store";
import { visibleChapterTitle } from "@/lib/textbook";
import type { Route } from "./+types/study";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Study — Kiftet" },
    {
      name: "description",
      content: "Choose a chapter and start a focused study session.",
    },
  ];
}

export default function Study() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const online = useOnline();
  const reconnecting = useReconnectGrace(online);
  const [chapters, setChapters] = useState<ChapterInfo[] | null>(null);
  const [query, setQuery] = useState("");
  const [queueMode, setQueueMode] = useState(false);
  const [queuePicks, setQueuePicks] = useState<string[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoExpired, setDemoExpired] = useState(false);
  const [offlineList, setOfflineList] = useState(false);

  // The saved list is local and instant. Render it while the live request is
  // in flight; a failure below flips `offlineList` so the room stays honest.
  useEffect(() => {
    let cancelled = false;
    void getCachedChapters().then((cached) => {
      if (cancelled || !cached?.length) return;
      setChapters(
        (current) =>
          current ??
          cached.map(({ id, title, subject, textbookTitle, unitId }) => ({
            id,
            title,
            subject,
            textbookTitle,
            unitId,
          })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const offlineAccount = canContinueOffline(online);
    const canStay = offlineAccount || reconnecting;
    if (sessionPending) return;
    if (!session && !getDemoUser() && !canStay) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    api<ChapterInfo[]>("/chapters")
      .then((rows) => {
        if (cancelled) return;
        setChapters(rows);
        setOfflineList(false);
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
      })
      .catch(async (err) => {
        if (err instanceof ApiError && err.demoExpired) {
          clearDemoUser();
          if (!cancelled) setDemoExpired(true);
          return;
        }
        if (err instanceof ApiError && err.status === 0) {
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
    return () => {
      cancelled = true;
    };
  }, [navigate, online, reconnecting, session, sessionPending]);

  const filteredChapters = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return chapters ?? [];
    return (chapters ?? []).filter((chapter) =>
      `${chapter.title} ${chapter.subject} ${chapter.textbookTitle}`
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [chapters, query]);

  const groupedChapters = useMemo(() => {
    const groups = new Map<
      string,
      { subject: string; title: string; chapters: ChapterInfo[] }
    >();
    for (const chapter of filteredChapters) {
      const key = `${chapter.subject}\u0000${chapter.textbookTitle}`;
      const group = groups.get(key) ?? {
        subject: chapter.subject,
        title: chapter.textbookTitle,
        chapters: [],
      };
      group.chapters.push(chapter);
      groups.set(key, group);
    }
    return [...groups.entries()];
  }, [filteredChapters]);

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const chapter of chapters ?? []) {
      const title = visibleChapterTitle(chapter.title);
      if (title.section === null) continue;
      const key = `${chapter.textbookTitle}\u0000${title.title}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [chapters]);

  const startChapter = async (chapterId: string) => {
    setStarting(chapterId);
    setError(null);
    try {
      const { sessionId } = await api<{ sessionId: string }>(
        "/sessions/start",
        {
          method: "POST",
          body: JSON.stringify({ chapterId }),
        },
      );
      navigate(`/study/${sessionId}`);
    } catch (err) {
      if (err instanceof ApiError && err.demoExpired) {
        clearDemoUser();
        setDemoExpired(true);
      } else {
        setError(apiError(err));
      }
      setStarting(null);
    }
  };

  const togglePick = (chapterId: string) => {
    setQueuePicks((picks) =>
      picks.includes(chapterId)
        ? picks.filter((id) => id !== chapterId)
        : [...picks, chapterId],
    );
  };

  const startQueue = async () => {
    if (queuePicks.length === 0) return;
    setQueueBusy(true);
    setError(null);
    try {
      const result = await api<{
        queueId: string;
        sessions: { sessionId: string }[];
      }>("/sessions/queue", {
        method: "POST",
        body: JSON.stringify({ chapterIds: queuePicks }),
      });
      const firstSessionId = result.sessions[0]?.sessionId;
      if (!firstSessionId) {
        setError(t("something-went-wrong"));
        setQueueBusy(false);
        return;
      }
      navigate(`/study/${firstSessionId}`);
    } catch (err) {
      if (err instanceof ApiError && err.demoExpired) {
        clearDemoUser();
        setDemoExpired(true);
      } else {
        setError(apiError(err));
      }
      setQueueBusy(false);
    }
  };

  if (demoExpired) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <DemoExpiredNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-36 sm:px-6 sm:pt-12 lg:px-8">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="k-label">{t("nav-study")}</p>
          <h1 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
            {t("study-page-title")}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {t("study-page-description")}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {SYLLABUS_ENABLED && (
            <Link
              to="/syllabus"
              className={buttonVariants({ variant: "outline" })}
            >
              {t("study-by-syllabus")}
            </Link>
          )}
          <Button
            variant={queueMode ? "secondary" : "outline"}
            onClick={() => {
              setQueueMode((mode) => !mode);
              setQueuePicks([]);
            }}
          >
            {queueMode ? t("queue-cancel") : t("queue-plan")}
          </Button>
        </div>
      </header>

      <label className="relative mb-6 block max-w-xl">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("study-search-placeholder")}
          aria-label={t("study-search-placeholder")}
          className="h-12 w-full rounded-full border border-border bg-background/70 pr-4 pl-11 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/50 focus-visible:ring-2 focus-visible:ring-foreground/10"
        />
      </label>

      {queueMode && (
        <p className="mb-4 text-muted-foreground text-sm">
          {t("queue-plan-hint")}
        </p>
      )}

      {offlineList && (
        <div className="inner-surface mb-6 border border-rust/40 px-4 py-3 text-sm">
          <p className="font-medium text-rust">{t("offline-saved")}</p>
          <p className="mt-0.5 text-muted-foreground leading-6">
            {t("offline-saved-text")}
          </p>
        </div>
      )}

      {error && (
        <div className="inner-surface mb-6 border border-rust/40 p-4 text-sm">
          <p className="font-medium text-rust" role="alert">
            {error}
          </p>
          {chapters === null && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              {t("retry")}
            </Button>
          )}
        </div>
      )}

      {chapters === null && !error && (
        <div className="surface p-6 text-muted-foreground text-sm">
          {t("study-loading")}
        </div>
      )}

      {chapters?.length === 0 && (
        <section className="surface flex flex-col items-start gap-4 p-6 sm:p-8">
          <div className="space-y-1">
            <h2 className="font-display font-semibold text-xl tracking-tight">
              {t("empty-none")}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {t("empty-none-text")}
            </p>
          </div>
          <Link to="/textbooks" className={buttonVariants()}>
            {t("add-textbook")}
          </Link>
        </section>
      )}

      {chapters && chapters.length > 0 && filteredChapters.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("study-no-results")}</p>
      )}

      <div className="space-y-8">
        {groupedChapters.map(([key, group]) => (
          <section key={key} aria-label={`${group.subject}: ${group.title}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display font-semibold text-lg tracking-tight">
                {group.title}
              </h2>
              <span className="text-muted-foreground text-xs">
                {t("chapter-count", { n: group.chapters.length })}
              </span>
            </div>
            <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border bg-background/50">
              {group.chapters.map((chapter, index) => {
                const title = visibleChapterTitle(chapter.title);
                const selectedIndex = queuePicks.indexOf(chapter.id);
                const selected = selectedIndex >= 0;
                const chapterName =
                  title.section === null
                    ? title.title
                    : `${title.title} · ${t("study-section", {
                        n: title.section,
                        total:
                          sectionCounts.get(
                            `${chapter.textbookTitle}\u0000${title.title}`,
                          ) ?? 1,
                      })}`;
                return (
                  <li
                    key={chapter.id}
                    className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted font-medium text-muted-foreground text-xs">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-muted-foreground text-xs">
                        {chapter.subject}
                      </p>
                      <h3 className="truncate font-medium text-sm sm:text-base">
                        {chapterName}
                      </h3>
                    </div>
                    {queueMode ? (
                      <Button
                        variant={selected ? "secondary" : "outline"}
                        size="sm"
                        aria-pressed={selected}
                        onClick={() => togglePick(chapter.id)}
                      >
                        {selected ? (
                          <>
                            <Check aria-hidden="true" />
                            {t("queue-picked", { n: selectedIndex + 1 })}
                          </>
                        ) : (
                          t("queue-add")
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={starting !== null}
                        loading={starting === chapter.id}
                        onClick={() => void startChapter(chapter.id)}
                      >
                        {t("study-this-chapter")}
                        <ArrowRight aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {queueMode && (
        <div className="safe-area-bottom fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t bg-panel/95 backdrop-blur-md sm:bottom-0">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <p className="min-w-0 text-sm">
              {queuePicks.length === 0
                ? t("queue-pick-none")
                : queuePicks.length === 1
                  ? t("queue-pick-count-one")
                  : t("queue-pick-count", { n: queuePicks.length })}
            </p>
            <Button
              disabled={queuePicks.length === 0 || queueBusy}
              loading={queueBusy}
              onClick={() => void startQueue()}
            >
              {t("queue-start")}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
