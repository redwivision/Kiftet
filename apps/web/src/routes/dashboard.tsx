import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { Skeleton } from "@kiftet/ui/components/skeleton";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { setChapter, setSession } from "@/components/assistant";
import { ConceptGraph } from "@/components/concept-graph";
import { useLanguage } from "@/components/language-provider";
import { MasteryRing } from "@/components/mastery-ring";
import type { ChapterInfo } from "@/components/study-provider";
import { ApiError, api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getDemoUser } from "@/lib/demo";
import {
  type CachedChapter,
  cacheChapters,
  getCachedChapters,
} from "@/lib/store";
import { visibleChapterTitle } from "@/lib/textbook";
import type { Route } from "./+types/dashboard";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Your chapters — Kiftet" },
    {
      name: "description",
      content:
        "Pick a chapter and keep closing the gap — every past score is saved and waiting.",
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
  windowSeconds: number;
  /** Epoch ms when the oldest call in the rolling window ages out, else null. */
  resetAt: number | null;
  /** Seconds until that happens; 0 when there is nothing to wait for. */
  retryAfterSeconds: number;
  books: {
    demo: boolean;
    used: number;
    /** null = no cap today (signed-in), which is different from zero left. */
    limit: number | null;
    resetAt: string | null;
  };
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

/**
 * "How long until I can do this again", as something a person can act on.
 * Returns "" once the moment has passed rather than counting into negatives —
 * the poll will replace it with the real number within 15s anyway.
 */
function countdown(resetAt: number | null, now: number): string {
  if (!resetAt) return "";
  const seconds = Math.max(0, Math.ceil((resetAt - now) / 1000));
  if (seconds <= 0) return "";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

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

  // The wait is the whole point of showing the number, so it counts down in the
  // open instead of saying "a moment" and leaving the student to guess. It
  // ticks only while actually blocked — a dashboard that updates every second
  // to report that nothing changed is just battery.
  const blocked = budget?.remaining === 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!blocked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [blocked]);
  const aiCountdown = useMemo(
    () => countdown(budget?.resetAt ?? null, now),
    [budget?.resetAt, now],
  );
  // Rendered in the student's own timezone on purpose: the server's clock is
  // not theirs, so the hour it names is not when their day turns over.
  const booksResetAt = budget?.books.resetAt
    ? new Date(budget.books.resetAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  // Every visitor gets the pill, not just demo ones. The server already
  // answers for signed-in students — the check used to short-circuit on demo
  // and leave the only people who can actually run out of the only screen that
  // would have told them. A count that refreshes is also the difference
  // between "the app is broken" and "I'm out of requests".
  useEffect(() => {
    const poll = () =>
      api<AiBudget>("/ai/budget")
        .then(setBudget)
        .catch(() => {});
    poll();
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, []);

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

  const openRound = history.find((h) => h.status === "in_progress");
  const neverStudied = history.length === 0;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 max-w-2xl space-y-2">
          <p className="k-label">{t("study-room")}</p>
          <h1 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
            {t("dash-title")}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {t("dash-text")}
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:shrink-0 sm:auto-cols-max sm:grid-flow-col sm:items-center">
          <Link
            to="/textbooks"
            className={buttonVariants({
              variant: chapters && chapters.length > 0 ? "outline" : "default",
              size: "default",
              className: "w-full sm:w-auto",
            })}
          >
            {t("add-textbook")}
          </Link>
          {chapters && chapters.length > 0 && (
            <Link
              to="/syllabus"
              className={buttonVariants({
                variant: "outline",
                size: "default",
                className: "w-full sm:w-auto",
              })}
            >
              {t("study-by-syllabus")}
            </Link>
          )}
        </div>
      </header>

      {!session && getDemoUser() && (
        <div className="surface mb-8 flex animate-border-fade flex-wrap items-center justify-between gap-3 border p-4 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-gold">{t("demo-label")}</span>
            {t("demo-banner")}
          </p>
          <Link
            to="/login"
            className="font-medium text-gold text-xs underline underline-offset-4 transition-colors duration-200 hover:text-gold-soft"
          >
            {t("create-free-account")}
          </Link>
        </div>
      )}

      {chapters && chapters.length > 0 && (openRound || neverStudied) && (
        <section className="surface mb-8 flex flex-col gap-4 border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="font-display font-semibold text-xl tracking-tight">
              {openRound ? t("continue-where") : t("start-first-chapter")}
            </h2>
            <p className="max-w-md text-muted-foreground text-sm leading-6">
              {openRound
                ? t("continue-where-text")
                : t("start-first-chapter-text")}
            </p>
          </div>
          {openRound ? (
            <Link
              to={`/study/${openRound.id}`}
              className={buttonVariants({ className: "w-full sm:w-auto" })}
            >
              {t("resume-round")}
            </Link>
          ) : (
            <Button
              className="w-full sm:w-auto"
              disabled={starting === chapters[0].id}
              onClick={() => start(chapters[0])}
            >
              {starting === chapters[0].id
                ? t("opening-ellipsis")
                : t("first-chapter-cta")}
            </Button>
          )}
        </section>
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
            {budget.remaining === 0 && aiCountdown
              ? t("budget-out-in", { time: aiCountdown })
              : budget.remaining === 0
                ? t("budget-out")
                : budget.remaining <= 2
                  ? t("budget-careful")
                  : ""}
          </span>
          <span>
            {t("new-textbooks-today")}{" "}
            <strong className="font-medium text-foreground">
              {budget.books.limit === null
                ? t("textbooks-unlimited", { used: budget.books.used })
                : t("textbooks-used-of", {
                    used: budget.books.used,
                    n: budget.books.limit,
                  })}
            </strong>
            {budget.books.limit !== null &&
            budget.books.used >= budget.books.limit &&
            booksResetAt
              ? t("textbooks-reset-at", { time: booksResetAt })
              : ""}
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
                <span className="text-rust">{row.count} students</span>{" "}
                <span className="text-foreground/90">{row.conceptText}</span>
                {row.unitTitle && (
                  <span className="ml-1 text-[0.78rem] text-muted-foreground">
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
            const chapterTitle = visibleChapterTitle(chapter.title);
            const sectionCount =
              sectionCounts.get(
                `${chapter.textbookTitle}\u0000${chapterTitle.title}`,
              ) ?? 1;
            const title =
              chapterTitle.section === null
                ? chapterTitle.title
                : `${chapterTitle.title} · ${t("study-section", {
                    n: chapterTitle.section,
                    total: sectionCount,
                  })}`;
            return (
              <li
                key={chapter.id}
                className="animate-fade-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className="space-y-2">
                  <ChapterCard
                    chapter={chapter}
                    title={title}
                    starting={starting === chapter.id}
                    percent={last?.after ?? 0}
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
  title,
  starting,
  percent,
  onStart,
}: {
  chapter: ChapterInfo;
  title: string;
  starting: boolean;
  percent: number;
  onStart: () => void;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={starting}
      className="group w-full rounded-3xl border border-border/70 bg-panel/80 p-6 text-left backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-gold/45 hover:shadow-[0_20px_50px_-24px_rgba(242,239,233,0.18)] focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 dark:border-white/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="font-medium text-[0.78rem] text-gold">
            {chapter.subject}
          </p>
          <h2 className="font-display font-semibold text-foreground text-xl tracking-tight sm:text-2xl">
            {title}
          </h2>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <MasteryRing percent={percent} size={30} />
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold opacity-90 transition-opacity group-hover:opacity-100">
            {starting ? t("opening-ellipsis") : t("start-review")}
          </span>
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
      <div className="flex items-center justify-between px-1 text-[0.78rem] text-muted-foreground">
        <span>{t("session-open")}</span>
        <Link
          to={`/study/${last.id}`}
          className="font-medium text-gold underline underline-offset-4 transition-colors duration-200 hover:text-gold-soft"
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
    <p className="px-1 text-[0.78rem] text-muted-foreground">
      {t("last-session", { delta: deltaText })}
      {duration ? ` · ${duration}` : ""}
    </p>
  );
}
