import { Button } from "@kiftet/ui/components/button";
import { Textarea } from "@kiftet/ui/components/textarea";
import { cn } from "@kiftet/ui/lib/utils";
import {
  BookOpen,
  Check,
  CircleAlert,
  MicOff,
  PlayCircle,
  Search,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BrandMark, GapClosingMark } from "@/components/brand-mark";
import { DemoExpiredNotice } from "@/components/demo-expired-notice";
import { CoverageView } from "@/components/gap-list";
import { GuideView } from "@/components/guide-view";
import { InkSettling } from "@/components/ink-settling";
import { KiftetLoader, LoadingVeil } from "@/components/kiftet-loader";
import { useLanguage } from "@/components/language-provider";
import { MasteryRing, SegmentedRing } from "@/components/mastery-ring";
import { ShortcutHint } from "@/components/shortcut-hint";
import {
  type AnswerRecord,
  type CognitiveLevel,
  type Gaps,
  type RecallMode,
  type StudyPlan,
  StudyProvider,
  useStudy,
} from "@/components/study-provider";
import { VoiceRing } from "@/components/voice-ring";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { ApiError, api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getDemoUser, isDemoVisitor } from "@/lib/demo";
import { haptic } from "@/lib/haptics";
import {
  markInstallHintOffered,
  readInstallEnv,
  shouldOfferInstall,
} from "@/lib/install";
import { countWords, findBoundaryEnd, leadingText } from "@/lib/intent";
import type { ConceptMeta } from "@/lib/mastery";
import type { MessageKey } from "@/lib/messages";
import { shareClosedGapCard } from "@/lib/share-card";
import {
  type ChecklistRow,
  cacheChecklist,
  getCachedChecklist,
} from "@/lib/store";
import { getRecallHint, getRetestHint } from "@/lib/subject-strategy";
import { useLoopTabChrome } from "@/lib/tab-chrome";
import { visibleChapterTitle } from "@/lib/textbook";
import {
  speakAloud,
  splitSentences,
  stopReadingAloud,
  type VoiceState,
} from "@/lib/voice";
import { useWakeLock } from "@/lib/wake-lock";
import type { Route } from "./+types/study.$sessionId";

// The sample answer demo visitors can submit without speaking a word. Written
// to land where the demo chapter expects: a few concepts named right, a few
// left out, and one classic muddle ("chloroplasts are in animal cells") so the
// plan has a "fix this first" step to show off.
const DEMO_SAMPLE_RECALL =
  "The cell is the basic unit of all living things. The plasma membrane controls what goes in and out. The nucleus holds the DNA and controls the cell. Ribosomes build proteins, and the cytoplasm is the fluid inside the cell. Mitochondria release energy. Chloroplasts are found in animal cells where they store energy.";

// The one-time first-run nudge: shown under the ring on a student's first
// recall, dismissed forever after. Remembered locally, not on the account —
// the point is helping a person get started, not tracking them.
const HINT_KEY = "kiftet-recall-hint-dismissed";

function FirstRunHint() {
  const { t } = useLanguage();
  // Hidden on the server and on first client paint, then revealed once we can
  // read the local flag — reading it during render would desync hydration.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_KEY) !== "1") setDismissed(false);
    } catch {
      // Private mode: leave the hint hidden rather than nag.
    }
  }, []);
  if (dismissed) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // Private mode: the hint just reappears next time. Not worth an error.
    }
    setDismissed(true);
  };
  return (
    <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-gold/[0.06] px-4 py-3">
      <p className="text-foreground/85 text-sm leading-6">
        {t("hint-first-recall")}
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-full border border-gold/30 px-3 py-1.5 font-medium text-gold text-xs transition-colors duration-200 hover:bg-gold/10"
      >
        {t("hint-dismiss")}
      </button>
    </div>
  );
}

// Offered once, on the result of the first completed loop, and only on a touch
// device that is not already installed. Unlike FirstRunHint this is one-time by
// construction: the moment it appears we record that it was offered, so no
// later loop repeats it. A nudge about the home screen should feel like a
// well-timed suggestion, not a banner that keeps coming back.
function AddToHomeHint() {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shouldOfferInstall(readInstallEnv())) return;
    markInstallHintOffered();
    setShown(true);
  }, []);
  if (!shown) return null;
  return (
    <div className="mx-auto mt-6 flex max-w-md items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-gold/[0.06] px-4 py-3">
      <p className="text-foreground/85 text-sm leading-6">
        {t("hint-add-home")}
      </p>
      <button
        type="button"
        onClick={() => setShown(false)}
        className="shrink-0 rounded-full border border-gold/30 px-3 py-1.5 font-medium text-gold text-xs transition-colors duration-200 hover:bg-gold/10"
      >
        {t("hint-dismiss")}
      </button>
    </div>
  );
}

// A closed-gap card the student can choose to share. Off by default and only
// ever made on a deliberate tap; the card itself names nothing about them. If
// the platform can't share a file, the button quietly downloads instead — the
// option is always honored, never a dead end.
function ShareCardButton() {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shareClosedGapCard(t("share-card-caption"), lang);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void share()}
      disabled={busy}
      className="w-full text-center text-muted-foreground text-xs underline underline-offset-4 transition-colors duration-200 hover:text-foreground disabled:opacity-50"
    >
      {t("share-card")}
    </button>
  );
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Study — Kiftet" },
    {
      name: "description",
      content:
        "Say what you remember, see what's missing, read the short lesson, then test yourself.",
    },
  ];
}

// The four loop pills, keyed by phase so the label can follow the language
// pref while the ordering (and the "Step a of b" math) stays structural.
const STEPS = [
  { phase: "recall", labelKey: "step-speak" },
  { phase: "gaps", labelKey: "step-diagnose" },
  { phase: "lesson", labelKey: "step-relearn" },
  { phase: "retest", labelKey: "step-retest" },
] as const;

export default function StudyRoute({ params }: Route.ComponentProps) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) {
    return (
      <main className="mx-auto grid min-h-64 place-items-center px-6 py-24 text-muted-foreground">
        <InkSettling />
      </main>
    );
  }
  if (!session && !getDemoUser()) {
    return <NavigateToLogin />;
  }
  // A demo room is a signed-out stranger trying the product. A signed-in
  // student is dedicating — even if a demo id is still lying around in this
  // browser (a social sign-in that never cleared it, say), the session wins,
  // so the loop never wears demo chrome in front of them.
  const demo = isDemoVisitor(session, getDemoUser());
  // Speaking is a signed-in feature. A stranger in the demo room gets the same
  // loop by typing (and the sample answer), never the mic — the account is what
  // makes a spoken explanation worth recording, and it keeps the anonymous room
  // from becoming a free transcription endpoint.
  const voiceAllowed = Boolean(session);
  return (
    <StudyProvider sessionId={params.sessionId}>
      <StudyScreen demo={demo} voiceAllowed={voiceAllowed} />
    </StudyProvider>
  );
}

function NavigateToLogin() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/login", { replace: true });
  }, [navigate]);
  return null;
}

