import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { cn } from "@kiftet/ui/lib/utils";
import { Mic, RefreshCcw, ScanSearch, Volume2 } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router";
import {
  BrandMark,
  BrandSignature,
  GapClosingMark,
} from "@/components/brand-mark";
import { CoverageView } from "@/components/gap-list";
import { useLanguage } from "@/components/language-provider";
import { ConceptRing } from "@/components/mastery-ring";
import type { MasteryLevel } from "@/components/study-provider";
import WaitlistForm from "@/components/waitlist-form";
import { apiError } from "@/lib/api";
import { setDemoUser, startDemo } from "@/lib/demo";
import { type ConceptMeta, weightedMastery } from "@/lib/mastery";
import type { MessageKey } from "@/lib/messages";
import { useOnScreen } from "@/lib/on-screen";
import type { Route } from "./+types/_index";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Kiftet — Close the gap" },
    {
      name: "description",
      content:
        "Kiftet listens to what you remember, finds the ideas you're missing, and gives you the shortest plan to learn them — built for Ethiopian students.",
    },
  ];
}

const LOOP = [
  {
    stepKey: "step-speak",
    titleKey: "l-speak-title",
    textKey: "l-speak-text",
    icon: Mic,
  },
  {
    stepKey: "step-diagnose",
    titleKey: "l-diagnose-title",
    textKey: "l-diagnose-text",
    icon: ScanSearch,
  },
  {
    stepKey: "step-relearn",
    titleKey: "l-relearn-title",
    textKey: "l-relearn-text",
    icon: Volume2,
  },
  {
    stepKey: "step-retest",
    titleKey: "l-retest-title",
    textKey: "l-retest-text",
    icon: RefreshCcw,
  },
] as const;

const PASS_RATES = [
  { year: "2023", rate: "3.2%" },
  { year: "2024", rate: "5.4%" },
  { year: "2025", rate: "8.4%" },
  { year: "2026", rate: "12.8%" },
] as const;

/* The objections a visitor arrives with, in the order they ask them. Kept
   next to the ask rather than in a support page, because a question that
   survives the scroll to the CTA is the one that stops the click. */
const FAQ = [
  { q: "faq-what-q", a: "faq-what-a" },
  { q: "faq-speak-q", a: "faq-speak-a" },
  { q: "faq-syllabus-q", a: "faq-syllabus-a" },
  { q: "faq-amharic-q", a: "faq-amharic-a" },
  { q: "faq-offline-q", a: "faq-offline-a" },
  { q: "faq-different-q", a: "faq-different-a" },
  { q: "faq-aiwrong-q", a: "faq-aiwrong-a" },
  { q: "faq-data-q", a: "faq-data-a" },
  { q: "faq-voice-q", a: "faq-voice-a" },
  { q: "faq-textbook-q", a: "faq-textbook-a" },
  { q: "faq-phone-q", a: "faq-phone-a" },
  { q: "faq-install-q", a: "faq-install-a" },
  { q: "faq-free-q", a: "faq-free-a" },
  { q: "faq-instructor-q", a: "faq-instructor-a" },
  { q: "faq-exam-q", a: "faq-exam-a" },
  { q: "faq-waitlist-q", a: "faq-waitlist-a" },
] as const satisfies readonly { q: MessageKey; a: MessageKey }[];

/* Reveals a string word-by-word: each word slides up and straightens out of
   its clipped box. Staggered by --kft-i, so the whole line reads left to
   right — the landing page's signature reveal. Pure CSS, no library. */
function Words({
  text,
  offset = 0,
  gap = 45,
  className,
}: {
  text: string;
  offset?: number;
  gap?: number;
  className?: string;
}) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return (
    <>
      {words.map((w, i) => (
        <span key={`${i}-${w}`} className="kft-word">
          <span
            className={className}
            style={{ "--kft-i": `${(offset + i) * gap}ms` } as CSSProperties}
          >
            {w}
            {i < words.length - 1 ? "\u00A0" : ""}
          </span>
        </span>
      ))}
    </>
  );
}

