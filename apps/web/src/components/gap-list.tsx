import { cn } from "@kiftet/ui/lib/utils";
import { Check, CircleAlert, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

interface CoverageViewProps {
  covered: string[];
  missing: string[];
  misconceptions?: string[];
  weights?: Record<string, number>;
  className?: string;
}

/**
 * The one place the design spends its boldness.
 *
 * Before/after coverage is shown as a segmented strip: each concept the
 * chapter is checked against is one segment. Solid concepts sit tall and
 * filled (bright ivory). Missing concepts sit low and open (rust) — the gap is
 * legible at a glance, not just scored. Bar height follows the concept's
 * importance weight, so a heavy missing idea looks like the hole it is.
 * Misconceptions (the ideas the student stated WRONG, not just skipped)
 * get their own rust warning band below.
 *
 * This is the moment the whole product is selling, so it is fully bilingual —
 * an Amharic reader used to hit English labels on the one screen that explains
 * what Kiftet just decided about their own understanding.
 */
export function CoverageView({
  covered,
  missing,
  misconceptions = [],
  weights = {},
  className,
}: CoverageViewProps) {
  const { t } = useLanguage();
  const total = covered.length + missing.length;
  const coveredPct = total > 0 ? Math.round((covered.length / total) * 100) : 0;
  const weightOf = (concept: string) => weights[concept] ?? 1;
  const heightFor = (concept: string) =>
    `${18 + Math.round(((Math.min(5, weightOf(concept)) - 1) / 4) * 82)}%`;
  const titleFor = (concept: string) =>
    weightOf(concept) > 1
      ? `${concept} · ${t("cov-importance", { n: weightOf(concept) })}`
      : concept;
  const ariaLabel = [
    t("cov-aria", { covered: covered.length, total, missing: missing.length }),
    misconceptions.length
      ? t("cov-aria-wrong", { n: misconceptions.length })
      : "",
  ]
    .join("")
    .trim();

  return (
    <div className={cn("space-y-6", className)}>
      {/* Score */}
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="font-display font-semibold text-5xl text-foreground tracking-[-0.03em] sm:text-6xl">
            {coveredPct}
            <span className="text-2xl text-muted-foreground">%</span>
          </p>
          <p className="text-muted-foreground text-sm">{t("cov-checked")}</p>
        </div>
        <div className="pb-1.5 text-right text-[0.78rem] text-muted-foreground leading-5">
          <p>
            <span className="mr-1 inline-block size-2 rounded-full bg-sage align-baseline" />
            {t("cov-solid")} · {covered.length}
          </p>
          <p>
            <span className="mr-1 inline-block size-2 rounded-full border border-rust align-baseline" />
            {t("cov-gap")} · {missing.length}
          </p>
          {misconceptions.length > 0 && (
            <p>
              <span className="mr-1 inline-block size-2 rounded-full border border-rust bg-rust/25 align-baseline" />
              {t("cov-wrong")} · {misconceptions.length}
            </p>
          )}
        </div>
      </div>

      {/* The gap, segmented by importance */}
      <div
        className="flex h-16 items-end gap-1.5"
        role="img"
        aria-label={ariaLabel}
      >
        {covered.map((concept, i) => (
          <span
            key={concept}
            title={titleFor(concept)}
            className="h-full flex-1 animate-beam rounded-t-md bg-sage/85 transition-colors hover:bg-sage"
            style={{ animationDelay: `${0.08 * i}s` }}
          />
        ))}
        {missing.map((concept, i) => (
          <span
            key={concept}
            title={titleFor(concept)}
            className="flex-1 animate-beam rounded-t-md border border-rust/70 border-dashed bg-rust/10 transition-colors hover:bg-rust/20"
            style={{
              animationDelay: `${0.08 * (covered.length + i)}s`,
              height: heightFor(concept),
            }}
          />
        ))}
        {total === 0 && (
          <span className="flex h-2 w-full animate-pulse-soft rounded-full bg-muted" />
        )}
      </div>

      {/* The diagnosis, spelled out */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="inner-surface p-4">
          <p className="k-label mb-3 flex items-center gap-2">
            <Check className="size-3.5 text-sage" aria-hidden="true" />
            {t("cov-already-solid")}
          </p>
          {covered.length > 0 ? (
            <ul className="space-y-2">
              {covered.map((concept) => (
                <li
                  key={concept}
                  className="flex items-baseline gap-2 text-foreground/90 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-sage"
                  />
                  {concept}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t("cov-none-yet")}</p>
          )}
        </div>

        <div className="inner-surface border-rust/25 p-4 dark:border-rust/30">
          <p className="k-label mb-3 flex items-center gap-2 text-rust">
            <CircleAlert className="size-3.5" aria-hidden="true" />
            {t("cov-needs-work")}
          </p>
          {missing.length > 0 ? (
            <ul className="space-y-2">
              {missing.map((concept) => (
                <li
                  key={concept}
                  className="flex items-baseline gap-2 text-foreground/90 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1.5 shrink-0 rounded-full border border-rust"
                  />
                  {concept}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sage text-sm">{t("cov-all-solid")}</p>
          )}
        </div>
      </div>

      {/* Misconceptions: the student stated a wrong idea, not just skipped it */}
      {misconceptions.length > 0 && (
        <div className="inner-surface border-rust/40 p-4 dark:border-rust/50">
          <p className="k-label mb-3 flex items-center gap-2 text-rust">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            {t("cov-wrong-title")}
          </p>
          <p className="mb-3 text-muted-foreground text-sm leading-6">
            {t("cov-wrong-text")}
          </p>
          <ul className="space-y-2">
            {misconceptions.map((concept) => (
              <li
                key={concept}
                className="flex items-baseline gap-2 text-foreground/90 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="mt-[7px] size-1.5 shrink-0 rounded-full bg-rust/60"
                />
                {concept}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
