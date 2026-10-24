import { Button } from "@kiftet/ui/components/button";
import { Skeleton } from "@kiftet/ui/components/skeleton";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { DemoExpiredNotice } from "@/components/demo-expired-notice";
import { useLanguage } from "@/components/language-provider";
import { MasteryRing } from "@/components/mastery-ring";
import { useOnline } from "@/hooks/use-online";
import { useReconnectGrace } from "@/hooks/use-reconnect-grace";
import { canContinueOffline } from "@/lib/account-hint";
import { ApiError, api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { clearDemoUser, getDemoUser } from "@/lib/demo";
import { SYLLABUS_ENABLED } from "@/lib/feature-flags";
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
  coverage: {
    before: number | null;
    after: number | null;
    delta: number | null;
  } | null;
};

type Unit = {
  id: string;
  unitNumber: number;
  title: string;
  description: string | null;
  /** The official MoE period allocation for this unit, when it has
   *  been transcribed from the syllabus document. `null` means "not stated in
   *  the source" — it is NOT zero, and the UI must not imply otherwise. */
  periods: number | null;
  periodsSource: string | null;
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
  sourceNote?: string | null;
  units: Unit[];
  unassigned: { id: string; title: string; textbookTitle: string }[];
};

export default function Syllabus() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const online = useOnline();
  const reconnecting = useReconnectGrace(online);
  const { t } = useLanguage();

  const [catalog, setCatalog] = useState<SyllabusRow[] | null>(null);
  const [detail, setDetail] = useState<SyllabusDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [savingUnit, setSavingUnit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoExpired, setDemoExpired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reportApiError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.demoExpired) {
      clearDemoUser();
      setDemoExpired(true);
      setError(null);
      return;
    }
    setError(apiError(err));
  }, []);

  useEffect(() => {
    // The syllabus surface is parked (see `SYLLABUS_ENABLED`): focus is the
    // uploaded textbook. A direct URL hit goes back to the chapters rather than
    // loading a view the student cannot act on.
    if (!SYLLABUS_ENABLED) {
      navigate("/dashboard", { replace: true });
      return;
    }
    const offlineAccount = canContinueOffline(online);
    const canStay = offlineAccount || reconnecting;
    if (!sessionPending && !session && !getDemoUser() && !canStay) {
      navigate("/login");
      return;
    }
    if (sessionPending || (!session && !getDemoUser() && !canStay)) {
      return;
    }
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
          reportApiError(err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, online, reconnecting, reportApiError, session, sessionPending]);

  const current = useMemo(
    () =>
      catalog?.find(
        (r) => r.subject === detail?.subject && r.grade === detail?.grade,
      ) ?? null,
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
      reportApiError(err);
    } finally {
      setLoading(false);
    }
  };

  const start = async (chapter: { id: string; title: string }) => {
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
      navigate(`/study/${sessionId}`, { replace: true });
    } catch (err) {
      reportApiError(err);
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
      setNotice(unitId ? t("unit-moved") : t("unit-unassigned"));
      if (detail) {
        const fresh = await api<SyllabusDetail>(
          `/syllabus/${encodeURIComponent(detail.subject)}/${detail.grade}`,
        );
        setDetail(fresh);
      }
    } catch (err) {
      reportApiError(err);
    } finally {
      setSavingUnit(null);
    }
  };

  // Parked: nothing renders while the redirect above runs, so a disabled
  // syllabus never flashes its skeleton or fires its data fetches.
  if (!SYLLABUS_ENABLED) return null;

  if (demoExpired) {
    return (
      <main className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-6 sm:py-10 lg:px-8">
        <DemoExpiredNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-8 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <p className="k-label">{t("study-by-syllabus")}</p>
            <h1 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
              {t("syllabus-title")}
            </h1>
            <p className="text-muted-foreground text-sm leading-6">
              {t("syllabus-text")}
            </p>
          </div>
          <Link to="/" className="hidden shrink-0 sm:block">
            <Button variant="outline" size="sm">
              {t("back-dash")}
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
                aria-pressed={
                  row.subject === current.subject && row.grade === current.grade
                }
                className={
                  row.subject === current.subject && row.grade === current.grade
                    ? "rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 font-medium text-[0.78rem] text-gold"
                    : "rounded-full border border-border/70 px-3.5 py-1.5 text-[0.78rem] text-muted-foreground transition-colors duration-200 hover:border-gold/40 hover:text-gold"
                }
              >
                {row.title}
              </button>
            ))}
          </div>
        )}
      </header>

      {error ? (
        <div className="inner-surface mb-8 border border-rust/40 p-4 text-sm">
          <p className="font-medium text-rust">{t("syllabus-error")}</p>
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

      {notice && !error && (
        <p className="inner-surface mb-8 border border-sage/30 p-3 text-sage text-sm">
          {notice}
        </p>
      )}

      {!catalog && !error && (
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <UnitCardSkeleton key={i} />
          ))}
        </div>
      )}

      {catalog && catalog.length === 0 && (
        <div className="surface p-10 text-center text-muted-foreground text-sm">
          {t("syllabus-empty")}
        </div>
      )}

      {catalog && catalog.length > 0 && (
        <>
          {detail?.source === "provisional" && (
            <p className="inner-surface mb-6 border border-gold/30 bg-gold/5 p-3 text-muted-foreground text-xs">
              <span className="font-medium text-gold">
                {t("unit-provisional")}
              </span>{" "}
              {t("unit-provisional-text")}
            </p>
          )}
          {detail?.source !== "provisional" && detail?.sourceNote && (
            <p className="mb-6 text-muted-foreground text-xs">
              <span className="font-medium text-sage">
                {t("unit-verified")}
              </span>{" "}
              {t("unit-verified-text", { source: detail.sourceNote })}
            </p>
          )}

          {loading && (
            <div className="space-y-6">
              {[0, 1, 2].map((i) => (
                <UnitCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!loading && detail && detail.units.length === 0 && (
            <div className="surface p-10 text-center text-muted-foreground text-sm">
              {t("syllabus-no-units")}
            </div>
          )}

          {!loading &&
            detail &&
            detail.units.map((unit, i) => (
              <section
                key={unit.id}
                className="mb-6 animate-fade-up"
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
            <section className="inner-surface animate-fade-up border border-border/70 border-dashed p-5">
              <h2 className="font-display font-semibold text-lg tracking-tight">
                {t("unassigned-title")}
              </h2>
              <p className="mt-1 text-muted-foreground text-sm">
                {t("unassigned-text", { subject: detail.subject })}
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
                      <p className="truncate text-[0.78rem] text-muted-foreground">
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

/** The unit list's loading state. It mirrors the real card — header, ring on
 *  the right, and its chapter rows — so the wait reads as the syllabus
 *  arriving rather than a wall of grey boxes. */
function UnitCardSkeleton() {
  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-border/60 border-b p-5">
        <div className="w-full space-y-2.5">
          <Skeleton className="h-3 w-20 rounded-full bg-muted/60 dark:bg-white/[0.05]" />
          <Skeleton className="h-6 w-1/2 rounded-lg bg-muted/60 dark:bg-white/[0.05]" />
          <Skeleton className="h-4 w-2/3 rounded-lg bg-muted/60 dark:bg-white/[0.05]" />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <MasteryRing percent={0} size={44} />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-20 rounded-full bg-muted/60 dark:bg-white/[0.05]" />
            <Skeleton className="h-3 w-12 rounded-full bg-muted/60 dark:bg-white/[0.05]" />
          </div>
        </div>
      </div>
      <ul className="divide-y divide-border/50">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="w-2/3 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded-lg bg-muted/60 dark:bg-white/[0.05]" />
              <Skeleton className="h-3 w-1/2 rounded-full bg-muted/60 dark:bg-white/[0.05]" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full bg-muted/60 dark:bg-white/[0.05]" />
          </li>
        ))}
      </ul>
    </div>
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
  const { t } = useLanguage();
  const pct =
    unit.total > 0 ? Math.round((unit.covered / unit.total) * 100) : 0;

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-border/60 border-b p-5">
        <div className="space-y-1">
          <p className="k-label">
            {t("unit-of-label", {
              n: String(unit.unitNumber).padStart(2, "0"),
            })}
          </p>
          <h2 className="font-display font-semibold text-xl tracking-tight">
            {unit.title}
          </h2>
          {unit.description && (
            <p className="max-w-lg text-muted-foreground text-sm">
              {unit.description}
            </p>
          )}
          {/* Official weighting, when we have it. This is the state's own
              allocation transcribed from the syllabus document — the reason we
              can tell a student what to study first instead of guessing.
              Rendered only when a figure exists, so an untranscribed unit never
              implies a weighting we don't actually have. */}
          {unit.periods != null && (
            <p
              className="text-muted-foreground text-xs"
              title={unit.periodsSource ?? undefined}
            >
              {t("unit-periods", { n: unit.periods })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {unit.total > 0 ? (
            <>
              <MasteryRing percent={pct} size={44} />
              <p className="text-right">
                <span
                  className={`font-medium text-sm ${
                    pct >= 100
                      ? "text-sage"
                      : pct > 0
                        ? "text-gold"
                        : "text-muted-foreground"
                  }`}
                >
                  {t("chapter-covered", {
                    covered: unit.covered,
                    total: unit.total,
                  })}
                </span>
                <span className="block text-[0.78rem] text-muted-foreground">
                  {t("pct-unit", { pct })}
                </span>
              </p>
            </>
          ) : (
            <p className="text-[0.78rem] text-muted-foreground">
              {t("no-chapters-mapped")}
            </p>
          )}
        </div>
      </div>

      {unit.chapters.length === 0 ? (
        <div className="p-5 text-muted-foreground text-sm">
          {t("map-chapter-text")}
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
                  <p className="truncate text-[0.78rem] text-muted-foreground">
                    {ch.textbookTitle}
                  </p>
                </div>
                {/* Three controls in one unwrapped row: the coverage pill, a
                    Study button and a native select whose option text is
                    "Unit {n} — {title}". A real chapter title runs 200px+, so
                    the row was ~410px inside a 311px card and the select ran
                    off the edge. Wrapping plus a width cap on the select keeps
                    all three reachable without a horizontal scroll. */}
                <div className="flex flex-wrap items-center gap-2">
                  <MasteryRing percent={ch.coverage?.after ?? 0} size={28} />
                  {covered ? (
                    <span className="shrink-0 rounded-full border border-sage/30 bg-sage/10 px-2.5 py-0.5 font-medium text-[0.78rem] text-sage">
                      {ch.coverage?.before ?? "—"}% → {ch.coverage?.after}%
                    </span>
                  ) : (
                    <span className="shrink-0 px-2.5 py-0.5 text-[0.78rem] text-muted-foreground">
                      {t("not-studied")}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStart(ch)}
                    disabled={starting === ch.id}
                  >
                    {starting === ch.id ? t("opening-ellipsis") : t("study")}
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
  const { t } = useLanguage();
  return (
    <select
      value={saving ? "" : (currentUnit ?? "")}
      disabled={saving}
      aria-label={t("map-aria")}
      onChange={(e) => onChange(e.target.value || null)}
      className="max-w-full rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-[0.78rem] text-foreground outline-none focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 disabled:opacity-50 sm:max-w-[16rem]"
    >
      <option value="">{t("no-unit")}</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {t("unit-option", { n: u.unitNumber, title: u.title })}
        </option>
      ))}
    </select>
  );
}