export default function Home() {
  const hero = useOnScreen<HTMLDivElement>();
  const stats = useOnScreen<HTMLDivElement>();
  const how = useOnScreen<HTMLElement>();
  const rates = useOnScreen<HTMLElement>();
  const faq = useOnScreen<HTMLElement>();
  const cta = useOnScreen<HTMLElement>();
  const { t } = useLanguage();
  const { launch, pending, failure } = useDemoLaunch();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
      {/* ── Hero: the problem, stated plainly ─────────────────── */}
      <section className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
        <div ref={hero.ref} className={cn("space-y-7", hero.shown && "kft-in")}>
          <h1 className="relative isolate space-y-3 font-display font-semibold text-4xl text-foreground leading-[1.06] tracking-[-0.03em] sm:text-6xl sm:leading-[1.04]">
            <span aria-hidden="true" className="halo" />
            <span className="block">
              <Words text="Kiftet" className="text-gold" />
            </span>
            <span className="block">
              <Words text={t("hero-gap")} offset={1} />
            </span>
          </h1>

          <p
            className="kft-rise max-w-xl text-base text-foreground/90 leading-7 sm:text-lg"
            style={{ "--kft-i": "260ms" } as CSSProperties}
          >
            {t("hero-line")}
          </p>

          <p
            className="kft-rise max-w-xl text-muted-foreground text-sm leading-7"
            style={{ "--kft-i": "320ms" } as CSSProperties}
          >
            {t("hero-sub")}
          </p>

          <div
            className="kft-rise flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ "--kft-i": "400ms" } as CSSProperties}
          >
            <Button
              size="lg"
              onClick={launch}
              disabled={pending}
              className="w-full font-medium sm:w-auto"
            >
              {pending ? t("demo-setting-up") : t("demo-try")}
            </Button>
            <a
              href="#how"
              className="text-center font-medium text-muted-foreground text-sm underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline sm:text-left"
            >
              {t("how-loop-works")}
            </a>
          </div>
          {failure && (
            <p role="alert" className="text-rust text-sm">
              {failure}
            </p>
          )}
          <p
            className="kft-rise text-muted-foreground text-sm"
            style={{ "--kft-i": "480ms" } as CSSProperties}
          >
            {t("no-account")}{" "}
            <Link
              to="/dashboard"
              className="font-medium text-gold underline underline-offset-4 transition-colors duration-200 hover:text-gold-soft"
            >
              {t("start-closing")}
            </Link>
          </p>
        </div>

        {/* The product, entered through the ring itself */}
        <div className="flex flex-col items-center gap-6">
          <button
            type="button"
            onClick={launch}
            disabled={pending}
            aria-label={t("demo-ring-aria")}
            className="group relative grid size-32 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-4"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-breathe rounded-full bg-gold/20 blur-2xl motion-reduce:animate-none"
            />
            <GapClosingMark
              size={120}
              className="relative text-gold transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          </button>
          <p className="text-muted-foreground text-sm">{t("demo-ring-hint")}</p>
          <DemoCard />
        </div>
      </section>

      {/* ── The statistic that decides the stakes ─────────────── */}
      <section className="surface mt-6 p-6 sm:p-8">
        <div
          ref={stats.ref}
          className={cn(
            "grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center",
            stats.shown && "kft-in",
          )}
        >
          <div>
            <p className="kft-pop font-display font-semibold text-6xl text-gold tracking-[-0.04em] sm:text-7xl">
              87.2<span className="text-3xl text-gold/70">%</span>
            </p>
            <div
              aria-hidden="true"
              className="kft-draw mt-3 h-0.5 w-16 rounded-full bg-gradient-to-r from-gold to-gold/20"
              style={{ "--kft-i": "180ms" } as CSSProperties}
            />
          </div>
          <div
            className="kft-rise space-y-2 text-muted-foreground text-sm leading-6"
            style={{ "--kft-i": "120ms" } as CSSProperties}
          >
            <p>
              {t("stat-87a", { count: "563,500" })}{" "}
              <span className="font-medium text-foreground">
                {t("stat-87b", { schools: "565" })}
              </span>
            </p>
            <p>{t("stat-absent")}</p>
          </div>
        </div>
      </section>

      {/* ── What it actually sees ─────────────────────────────── */}
      <DiagnosisSection />

      {/* ── Try it live ──────────────────────────────────────────── */}
      <DemoSection />

      {/* ── The loop ──────────────────────────────────────────── */}
      <section
        id="how"
        ref={how.ref}
        className={cn("scroll-mt-24 pt-20", how.shown && "kft-in")}
      >
        <div className="mb-10 max-w-2xl space-y-3">
          <h2
            className="kft-rise font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl"
            style={{ "--kft-i": "0ms" } as CSSProperties}
          >
            {t("loop-title")}
          </h2>
          <p
            className="kft-rise text-base text-muted-foreground leading-7"
            style={{ "--kft-i": "80ms" } as CSSProperties}
          >
            {t("loop-sub")}
          </p>
          <div
            aria-hidden="true"
            className="kft-draw mt-4 h-0.5 w-24 rounded-full bg-gradient-to-r from-gold/60 to-gold/10"
            style={{ "--kft-i": "140ms" } as CSSProperties}
          />
        </div>

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map(({ stepKey, titleKey, textKey, icon: Icon }, i) => (
            <li
              key={stepKey}
              className="surface kft-rise p-5"
              style={{ "--kft-i": `${160 + i * 90}ms` } as CSSProperties}
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span
                  className="font-display font-medium text-2xl text-border"
                  aria-hidden="true"
                >
                  0{i + 1}
                </span>
              </div>
              <p className="font-medium text-[0.78rem] text-gold">
                {t(stepKey)}
              </p>
              <h3 className="mt-1 font-display font-semibold text-lg tracking-tight">
                {t(titleKey)}
              </h3>
              <p className="mt-2 text-muted-foreground text-sm leading-6">
                {t(textKey)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* The ask, placed right after the loop explains why it works. */}
      <WaitlistSection />

      {/* ── Why voice ─────────────────────────────────────────── */}
      <section className="mt-20 grid gap-8 lg:grid-cols-2 lg:items-center">
        <div className="space-y-5">
          <h2 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
            {t("voice-title")}
          </h2>
          <p className="text-base text-muted-foreground leading-7">
            {t("voice-1")}
          </p>
          <p className="text-base text-muted-foreground leading-7">
            {t("voice-2")}
          </p>
        </div>

        <div className="surface flex flex-col items-center justify-center gap-4 p-8">
          <div className="relative grid place-items-center">
            <span className="absolute inset-0 animate-ring-pulse rounded-full bg-gold/25" />
            <span className="absolute inset-0 animate-ring-pulse rounded-full bg-gold/15 [animation-delay:0.9s]" />
            <div className="relative grid size-32 place-items-center rounded-full border-2 border-gold/50 bg-night-raised text-gold shadow-[0_0_40px_rgba(242,239,233,0.15)]">
              <Mic className="size-11" aria-hidden="true" />
            </div>
          </div>
          <p className="text-center font-medium text-foreground text-sm">
            {t("tap-speak")}
          </p>
          <p className="max-w-xs text-center text-muted-foreground text-sm leading-6">
            {t("ring-caption")}
          </p>
        </div>
      </section>

      {/* ── The numbers, honestly ─────────────────────────────── */}
      <section ref={rates.ref} className={cn("mt-20", rates.shown && "kft-in")}>
        <div className="mb-8 max-w-2xl space-y-3">
          <h2
            className="kft-rise font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl"
            style={{ "--kft-i": "0ms" } as CSSProperties}
          >
            {t("rates-title")}
          </h2>
          <p
            className="kft-rise text-base text-muted-foreground leading-7"
            style={{ "--kft-i": "100ms" } as CSSProperties}
          >
            {t("rates-text")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {PASS_RATES.map(({ year, rate }, i) => (
            <div
              key={year}
              className={cn(
                "surface kft-rise p-5",
                i === PASS_RATES.length - 1 && "border-gold/40 bg-gold/[0.07]",
              )}
              style={{ "--kft-i": `${160 + i * 80}ms` } as CSSProperties}
            >
              <p className="k-label">{year}</p>
              <p
                className={cn(
                  "mt-1 font-display font-semibold text-3xl tracking-[-0.02em]",
                  i === PASS_RATES.length - 1
                    ? "text-gold"
                    : "text-muted-foreground",
                )}
              >
                {rate}
              </p>
              <p className="mt-2 text-muted-foreground text-xs leading-5">
                {i === PASS_RATES.length - 1
                  ? t("pass-rate-best")
                  : t("pass-rate")}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Built for the real exam room ──────────────────────── */}
      <section className="mt-20 grid gap-4 md:grid-cols-3">
        <div className="inner-surface p-5">
          <h3 className="font-display font-semibold text-lg tracking-tight">
            {t("school-phone-title")}
          </h3>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {t("school-phone-text")}
          </p>
        </div>
        <div className="inner-surface p-5">
          <h3 className="font-display font-semibold text-lg tracking-tight">
            {t("night-study-title")}
          </h3>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {t("night-study-text")}
          </p>
        </div>
        <div className="inner-surface p-5">
          <h3 className="font-display font-semibold text-lg tracking-tight">
            {t("honest-title")}
          </h3>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {t("honest-text")}
          </p>
        </div>
      </section>

      {/* ── The bookshelf: your textbook becomes the study room ── */}
      <section className="mt-20 grid gap-8 lg:grid-cols-2 lg:items-center">
        <div className="space-y-5">
          <p className="k-label">{t("byob-label")}</p>
          <h2 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
            {t("byob-a")}
            <span className="text-gold">{t("byob-gold")}</span>
            {t("byob-b")}
          </h2>
          <p className="text-base text-muted-foreground leading-7">
            {t("byob-1")}
          </p>
          <p className="text-base text-muted-foreground leading-7">
            {t("byob-2")}
          </p>
          <Link
            to="/textbooks"
            className={cn(buttonVariants({ size: "lg" }), "mt-2 font-medium")}
          >
            {t("preview-on-book")}
          </Link>
          <p className="text-muted-foreground text-sm">{t("no-pdf")}</p>
        </div>

        <div className="surface p-6">
          {/* min-w-0 on the text block and a truncated heading: the pair was
              justify-between with no shrinkable child, so a long chapter name
              pushed the chunk pill off the card rather than shortening the
              name. */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-[0.78rem] text-gold">
                {t("byob-card-subject")}
              </p>
              <h3 className="truncate font-display font-semibold text-xl tracking-tight">
                {t("byob-card-unit")}
              </h3>
            </div>
            <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold opacity-90">
              {t("chunks", { n: 7 })}
            </span>
          </div>
          <ul className="divide-y divide-border/60">
            {(
              [
                ["byob-card-chapter-1", "closed"],
                ["byob-card-chapter-2", "closed"],
                ["byob-card-chapter-3", "open"],
                ["byob-card-chapter-4", "open"],
                ["byob-card-chapter-5", "open"],
                ["byob-card-chapter-6", "open"],
              ] as const
            ).map(([chapterKey, state], i) => (
              <li
                key={chapterKey}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "font-medium text-[0.78rem]",
                      state === "closed"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/40",
                    )}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p
                    className={cn(
                      "truncate text-sm",
                      state === "closed" ? "text-foreground" : "text-fog/60",
                    )}
                  >
                    {t(chapterKey)}
                  </p>
                </div>
                {state === "closed" ? (
                  <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold">
                    {t("study-loop-ready")}
                  </span>
                ) : (
                  <span className="shrink-0 text-[0.78rem] text-muted-foreground">
                    {t("lines-up-next")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── The questions a visitor actually has ──────────────── */}
      <section ref={faq.ref} className={cn("mt-20", faq.shown && "kft-in")}>
        <div className="mb-8 max-w-2xl space-y-3">
          <p
            className="kft-rise k-label"
            style={{ "--kft-i": "0ms" } as CSSProperties}
          >
            {t("faq-eyebrow")}
          </p>
          <h2
            className="kft-rise font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl"
            style={{ "--kft-i": "60ms" } as CSSProperties}
          >
            {t("faq-title")}
          </h2>
          <p
            className="kft-rise text-muted-foreground text-sm leading-6"
            style={{ "--kft-i": "90ms" } as CSSProperties}
          >
            {t("faq-beta-note")}
          </p>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          {FAQ.map(({ q, a }, i) => (
            <div
              key={q}
              className="surface kft-rise p-5"
              style={{ "--kft-i": `${120 + i * 60}ms` } as CSSProperties}
            >
              <dt className="font-medium text-[0.95rem] text-foreground leading-6">
                {t(q)}
              </dt>
              <dd className="mt-2 text-muted-foreground text-sm leading-6">
                {t(a)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section
        ref={cta.ref}
        className={cn(
          "surface mt-20 border-gold/30 bg-gold/[0.06] p-8 text-center sm:p-12",
          cta.shown && "kft-in",
        )}
      >
        <BrandSignature size={72} className="kft-rise mx-auto mb-6" />
        <h2 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
          <Words text={t("cta-title")} />
        </h2>
        <p
          className="kft-rise mx-auto mt-3 max-w-md text-base text-muted-foreground leading-7"
          style={{ "--kft-i": "160ms" } as CSSProperties}
        >
          {t("cta-text")}
        </p>
        <Link
          to="/dashboard"
          className={cn(
            buttonVariants({ size: "lg" }),
            "kft-rise mt-7 font-medium",
          )}
          style={{ "--kft-i": "240ms" } as CSSProperties}
        >
          {t("open-study-room")}
        </Link>
      </section>

      <footer className="mt-16 border-border/60 border-t pt-8 dark:border-white/10">
        <div className="flex flex-col items-center gap-4 text-center">
          <BrandMark size={40} className="opacity-60" />
          <p className="max-w-sm text-muted-foreground text-xs leading-6">
            {t("footer-text")}
          </p>
          <p className="text-[0.78rem] text-muted-foreground/60">
            Kiftet · ክፍተት
          </p>
        </div>
      </footer>
    </main>
  );
}

/* The product, shown as itself: a live-looking recall card that already
   finished a diagnosis. Reuses the real CoverageView so the landing and the
   product can never drift apart visually. */
function DemoCard() {
  const { t } = useLanguage();
  return (
    <div
      className="surface animate-rise-in overflow-hidden"
      style={{ animationDelay: "0.15s" }}
    >
      <div className="border-border/60 border-b px-6 py-4 dark:border-white/10">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark size={22} className="rounded-full" />
            <p className="font-medium text-[0.78rem] text-muted-foreground">
              Kiftet
            </p>
          </div>
          <span className="rounded-full border border-border/70 px-2.5 py-0.5 font-medium text-[0.72rem] text-muted-foreground dark:border-white/15">
            {t("example-label")}
          </span>
        </div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="k-label">{t("demo-card-unit")}</p>
          <span className="inline-flex items-center gap-1.5 font-medium text-[0.78rem] text-sage">
            <span
              className="size-1.5 rounded-full bg-sage"
              aria-hidden="true"
            />
            {t("recalled")}
          </span>
        </div>
        <h3 className="font-display font-semibold text-xl tracking-tight">
          {t("demo-card-chapter")}
        </h3>
      </div>

      <div className="p-6">
        <CoverageView
          covered={[t("demo-card-c-1"), t("demo-card-c-2"), t("demo-card-c-3")]}
          missing={[t("demo-card-c-4"), t("demo-card-c-5")]}
        />
      </div>

      <div className="border-border/60 border-t px-6 py-4 dark:border-white/10">
        <a
          href="#demo"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full justify-center font-medium",
          )}
        >
          {t("see-your-chapter")}
        </a>
      </div>
    </div>
  );
}

/**
 * The section that has to earn the product.
 *
 * Everything else on this page is a claim. This one is a receipt: a real
 * Biology 12 checklist, the four levels a recall can land on, and the numbers
 * that come out of them. A visitor should be able to read the gold row and
 * recognise their own Tuesday night — "I said the word, I just didn't say what
 * it meant" is the feeling the product exists for, and it is worth more to a
 * student than any percentage.
 *
 * Biology 12 on purpose. We do not claim Mathematics or Physics (a spoken
 * explanation cannot show that someone can calculate), so the page stays on
 * word-based subjects — this checklist and the "Bring your own book" card both.
 */
function DiagnosisSection() {
  const { t } = useLanguage();
  const reveal = useOnScreen<HTMLDivElement>();

  // The checklist of one real Biology 12 unit, with the levels one student's
  // spoken recall actually landed on. Kept as data, not JSX, so it renders
  // through the same component the study screen uses.
  const mastery: Record<string, MasteryLevel> = {
    [t("demo-c-1")]: 3,
    [t("demo-c-2")]: 3,
    [t("demo-c-3")]: 1,
    [t("demo-c-4")]: 2,
    [t("demo-c-5")]: 0,
  };
  const meta: Record<string, ConceptMeta> = {
    [t("demo-c-1")]: { weight: 5, isMisconception: false },
    [t("demo-c-2")]: { weight: 3, isMisconception: false },
    [t("demo-c-3")]: { weight: 4, isMisconception: false },
    [t("demo-c-4")]: { weight: 2, isMisconception: false },
    [t("demo-c-5")]: { weight: 4, isMisconception: false },
  };
  const name = (i: 1 | 2 | 3 | 4 | 5) => t(`demo-c-${i}` as MessageKey);

  return (
    <section className="mt-6" aria-labelledby="diagnosis-title">
      <div
        ref={reveal.ref}
        className={cn("space-y-6", reveal.shown && "kft-in")}
      >
        <div className="space-y-3">
          <p
            className="kft-rise font-medium text-muted-foreground text-sm"
            style={{ "--kft-i": "0ms" } as CSSProperties}
          >
            {t("diag-eyebrow")}
          </p>
          <h2
            id="diagnosis-title"
            className="kft-rise max-w-2xl text-balance font-display font-semibold text-2xl text-foreground tracking-[-0.02em] sm:text-3xl"
            style={{ "--kft-i": "80ms" } as CSSProperties}
          >
            {t("diag-title")}
          </h2>
          <p
            className="kft-rise max-w-2xl text-muted-foreground text-sm leading-6 sm:text-base"
            style={{ "--kft-i": "160ms" } as CSSProperties}
          >
            {t("diag-sub")}
          </p>
        </div>

        <div
          className="kft-rise grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-start lg:gap-8"
          style={{ "--kft-i": "240ms" } as CSSProperties}
        >
          <div className="surface p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="k-label">{t("diag-unit")}</p>
              <p className="font-medium text-muted-foreground text-xs">
                {t("diag-one-minute")}
              </p>
            </div>
            <CoverageView
              covered={[name(1), name(2)]}
              missing={[name(5)]}
              misconceptions={[name(4)]}
              mastery={mastery}
              meta={meta}
              score={weightedMastery(mastery, meta, Object.keys(mastery))}
            />
          </div>

          <ul className="space-y-3">
            {(
              [
                ["3", t("diag-l3"), t("diag-t3"), "var(--color-sage)"],
                ["1", t("diag-l1"), t("diag-t1"), "var(--color-gold)"],
                ["2", t("diag-l2"), t("diag-t2"), "var(--color-rust)"],
                ["0", t("diag-l0"), t("diag-t0"), "var(--border)"],
              ] as const
            ).map(([level, head, body, color], i) => (
              <li
                key={level}
                className="kft-rise inner-surface flex gap-3 p-4"
                style={{ "--kft-i": `${280 + i * 80}ms` } as CSSProperties}
              >
                <ConceptRing level={Number(level) as MasteryLevel} size={26} />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-sm" style={{ color }}>
                    {head}
                  </p>
                  <p className="text-muted-foreground text-sm leading-6">
                    {body}
                  </p>
                </div>
              </li>
            ))}
            <li
              className="kft-rise inner-surface border-gold/30 p-4"
              style={{ "--kft-i": "600ms" } as CSSProperties}
            >
              <p className="text-foreground text-sm leading-6">
                {t("diag-punchline")}
              </p>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const [proximity, setProximity] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setInView(true);
      setProximity(1);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      setProximity(1);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) setCycle((c) => c + 1);
      },
      { threshold: 0.25 },
    );
    io.observe(el);

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const center = r.top + r.height / 2 - vh / 2;
        const reach = vh * 0.85;
        setProximity(Math.max(0, Math.min(1, 1 - Math.abs(center) / reach)));
      });
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return { ref, inView, proximity, cycle };
}

function DemoSection() {
  const { ref, inView, proximity, cycle } = useScrollReveal<HTMLElement>();
  const { t } = useLanguage();

  const spring =
    "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";

  const stagger = (i: number, child: ReactNode) => (
    <div
      className={cn(
        spring,
        inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
      )}
      style={
        { transitionDelay: inView ? `${i * 90}ms` : "0ms" } as CSSProperties
      }
    >
      {child}
    </div>
  );

  const glowIntensity = inView ? Math.max(proximity, 0.5) : proximity * 0.4;

  return (
    <section
      ref={ref}
      id="demo"
      className="surface relative mt-10 scroll-mt-24 overflow-hidden rounded-[2rem] border border-gold/25 px-6 py-14 text-center sm:px-12 sm:py-16"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-gold/15 blur-3xl"
        style={{ opacity: glowIntensity }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-16 size-56 rounded-full bg-gold/10 blur-3xl"
        style={{ opacity: glowIntensity * 0.7 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-16 size-56 rounded-full bg-gold/10 blur-3xl"
        style={{ opacity: glowIntensity * 0.6 }}
      />

      <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
        <div
          aria-hidden="true"
          className={cn("kft-beam", inView && "kft-in")}
        />
        <div className="relative size-32">
          {cycle > 0 ? (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 rounded-full bg-gold/25 blur-2xl transition-opacity duration-500",
                  proximity > 0.2 ? "animate-pulse opacity-100" : "opacity-60",
                )}
              />
              <GapClosingMark
                key={`ring-${cycle}`}
                size={128}
                className="relative text-gold"
              />
            </>
          ) : null}
        </div>

        {stagger(
          0,
          <span className="inline-flex items-center gap-2 rounded-full border border-sage/30 bg-sage/10 px-3 py-1 font-medium text-[0.78rem] text-sage">
            <span
              className={cn(
                "size-1.5 rounded-full bg-sage transition-opacity duration-500",
                inView && "animate-pulse opacity-100",
              )}
              aria-hidden="true"
            />
            {t("demo-chip")}
          </span>,
        )}

        <h2
          className={cn(
            "font-display font-semibold text-3xl text-foreground leading-[1.12] tracking-[-0.02em] sm:text-4xl",
            inView && "kft-in",
          )}
        >
          <Words text={t("demo-title")} gap={40} />
        </h2>

        {stagger(
          2,
          <p className="max-w-md text-base text-muted-foreground leading-7">
            {t("demo-text")}
          </p>,
        )}

        {stagger(3, <DemoButton variant="primary" size="lg" />)}

        {stagger(
          4,
          <p className="text-[0.78rem] text-muted-foreground">
            {t("demo-foot")}
          </p>,
        )}
      </div>
    </section>
  );
}

/* The waitlist, asked once and asked plainly, under the loop that earns it. */
function WaitlistSection() {
  const { t } = useLanguage();
  return (
    <section
      id="waitlist"
      className="surface mx-auto mt-20 max-w-2xl scroll-mt-24 rounded-[2rem] border p-6 text-center sm:p-10"
    >
      <div className="flex flex-col items-center gap-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-medium text-[0.78rem] text-gold">
          {t("waitlist-chip")}
        </span>
        <h2 className="font-display font-semibold text-2xl leading-[1.15] tracking-[-0.02em] sm:text-3xl">
          {t("waitlist-title")}
        </h2>
      </div>
      <div className="mx-auto mt-8 max-w-md text-left">
        <WaitlistForm />
        {/* Sign-in left the header when sign-up and the waitlist merged into
            one button, so the way back to an existing account lives here,
            next to the form it is most likely to be wanted from. */}
        <p className="mt-5 text-center text-muted-foreground text-sm">
          {t("waitlist-signin-prefix")}{" "}
          <Link
            to="/login"
            className="font-medium text-gold underline-offset-4 hover:underline"
          >
            {t("sign-in")}
          </Link>
        </p>
      </div>
    </section>
  );
}

function useDemoLaunch() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const launch = async () => {
    setPending(true);
    setFailure(null);
    try {
      const userId = await startDemo();
      setDemoUser(userId);
      navigate("/dashboard");
    } catch (error) {
      setFailure(apiError(error));
      setPending(false);
    }
  };

  return { launch, pending, failure };
}

function DemoButton({
  variant = "outline",
  size,
  className,
}: {
  variant?: "primary" | "outline";
  size?: "lg";
  className?: string;
}) {
  const { launch, pending, failure } = useDemoLaunch();
  const { t } = useLanguage();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Button
        size={size}
        variant={variant === "primary" ? "default" : "outline"}
        onClick={launch}
        disabled={pending}
        className="w-full font-medium sm:w-auto"
      >
        {pending
          ? t("demo-setting-up")
          : variant === "primary"
            ? t("demo-start")
            : t("demo-try")}
      </Button>
      {failure && (
        <p role="alert" className="text-rust text-xs">
          {failure}
        </p>
      )}
    </div>
  );
}
