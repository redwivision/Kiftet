import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { cn } from "@kiftet/ui/lib/utils";
import {
  BookText,
  Bot,
  ChevronDown,
  CircleAlert,
  ListChecks,
  Mic,
  RefreshCcw,
  ScanSearch,
  Search,
  Volume2,
} from "lucide-react";
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
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
        "It looks familiar — can you explain it? Kiftet hears you explain a chapter, finds the ideas you can't, and gives you the shortest plan to learn them. Built for the Ethiopian national exam.",
    },
  ];
}

/* The public loop, told in four words. The study screen has its own, longer
   pills; these are the skimmable version for someone who has never seen the
   product, so each is a verb a student recognises, not a feature name. */
const LOOP = [
  { stepKey: "step-speak", Icon: Mic },
  { stepKey: "step-diagnose", Icon: ScanSearch },
  { stepKey: "step-relearn", Icon: Volume2 },
  { stepKey: "step-retest", Icon: RefreshCcw },
] as const satisfies readonly {
  stepKey: MessageKey;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[];

const PASS_RATES = [
  { year: "2023", rate: "3.2%" },
  { year: "2024", rate: "5.4%" },
  { year: "2025", rate: "8.4%" },
  { year: "2026", rate: "12.8%" },
] as const;

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

/* The five that answer "what is it, do I need it, will it run here" — the rest
   live one tap away. A wall of sixteen is what stops the read. */
const FAQ_TOP_KEYS: readonly MessageKey[] = [
  "faq-what-q",
  "faq-free-q",
  "faq-offline-q",
  "faq-different-q",
  "faq-amharic-q",
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
  const { launch, pending, failure } = useDemoLaunch();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
      {/* ── Hero: the promise, and the demo one tap away ──────── */}
      <section className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
        <div ref={hero.ref} className={cn("space-y-6", hero.shown && "kft-in")}>
          <p className="k-label text-gold">{t("hero-eyebrow")}</p>
          <h1 className="relative isolate font-display font-semibold text-4xl text-foreground leading-[1.06] tracking-[-0.03em] sm:text-5xl sm:leading-[1.05]">
            <span aria-hidden="true" className="halo" />
            <Words text={t("hero-h1")} />
          </h1>

          <p
            className="kft-rise max-w-xl text-base text-foreground/90 leading-7 sm:text-lg"
            style={{ "--kft-i": "220ms" } as CSSProperties}
          >
            {t("hero-line")}
          </p>

          <div
            className="kft-rise flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ "--kft-i": "320ms" } as CSSProperties}
          >
            <Button
              size="lg"
              onClick={launch}
              disabled={pending}
              className="w-full font-medium sm:w-auto"
            >
              {pending ? t("demo-setting-up") : t("hero-cta")}
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
          <p className="text-muted-foreground text-sm">{t("hero-micro")}</p>
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

      {/* ── How it works: four words, no paragraphs ───────────── */}
      <section
        id="how"
        ref={how.ref}
        className={cn("scroll-mt-24 pt-16", how.shown && "kft-in")}
      >
        <h2 className="font-display font-semibold text-2xl tracking-[-0.02em] sm:text-3xl">
          {t("loop-title")}
        </h2>
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
        <p className="mt-6 text-muted-foreground text-sm">
          {t("no-account")}{" "}
          <Link
            to="/dashboard"
            className="font-medium text-gold underline underline-offset-4 transition-colors duration-200 hover:text-gold-soft"
          >
            {t("start-closing")}
          </Link>
        </p>

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

/* The product, shown as itself: a live-looking recall card that already
   finished a diagnosis. Reuses the real CoverageView so the landing and the
   product can never drift apart visually. */
function DemoCard() {
  const { t } = useLanguage();
  const { launch, pending } = useDemoLaunch();
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
        <Button
          variant="outline"
          onClick={launch}
          disabled={pending}
          className="w-full justify-center font-medium"
        >
          {t("see-your-chapter")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The one receipt on the page.
 *
 * Everything else here is a claim. This one shows a real Biology 12 checklist
 * and the levels a spoken recall lands on, so a visitor can recognise their own
 * Tuesday night — "I said the word, I just didn't say what it meant" is the
 * feeling the product exists for. The four levels are drawn by CoverageView
 * itself (its legend covers them), so the explainer list it used to carry is
 * gone and only the punchline remains.
 *
 * Biology 12 on purpose. We do not claim Mathematics or Physics (a spoken
 * explanation cannot show that someone can calculate), so the page stays on
 * word-based subjects.
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

        <div className="grid gap-5">
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
          className="w-full rounded-full border border-border bg-background/60 py-2.5 pr-4 pl-10 text-foreground text-sm outline-none transition-colors duration-200 placeholder:text-muted-foreground focus-visible:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold/20"
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
    <div className={cn("flex flex-col items-center gap-1", className)}>
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
