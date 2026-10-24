import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { cn } from "@kiftet/ui/lib/utils";
import {
  ArrowRight,
  BookText,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  ListChecks,
  Mic,
  RefreshCcw,
  ScanSearch,
  Search,
} from "lucide-react";
import { motion } from "motion/react";
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useState,
} from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { BrandMark, BrandSignature } from "@/components/brand-mark";
import { CoverageView } from "@/components/gap-list";
import { HeroFilm } from "@/components/hero-film";
import { useLanguage } from "@/components/language-provider";
import type { MasteryLevel } from "@/components/study-provider";
import WaitlistForm from "@/components/waitlist-form";
import { apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { startDemoStudy } from "@/lib/demo";
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
        "It looks familiar — can you explain it? Kiftet hears you explain a chapter, finds the ideas you can't, and gives you the shortest plan to learn them. Built for every Ethiopian student.",
    },
  ];
}

/* The public loop, told in four words. The study screen has its own, longer
   pills; these are the skimmable version for someone who has never seen the
   product, so each is a verb a student recognises, not a feature name. */
const LOOP = [
  { stepKey: "step-speak", Icon: Mic },
  { stepKey: "step-diagnose", Icon: ScanSearch },
  { stepKey: "step-relearn", Icon: BookText },
  { stepKey: "step-retest", Icon: RefreshCcw },
] as const satisfies readonly {
  stepKey: MessageKey;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[];

const LOOP_PREVIEW = [
  { titleKey: "preview-recall-title", bodyKey: "preview-recall-body" },
  { titleKey: "preview-diagnose-title", bodyKey: "preview-diagnose-body" },
  { titleKey: "preview-plan-title", bodyKey: "preview-plan-body" },
  { titleKey: "preview-retest-title", bodyKey: "preview-retest-body" },
] as const satisfies readonly { titleKey: MessageKey; bodyKey: MessageKey }[];

const PASS_RATES = [
  { year: "2023", rate: "3.2%" },
  { year: "2024", rate: "5.4%" },
  { year: "2025", rate: "8.4%" },
  { year: "2026", rate: "12.8%" },
] as const;

/* The five answers a sceptical visitor needs before the button: what it costs,
   whether they need an account, whether it runs on their phone, and whether
   their voice is kept. Every one is verifiable against the FAQ. */
const HERO_CHIPS: readonly MessageKey[] = [
  "hero-chip-free",
  "hero-chip-account",
  "hero-chip-phone",
  "hero-chip-audio",
];

/* One diagnosis, three subjects.
 *
 * Kiftet's promise is not "a Biology app" — it is "explain what you remember
 * and we find the gaps". Letting a History or Geography student see their own
 * chapter graded is the whole point of speaking to *every* Ethiopian student.
 *
 * The levels are identical for all three (two solid, one half-known, one stated
 * wrong, one left open) so the punchline below the card stays true whichever a
 * visitor picks; only the content and the importances change. Word-based
 * subjects on purpose — a spoken answer can show you know History, but not that
 * you can calculate, so the worked-problem sciences stay off the receipt. */
const MICRO_DEMO_LEVELS: readonly MasteryLevel[] = [3, 3, 1, 2, 0];

const MICRO_DEMO = [
  {
    id: "biology",
    labelKey: "subject-biology",
    unitKey: "demo-card-unit",
    chapterKey: "demo-card-chapter",
    conceptKeys: [
      "demo-card-c-1",
      "demo-card-c-2",
      "demo-card-c-3",
      "demo-card-c-4",
      "demo-card-c-5",
    ],
    weights: [5, 3, 4, 2, 4],
  },
  {
    id: "history",
    labelKey: "subject-history",
    unitKey: "demo-hist-unit",
    chapterKey: "demo-hist-chapter",
    conceptKeys: [
      "demo-hist-c-1",
      "demo-hist-c-2",
      "demo-hist-c-3",
      "demo-hist-c-4",
      "demo-hist-c-5",
    ],
    weights: [4, 3, 4, 2, 3],
  },
  {
    id: "geography",
    labelKey: "subject-geography",
    unitKey: "demo-geo-unit",
    chapterKey: "demo-geo-chapter",
    conceptKeys: [
      "demo-geo-c-1",
      "demo-geo-c-2",
      "demo-geo-c-3",
      "demo-geo-c-4",
      "demo-geo-c-5",
    ],
    weights: [5, 4, 3, 3, 3],
  },
] as const satisfies readonly {
  id: string;
  labelKey: MessageKey;
  unitKey: MessageKey;
  chapterKey: MessageKey;
  conceptKeys: readonly MessageKey[];
  weights: readonly number[];
}[];

/* The aware visitor's three objections, answered in one line each. */
const DIFF = [
  { textKey: "diff-1", Icon: ListChecks },
  { textKey: "diff-2", Icon: Bot },
  { textKey: "diff-3", Icon: BookText },
] as const satisfies readonly {
  textKey: MessageKey;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[];

/* The objections a visitor arrives with, in the order they ask them. Kept
   next to the ask rather than in a support page, because a question that
   survives the scroll to the CTA is the one that stops the click. */
const FAQ = [
  { q: "faq-what-q", a: "faq-what-a" },
  { q: "faq-different-q", a: "faq-different-a" },
  { q: "faq-speak-q", a: "faq-speak-a" },
  { q: "faq-free-q", a: "faq-free-a" },
  { q: "faq-syllabus-q", a: "faq-syllabus-a" },
  { q: "faq-amharic-q", a: "faq-amharic-a" },
  { q: "faq-offline-q", a: "faq-offline-a" },
  { q: "faq-textbook-q", a: "faq-textbook-a" },
  { q: "faq-aiwrong-q", a: "faq-aiwrong-a" },
  { q: "faq-data-q", a: "faq-data-a" },
  { q: "faq-voice-q", a: "faq-voice-a" },
  { q: "faq-phone-q", a: "faq-phone-a" },
  { q: "faq-install-q", a: "faq-install-a" },
  { q: "faq-exam-q", a: "faq-exam-a" },
  { q: "faq-instructor-q", a: "faq-instructor-a" },
  { q: "faq-waitlist-q", a: "faq-waitlist-a" },
] as const satisfies readonly { q: MessageKey; a: MessageKey }[];

/* The five that answer "what is it, do I need it, will it run here" — the rest
   live one tap away. A wall of sixteen is what stops the read. */
const FAQ_TOP_KEYS: readonly MessageKey[] = [
  "faq-what-q",
  "faq-different-q",
  "faq-free-q",
  "faq-speak-q",
  "faq-offline-q",
];

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

/* Tap-to-open row. Native <details>, so it works with no JavaScript, is
   keyboard-operable and screen-reader-announced for free — and it is how the
   long half of the page stays out of the way until someone asks for it. */
function Disclosure({
  summary,
  children,
  id,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <details
      id={id}
      className={cn("surface group scroll-mt-24 overflow-hidden", className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-foreground transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <ChevronDown
          className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="border-border/60 border-t px-5 py-5 dark:border-white/10">
        {children}
      </div>
    </details>
  );
}

export default function Home() {
  const hero = useOnScreen<HTMLDivElement>();
  const how = useOnScreen<HTMLElement>();
  const stats = useOnScreen<HTMLElement>();
  const diff = useOnScreen<HTMLElement>();
  const cta = useOnScreen<HTMLElement>();
  const { t } = useLanguage();
  const { launch, pending, disabled, failure, signedIn } = useDemoLaunch();

  if (signedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-3 pb-20 sm:px-6 lg:px-8">
      {/* ── Hero: the promise, and the demo one tap away ────────
          On phones the film leads — it is the product speaking — followed by
          the CTAs; the written copy and the loop preview follow below. On
          desktop the two halves sit side by side, as before. */}
      <section className="grid gap-10 pt-6 pb-12 sm:pt-10 sm:pb-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-x-12 lg:gap-y-4">
        <div
          ref={hero.ref}
          className={cn(
            "order-2 space-y-6 lg:order-none lg:col-start-1 lg:row-start-1",
            hero.shown && "kft-in",
          )}
        >
          <h1 className="relative isolate font-display font-semibold text-4xl text-foreground leading-[1.06] tracking-[-0.03em] sm:text-5xl sm:leading-[1.05]">
            <span aria-hidden="true" className="halo" />
            <span className="sr-only">{t("hero-h1")}</span>
          </h1>

          <div
            className="kft-rise flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ "--kft-i": "220ms" } as CSSProperties}
          >
            <Button
              size="lg"
              onClick={launch}
              disabled={disabled}
              className="min-h-14 w-full justify-between px-6 font-semibold text-base sm:w-auto sm:min-w-64"
            >
              {pending
                ? t("demo-setting-up")
                : signedIn
                  ? t("hero-dashboard-cta")
                  : t("hero-cta")}
              <ArrowRight className="size-5" aria-hidden="true" />
            </Button>
            {signedIn ? (
              <Link
                to="/dashboard"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full sm:w-auto",
                )}
              >
                {t("hero-dashboard-cta")}
              </Link>
            ) : (
              <Link
                to="/login?signup=1"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full sm:w-auto",
                )}
              >
                {t("hero-signup-cta")}
              </Link>
            )}
          </div>

          <p
            className="kft-rise max-w-xl text-base text-foreground/90 leading-7 sm:text-lg"
            style={{ "--kft-i": "320ms" } as CSSProperties}
          >
            {t("hero-h1")}{" "}{t("hero-line")}
          </p>

          <div
            className="kft-rise flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ "--kft-i": "400ms" } as CSSProperties}
          >
            <a
              href="#waitlist"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "w-full sm:w-auto",
              )}
            >
              {t("hero-join-cta")}
            </a>
            <a
              href="#how"
              className="py-2 text-center font-medium text-muted-foreground text-sm underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline sm:text-left"
            >
              {t("how-loop-works")}
            </a>
            <Link
              to="/plans"
              className="py-2 text-center font-medium text-muted-foreground text-sm underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline sm:text-left"
            >
              {t("plans-link")}
            </Link>
          </div>

          {failure && (
            <p role="alert" className="text-rust text-sm">
              {failure}
            </p>
          )}

          <ul
            className="kft-rise flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground text-sm"
            style={{ "--kft-i": "480ms" } as CSSProperties}
          >
            {HERO_CHIPS.map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <Check className="size-4 text-gold" aria-hidden="true" />
                {t(key)}
              </li>
            ))}
          </ul>

          <p
            className="kft-rise max-w-xl font-medium text-foreground text-sm sm:text-base"
            style={{ "--kft-i": "560ms" } as CSSProperties}
          >
            {t("hero-proof")}
          </p>
        </div>

        {/* The product, performing — first on a phone. The open ring hears an
            answer and turns it into a diagnosis of exactly what the student
            cannot explain. */}
        <div className="order-1 flex flex-col items-center gap-4 lg:order-none lg:col-start-2 lg:row-start-1">
          <HeroFilm className="w-full max-w-md" />
          <p className="max-w-md text-balance text-center text-muted-foreground text-sm leading-6">
            {t("hero-film-caption")}
          </p>
        </div>

        {/* The loop preview closes the hero on a phone — under the read — but
            stays under the film on desktop. */}
        <div className="order-3 flex justify-center lg:order-none lg:col-start-2 lg:row-start-2">
          <LoopPreview
            className="w-full max-w-md"
            onLaunch={launch}
            disabled={disabled}
            pending={pending}
            signedIn={signedIn}
          />
        </div>
      </section>

      {/* ── How it works: four words, no paragraphs ───────────── */}
      <section
        id="how"
        ref={how.ref}
        className={cn("scroll-mt-24 pt-16", how.shown && "kft-in")}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="k-label">{t("how-loop-works")}</p>
            <h2 className="mt-2 font-display font-semibold text-2xl tracking-[-0.02em] sm:text-3xl">
              {t("loop-title")}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6 sm:text-base">
              {t("hero-line")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/login?signup=1"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              {t("hero-signup-cta")}
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={launch}
              disabled={disabled}
            >
              {pending ? t("demo-setting-up") : t("hero-cta")}
            </Button>
            <a
              href="#waitlist"
              className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
            >
              {t("hero-join-cta")}
            </a>
          </div>
        </div>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map(({ stepKey, Icon }, i) => (
            <li
              key={stepKey}
              className="surface kft-rise flex items-center gap-3 p-5"
              style={{ "--kft-i": `${120 + i * 80}ms` } as CSSProperties}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                <Icon className="size-5" aria-hidden={true} />
              </span>
              <span className="font-medium text-foreground">{t(stepKey)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── The aha: the one receipt on the page ──────────────── */}
      <DiagnosisSection />

      {/* ── The stakes, and the trend behind them ─────────────── */}
      <section ref={stats.ref} className={cn("mt-16", stats.shown && "kft-in")}>
        <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
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
          <div className="space-y-2 text-muted-foreground text-sm leading-6">
            <p>
              {t("stat-87a", { count: "563,500" })}{" "}
              <span className="font-medium text-foreground">
                {t("stat-87b", { schools: "565" })}
              </span>
            </p>
            <p>{t("stat-absent")}</p>
          </div>
        </div>

        <Disclosure summary={t("more-rates")} id="rates" className="mt-6">
          <p className="mb-5 max-w-2xl text-muted-foreground text-sm leading-6">
            {t("rates-text")}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {PASS_RATES.map(({ year, rate }, i) => (
              <div
                key={year}
                className={cn(
                  "inner-surface p-5",
                  i === PASS_RATES.length - 1 &&
                    "border-gold/40 bg-gold/[0.07]",
                )}
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
        </Disclosure>
      </section>

      {/* ── Why not the obvious tools ─────────────────────────── */}
      <section
        ref={diff.ref}
        className={cn(
          "mt-16 grid gap-4 md:grid-cols-3",
          diff.shown && "kft-in",
        )}
      >
        {DIFF.map(({ textKey, Icon }, i) => (
          <div
            key={textKey}
            className="inner-surface kft-rise flex items-start gap-3 p-5"
            style={{ "--kft-i": `${120 + i * 90}ms` } as CSSProperties}
          >
            <Icon
              className="mt-0.5 size-5 shrink-0 text-gold"
              aria-hidden={true}
            />
            <p className="text-foreground text-sm leading-6">{t(textKey)}</p>
          </div>
        ))}
      </section>

      {/* ── The long half, one tap away ───────────────────────── */}
      <section className="mt-16">
        <p className="k-label">{t("more-title")}</p>
        <div className="mt-4 space-y-3">
          <Disclosure summary={t("more-voice")}>
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="space-y-4">
                <p className="font-display font-semibold text-xl tracking-tight">
                  {t("voice-title")}
                </p>
                <p className="text-muted-foreground text-sm leading-6">
                  {t("voice-1")}
                </p>
                <p className="text-muted-foreground text-sm leading-6">
                  {t("voice-2")}
                </p>
              </div>
              <div className="inner-surface flex flex-col items-center gap-3 p-6">
                <div className="relative grid place-items-center">
                  <span className="absolute inset-0 animate-ring-pulse rounded-full bg-gold/25" />
                  <div className="relative grid size-24 place-items-center rounded-full border-2 border-gold/50 bg-night-raised text-gold">
                    <Mic className="size-9" aria-hidden="true" />
                  </div>
                </div>
                <p className="font-medium text-foreground text-sm">
                  {t("tap-speak")}
                </p>
              </div>
            </div>
          </Disclosure>

          <Disclosure summary={t("more-byob")}>
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              <div className="space-y-4">
                <p className="font-display font-semibold text-xl tracking-tight">
                  {t("byob-a")}
                  <span className="text-gold">{t("byob-gold")}</span>
                  {t("byob-b")}
                </p>
                <p className="text-muted-foreground text-sm leading-6">
                  {t("byob-1")}
                </p>
                <p className="text-muted-foreground text-sm leading-6">
                  {t("byob-2")}
                </p>
                <Link
                  to="/textbooks"
                  className={cn(buttonVariants({ variant: "outline" }), "mt-1")}
                >
                  {t("preview-on-book")}
                </Link>
              </div>
              <div className="inner-surface p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[0.78rem] text-gold">
                      {t("byob-card-subject")}
                    </p>
                    <h3 className="truncate font-display font-semibold text-lg tracking-tight">
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
                        <span className="font-medium text-[0.78rem] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <p
                          className={cn(
                            "truncate text-sm",
                            state === "closed"
                              ? "text-foreground"
                              : "text-fog/60",
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
            </div>
          </Disclosure>

          <Disclosure summary={t("more-exam")}>
            <div className="grid gap-4 md:grid-cols-3">
              {(
                [
                  ["school-phone-title", "school-phone-text"],
                  ["night-study-title", "night-study-text"],
                  ["honest-title", "honest-text"],
                ] as const
              ).map(([titleKey, textKey]) => (
                <div key={titleKey} className="inner-surface p-5">
                  <h3 className="font-display font-semibold text-lg tracking-tight">
                    {t(titleKey)}
                  </h3>
                  <p className="mt-2 text-muted-foreground text-sm leading-6">
                    {t(textKey)}
                  </p>
                </div>
              ))}
            </div>
          </Disclosure>
        </div>
      </section>

      {/* ── The questions a visitor actually has ──────────────── */}
      <FaqSection />

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section
        ref={cta.ref}
        className={cn(
          "surface mt-16 border-gold/30 bg-gold/[0.06] p-8 text-center sm:p-12",
          cta.shown && "kft-in",
        )}
      >
        <BrandSignature size={72} className="kft-rise mx-auto mb-6" />
        <h2 className="font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
          <Words text={t("cta-title")} />
        </h2>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground leading-7">
          {t("cta-text")}
        </p>
        <div className="mt-7 flex justify-center">
          <DemoButton variant="primary" size="lg" />
        </div>
        <p className="mt-6 text-muted-foreground text-sm">{t("no-account")}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/plans"
            className="font-medium text-foreground text-sm underline underline-offset-4"
          >
            {t("plans-link")}
          </Link>
          {!signedIn && (
            <Link
              to="/login"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("auth-signin-cta")}
            </Link>
          )}
        </div>

        <div className="mx-auto mt-8 max-w-md text-left">
          <Disclosure summary={t("waitlist-chip")} id="waitlist">
            <div className="space-y-3">
              <p className="font-display font-semibold text-lg tracking-tight">
                {t("waitlist-title")}
              </p>
              <WaitlistForm />
              <p className="text-center text-muted-foreground text-sm">
                {t("waitlist-signin-prefix")}{" "}
                <Link
                  to="/login"
                  className="font-medium text-gold underline-offset-4 hover:underline"
                >
                  {t("sign-in")}
                </Link>
              </p>
            </div>
          </Disclosure>
        </div>
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

function LoopPreview({
  className,
  onLaunch,
  disabled,
  pending,
  signedIn,
}: {
  className?: string;
  onLaunch: () => void;
  disabled: boolean;
  pending: boolean;
  signedIn: boolean;
}) {
  const { t } = useLanguage();
  const [activeStep, setActiveStep] = useState(0);
  const step = LOOP_PREVIEW[activeStep] ?? LOOP_PREVIEW[0];

  return (
    <section
      aria-label={t("preview-title")}
      className={cn(
        "surface w-full max-w-md space-y-4 border-gold/25 p-4 sm:p-5",
        className,
      )}
    >
      <div>
        <p className="k-label">{t("preview-eyebrow")}</p>
        <h2 className="mt-1 font-display font-semibold text-lg tracking-tight">
          {t("preview-title")}
        </h2>
      </div>
      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <legend className="sr-only">{t("preview-choose-step")}</legend>
        {LOOP.map(({ stepKey, Icon }, i) => (
          <button
            key={stepKey}
            type="button"
            aria-pressed={activeStep === i}
            onClick={() => setActiveStep(i)}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2",
              activeStep === i
                ? "border-gold/50 bg-gold/10 text-foreground"
                : "border-border/70 text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            {t(stepKey)}
          </button>
        ))}
      </fieldset>
      <motion.div
        key={step.titleKey}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        aria-live="polite"
        className="inner-surface min-h-24 p-4"
      >
        <h3 className="font-medium text-foreground text-sm">
          {t(step.titleKey)}
        </h3>
        <p className="mt-1 text-muted-foreground text-sm leading-6">
          {t(step.bodyKey)}
        </p>
      </motion.div>
      <Button
        className="w-full justify-center"
        onClick={onLaunch}
        disabled={disabled}
      >
        {pending
          ? t("demo-setting-up")
          : t(signedIn ? "hero-dashboard-cta" : "preview-try")}
      </Button>
    </section>
  );
}

/**
 * The receipt, spelled out — and switchable.
 *
 * The hero film shows the moment; this is the same diagnosis, stilled and
 * explained, so a visitor can read it at their own pace. It is a *different*
 * chapter from the film (Cell biology, where the film is Plant physiology), so
 * the page never shows the same receipt twice.
 *
 * The subject switch matters more than it looks: it lets a History or
 * Geography student see their own chapter graded, which is the whole point of
 * speaking to every Ethiopian student rather than only the science ones.
 */
function DiagnosisSection() {
  const { t } = useLanguage();
  const reveal = useOnScreen<HTMLDivElement>();
  const [subjectId, setSubjectId] = useState<string>(MICRO_DEMO[0].id);
  const subject = MICRO_DEMO.find((s) => s.id === subjectId) ?? MICRO_DEMO[0];

  // The same levels every time, so the punchline beneath the card never lies.
  const names = subject.conceptKeys.map((key) => t(key));
  const mastery: Record<string, MasteryLevel> = {};
  const meta: Record<string, ConceptMeta> = {};
  subject.conceptKeys.forEach((key, i) => {
    const label = t(key);
    const level = MICRO_DEMO_LEVELS[i] ?? 0;
    mastery[label] = level;
    meta[label] = {
      weight: subject.weights[i] ?? 1,
      isMisconception: level === 2,
    };
  });

  return (
    <section className="mt-16" aria-labelledby="diagnosis-title">
      <div
        ref={reveal.ref}
        className={cn("space-y-6", reveal.shown && "kft-in")}
      >
        <div className="space-y-3">
          <p className="k-label">{t("diag-eyebrow")}</p>
          <h2
            id="diagnosis-title"
            className="max-w-2xl text-balance font-display font-semibold text-2xl text-foreground tracking-[-0.02em] sm:text-3xl"
          >
            {t("diag-title")}
          </h2>
          <p className="max-w-2xl text-muted-foreground text-sm leading-6 sm:text-base">
            {t("diag-sub")}
          </p>
        </div>

        {/* Three real receipts, one per word-based subject — so a visitor sees
            their own subject, not just the one we happened to pick. */}
        <div className="space-y-2.5">
          <p className="k-label">{t("demo-pick-subject")}</p>
          <div
            role="radiogroup"
            aria-label={t("demo-pick-subject")}
            className="inline-flex flex-wrap gap-1 rounded-full border border-border/70 bg-panel/60 p-1"
          >
            {MICRO_DEMO.map((option) => {
              const selected = option.id === subject.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "cursor-pointer rounded-full px-3.5 py-1.5 font-medium text-sm transition-colors duration-200 focus-within:outline-2 focus-within:outline-gold focus-within:outline-offset-2",
                    selected
                      ? "bg-gold/15 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name="demo-subject"
                    value={option.id}
                    checked={selected}
                    onChange={() => setSubjectId(option.id)}
                    className="sr-only"
                  />
                  {t(option.labelKey)}
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5">
          <motion.div
            key={subject.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="surface p-5 sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="k-label">{t(subject.unitKey)}</p>
                <h3 className="mt-1 truncate font-display font-semibold text-lg tracking-tight">
                  {t(subject.chapterKey)}
                </h3>
              </div>
              <p className="shrink-0 font-medium text-muted-foreground text-xs">
                {t("diag-one-minute")}
              </p>
            </div>
            <CoverageView
              covered={names.slice(0, 2)}
              missing={names.slice(4, 5)}
              misconceptions={names.slice(3, 4)}
              mastery={mastery}
              meta={meta}
              score={weightedMastery(mastery, meta, names)}
            />
          </motion.div>
          <p className="inner-surface border-gold/30 p-4 text-foreground text-sm leading-6">
            {t("diag-punchline")}
          </p>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const { t } = useLanguage();
  const faq = useOnScreen<HTMLElement>();
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  // Filter over both the question and its answer, so a student can search for
  // the word they actually remember ("offline", "Amharic") and still land on
  // the question that answers it — not only one that matches a title.
  const matches = term
    ? FAQ.filter(({ q, a }) => `${t(q)} ${t(a)}`.toLowerCase().includes(term))
    : [];
  const top = FAQ.filter(({ q }) => FAQ_TOP_KEYS.includes(q));
  const rest = FAQ.filter(({ q }) => !FAQ_TOP_KEYS.includes(q));

  const row = ({ q, a }: { q: MessageKey; a: MessageKey }, key?: string) => (
    <Disclosure key={key ?? q} summary={t(q)}>
      <p className="text-muted-foreground text-sm leading-6">{t(a)}</p>
    </Disclosure>
  );

  return (
    <section
      id="faq"
      ref={faq.ref}
      className={cn("mt-16 scroll-mt-24", faq.shown && "kft-in")}
    >
      <div className="mb-6 max-w-2xl space-y-3">
        <p className="k-label">{t("faq-eyebrow")}</p>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.02em] sm:text-3xl">
          {t("faq-title")}
        </h2>
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-xl border border-rust/40 bg-rust/[0.08] px-3.5 py-2.5"
        >
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-rust"
            aria-hidden="true"
          />
          <p className="font-medium text-rust text-sm leading-6">
            {t("faq-beta-note")}
          </p>
        </div>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("faq-search-placeholder")}
          aria-label={t("faq-search-placeholder")}
          className="w-full rounded-full border border-border bg-background/60 py-2.5 pr-4 pl-10 text-base text-foreground outline-none transition-colors duration-200 placeholder:text-muted-foreground focus-visible:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold/20 sm:text-sm"
        />
      </div>

      {term ? (
        matches.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("faq-search-empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {matches.map((item) => row(item, `match-${item.q}`))}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {top.map((item) => row(item))}{" "}
          <Disclosure summary={t("more-faq")}>
            <dl className="space-y-5">
              {rest.map(({ q, a }) => (
                <div key={q}>
                  <dt className="font-medium text-foreground text-sm leading-6">
                    {t(q)}
                  </dt>
                  <dd className="mt-1 text-muted-foreground text-sm leading-6">
                    {t(a)}
                  </dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        </div>
      )}
    </section>
  );
}

function useDemoLaunch() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const launch = async () => {
    if (sessionPending) return;
    if (session) {
      navigate("/dashboard", { viewTransition: true });
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      const sessionId = await startDemoStudy();
      navigate(`/study/${sessionId}`, { viewTransition: true });
    } catch (error) {
      setFailure(apiError(error));
      setPending(false);
    }
  };

  return {
    launch,
    pending,
    disabled: pending || sessionPending,
    failure,
    signedIn: Boolean(session),
  };
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
  const { launch, pending, disabled, failure, signedIn } = useDemoLaunch();
  const { t } = useLanguage();

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <Button
        size={size}
        variant={variant === "primary" ? "default" : "outline"}
        onClick={launch}
        disabled={disabled}
        className="w-full font-medium sm:w-auto"
      >
        {pending
          ? t("demo-setting-up")
          : signedIn
            ? t("hero-dashboard-cta")
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
