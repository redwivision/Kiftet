import { cn } from "@kiftet/ui/lib/utils";
import { Check, CircleAlert, Flame, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { ConceptRing, MasteryRing } from "@/components/mastery-ring";
import type { MasteryLevel } from "@/components/study-provider";
import {
  byImportance,
  type ConceptMeta,
  levelOf,
  triage,
  weightedMastery,
} from "@/lib/mastery";

interface CoverageViewProps {
  covered: string[];
  missing: string[];
  misconceptions?: string[];
  /** The chapter checklist's per-concept weight and misconception flag, keyed
   *  by conceptText. Both are needed: the weight sets the bar's height, and the
   *  flag keeps known traps out of the weighted denominator. */
  meta?: Record<string, ConceptMeta>;
  /** Phase 11: per-concept levels. Optional so a caller that only has the
   *  three flat lists (the landing page's illustration) still renders — in
   *  that case the levels are inferred from which list a name is in. */
  mastery?: Record<string, MasteryLevel>;
  /** The server's weighted score. Authoritative when present; recomputed from
   *  `mastery` only when a caller has no score to show. */
  score?: number;
  estimated?: boolean;
  className?: string;
}

/**
 * The one place the design spends its boldness.
 *
 * Every concept the chapter is checked against is one segment of a strip, and
 * each segment carries two readings at once:
 *
 *  - **how tall it stands** is how much the concept matters (its importance
 *    weight), so a heavy gap looks like the hole it is;
 *  - **how much of it is filled** is how much of it the student can actually
 *    answer. Solid, half-raised, and empty are therefore different heights of
 *    the same kind, not three colours in a row.
 *
 * Level 1 — raised but not explained — used to be filed as "covered" and drawn
 * in the same solid sage as a correct answer. That is the exact flattening this
 * product exists to undo, so it now gets its own state: a half-filled bar in
 * gold, sitting in a gold panel, described as the cheapest win on the page.
 * Level 2 is a wrong belief, so it is a full bar in rust and is never counted as
 * progress.
 *
 * The headline number is the *weighted* score, which is what the server graded.
 * It used to be a flat count of list lengths sitting directly above bars whose
 * heights came from weights — the number and the picture disagreed, and both
 * disagreed with the stored score.
 */
export function CoverageView({
  covered,
  missing,
  misconceptions = [],
  meta: given = {},
  mastery,
  score,
  estimated = false,
  className,
}: CoverageViewProps) {
  const { t } = useLanguage();

  // Anything the caller did not describe (a name that only ever appeared in a
  // gap list) is treated as a weight-1 real concept, so the denominator and the
  // bar heights are always defined.
  const meta: Record<string, ConceptMeta> = { ...given };
  for (const name of [...covered, ...missing, ...misconceptions]) {
    meta[name] ??= { weight: 1, isMisconception: false };
  }
  const weightOf = (concept: string) => meta[concept]?.weight ?? 1;

  // Levels come from the map when we have one; otherwise they are inferred from
  // which list a name landed in, so the landing illustration still means
  // something.
  const levels: Record<string, MasteryLevel> = mastery ?? {
    ...Object.fromEntries(covered.map((c) => [c, 3] as const)),
    ...Object.fromEntries(
      [...missing, ...misconceptions].map((c) => [c, 0] as const),
    ),
  };

  // Every concept that has to be accounted for. When a mastery map exists it is
  // the authority — a level-1 concept appears in none of the three lists (it is
  // neither "covered" nor "missing"), so building this from the lists alone
  // would silently drop the exact state this screen exists to show.
  const every = [
    ...new Set([
      ...Object.keys(levels),
      ...covered,
      ...missing,
      ...misconceptions,
    ]),
  ];
  const groups = triage(levels, every);

  const pct = Math.round((score ?? weightedMastery(levels, meta, every)) * 100);

  // Importance reads as height, mastery as fill, so the strip stays scannable.
  const heightFor = (concept: string) => {
    const w = Math.min(5, Math.max(1, weightOf(concept)));
    return `${22 + Math.round(((w - 1) / 4) * 78)}%`;
  };
  const fillFor = (concept: string) => {
    const level = levelOf(levels, concept);
    return `${[0, 0.45, 1, 1][level] * 100}%`;
  };
  const titleFor = (concept: string) =>
    weightOf(concept) > 1
      ? `${concept} · ${t("cov-importance", { n: weightOf(concept) })}`
      : concept;

  const strip = [
    ...groups.solid,
    ...groups.almost,
    ...groups.wrong,
    ...groups.open,
  ];
  const ariaLabel = [
    t("cov-aria", {
      covered: groups.solid.length,
      total: strip.length,
      missing: groups.open.length,
    }),
    groups.almost.length
      ? t("cov-aria-almost", { n: groups.almost.length })
      : "",
    groups.wrong.length ? t("cov-aria-wrong", { n: groups.wrong.length }) : "",
  ]
    .join("")
    .trim();

  return (
    <div className={cn("space-y-6", className)}>
      {/* The score, as a gap closing */}
      <div className="flex items-center gap-5">
        <MasteryRing percent={pct} estimated={estimated} />
        <div className="min-w-0 space-y-1">
          <p className="font-display font-semibold text-4xl text-foreground tabular-nums tracking-[-0.03em] sm:text-5xl">
            {pct}
            <span className="text-muted-foreground text-xl">%</span>
          </p>
          <p className="text-muted-foreground text-sm">{t("cov-checked")}</p>
          <p className="text-muted-foreground text-xs">
            {t("cov-legend-sage")} · {t("cov-legend-gold")} ·{" "}
            {t("cov-legend-rust")} · {t("cov-legend-open")}
          </p>
        </div>
      </div>

      {/* The gap, segmented by importance, filled by mastery */}
      <div
        className="flex h-16 items-end gap-1.5"
        role="img"
        aria-label={ariaLabel}
      >
        {strip.map((concept, i) => {
          const level = levelOf(levels, concept);
          const isOpen = level === 0;
          return (
            <span
              key={concept}
              title={titleFor(concept)}
              className={cn(
                "relative flex flex-1 animate-beam overflow-hidden rounded-t-md",
                isOpen
                  ? "border border-rust/70 border-dashed bg-rust/10"
                  : level === 2
                    ? "bg-rust/15"
                    : "bg-sage/15",
              )}
              style={{
                animationDelay: `${0.08 * i}s`,
                height: isOpen ? heightFor(concept) : "100%",
              }}
            >
              {!isOpen && (
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0",
                    level === 2
                      ? "bg-rust/70"
                      : level === 1
                        ? "bg-gold/80"
                        : "bg-sage/85",
                  )}
                  style={{ height: fillFor(concept) }}
                />
              )}
            </span>
          );
        })}
        {strip.length === 0 && (
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
          {groups.solid.length > 0 ? (
            <ul className="space-y-2">
              {groups.solid.map((concept) => (
                <li
                  key={concept}
                  className="flex items-baseline gap-2 text-foreground/90 text-sm"
                >
                  <ConceptRing
                    level={3}
                    size={16}
                    className="translate-y-[3px]"
                  />
                  <span className="min-w-0 break-words">{concept}</span>
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
          {groups.open.length > 0 ? (
            <ul className="space-y-2">
              {groups.open.map((concept) => (
                <li
                  key={concept}
                  className="flex items-baseline gap-2 text-foreground/90 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1.5 shrink-0 rounded-full border border-rust"
                  />
                  <span className="min-w-0 break-words">{concept}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sage text-sm">{t("cov-all-solid")}</p>
          )}
        </div>
      </div>

      {/* Half-raised: the cheapest win on the page, so it gets its own room */}
      {groups.almost.length > 0 && (
        <div className="inner-surface border-gold/30 p-4">
          <p className="k-label mb-2 flex items-center gap-2 text-gold">
            <Flame className="size-3.5" aria-hidden="true" />
            {t("cov-almost-title")}
          </p>
          <p className="mb-3 text-muted-foreground text-sm leading-6">
            {t("cov-almost-text")}
          </p>
          <ul className="space-y-2">
            {groups.almost.map((concept) => (
              <li
                key={concept}
                className="flex items-baseline gap-2 text-foreground/90 text-sm"
              >
                <ConceptRing
                  level={1}
                  size={16}
                  className="translate-y-[3px]"
                />
                <span className="min-w-0 break-words">{concept}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Misconceptions: the student stated a wrong idea, not just skipped it */}
      {groups.wrong.length > 0 && (
        <div className="inner-surface border-rust/40 p-4 dark:border-rust/50">
          <p className="k-label mb-3 flex items-center gap-2 text-rust">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            {t("cov-wrong-title")}
          </p>
          <p className="mb-3 text-muted-foreground text-sm leading-6">
            {t("cov-wrong-text")}
          </p>
          <ul className="space-y-2">
            {byImportance(groups.wrong, meta).map((concept) => (
              <li
                key={concept}
                className="flex items-baseline gap-2 text-foreground/90 text-sm"
              >
                <ConceptRing
                  level={2}
                  size={16}
                  className="translate-y-[3px]"
                />
                <span className="min-w-0 break-words">{concept}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