function StudyScreen({
  demo,
  voiceAllowed,
}: {
  demo: boolean;
  voiceAllowed: boolean;
}) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { state, retryAgain, retryLast, completeSession, clearError } =
    useStudy();
  // `demo` is threaded down from the route so a signed-in student is never
  // dressed as a visitor: the banner and the no-effort sample-answer on-ramp
  // belong to the anonymous room only.
  // Tier 3: the tab names the phase and the favicon is the ring closing as the
  // loop advances. Called before the early returns below so hook order holds.
  useLoopTabChrome(state.phase);
  // Tier 3: hold the screen on through the two phases the student just sits
  // and works — speaking a recall, reading a lesson. A phone that sleeps then
  // is a dropped voice session, and the loop's rhythm breaks with it.
  useWakeLock(state.phase === "recall" || state.phase === "lesson");

  if (state.demoExpired) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24">
        <DemoExpiredNotice />
      </main>
    );
  }

  if (state.chapterLoading) {
    return (
      <main className="mx-auto grid w-full max-w-md content-center justify-items-center gap-4 px-6 py-24 text-muted-foreground">
        <KiftetLoader size={56} label={t("opening")} />
        <p className="text-sm">{t("opening")}</p>
      </main>
    );
  }

  if (state.sessionNotFound || !state.chapter) {
    return (
      <main className="mx-auto grid w-full max-w-md content-center gap-4 px-6 py-24 text-center">
        <h1 className="font-display font-semibold text-2xl text-foreground tracking-tight">
          {t("session-missing")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("session-missing-body")}
        </p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          {t("back-to-chapters")}
        </Button>
      </main>
    );
  }

  const done = async () => {
    await completeSession();
    navigate("/dashboard");
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <LoadingVeil show={state.busy} label={t("loading")} />
      {demo && (
        <div className="surface mb-6 flex flex-wrap items-center justify-between gap-3 border p-4 text-sm">
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
      <div className="surface overflow-hidden">
        <SessionHeader
          subject={state.chapter.subject}
          title={visibleChapterTitle(state.chapter.title).title}
          phase={state.phase}
        />

        <div className="p-6 sm:p-8">
          {state.notice && (
            <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-gold/25 bg-gold/[0.07] px-4 py-3 text-sm">
              <p className="text-foreground/90 leading-6">
                <span className="mr-1.5 font-medium text-gold">
                  {t("notice")}
                </span>
                {state.notice}
              </p>
              <button
                type="button"
                onClick={() => {
                  const text = state.notice;
                  if (text) void speak(text);
                }}
                aria-label={t("read-notice")}
                className="mt-0.5 shrink-0 rounded-full border border-gold/30 bg-gold/10 p-2 text-gold transition-colors duration-200 hover:bg-gold/20"
              >
                <Volume2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {state.demoExpired ? (
            <DemoExpiredNotice />
          ) : state.error ? (
            <div className="mb-5 rounded-2xl border border-rust/40 bg-rust/10 px-4 py-3 text-sm">
              <p className="mb-1 font-medium text-rust">
                {t("something-went-wrong")}
              </p>
              <p className="text-muted-foreground">{state.error}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => void retryLast()}>
                  {t("retry")}
                </Button>
                <Button size="sm" variant="ghost" onClick={clearError}>
                  {t("dismiss")}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="animate-fade-in" key={state.phase}>
            {state.phase === "recall" && (
              <RecallPhase demo={demo} voiceAllowed={voiceAllowed} />
            )}
            {state.phase === "targeted" && (
              <TargetedRecallPhase voiceAllowed={voiceAllowed} />
            )}
            {state.phase === "gaps" && (
              <GapsPhase startHereConcept={state.plan?.steps[0]?.concept} />
            )}
            {state.phase === "lesson" && <LessonPhase />}
            {state.phase === "retest" && (
              <RetestPhase voiceAllowed={voiceAllowed} />
            )}
            {state.phase === "result" && (
              <ResultPhase onDone={done} onTryAgain={retryAgain} />
            )}
            {state.phase === "result" && <AddToHomeHint />}
          </div>
        </div>
      </div>
    </main>
  );
}

function speak(text: string) {
  // Chrome's speechSynthesis truncates long utterances and drops a bulk-queued
  // batch partway — so we always go through the sentence-chunked, end-chained
  // queue in lib/voice.ts speakAloud. The read-back never cuts off without
  // finishing. See docs/howItWorks/dataflow.md §5 sep of concerns.
  speakAloud(text);
}

function SessionHeader({
  subject,
  title,
  phase,
}: {
  subject: string;
  title: string;
  phase: string;
}) {
  const { t } = useLanguage();
  // "targeted" is a recall of its own kind, so it keeps the recall step lit.
  const stepPhase = phase === "targeted" ? "recall" : phase;
  const current =
    phase === "result"
      ? STEPS.length
      : Math.max(1, STEPS.findIndex((s) => s.phase === stepPhase) + 1);

  return (
    <header className="border-border/60 border-b px-4 pt-5 pb-5 sm:px-6 sm:pt-6 dark:border-white/10">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="k-label">{subject}</p>
            <h1 className="font-display font-semibold text-2xl text-foreground tracking-[-0.02em] sm:text-3xl">
              {title}
            </h1>
          </div>
          <div className="hidden h-9 w-9 shrink-0 rounded-full ring-1 ring-gold/40 sm:block">
            <BrandMark size={36} className="rounded-full" />
          </div>
        </div>
        <p className="font-medium text-[0.78rem] text-muted-foreground">
          {t("step-of", { a: current, b: STEPS.length })}
        </p>
      </div>

      <ol className="flex items-center gap-1" aria-label={t("loop-aria")}>
        {STEPS.map((step, i) => {
          const done =
            i + 1 < current || (phase === "result" && i + 1 === current);
          const active = i + 1 === current && phase !== "result";
          return (
            <li key={step.phase} className="flex flex-1 items-center gap-1">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2 font-medium text-[0.78rem] transition-colors",
                  active && "border border-gold/40 bg-gold/10 text-gold",
                  done && "text-sage",
                  !active && !done && "text-muted-foreground/70",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-full",
                    done ? "bg-sage/15" : active ? "bg-gold/15" : "bg-muted/40",
                  )}
                >
                  {done ? (
                    <Check className="size-2.5" aria-hidden="true" />
                  ) : (
                    <span className="font-display font-semibold text-[0.78rem]">
                      {i + 1}
                    </span>
                  )}
                </span>
                {/* Label text hides on very narrow screens — the four pills
								    then fit 320px without wrapping. Names stay in the DOM for
								    screen readers (aria-label on the list + aria-current here). */}
                <span className="hidden sm:inline">{t(step.labelKey)}</span>
              </span>
              {i < STEPS.length - 1 && (
                <span
                  className="relative h-px flex-1 overflow-hidden bg-border/60 dark:bg-white/10"
                  aria-hidden="true"
                >
                  {/* The gold fill — "the gap closing through the loop".
									    Scales from the left as its step completes. */}
                  <span
                    className={cn(
                      "absolute inset-0 origin-left bg-gradient-to-r from-gold to-gold/40 transition-transform duration-500 ease-out",
                      done ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </header>
  );
}

// ── Voice capture ───────────────────────────────────────────────

// The one way to give an answer, spoken or typed. Voice rides on the browser's
// own SpeechRecognition behind lib/voice.ts (`useVoiceSession`); when it is
// missing, or disallowed in the signed-out demo room, or the mic errors, the
// same component degrades to the text recorder so the loop never dead-ends.
function VoiceCapture({
  submit,
  voiceAllowed,
  busy,
  placeholder,
  buttonLabel,
}: {
  submit: (text: string) => Promise<void>;
  voiceAllowed: boolean;
  busy: boolean;
  placeholder?: string;
  buttonLabel?: string;
}) {
  const { state, setNotice, clearNotice } = useStudy();
  const { t } = useLanguage();
  const voice = useVoiceSession();
  // The browser voice layer only exists on the client, and only where
  // SpeechRecognition does. Deciding that after mount keeps SSR and the first
  // client paint in agreement (a mismatch would flash the wrong control).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const voiceReady = mounted && voiceAllowed && voice.isSupported;
  const [showText, setShowText] = useState(false);
  const effectiveText = showText || !voiceReady;

  const busyRef = useRef(busy);
  busyRef.current = busy;
  const noticeRef = useRef<string | null>(state.notice);
  noticeRef.current = state.notice;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  // The answer so far: the finalized transcript plus whatever is still interim.
  // Read through a ref from timers and effects so it is never frozen at the
  // value it had when the effect first ran.
  const spoken = `${voice.transcript} ${voice.interim}`
    .replace(/\s+/g, " ")
    .trim();
  const spokenRef = useRef(spoken);
  spokenRef.current = spoken;

  const baseKey =
    state.phase === "retest"
      ? `retest:${state.currentQuestion}`
      : `phase:${state.phase}`;

  // Which capture window is current. Written when the window opens, read by the
  // grace timer so a timer left over from a previous question tears itself down
  // instead of nudging a student who has already moved on.
  const windowKeyRef = useRef(baseKey);
  // True once this window's answer has been handed to `submit`, so the
  // listening→idle edge never sends the same words twice.
  const submittedRef = useRef(false);
  // True once the student (or the end-of-speech cue) has asked to stop, so an
  // empty result is reported rather than silently swallowed.
  const stoppingRef = useRef(false);

  // Open a fresh capture window when the phase or question changes: forget the
  // previous turn and clear any stale nudge. Deliberately keyed on `baseKey`
  // alone — it must fire once per phase/question, not per streamed chunk.
  useEffect(() => {
    windowKeyRef.current = baseKey;
    submittedRef.current = false;
    stoppingRef.current = false;
    voiceRef.current.reset();
    clearNotice();
  }, [baseKey, clearNotice]);

  // A single quiet tick the moment the mic starts listening, so the ring
  // answering under your finger is felt, not only seen. Silent where the
  // hardware or the person's reduced-motion setting says no.
  useEffect(() => {
    if (voice.state !== "listening") return;
    haptic(10);
  }, [voice.state]);

  // Auto-end: when the student signals they've finished speaking ("that's all I
  // remember"), finalize on the spot so the loop advances without a second tap.
  // Keyed on the transcript + interim so it re-runs per streamed chunk — the
  // cue may only be complete on the last one. A cue mid-sentence is not an
  // ending — only fire when it is in the last words of the turn, counted with
  // countWords so Amharic is measured in Amharic.
  useEffect(() => {
    if (busyRef.current) return;
    if (voice.state !== "listening") return;
    const now = `${voice.transcript} ${voice.interim}`
      .replace(/\s+/g, " ")
      .trim();
    if (!now) return;
    const marker = findBoundaryEnd(now);
    if (!marker) return;
    if (countWords(now.slice(marker.index + marker.phrase.length)) > 6) return;
    // Everything before the cue is the answer; the cue itself is not part of it.
    const finished = leadingText(now, marker.index).trim();
    stoppingRef.current = true;
    submittedRef.current = true;
    voice.stop();
    if (finished) {
      void submit(finished);
    } else {
      setNotice(t("voice-catch-none"));
    }
  }, [
    voice.state,
    voice.transcript,
    voice.interim,
    voice.stop,
    submit,
    t,
    setNotice,
  ]);

  // Finalize: when capture goes from listening to idle, everything said is the
  // answer. `onend` hands over the one consolidated final transcript, so by the
  // time the state is idle `voice.transcript` holds the whole turn.
  useEffect(() => {
    if (busyRef.current) return;
    if (voice.state !== "idle") return;
    if (submittedRef.current) return;
    const now = `${voice.transcript} ${voice.interim}`
      .replace(/\s+/g, " ")
      .trim();
    if (now) {
      submittedRef.current = true;
      void submit(now);
    } else if (stoppingRef.current) {
      stoppingRef.current = false;
      setNotice(t("voice-catch-deferred"));
    }
  }, [voice.state, voice.transcript, voice.interim, submit, t, setNotice]);

  // Grace state: after a long stretch of no speech while listening, reassure the
  // student instead of timing them out. Never emits failure copy on our own.
  // The transcript is read through a ref on every tick — reading it from the
  // closure would freeze it at mount and fire a false nudge mid-answer.
  useEffect(() => {
    if (voice.state !== "listening") return;
    // Pinned to the window it started in: a tick that finds the student has
    // moved on retires the timer instead of nudging them.
    const windowKey = baseKey;
    let last = spokenRef.current;
    let lastChangedAt = Date.now();
    const timer = setInterval(() => {
      if (windowKey !== windowKeyRef.current) {
        clearInterval(timer);
        return;
      }
      const now = spokenRef.current;
      if (now !== last) {
        if (noticeRef.current) clearNotice();
        last = now;
        lastChangedAt = Date.now();
        return;
      }
      if (Date.now() - lastChangedAt >= 7000) {
        setNotice(t("voice-still-listening"));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [voice.state, baseKey, clearNotice, setNotice, t]);

  // Tap once to open the mic, tap again to close it and send what was said.
  const toggle = () => {
    if (voice.state === "listening") {
      stoppingRef.current = true;
      voice.stop();
      return;
    }
    if (voice.state === "idle") {
      clearNotice();
      voice.start();
    }
  };

  const lastJustSaid = spoken || undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3">
        {effectiveText ? (
          <div className="grid size-32 place-items-center rounded-full border-2 border-border border-dashed text-muted-foreground/40 dark:border-white/20">
            <MicOff className="size-8" aria-hidden="true" />
          </div>
        ) : (
          <VoiceRing
            state={voice.state}
            onToggle={toggle}
            ariaLabel={captureCaption(voice.state, state.phase, t)}
            shortcutLabel={t("shortcut-talk-label")}
          />
        )}

        {!effectiveText && (
          <p
            className="max-w-md text-center font-medium text-foreground/80 text-sm leading-6"
            aria-live="polite"
          >
            {captureCaption(voice.state, state.phase, t)}
          </p>
        )}

        {/* Why there is no ring — signed-out, or a browser without speech. */}
        {effectiveText && mounted && (
          <p className="max-w-md text-center text-muted-foreground text-sm leading-6">
            {voiceAllowed ? t("voice-unsupported") : t("voice-signin-only")}
          </p>
        )}

        {!effectiveText && voice.state === "listening" && <ElapsedTimer />}

        {busy && (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <InkSettling />
            {t("recall-reading")}
          </p>
        )}
      </div>

      {/* What you said, read back — rendered exactly once. */}
      {!effectiveText && lastJustSaid && (
        <div className="mx-auto max-w-md rounded-2xl border border-sage/25 bg-sage/[0.06] px-4 py-3 text-sm">
          <p className="mb-1 font-medium text-[0.78rem] text-sage">
            {t("what-you-said")}
          </p>
          <p className="text-foreground/90 leading-6">{lastJustSaid}</p>
          <button
            type="button"
            onClick={() => speak(lastJustSaid)}
            className="mt-2 inline-flex items-center gap-1.5 font-medium text-sage text-xs underline underline-offset-4 transition-colors duration-200 hover:text-sage-soft"
          >
            <Volume2 className="size-3.5" aria-hidden="true" />
            {t("read-it-back")}
          </button>
        </div>
      )}

      {/* The mic failed mid-turn: say so instead of leaving a dead ring. */}
      {!effectiveText && voice.error && (
        <p className="mx-auto max-w-md rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-center text-muted-foreground text-xs leading-5">
          {t("voice-error")}
        </p>
      )}

      {effectiveText && (
        <TextRecorder
          busy={busy}
          submit={submit}
          placeholder={placeholder}
          buttonLabel={buttonLabel}
        />
      )}

      {voiceReady && (
        <div className="text-center">
          <button
            type="button"
            className="text-muted-foreground text-xs underline underline-offset-4 transition-colors duration-200 hover:text-foreground"
            onClick={() => setShowText((v) => !v)}
          >
            {showText ? t("try-voice-instead") : t("prefer-typing")}
          </button>
        </div>
      )}
    </div>
  );
}

type Translate = ReturnType<typeof useLanguage>["t"];

// The ring is push-to-talk, so its captions are the `st-*` strings: "tap the
// ring when you're done", not the always-on verbs. The idle line swaps on the
// retest pass, because recalling and answering want different prompts.
const CAPTION_KEYS: Record<
  "recall" | "answer",
  Record<VoiceState, MessageKey>
> = {
  recall: {
    idle: "st-recall-idle",
    listening: "st-listening",
    thinking: "st-thinking",
    speaking: "st-speaking",
  },
  answer: {
    idle: "st-answer-idle",
    listening: "st-listening",
    thinking: "st-thinking",
    speaking: "st-speaking",
  },
};

function captureCaption(
  state: VoiceState,
  phase: string,
  t: Translate,
): string {
  const table = phase === "retest" ? CAPTION_KEYS.answer : CAPTION_KEYS.recall;
  return t(table[state]);
}

// A calm elapsed clock, shown only while the mic is listening. It answers the
// one question a person speaking has — "how long have I been going?" — without
// ever counting down or turning a pause into a deadline.
function ElapsedTimer() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(
      () => setSecs(Math.floor((Date.now() - started) / 1000)),
      500,
    );
    return () => window.clearInterval(id);
  }, []);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className="font-medium text-muted-foreground text-sm tabular-nums">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function TextRecorder({
  busy,
  submit,
  placeholder,
  buttonLabel,
}: {
  busy: boolean;
  submit: (text: string) => Promise<void>;
  placeholder?: string;
  buttonLabel?: string;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");

  const doSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setText("");
    await submit(trimmed);
  };

  return (
    <div className="mx-auto max-w-md space-y-2">
      <Textarea
        name="recall"
        aria-label={t("recall-aria")}
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? t("type-your-answer")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void doSubmit();
        }}
        className="border-border/70 bg-background/60 text-foreground placeholder:text-muted-foreground dark:border-white/10 dark:bg-white/[0.05]"
      />
      <Button
        className="w-full justify-center"
        onClick={() => void doSubmit()}
        disabled={!text.trim() || busy}
      >
        {buttonLabel ?? t("submit")}
      </Button>
    </div>
  );
}

// ── Phases ──────────────────────────────────────────────────────

function PhaseHeading({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-6 space-y-1.5">
      <h2 className="font-display font-semibold text-foreground text-xl tracking-[-0.01em] sm:text-2xl">
        {title}
      </h2>
      <p className="text-muted-foreground text-sm leading-6">{text}</p>
    </div>
  );
}

// Bet 3: the honest "parked" state. A queued submission is NOT a score — it
// just means the words are safely on the phone and will be graded once a
// connection comes back. No progress number, no right/wrong, no result.
function QueuedPanel({ text }: { text: string }) {
  const { t } = useLanguage();
  return (
    <div className="inner-surface border border-rust/30 bg-rust/[0.07] px-4 py-3 text-sm">
      <p className="mb-1 font-medium text-rust">{t("saved-waiting")}</p>
      <p className="text-foreground/85 leading-6">{text}</p>
    </div>
  );
}

// The shared cognitive standard the server tags each question with, rendered
// as a small label so the student can see what kind of thinking is asked for.
const LEVEL_KEYS: Record<CognitiveLevel, MessageKey> = {
  knowledge: "level-knowledge",
  comprehension: "level-comprehension",
  application: "level-application",
  critical_thinking: "level-critical-thinking",
  compare_contrast: "level-compare-contrast",
};

function LevelBadge({
  level,
  beyondText,
}: {
  level?: CognitiveLevel;
  beyondText?: boolean;
}) {
  const { t } = useLanguage();
  if (!level && !beyondText) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {level && (
        <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 font-medium text-[0.72rem] text-gold">
          {t(LEVEL_KEYS[level])}
        </span>
      )}
      {beyondText && (
        <span className="rounded-full border border-sage/40 bg-sage/10 px-2 py-0.5 font-medium text-[0.72rem] text-sage">
          {t("beyond-textbook")}
        </span>
      )}
    </span>
  );
}

// The per-question feedback list, shared by the retest and targeted recall so
// both families read the same way: what was asked, what the student said, and
// which ideas are still open.
function AnswerResults({ answered }: { answered: AnswerRecord[] }) {
  const { t } = useLanguage();
  return (
    <ul className="space-y-2">
      {answered.map((a, i) => (
        <li
          key={i}
          className={cn(
            "inner-surface flex items-start gap-3 px-4 py-3",
            a.correct ? "dark:border-sage/25" : "dark:border-rust/30",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
              a.correct ? "bg-sage/15 text-sage" : "bg-rust/15 text-rust",
            )}
          >
            {a.correct ? (
              <Check className="size-3" />
            ) : (
              <X className="size-3" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[0.78rem] text-muted-foreground">
              {t("question-i", { n: i + 1 })} ·{" "}
              {a.correct ? t("right") : t("still-open")}
            </p>
            <p className="mt-0.5 text-foreground/85 text-sm leading-6">
              {a.question}
            </p>
            <p className="mt-2 text-foreground/70 text-xs leading-5">
              <span className="font-medium text-muted-foreground">
                {t("you-said")}{" "}
              </span>
              {a.answer || t("recorded-by-voice")}
            </p>
            {(a.gaps.missing.length > 0 ||
              a.gaps.misconceptions.length > 0) && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-[0.78rem] text-muted-foreground">
                  {t("still-open")}
                </span>
                {[...a.gaps.missing, ...a.gaps.misconceptions].map(
                  (concept, gi) => (
                    <span
                      key={`${gi}-${concept}`}
                      className="rounded-full border border-rust/40 bg-rust/10 px-2 py-0.5 font-medium text-[0.78rem] text-rust"
                    >
                      {concept}
                    </span>
                  ),
                )}
              </p>
            )}
            {a.gaps.covered.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-[0.78rem] text-muted-foreground">
                  {t("landed")}
                </span>
                {a.gaps.covered.map((concept, gi) => (
                  <span
                    key={`${gi}-${concept}`}
                    className="rounded-full border border-sage/40 bg-sage/10 px-2 py-0.5 font-medium text-[0.78rem] text-sage"
                  >
                    {concept}
                  </span>
                ))}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// The upfront choice: how the student wants to remember. Kept as a small radio
// group so the loop's shape is the student's call, and persisted so a reload
// keeps the same flow.
function RecallModeChooser({
  value,
  onChange,
}: {
  value: RecallMode;
  onChange: (mode: RecallMode) => void;
}) {
  const { t } = useLanguage();
  const options: { mode: RecallMode; label: MessageKey; desc: MessageKey }[] = [
    {
      mode: "blurting",
      label: "recall-mode-blurting",
      desc: "recall-mode-blurting-desc",
    },
    {
      mode: "targeted",
      label: "recall-mode-targeted",
      desc: "recall-mode-targeted-desc",
    },
    { mode: "both", label: "recall-mode-both", desc: "recall-mode-both-desc" },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="k-label mb-2 block">{t("recall-mode-label")}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => {
          const active = value === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.mode)}
              className={cn(
                "rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200",
                active
                  ? "border-gold/40 bg-gold/10"
                  : "border-border/60 hover:bg-muted/40 dark:border-white/10",
              )}
            >
              <span
                className={cn(
                  "block font-medium text-sm",
                  active ? "text-gold" : "text-foreground",
                )}
              >
                {t(o.label)}
              </span>
              <span className="mt-0.5 block text-muted-foreground text-xs leading-5">
                {t(o.desc)}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function RecallPhase({
  demo,
  voiceAllowed,
}: {
  demo: boolean;
  voiceAllowed: boolean;
}) {
  const { state, submitRecall, setRecallMode, startRecallQuestions } =
    useStudy();
  const { t } = useLanguage();
  // Stable so VoiceCapture's capture effects can depend on it honestly instead
  // of re-running on every render of an inline arrow.
  const submitText = useCallback(
    (text: string) => submitRecall(text),
    [submitRecall],
  );

  if (state.queued?.kind === "recall") {
    return (
      <div className="space-y-6">
        <PhaseHeading title={t("recall-title")} text={t("recall-text")} />
        <QueuedPanel text={t("queued-recall")} />
      </div>
    );
  }

  const subjectHint = getRecallHint(state.chapter?.subject ?? "");
  const targeted = state.recallMode === "targeted";
  return (
    <div className="space-y-6">
      <PhaseHeading title={t("recall-title")} text={t("recall-text")} />
      <RecallModeChooser value={state.recallMode} onChange={setRecallMode} />
      {subjectHint && (
        <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] px-4 py-3 text-sm">
          <p className="text-muted-foreground text-xs leading-5">
            {subjectHint}
          </p>
        </div>
      )}
      {targeted ? (
        <div className="inner-surface space-y-4 p-5">
          <p className="text-foreground/85 text-sm leading-6">
            {t("recall-mode-targeted-desc")}
          </p>
          <Button
            className="w-full justify-center"
            disabled={state.busy}
            onClick={() => void startRecallQuestions("chapter")}
          >
            {state.busy ? t("grading") : t("targeted-start")}
          </Button>
        </div>
      ) : (
        <>
          <VoiceCapture
            submit={submitText}
            voiceAllowed={voiceAllowed}
            busy={state.busy}
          />
          {!demo && <FirstRunHint />}
          {demo && (
            <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] px-4 py-3 text-sm">
              <p className="text-muted-foreground text-xs leading-5">
                {t("plan-demo-sample-note")}
              </p>
              <Button
                className="mt-2.5"
                variant="outline"
                size="sm"
                disabled={state.busy}
                onClick={() => void submitRecall(DEMO_SAMPLE_RECALL)}
              >
                {state.busy ? t("preparing") : t("plan-demo-sample")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GapsPhase({ startHereConcept }: { startHereConcept?: string }) {
  const { state, fetchLesson, startRetest, startRecallQuestions } = useStudy();
  const { t } = useLanguage();
  const [budgetMinutes, setBudgetMinutes] = useState<10 | 20 | 40>(() => {
    if (typeof window === "undefined") return 20;
    const saved = window.localStorage.getItem("kiftet-plan-budget");
    return saved === "10" || saved === "20" || saved === "40"
      ? (Number(saved) as 10 | 20 | 40)
      : 20;
  });
  const gaps = state.gaps;
  const [meta, setMeta] = useState<Record<string, ConceptMeta>>({});

  // Concept importance (1-5) and the known-misconception flag live on the
  // chapter's checklist; pull them once so the bars can reflect what actually
  // matters and the weighted score can exclude the trap entries. The same rows
  // are cached (bet 3) so a lost connection still lets the bars render from
  // what was saved.
  useEffect(() => {
    let cancelled = false;
    const chapterId = state.chapter?.id;
    if (!chapterId) return;
    const adopt = (rows: ChecklistRow[]) => {
      const next: Record<string, ConceptMeta> = {};
      for (const row of rows) {
        next[row.conceptText] = {
          weight: row.weight,
          isMisconception: row.isMisconception,
        };
      }
      setMeta(next);
    };
    api<ChecklistRow[]>(`/chapters/${chapterId}/concepts`)
      .then((rows) => {
        if (cancelled) return;
        adopt(rows);
        void cacheChecklist(chapterId, rows);
      })
      .catch(async (err) => {
        if (cancelled) return;
        // Offline: fall back to the cached checklist instead of hiding the
        // bars (weights are structural — the gap copy stays authoritative
        // from the grading that already ran).
        if (err instanceof ApiError && err.status === 0) {
          const cached = await getCachedChecklist(chapterId);
          if (cancelled || !cached) return;
          adopt(cached.rows);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.chapter?.id]);

  if (!gaps) return null;

  return (
    <div className="space-y-6">
      <PhaseHeading title={t("gaps-title")} text={t("gaps-text")} />
      {/* A degraded request must never look like a judged one. The lexical
        fallback can see which ideas were mentioned but not whether they were
        explained correctly, so its score is an estimate held well below full
        credit -- say so instead of showing a quietly halved number. */}
      {gaps.estimated && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-muted-foreground text-sm">
          {t("gaps-estimated")}
        </p>
      )}
      <CoverageView
        covered={gaps.covered}
        missing={gaps.missing}
        misconceptions={gaps.misconceptions}
        meta={meta}
        mastery={gaps.mastery}
        score={gaps.score}
        estimated={gaps.estimated}
        startHereConcept={startHereConcept}
      />
      <div className="space-y-2 pt-2">
        <fieldset className="space-y-2">
          <legend className="font-medium text-muted-foreground text-sm">
            {t("plan-budget-question")}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {([10, 20, 40] as const).map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={budgetMinutes === minutes}
                onClick={() => {
                  setBudgetMinutes(minutes);
                  window.localStorage.setItem(
                    "kiftet-plan-budget",
                    String(minutes),
                  );
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm transition-colors",
                  budgetMinutes === minutes
                    ? "border-gold/50 bg-gold/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t("plan-budget-option", { n: minutes })}
              </button>
            ))}
          </div>
        </fieldset>
        <Button
          className="w-full justify-center"
          disabled={state.busy}
          onClick={() => void fetchLesson(budgetMinutes)}
        >
          {state.busy ? t("preparing") : t("see-study-plan")}
        </Button>
        {state.recallMode === "both" && (
          <Button
            variant="outline"
            className="w-full justify-center"
            disabled={state.busy}
            onClick={() => void startRecallQuestions("gaps")}
          >
            {t("gaps-quiz-these")}
          </Button>
        )}
        <button
          type="button"
          className="w-full text-center text-muted-foreground text-xs underline underline-offset-4 transition-colors duration-200 hover:text-foreground"
          onClick={() => void startRetest()}
        >
          {t("skip-lesson")}
        </button>
      </div>
    </div>
  );
}

function PlanView({
  plan,
  startRetest,
}: {
  plan: StudyPlan;
  startRetest: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const { sessionId = "study" } = useParams();
  const doneKey = `kiftet-plan-done:${sessionId}`;
  const [done, setDone] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved: unknown = JSON.parse(
        window.sessionStorage.getItem(doneKey) ?? "[]",
      );
      return new Set(
        Array.isArray(saved)
          ? saved.filter((value): value is string => typeof value === "string")
          : [],
      );
    } catch {
      return new Set();
    }
  });
  const toggleDone = (concept: string) => {
    setDone((previous) => {
      const next = new Set(previous);
      if (next.has(concept)) next.delete(concept);
      else next.add(concept);
      window.sessionStorage.setItem(doneKey, JSON.stringify([...next]));
      return next;
    });
  };

  const total = plan.steps.length;
  const doneCount = plan.steps.filter((step) => done.has(step.concept)).length;
  const searchLinks = (query: string) => {
    const encoded = encodeURIComponent(query);
    return {
      youtube: `https://www.youtube.com/results?search_query=${encoded}`,
      google: `https://www.google.com/search?q=${encoded}`,
    };
  };

  return (
    <div className="space-y-4">
      {total === 0 ? (
        <div className="rounded-xl border border-border/70 bg-card/50 p-4 text-muted-foreground text-sm">
          {t("plan-no-steps")}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/50 p-4">
            <MasteryRing
              percent={(doneCount / total) * 100}
              size={48}
              estimated={plan.estimated}
            />
            <p className="font-medium text-foreground text-sm">
              {t("plan-progress", { a: doneCount, b: total })}
            </p>
          </div>
          <ol className="space-y-3">
            {plan.steps.map((step, index) => {
              const isDone = done.has(step.concept);
              const links = searchLinks(step.searchQuery);
              return (
                <li
                  key={step.concept}
                  className={cn(
                    "rounded-2xl border p-4 transition-colors",
                    isDone
                      ? "border-gold/30 bg-gold/[0.06]"
                      : "border-border/70 bg-card/50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground text-xs">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display font-semibold text-foreground text-lg leading-7">
                        {step.concept}
                      </h3>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {t("plan-minutes", { n: step.estimatedMinutes })}
                      </p>
                      <p className="mt-2 text-foreground/85 text-sm leading-6">
                        {step.whyFirst}
                      </p>
                      <p className="mt-2 font-medium text-foreground text-sm">
                        {step.action}
                      </p>
                      <p className="text-muted-foreground text-sm leading-6">
                        {t("plan-search-label", { query: step.searchQuery })}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={links.youtube}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm transition-colors duration-200 hover:border-gold/40 hover:text-gold"
                        >
                          <PlayCircle className="size-4" aria-hidden="true" />
                          {t("plan-search-youtube")}
                        </a>
                        <a
                          href={links.google}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm transition-colors duration-200 hover:border-gold/40 hover:text-gold"
                        >
                          <Search className="size-4" aria-hidden="true" />
                          {t("plan-search-google")}
                        </a>
                      </div>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-muted-foreground text-xs">
                          {t("plan-in-book")}
                        </summary>
                        <p className="mt-1 flex items-start gap-2 text-muted-foreground text-xs leading-5">
                          <BookOpen
                            className="mt-0.5 size-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span>
                            {step.anchor.chapter}
                            {step.anchor.heading
                              ? ` · ${step.anchor.heading}`
                              : ""}
                            {step.anchor.page !== null
                              ? ` · ${t("plan-page", { n: step.anchor.page })}`
                              : ""}
                            {step.anchor.excerpt
                              ? ` · “${step.anchor.excerpt}”`
                              : ""}
                          </span>
                        </p>
                      </details>
                      <button
                        type="button"
                        aria-pressed={isDone}
                        onClick={() => toggleDone(step.concept)}
                        className={cn(
                          "mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors duration-200",
                          isDone
                            ? "border-gold/50 bg-gold/10 text-gold"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Check className="size-4" aria-hidden="true" />
                        {t("plan-mark-done")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {plan.nextSession.length > 0 && (
        <details className="rounded-xl border border-border/60 px-4 py-3">
          <summary className="cursor-pointer text-muted-foreground text-sm">
            {t("plan-next-session", { n: plan.nextSession.length })}
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground text-sm">
            {plan.nextSession.map((concept) => (
              <li key={concept}>{concept}</li>
            ))}
          </ul>
        </details>
      )}
      {plan.skippedKnown.count > 0 && (
        <p className="text-muted-foreground text-xs">
          {t("plan-skipped-known", {
            n: plan.skippedKnown.count,
            minutes: plan.skippedKnown.estimatedTimeSavedMinutes,
          })}
        </p>
      )}
      <div className="flex justify-center">
        <Button variant="outline" onClick={() => void startRetest()}>
          {t("ready-to-be-tested")}
        </Button>
      </div>
    </div>
  );
}

// The classic-lesson text panel: the sentence-chunked read view with its
// read-aloud control. Shared by the Beta toggle and the no-plan fallback.
function LessonTextPanel({
  lessonText,
  sentences,
  activeSentence,
  recording,
  narrate,
  stopReading,
  onReplaySentence,
}: {
  lessonText: string | null;
  sentences: string[];
  activeSentence: number | null;
  recording: boolean;
  narrate: () => void;
  stopReading: () => void;
  onReplaySentence?: (index: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <>
      <div className="read-panel px-5 py-5 text-[0.95rem] leading-7">
        {sentences.length > 1
          ? sentences.map((sentence, i) => (
              <button
                key={`${i}-${sentence}`}
                type="button"
                onClick={() => onReplaySentence?.(i)}
                className={cn(
                  "rounded px-0.5 text-left transition-colors duration-150",
                  onReplaySentence &&
                    "cursor-pointer hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2",
                  activeSentence === i && "bg-gold/15 text-foreground",
                )}
              >
                {sentence}{" "}
              </button>
            ))
          : (lessonText ?? "Writing the lesson…")}
      </div>

      {lessonText && (
        <div className="flex items-center justify-center gap-2">
          {onReplaySentence && (
            <span className="text-muted-foreground text-xs">
              {t("tap-a-sentence")}
            </span>
          )}
          {recording ? (
            <span className="group relative inline-flex">
              <Button
                variant="outline"
                size="sm"
                onClick={stopReading}
                aria-keyshortcuts="Escape"
              >
                <Square className="size-3.5" aria-hidden="true" />
                {t("stop-reading")}
              </Button>
              <span className="absolute top-1/2 left-full ml-2 -translate-y-1/2">
                <ShortcutHint keys="Esc" label={t("shortcut-pause-label")} />
              </span>
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={narrate}>
              <Volume2 className="size-4" aria-hidden="true" />
              {t("read-it-to-me")}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function LessonPhase() {
  const { state, startRetest, viewGaps } = useStudy();
  const { t, lang } = useLanguage();
  // A single acknowledged "something is being read aloud" flag. Every
  // interaction flips it immediately, so a tap on the button is never answered
  // with dead air or a silent button.
  const [reading, setReading] = useState(false);
  const stopRef = useRef<() => void>(null);
  const plan = state.plan;
  const showPlan = Boolean(plan);
  const [activeSentence, setActiveSentence] = useState<number | null>(null);
  const sentences = useMemo(
    () => splitSentences(state.lessonText ?? ""),
    [state.lessonText],
  );

  // Voice + TEXT: the micro-lesson is meant to be taught, not just read. The
  // browser's own speech synthesis reads it aloud while the text stays on
  // screen, with each sentence highlighted as it is spoken. Only ever started
  // by an explicit tap — the browser voice is deliberate, never automatic.
  // One narration entry point. Acknowledges immediately (reading state) so a
  // tap on the button is never answered with dead air.
  const narrate = (text: string) => {
    if (!text) return;
    // Stop anything already playing so a second "Read it to me" replaces the
    // first instead of stacking a double read-back.
    stopRef.current?.();
    setReading(true);
    setActiveSentence(sentences.length > 1 ? 0 : null);
    speakAloud(
      text,
      (i) => setActiveSentence(i),
      () => {
        setReading(false);
        setActiveSentence(null);
      },
    );
  };

  const stopReading = () => {
    stopReadingAloud();
    setReading(false);
    setActiveSentence(null);
  };

  stopRef.current = stopReading;

  // Esc pauses the lesson — the read-aloud stops where it is. On a desktop the
  // narration is the one thing playing on its own, so the key a student
  // reaches for to quiet it should work. Read through a ref so the listener is
  // bound once and never goes stale between renders.
  const readingRef = useRef(reading);
  readingRef.current = reading;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !readingRef.current) return;
      event.preventDefault();
      stopRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Leaving the phase (test, back to gaps, session end) must cut off any
  // read-back still in flight — never bleed narration into the next phase.
  useEffect(() => () => stopRef.current?.(), []);

  return (
    <div className="space-y-6">
      {showPlan && plan ? (
        <>
          <PhaseHeading title={t("plan-title")} text={t("plan-text")} />
          {plan.estimated && (
            <p className="rounded-lg border border-border bg-muted px-3 py-2 text-muted-foreground text-sm">
              {t("plan-estimated")}
            </p>
          )}
          <PlanView plan={plan} startRetest={startRetest} />
        </>
      ) : state.guide?.length ? (
        <>
          <PhaseHeading title={t("lesson-title")} text={t("lesson-text")} />
          {lang === "am" && (
            <p className="mx-auto inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-medium text-[0.78rem] text-gold tracking-wide">
              {t("fluency-am")}
            </p>
          )}
          <p className="font-display font-medium text-foreground text-lg tracking-[-0.01em]">
            {t("lesson-only-gaps")}
          </p>
          {state.guide?.length ? (
            <GuideView
              sections={state.guide}
              estimated={state.guideEstimated}
              onRecall={(section) =>
                section.recall &&
                void narrate(`${section.what} ${section.recall}`)
              }
            />
          ) : (
            <LessonTextPanel
              lessonText={state.lessonText}
              sentences={sentences}
              activeSentence={activeSentence}
              recording={reading}
              narrate={() => void narrate(state.lessonText ?? "")}
              stopReading={stopReading}
              onReplaySentence={(i) => void narrate(sentences[i] ?? "")}
            />
          )}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={viewGaps}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium text-muted-foreground text-xs transition-colors duration-200 hover:border-gold/40 hover:text-gold"
            >
              {t("back-to-gaps")}
            </button>
          </div>
        </>
      ) : (
        <>
          <PhaseHeading title={t("lesson-title")} text={t("lesson-text")} />
          {lang === "am" && (
            <p className="mx-auto inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-medium text-[0.78rem] text-gold tracking-wide">
              {t("fluency-am")}
            </p>
          )}
          <p className="font-display font-medium text-foreground text-lg tracking-[-0.01em]">
            {t("lesson-only-gaps")}
          </p>
          {state.guide?.length ? (
            <GuideView
              sections={state.guide}
              estimated={state.guideEstimated}
              onRecall={(section) =>
                section.recall &&
                void narrate(`${section.what} ${section.recall}`)
              }
            />
          ) : (
            <LessonTextPanel
              lessonText={state.lessonText}
              sentences={sentences}
              activeSentence={activeSentence}
              recording={reading}
              narrate={() => void narrate(state.lessonText ?? "")}
              stopReading={stopReading}
              onReplaySentence={(i) => void narrate(sentences[i] ?? "")}
            />
          )}
        </>
      )}

      <div className="space-y-2 pt-1">
        {!showPlan && (
          <Button
            className="w-full justify-center"
            disabled={state.busy}
            onClick={() => void startRetest()}
          >
            {t("ready-to-be-tested")}
          </Button>
        )}
        <button
          type="button"
          className="w-full text-center text-muted-foreground text-xs underline underline-offset-4 transition-colors duration-200 hover:text-foreground"
          onClick={viewGaps}
        >
          {t("back-to-gaps")}
        </button>
      </div>
    </div>
  );
}

function RetestPhase({ voiceAllowed }: { voiceAllowed: boolean }) {
  const { state, submitAnswer, fetchResult } = useStudy();
  const { t, lang } = useLanguage();
  const { questions, currentQuestion, answered } = state;
  const done = currentQuestion >= questions.length;
  const submitText = useCallback(
    (text: string) => submitAnswer(text),
    [submitAnswer],
  );

  const retestHint = getRetestHint(state.chapter?.subject ?? "");
  return (
    <div className="space-y-6">
      <PhaseHeading
        title={t("retest-title")}
        text={done ? t("retest-done-text") : t("retest-text")}
      />
      {!done && retestHint && (
        <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] px-4 py-3 text-sm">
          <p className="text-muted-foreground text-xs leading-5">
            {retestHint}
          </p>
        </div>
      )}
      {lang === "am" && !done && (
        <p className="mx-auto inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-medium text-[0.78rem] text-gold tracking-wide">
          {t("fluency-am")}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="k-label">
          {done
            ? t("all-answered")
            : t("question-of", {
                a: currentQuestion + 1,
                b: questions.length,
              })}
        </p>
        <SegmentedRing
          size={40}
          states={questions.map((_q, i) => {
            const a = answered[i];
            if (a) return a.correct ? "correct" : "wrong";
            return i === currentQuestion ? "current" : "pending";
          })}
        />
      </div>

      {!done ? (
        <div className="inner-surface p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            {questions[currentQuestion]?.focus?.length ? (
              <p className="font-medium text-[0.78rem] text-muted-foreground">
                {t("retest-checking", {
                  focus: questions[currentQuestion].focus.join(", "),
                })}
              </p>
            ) : (
              <span />
            )}
            <LevelBadge
              level={questions[currentQuestion]?.level}
              beyondText={questions[currentQuestion]?.beyondText}
            />
          </div>
          <p className="font-display font-medium text-foreground text-lg leading-7 tracking-[-0.01em] sm:text-xl">
            {questions[currentQuestion]?.question ?? ""}
          </p>
          <div className="mt-5 border-border/60 border-t pt-5 dark:border-white/10">
            {state.queued?.kind === "answer" &&
            state.queued.questionIndex === currentQuestion ? (
              <QueuedPanel text={t("queued-answer")} />
            ) : (
              <VoiceCapture
                submit={submitText}
                voiceAllowed={voiceAllowed}
                busy={state.busy}
                placeholder={t("type-answer-out-loud")}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnswerResults answered={answered} />
          <Button
            className="w-full justify-center"
            disabled={state.busy}
            onClick={() => void fetchResult()}
          >
            {state.busy ? t("grading") : t("see-result")}
          </Button>
        </div>
      )}
    </div>
  );
}

// Targeted recall: the diagnostic question family, shown when the student
// chose "targeted" (whole chapter) or "both" (the gaps). It reuses the same
// answer UI as the retest, but the questions are diagnostic and the set ends
// at the student's starting picture, not a grade.
function TargetedRecallPhase({ voiceAllowed }: { voiceAllowed: boolean }) {
  const { state, submitRecallAnswer, viewTargetedGaps } = useStudy();
  const { t } = useLanguage();
  const { questions, currentQuestion, answered } = state;
  const done = currentQuestion >= questions.length;
  const submitText = useCallback(
    (text: string) => submitRecallAnswer(text),
    [submitRecallAnswer],
  );

  return (
    <div className="space-y-6">
      <PhaseHeading
        title={t("targeted-title")}
        text={done ? t("targeted-done-text") : t("targeted-text")}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="k-label">
          {done
            ? t("all-answered")
            : t("question-of", {
                a: currentQuestion + 1,
                b: questions.length,
              })}
        </p>
        <SegmentedRing
          size={40}
          states={questions.map((_q, i) => {
            const a = answered[i];
            if (a) return a.correct ? "correct" : "wrong";
            return i === currentQuestion ? "current" : "pending";
          })}
        />
      </div>

      {!done ? (
        <div className="inner-surface p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            {questions[currentQuestion]?.focus?.length ? (
              <p className="font-medium text-[0.78rem] text-muted-foreground">
                {t("targeted-checking", {
                  focus: questions[currentQuestion].focus.join(", "),
                })}
              </p>
            ) : (
              <span />
            )}
            <LevelBadge
              level={questions[currentQuestion]?.level}
              beyondText={questions[currentQuestion]?.beyondText}
            />
          </div>
          <p className="font-display font-medium text-foreground text-lg leading-7 tracking-[-0.01em] sm:text-xl">
            {questions[currentQuestion]?.question ?? ""}
          </p>
          <div className="mt-5 border-border/60 border-t pt-5 dark:border-white/10">
            {state.queued?.kind === "recall-answer" &&
            state.queued.questionIndex === currentQuestion ? (
              <QueuedPanel text={t("queued-answer")} />
            ) : (
              <VoiceCapture
                submit={submitText}
                voiceAllowed={voiceAllowed}
                busy={state.busy}
                placeholder={t("type-answer-out-loud")}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnswerResults answered={answered} />
          <Button
            className="w-full justify-center"
            disabled={state.busy}
            onClick={viewTargetedGaps}
          >
            {t("see-your-gaps")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ResultPhase({
  onDone,
  onTryAgain,
}: {
  onDone: () => Promise<void>;
  onTryAgain: () => void;
}) {
  const { state, startRetest, goLesson } = useStudy();
  const { t } = useLanguage();
  const result = state.result;
  const busy = state.busy;

  if (!result) {
    return (
      <div className="grid min-h-40 place-items-center text-muted-foreground">
        <InkSettling />
      </div>
    );
  }

  const improved = (result.delta ?? 0) > 0;

  if (state.allCovered) {
    return (
      <ResultPanel
        tone="sage"
        headline={t("result-none-title")}
        body={t("result-none-body")}
        metric={durationMetric(result, t)}
        actions={
          <Button
            className="w-full justify-center"
            disabled={busy}
            onClick={() => void onDone()}
          >
            {t("done-for-now")}
          </Button>
        }
        before={result.before ?? 0}
      />
    );
  }

  if (improved) {
    return (
      <div className="space-y-6">
        <ResultPanel
          tone="gold"
          headline={t("result-gap-title")}
          body={t("result-gap-body")}
          metric={durationMetric(result, t)}
          actions={
            <div className="space-y-3">
              <Button
                className="w-full justify-center"
                disabled={busy}
                onClick={() => void onDone()}
              >
                {t("done-for-now")}
              </Button>
              <ShareCardButton />
            </div>
          }
          before={result.before ?? 0}
          after={result.after ?? 0}
          delta={result.delta ?? 0}
        />
        <StillOpen gaps={state.gaps} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ResultPanel
        tone="rust"
        headline={t("result-open-title")}
        body={t("result-open-body")}
        actions={
          <div className="space-y-3">
            <Button
              className="w-full justify-center"
              disabled={busy}
              onClick={() => void startRetest()}
            >
              {t("retest-the-gaps")}
            </Button>
            <Button
              className="w-full justify-center"
              variant="outline"
              disabled={busy}
              onClick={goLesson}
            >
              {t("relearn-short-version")}
            </Button>
            <button
              type="button"
              className="w-full text-center text-muted-foreground text-xs underline underline-offset-4 transition-colors duration-200 hover:text-foreground"
              onClick={onTryAgain}
            >
              {t("start-over")}
            </button>
            {state.attempts >= 2 && (
              <button
                type="button"
                className="w-full text-center text-muted-foreground text-xs underline underline-offset-4 transition-colors duration-200 hover:text-foreground"
                onClick={() => void onDone()}
              >
                {t("come-back-later")}
              </button>
            )}
          </div>
        }
        before={result.before ?? 0}
        after={result.after ?? 0}
        delta={result.delta ?? 0}
      />
      <StillOpen gaps={state.gaps} />
    </div>
  );
}

function durationMetric(
  result: { durationMs?: number | null } | null,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): { label: string; value: string }[] {
  if (!result?.durationMs) return [];
  const mins = Math.round(result.durationMs / 60000);
  return [
    {
      label: t("session-time"),
      value:
        mins < 1
          ? t("under-a-minute")
          : mins === 1
            ? t("minute", { n: mins })
            : t("minutes", { n: mins }),
    },
  ];
}

// The result screen's number says "how much did you improve"; this list says
// "which ideas are still open for exam day" — the actionable takeaway that a
// bare delta hides. Every open item maps back to the gaps view the loop just
// ran.
function StillOpen({ gaps }: { gaps: Gaps | null }) {
  const { t } = useLanguage();
  if (!gaps) return null;
  const items = [...gaps.missing, ...gaps.misconceptions];
  if (!items.length) return null;
  return (
    <div className="inner-surface border-rust/25 p-5 dark:border-rust/30">
      <p className="k-label mb-3 flex items-center gap-2 text-rust">
        <CircleAlert className="size-3.5" aria-hidden="true" />
        {t("still-open-exam")}
      </p>
      <ul className="space-y-2">
        {items.map((concept) => (
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
    </div>
  );
}

function ResultPanel({
  tone,
  headline,
  body,
  metric = [],
  actions,
  before,
  after,
  delta,
}: {
  tone: "sage" | "gold" | "rust";
  headline: string;
  body: string;
  metric?: { label: string; value: string }[];
  actions: React.ReactNode;
  before?: number;
  after?: number;
  delta?: number;
}) {
  const isGold = tone === "gold";
  const { t } = useLanguage();

  // The ring closing is one of the two moments the design is allowed to be
  // bold, so it is the one thing on this screen that moves: it opens from the
  // "before" score to the "after" score and holds. On a full close it also
  // gives a double haptic, the only reward the loop offers — still quiet under
  // reduced motion, where the closing ring alone carries it.
  useEffect(() => {
    if (after !== undefined && after >= 100) haptic([12, 60, 12]);
  }, [after]);

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border p-6",
          isGold && "border-gold/40 bg-gold/[0.08] dark:border-gold/30",
          tone === "sage" &&
            "border-sage/30 bg-sage/[0.07] dark:border-sage/25",
          tone === "rust" &&
            "border-rust/35 bg-rust/[0.07] dark:border-rust/30",
        )}
      >
        {isGold && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(480px 240px at 85% -20%, rgba(242,239,233,0.14), transparent 60%)",
            }}
          />
        )}
        {isGold &&
          (after !== undefined ? (
            <div className="mb-5 flex flex-col items-center gap-2">
              <AnimatedRing before={before ?? 0} after={after} />
              <p className="text-muted-foreground text-sm">
                {t("result-ring-words", {
                  before: before ?? 0,
                  after,
                })}
              </p>
            </div>
          ) : (
            <div className="mb-5 flex justify-center">
              <GapClosingMark size={64} closing className="text-sage" />
            </div>
          ))}
        <p
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium text-[0.78rem]",
            isGold && "bg-gold/15 text-gold",
            tone === "sage" && "bg-sage/15 text-sage",
            tone === "rust" && "bg-rust/15 text-rust",
          )}
        >
          {isGold ? (
            <BrandMark size={14} className="rounded-full" />
          ) : tone === "sage" ? (
            <Check className="size-3.5" />
          ) : (
            <X className="size-3.5" />
          )}
          {isGold
            ? t("gap-closed")
            : tone === "sage"
              ? after !== undefined
                ? t("gap-covered")
                : t("all-solid")
              : t("another-pass")}
        </p>
        <h2
          className={cn(
            "mt-4 font-display font-semibold text-3xl tracking-[-0.02em]",
            isGold && "text-gold",
            tone === "sage" && "text-sage",
            tone === "rust" && "text-rust",
          )}
        >
          {headline}
        </h2>
        <p className="mt-2 max-w-md text-foreground/80 text-sm leading-6">
          {body}
        </p>
      </div>

      {(after !== undefined || metric.length > 0) && (
        <BeforeAfter
          before={before ?? 0}
          after={after}
          delta={delta}
          tone={tone}
          metric={metric}
        />
      )}

      <div className="pt-1">{actions}</div>
    </div>
  );
}

function BeforeAfter({
  before,
  after,
  delta,
  tone,
  metric,
}: {
  before: number;
  after?: number;
  delta?: number;
  tone: "sage" | "gold" | "rust";
  metric: { label: string; value: string }[];
}) {
  const hasAfter = after !== undefined;
  const afterBar =
    tone === "gold" ? "bg-gold" : tone === "sage" ? "bg-sage" : "bg-rust";

  return (
    <div className="inner-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="k-label">
          {hasAfter
            ? "How much you knew, before and after"
            : "How much you knew this round"}
        </p>
        {hasAfter && delta !== undefined && (
          <span
            className={cn(
              "font-display font-semibold text-lg tracking-tight",
              tone === "gold"
                ? "text-gold"
                : tone === "sage"
                  ? "text-sage"
                  : "text-muted-foreground",
            )}
          >
            {delta > 0 ? `+${delta} points` : `${delta} points`}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {metric.length > 0 ? (
          metric.map((m) => (
            <div
              key={m.label}
              className="flex items-baseline justify-between gap-4 text-sm"
            >
              <span className="text-muted-foreground">{m.label}</span>
              <span className="font-display font-semibold text-foreground text-xl tracking-tight">
                {m.value}
              </span>
            </div>
          ))
        ) : (
          <>
            <ScoreBar label="Before" value={before} />
            {hasAfter && (
              <ScoreBar
                label="After"
                value={after ?? 0}
                active
                barColor={afterBar}
                delay={0.35}
              />
            )}
          </>
        )}
      </div>

      {hasAfter && (
        <div
          className="mt-4 h-px w-full origin-left animate-beam bg-gradient-to-r from-gold/60 to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function AnimatedRing({
  before,
  after,
  size = 96,
}: {
  before: number;
  after: number;
  size?: number;
}) {
  // Starts where the round started, then opens to where it ended. The ring
  // itself carries the motion; nothing else on the screen needs to.
  const [pct, setPct] = useState(before);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPct(after));
    return () => cancelAnimationFrame(id);
  }, [after]);
  return <MasteryRing percent={pct} size={size} />;
}

function ScoreBar({
  label,
  value,
  active,
  barColor = "bg-sage",
  delay = 0,
}: {
  label: string;
  value: number;
  active?: boolean;
  barColor?: string;
  /** Seconds to wait before the bar grows in — lets "After" follow "Before". */
  delay?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span
          className={cn(
            "font-medium text-[0.78rem]",
            active ? "text-foreground/90" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        <span className="font-display font-semibold text-foreground text-lg tracking-tight">
          {value}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/60 dark:bg-white/10">
        <div
          className={cn(
            "h-full origin-left animate-grow rounded-full transition-all duration-700",
            active ? barColor : "bg-muted-foreground/40",
          )}
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            animationDelay: `${delay}s`,
          }}
        />
      </div>
    </div>
  );
}
