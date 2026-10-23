import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ConceptGraph } from "@/components/concept-graph";
import { DemoExpiredNotice } from "@/components/demo-expired-notice";
import { useLanguage } from "@/components/language-provider";
import { PlacementPrompt } from "@/components/placement-prompt";
import type { ChapterInfo } from "@/components/study-provider";
import { TodayPlan } from "@/components/today-plan";
import { ApiError, api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { clearDemoUser, getDemoUser } from "@/lib/demo";
import { SYLLABUS_ENABLED } from "@/lib/feature-flags";
import {
  type CachedChapter,
  cacheChapters,
  getCachedChapters,
} from "@/lib/store";
import type { Route } from "./+types/dashboard";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Home — Kiftet" },
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

type QueueItem = {
  sessionId: string;
  chapterId: string;
  chapterTitle: string;
  position: number;
  status: "pending" | "in_progress" | "completed";
};

type ActiveQueue = {
  queueId: string | null;
  items: QueueItem[];
  done: number;
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
  const [history, setHistory] = useState<SessionHistory[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoExpired, setDemoExpired] = useState(false);
  const [budget, setBudget] = useState<AiBudget | null>(null);
  const [misconceptions, setMisconceptions] = useState<MisconceptionMap | null>(
    null,
  );
  const [queue, setQueue] = useState<ActiveQueue | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [placementSettled, setPlacementSettled] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);

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

  // Once a real session exists the demo identity has done its job, so drop it.
  // Sign-up and password sign-in already clear it on success; this also covers
  // the paths that can't (an OAuth redirect, or an email link landing here), so
  // a signed-in student is never left looking half-anonymous.
  useEffect(() => {
    if (session) clearDemoUser();
  }, [session]);

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
        if (err instanceof ApiError && err.demoExpired) {
          clearDemoUser();
          if (!cancelled) {
            setDemoExpired(true);
            setError(null);
          }
          return;
        }
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
    // Recent sessions power the home screen's continue card.
    api<SessionHistory[]>("/sessions")
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {});
    api<ActiveQueue>("/sessions/queue")
      .then((active) => {
        if (!cancelled) setQueue(active.queueId ? active : null);
      })
      .catch(() => {
        // Non-fatal: without it the dashboard simply offers no queue card.
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, session, sessionPending]);

  const start = async (chapterId: string) => {
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
      navigate(`/study/${sessionId}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.demoExpired) {
        clearDemoUser();
        setDemoExpired(true);
        setError(null);
        setStarting(null);
        return;
      }
      setError(apiError(err));
      setStarting(null);
    }
  };

  const dropFromQueue = async (sessionId: string) => {
    if (!queue) return;
    const before = queue;
    // Optimistic: dropping a chapter the student never opened has no
    // consequences to confirm, and a spinner on a chip would be heavier than
    // the act. A failure puts it back and says why.
    setQueue({
      ...queue,
      items: queue.items.filter((item) => item.sessionId !== sessionId),
    });
    try {
      await api(`/sessions/${sessionId}/queue`, { method: "DELETE" });
    } catch (err) {
      setQueue(before);
      setQueueError(apiError(err));
    }
  };

  const openRound = history?.find((h) => h.status === "in_progress");
  const completedRounds =
    history?.filter((h) => h.status === "completed") ?? [];
  const latestCompleted = completedRounds[0];

  if (demoExpired) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <DemoExpiredNotice />
      </main>
    );
  }

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
            to={chapters && chapters.length === 0 ? "/textbooks" : "/study"}
            className={buttonVariants({
              variant: "default",
              size: "default",
              className: "w-full sm:w-auto",
            })}
          >
            {chapters && chapters.length === 0
              ? t("add-textbook")
              : t("browse-chapters")}
          </Link>
          {chapters && chapters.length > 0 && (
            <Link
              to="/textbooks"
              className={buttonVariants({
                variant: "outline",
                size: "default",
                className: "w-full sm:w-auto",
              })}
            >
              {t("manage-books")}
            </Link>
          )}
          {SYLLABUS_ENABLED && chapters && chapters.length > 0 && (
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

      {session && (
        <TodayPlan
          key={planRevision}
          onStartChapter={(chapterId) => void start(chapterId)}
          starting={starting}
        />
      )}

      {session && !placementSettled && (
        <PlacementPrompt
          onSettled={() => {
            setPlacementSettled(true);
            setPlanRevision((revision) => revision + 1);
          }}
        />
      )}

      {!session && getDemoUser() && (
        <div className="surface mb-8 flex animate-border-fade flex-wrap items-center justify-between gap-3 border p-4 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-gold">{t("demo-label")}</span>
            {t("demo-banner")}
          </p>
          <Link
            to="/login?signup=1"
            className="font-medium text-gold text-xs underline underline-offset-4 transition-colors duration-200 hover:text-gold-soft"
          >
            {t("create-free-account")}
          </Link>
        </div>
      )}

      {openRound && (
        <section className="surface mb-8 flex flex-col gap-4 border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="font-display font-semibold text-xl tracking-tight">
              {t("continue-where")}
            </h2>
            <p className="max-w-md text-muted-foreground text-sm leading-6">
              {t("continue-where-text")}
            </p>
          </div>
          <Link
            to={`/study/${openRound.id}`}
            className={buttonVariants({ className: "w-full sm:w-auto" })}
          >
            {t("resume-round")}
          </Link>
        </section>
      )}

      {history !== null && (
        <section className="surface mb-8 flex flex-col gap-4 border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="space-y-1">
            <p className="k-label">{t("home-progress")}</p>
            <h2 className="font-display font-semibold text-lg tracking-tight">
              {t("home-completed-count", { n: completedRounds.length })}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {latestCompleted &&
              latestCompleted.before !== null &&
              latestCompleted.after !== null
                ? t("home-latest-score", {
                    before: latestCompleted.before,
                    after: latestCompleted.after,
                  })
                : t("home-progress-note")}
            </p>
          </div>
          <Link
            to="/study"
            className={buttonVariants({
              variant: "outline",
              className: "w-full sm:w-auto",
            })}
          >
            {t("browse-chapters")}
          </Link>
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

      {queue && queue.items.length > 0 && (
        <section className="inner-surface mb-8 border p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="k-label">{t("queue-title")}</p>
              <h2 className="font-display font-semibold text-lg tracking-tight">
                {t("queue-left", { n: queue.items.length })}
              </h2>
              {queue.done > 0 && (
                <p className="text-muted-foreground text-sm">
                  {t("queue-done", { n: queue.done })}
                </p>
              )}
            </div>
            {queueError && (
              <p className="text-rust text-sm" role="alert">
                {queueError}
              </p>
            )}
          </div>
          <ol className="mt-4 space-y-2">
            {queue.items.map((item, i) => (
              <li
                key={item.sessionId}
                className="flex items-center gap-3 rounded-2xl border border-border/70 px-3 py-2 text-sm dark:border-white/10"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10 font-medium text-[0.72rem] text-gold">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {item.chapterTitle}
                </span>
                {item.status === "in_progress" ? (
                  <Link
                    to={`/study/${item.sessionId}`}
                    className="shrink-0 font-medium text-gold text-xs underline underline-offset-4 transition-colors duration-200 hover:text-gold-soft"
                  >
                    {t("queue-continue")}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-label={t("queue-remove", {
                      title: item.chapterTitle,
                    })}
                    title={t("queue-remove", { title: item.chapterTitle })}
                    className="shrink-0 rounded-full px-2 text-muted-foreground transition-colors duration-200 hover:text-rust"
                    onClick={() => void dropFromQueue(item.sessionId)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
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

      {error ? (
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
      ) : null}

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
        <section className="surface flex flex-col gap-4 border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="k-label">{t("browse-chapters")}</p>
            <h2 className="font-display font-semibold text-xl tracking-tight">
              {t("chapter-count", { n: chapters.length })}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {t("home-study-prompt")}
            </p>
          </div>
          <Link
            to="/study"
            className={buttonVariants({ className: "w-full sm:w-auto" })}
          >
            {t("browse-chapters")}
          </Link>
        </section>
      )}
    </main>
  );
}
