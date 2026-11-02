import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { Skeleton } from "@kiftet/ui/components/skeleton";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { useLanguage } from "@/components/language-provider";
import { api, apiError } from "@/lib/api";
import {
  daysUntilExam,
  type TodayPlan as TodayPlanData,
} from "@/lib/today-plan";

export function TodayPlan({
  onStartChapter,
  starting,
}: {
  onStartChapter: (chapterId: string) => void;
  starting: string | null;
}) {
  const [reload, setReload] = useState(0);

  return (
    <TodayPlanContent
      key={reload}
      onRetry={() => setReload((value) => value + 1)}
      onStartChapter={onStartChapter}
      starting={starting}
    />
  );
}

function TodayPlanContent({
  onRetry,
  onStartChapter,
  starting,
}: {
  onRetry: () => void;
  onStartChapter: (chapterId: string) => void;
  starting: string | null;
}) {
  const { lang, t } = useLanguage();
  const [plan, setPlan] = useState<TodayPlanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<TodayPlanData>("/plan/today")
      .then((loaded) => {
        if (!cancelled) setPlan(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const frame = "surface mb-8 border p-5 sm:p-6";
  if (loading) {
    return (
      <section className={frame} aria-label={t("today-plan-title")}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-6 w-48" />
        <Skeleton className="mt-3 h-4 w-3/4" />
      </section>
    );
  }

  if (error) {
    return (
      <section className={frame} aria-labelledby="today-plan-title">
        <p className="k-label">{t("today-plan-label")}</p>
        <h2
          id="today-plan-title"
          className="mt-1 font-display font-semibold text-xl tracking-tight"
        >
          {t("today-plan-title")}
        </h2>
        <p role="alert" className="mt-3 text-muted-foreground text-sm">
          {t("today-plan-error", { error })}
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {t("retry")}
        </Button>
      </section>
    );
  }

  if (!plan) return null;

  const examDays = plan.examDate === null ? null : daysUntilExam(plan.examDate);
  const examDate =
    plan.examDate === null
      ? null
      : new Date(`${plan.examDate}T00:00:00`).toLocaleDateString(
          lang === "am" ? "am-ET" : "en-ET",
          { year: "numeric", month: "long", day: "numeric" },
        );
  const learn = plan.learn;
  const nextLearn =
    plan.positioned && learn && learn.remainingInChapter > 0 ? learn : null;
  const nextReview = plan.review[0] ?? null;
  const showReviewAsPrimary = !nextLearn && nextReview !== null;

  return (
    <section className={frame} aria-labelledby="today-plan-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="k-label">{t("today-plan-label")}</p>
          <h2
            id="today-plan-title"
            className="mt-1 font-display font-semibold text-xl tracking-tight"
          >
            {t("today-plan-title")}
          </h2>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">
            {t("today-plan-minutes", { n: plan.minutes })}
          </p>
          {plan.examDate && examDate && (
            <p className="text-muted-foreground">
              {examDays === null
                ? t("today-exam-date", { date: examDate })
                : examDays > 0
                  ? examDays === 1
                    ? t("today-exam-one-day")
                    : t("today-exam-days", { n: examDays })
                  : examDays === 0
                    ? t("today-exam-today")
                    : t("today-exam-past")}
            </p>
          )}
        </div>
      </div>

      {plan.book && (
        <p className="mt-3 text-muted-foreground text-sm">
          {t("today-plan-book", { title: plan.book.title })}
        </p>
      )}

      {nextLearn ? (
        <section className="mt-5 rounded-2xl border border-gold/30 bg-gold/[0.04] p-4 sm:p-5">
          <p className="k-label">{t("today-plan-learn")}</p>
          <h3 className="mt-1 font-display font-semibold text-xl tracking-tight">
            {nextLearn.sectionTitle ?? nextLearn.chapterTitle}
          </h3>
          {nextLearn.sectionTitle && (
            <p className="mt-1 text-muted-foreground text-sm">
              {nextLearn.chapterTitle}
            </p>
          )}
          <Button
            className="mt-4"
            disabled={starting !== null}
            onClick={() => onStartChapter(nextLearn.chapterId)}
          >
            {starting === nextLearn.chapterId
              ? t("starting-study")
              : t("today-plan-start-learn")}
          </Button>
        </section>
      ) : showReviewAsPrimary && nextReview ? (
        <section className="mt-5 rounded-2xl border border-gold/30 bg-gold/[0.04] p-4 sm:p-5">
          <p className="k-label">{t("today-plan-review")}</p>
          <h3 className="mt-1 font-display font-semibold text-xl tracking-tight">
            {nextReview.concept}
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {nextReview.chapterTitle}
          </p>
          <p className="mt-2 text-muted-foreground text-xs leading-5">
            {plan.reviewReason === "exam"
              ? t("today-plan-review-exam")
              : t("today-plan-review-preference")}
          </p>
          <Button
            className="mt-4"
            disabled={starting !== null}
            onClick={() => onStartChapter(nextReview.chapterId)}
          >
            {starting === nextReview.chapterId
              ? t("starting-study")
              : t("today-plan-start-review")}
          </Button>
        </section>
      ) : !plan.positioned ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/40 p-4">
          <p className="max-w-xl text-muted-foreground text-sm leading-6">
            {t("today-plan-no-position")}
          </p>
          <Link
            to="/settings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("today-plan-set-position")}
          </Link>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-border/70 bg-background/40 p-4">
          <p className="text-muted-foreground text-sm leading-6">
            {t("today-plan-chapter-done")}
          </p>
          <Link
            to="/settings"
            className="mt-2 inline-block font-medium text-gold text-sm underline underline-offset-4"
          >
            {t("today-plan-set-position")}
          </Link>
        </div>
      )}

      {plan.review.length > (showReviewAsPrimary ? 1 : 0) ? (
        <details className="mt-4 rounded-2xl border border-border/70 px-4 py-3">
          <summary className="cursor-pointer text-muted-foreground text-sm">
            {t("today-plan-more-review", {
              n: plan.review.length - (showReviewAsPrimary ? 1 : 0),
            })}
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {plan.review.slice(showReviewAsPrimary ? 1 : 0).map((item) => (
              <li
                key={`${item.chapterId}:${item.concept}`}
                className="flex flex-wrap items-center justify-between gap-3 border-border/50 border-t pt-3"
              >
                <p className="min-w-0 text-sm">
                  <span className="block font-medium">{item.concept}</span>
                  <span className="block text-muted-foreground text-xs">
                    {item.chapterTitle}
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={starting !== null}
                  onClick={() => onStartChapter(item.chapterId)}
                >
                  {starting === item.chapterId
                    ? t("starting-study")
                    : t("today-plan-start-review")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {nextLearn && plan.review.length === 0 && (
        <p className="mt-3 text-muted-foreground text-xs leading-5">
          {t("today-plan-no-review")}
        </p>
      )}
      {!plan.positioned && showReviewAsPrimary && (
        <Link
          to="/settings"
          className="mt-3 inline-block font-medium text-gold text-sm underline underline-offset-4"
        >
          {t("today-plan-set-position")}
        </Link>
      )}
    </section>
  );
}
