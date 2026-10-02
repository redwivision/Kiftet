import { cn } from "@kiftet/ui/lib/utils";
import { BookOpen, Check, MessageCircleQuestion, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { GuideSection } from "@/components/study-provider";

/**
 * The guide, in the order this student needs it.
 *
 * The order is the product. A wrong belief comes first because re-reading
 * cannot fix it; a raised-but-unfinished idea next because it is the cheapest
 * win on the page; untouched ideas after that by importance; solid ones last as
 * a confirmation rather than something to read twice.
 *
 * Each section is `what` / `why` / `recall` — "the right length" as structure
 * rather than a word count a model is asked to guess at. A section carrying a
 * source quote shows it, so the guide can hand the student back to their own
 * book instead of being a closed loop.
 */
export function GuideView({
  sections,
  estimated,
  onRecall,
}: {
  sections: GuideSection[];
  estimated: boolean;
  onRecall?: (section: GuideSection) => void;
}) {
  const { t } = useLanguage();
  const work = sections.filter((s) => s.needsWork);
  const solid = sections.filter((s) => !s.needsWork);

  if (!work.length) {
    return (
      <div className="rounded-xl border border-sage/30 bg-sage/10 px-4 py-4 text-[0.9rem] text-foreground leading-6">
        {t("guide-empty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {estimated && (
        <p className="flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-[0.78rem] text-muted-foreground leading-5">
          <Sparkles
            className="mt-0.5 size-3.5 shrink-0 text-gold"
            aria-hidden="true"
          />
          <span>{t("guide-estimated-note")}</span>
        </p>
      )}

      <p className="font-medium text-[0.72rem] text-muted-foreground uppercase tracking-[0.14em]">
        {t("guide-section-count", { count: work.length })}
      </p>

      <ol className="space-y-3">
        {work.map((section, i) => (
          <GuideSectionCard
            key={`${section.conceptText}-${i}`}
            section={section}
            onRecall={onRecall}
          />
        ))}
      </ol>

      {solid.length > 0 && <SolidSummary sections={solid} />}
    </div>
  );
}

function GuideSectionCard({
  section,
  onRecall,
}: {
  section: GuideSection;
  onRecall?: (section: GuideSection) => void;
}) {
  const { t } = useLanguage();
  return (
    <li
      className={cn(
        "rounded-xl border px-4 py-4",
        section.level === 2 && "border-rust/40 bg-rust/5",
        section.level === 1 && "border-gold/40 bg-gold/5",
        section.level === 0 && "border-border bg-card",
      )}
    >
      {/* Stacked on a phone, side by side from sm. "So close — one sentence
          from you" is ~175px at the pill's size, so sharing a row left the
          concept title about 100px and the two collided at 375px. The pill is
          short and the title is the point, so the title keeps the first line
          and the pill drops under it. */}
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <p className="min-w-0 font-semibold text-[0.95rem] text-foreground leading-6">
          {section.conceptText}
        </p>
        <StatePill level={section.level} />
      </div>

      <p className="mt-2 text-[0.9rem] text-foreground/90 leading-6">
        {section.what}
      </p>

      {section.why && (
        <div className="mt-3">
          <p className="font-medium text-[0.68rem] text-muted-foreground uppercase tracking-[0.14em]">
            {t("guide-why")}
          </p>
          <p className="mt-1 text-[0.85rem] text-muted-foreground leading-6">
            {section.why}
          </p>
        </div>
      )}

      {section.sourceQuote && (
        <p className="mt-3 flex items-start gap-1.5 border-border border-l-2 pl-2.5 text-[0.8rem] text-muted-foreground/90 leading-5">
          <BookOpen
            className="mt-0.5 size-3 shrink-0 opacity-70"
            aria-hidden="true"
          />
          <span>
            <span className="font-medium">{t("guide-in-your-book")}: </span>
            {section.sourceQuote}
          </span>
        </p>
      )}

      {section.recall && (
        <div className="mt-3 rounded-lg bg-background/60 px-3 py-2.5">
          <p className="font-medium text-[0.68rem] text-gold uppercase tracking-[0.14em]">
            {t("guide-recall")}
          </p>
          <p className="mt-1 text-[0.85rem] text-foreground leading-6">
            {section.recall}
          </p>
          {onRecall && (
            <button
              type="button"
              onClick={() => onRecall(section)}
              className="mt-2 inline-flex items-center gap-1.5 font-medium text-[0.78rem] text-gold underline underline-offset-4 transition-colors duration-200 hover:text-foreground"
            >
              <MessageCircleQuestion className="size-3.5" aria-hidden="true" />
              {t("guide-recall")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function StatePill({ level }: { level: GuideSection["level"] }) {
  const { t } = useLanguage();
  const key =
    level === 2
      ? "guide-wrong-first"
      : level === 1
        ? "guide-almost-first"
        : "guide-not-yet";
  return (
    <span
      className={cn(
        "max-w-full rounded-full px-2 py-0.5 font-medium text-[0.68rem] tracking-wide sm:shrink-0 sm:whitespace-nowrap",
        level === 2 && "bg-rust/15 text-rust",
        level === 1 && "bg-gold/15 text-gold",
        level === 0 && "bg-muted text-muted-foreground",
      )}
    >
      {t(key)}
    </span>
  );
}

function SolidSummary({ sections }: { sections: GuideSection[] }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-sage/30 bg-sage/5 px-4 py-3">
      <p className="flex items-center gap-1.5 font-medium text-[0.8rem] text-sage">
        <Check className="size-3.5" aria-hidden="true" />
        {t("guide-already-have")}
      </p>
      <p className="mt-1 text-[0.78rem] text-muted-foreground leading-5">
        {t("guide-already-body")}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {sections.map((s) => (
          <li
            key={s.conceptText}
            className="rounded-full border border-sage/25 px-2 py-0.5 text-[0.72rem] text-muted-foreground"
          >
            {s.conceptText}
          </li>
        ))}
      </ul>
    </div>
  );
}
