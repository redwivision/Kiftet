import { Button } from "@kiftet/ui/components/button";
import { Textarea } from "@kiftet/ui/components/textarea";
import { cn } from "@kiftet/ui/lib/utils";
import { useVoxideVoice, type VoxideStatus } from "@voxide/react";
import {
  Check,
  CircleAlert,
  MicOff,
  Play,
  Search,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  getVoxideClient,
  hasVoxideKey,
  setCaptureActive,
  speakViaVoxide,
  stopVoiceNarration,
} from "@/components/assistant";
import { BrandMark, GapClosingMark } from "@/components/brand-mark";
import { CoverageView } from "@/components/gap-list";
import { GuideView } from "@/components/guide-view";
import { InkSettling } from "@/components/ink-settling";
import { useLanguage } from "@/components/language-provider";
import { MasteryRing, SegmentedRing } from "@/components/mastery-ring";
import {
  type Gaps,
  type StudyPlan,
  StudyProvider,
  useStudy,
} from "@/components/study-provider";
import { VoxideRing } from "@/components/voxide-ring";
import { ApiError, api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { getDemoUser } from "@/lib/demo";
import { haptic } from "@/lib/haptics";
import {
  markInstallHintOffered,
  readInstallEnv,
  shouldOfferInstall,
} from "@/lib/install";
import { countWords, findBoundaryEnd, leadingText } from "@/lib/intent";
import type { ConceptMeta } from "@/lib/mastery";
import type { MessageKey } from "@/lib/messages";
import {
  type ChecklistRow,
  cacheChecklist,
  getCachedChecklist,
} from "@/lib/store";
import { useLoopTabChrome } from "@/lib/tab-chrome";
import { visibleChapterTitle } from "@/lib/textbook";
import { speakAloud, splitSentences, stopReadingAloud } from "@/lib/voice";
import { useWakeLock } from "@/lib/wake-lock";
import type { Route } from "./+types/study.$sessionId";

const ACTIVE: VoxideStatus[] = [
  "connecting",
  "listening",
  "speaking",
  "thinking",
  "executing",
];

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

// Everything the student said since the capture window opened. A long recall
// streams in as many partial transcript chunks, and Voxide only finalizes a
// turn once Gemini sends turn_complete — which can lag behind the student
// tapping the ring. Filtering to "final" alone would drop the whole recall;
// joining every user chunk (partial or final) rebuilds the full spoken answer.
// Module-level so the effects below can depend on it directly.
function transcriptOf(
  msgs: { role: string; text: string }[],
  start: number,
): string {
  return msgs
    .slice(start)
    .filter((m) => m.role === "user" && Boolean(m.text.trim()))
    .map((m) => m.text.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
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
  return (
    <StudyProvider sessionId={params.sessionId}>
      <StudyScreen />
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

function StudyScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { state, retryAgain, retryLast, completeSession, clearError } =
    useStudy();
  // A demo room is trying the product; a signed-in student is dedicating.
  // The same loop serves both, but the demo wears a banner and gets a
  // no-effort on-ramp (sample answer) so the loop is visible in one minute.
  const demo = getDemoUser();
  // Tier 3: the tab names the phase and the favicon is the ring closing as the
  // loop advances. Called before the early returns below so hook order holds.
  useLoopTabChrome(state.phase);
  // Tier 3: hold the screen on through the two phases the student just sits
  // and works — speaking a recall, reading a lesson. A phone that sleeps then
  // is a dropped voice session, and the loop's rhythm breaks with it.
  useWakeLock(state.phase === "recall" || state.phase === "lesson");

  if (state.chapterLoading) {
    return (
      <main className="mx-auto grid w-full max-w-md content-center justify-items-center gap-4 px-6 py-24 text-muted-foreground">
        <InkSettling />
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

          {state.error && (
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
          )}

          <div className="animate-fade-in" key={state.phase}>
            {state.phase === "recall" && <RecallPhase />}
            {state.phase === "gaps" && <GapsPhase />}
            {state.phase === "lesson" && <LessonPhase />}
            {state.phase === "retest" && <RetestPhase />}
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
  const current =
    phase === "result"
      ? STEPS.length
      : Math.max(1, STEPS.findIndex((s) => s.phase === phase) + 1);

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

function VoiceCapture({
  submit,
  textDefault,
  busy,
  placeholder,
}: {
  submit: (text: string) => Promise<void>;
  textDefault: boolean;
  busy: boolean;
  placeholder?: string;
}) {
  const { state, setNotice, clearNotice } = useStudy();
  const { t } = useLanguage();
  const voice = useVoxideVoice(hasVoxideKey() ? getVoxideClient() : null);
  const [showText, setShowText] = useState(textDefault);

  // Voice "dead" conditions that force text mode: no key, init stuck, quota out.
  const [timedOut, setTimedOut] = useState(false);
  const client = hasVoxideKey() ? getVoxideClient() : null;
  useEffect(() => {
    if (!client) return;
    if (client.isInitialized) return;
    const timer = setTimeout(() => {
      if (!client.isInitialized) setTimedOut(true);
    }, 6000);
    const off = client.on("ready", () => setTimedOut(false));
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [client]);

  const voiceDead = !client || timedOut || voice.errorCode === "usage_limit";
  const effectiveText = showText || voiceDead;

  // Capture window state: reset the transcript slice whenever we enter a fresh
  // listening session (new phase, or a new retest question).
  const baseRef = useRef<number | null>(null);
  const wasActiveRef = useRef(false);
  const submittedRef = useRef(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const noticeRef = useRef<string | null>(state.notice);
  noticeRef.current = state.notice;
  // The latest voice state, readable from inside an effect or a timer without
  // that effect having to re-run on every streamed chunk. Effects below are
  // keyed on the values that should *trigger* them; the rest is read from here.
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const baseKey =
    state.phase === "retest"
      ? `retest:${state.currentQuestion}`
      : `phase:${state.phase}`;

  // Which capture window is current. Written when the window opens, read by the
  // grace timer so a timer left over from a previous question tears itself down
  // instead of nudging a student who has already moved on.
  const windowKeyRef = useRef(baseKey);

  // Open a fresh capture window. Deliberately keyed on `baseKey` alone: this
  // must fire once per phase/question, not every time a partial transcript
  // chunk lands — the "as of right now" values come from the ref.
  useEffect(() => {
    windowKeyRef.current = baseKey;
    const v = voiceRef.current;
    baseRef.current = v.messages.length;
    wasActiveRef.current = ACTIVE.includes(v.status);
    submittedRef.current = false;
    clearNotice();
  }, [baseKey, clearNotice]);

  // While this capture owns the mic, end-of-speech cues ("that's all I
  // remember") belong to the answer being recorded — a "bye" mid-answer must
  // not be read as a whole-session goodbye.
  useEffect(() => {
    setCaptureActive(ACTIVE.includes(voice.status));
    return () => setCaptureActive(false);
  }, [voice.status]);

  // A single quiet tick the moment the mic starts listening, so the ring
  // answering under your finger is felt, not only seen. Silent where the
  // hardware or the person's reduced-motion setting says no.
  useEffect(() => {
    if (voice.status !== "listening") return;
    haptic(10);
  }, [voice.status]);

  // Auto-end: when the student signals they've finished speaking, finalize
  // the capture on the spot and hang up — the loop advances to the next step
  // without waiting for a tap on the ring. Re-runs per streamed chunk, which
  // is the point: the cue may only be complete on the last one.
  useEffect(() => {
    if (busyRef.current) return;
    if (voice.status !== "listening") return;
    if (baseRef.current === null) return;
    const spoken = transcriptOf(voice.messages, baseRef.current);
    const marker = findBoundaryEnd(spoken);
    if (!marker) return;
    // A cue mid-sentence ("I'm done with the electron carriers", "በኢልትሮኖን ካሪየርስ ጠናቋለሁ") is not an
    // ending — only fire when the cue is in the last words of the turn. Counted
    // with countWords so the remainder is measured in the language spoken; the
    // ASCII strip this replaced deleted every Ethiopic codepoint first, which
    // left the guard permanently reading zero words in Amharic.
    if (countWords(spoken.slice(marker.index + marker.phrase.length)) > 6) {
      return;
    }
    const finished = leadingText(spoken, marker.index);
    submittedRef.current = true;
    setCaptureActive(false);
    if (finished) {
      void submit(finished);
    } else {
      setNotice(t("voice-catch-none"));
    }
    void voice.disconnect();
  }, [submit, t, voice.messages, voice.status, voice.disconnect, setNotice]);

  // Listen → hang up: when capture goes from active to inactive, everything
  // said since the window opened is the answer.
  useEffect(() => {
    if (busyRef.current) return;
    if (submittedRef.current) return; // already finalized by auto-end
    const isActive = ACTIVE.includes(voice.status);
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!wasActive || isActive || baseRef.current === null || busyRef.current)
      return;
    // Messages come through the ref on purpose: this must fire once, on the
    // active → inactive edge, not on every streamed partial chunk.
    const spoken = transcriptOf(voiceRef.current.messages, baseRef.current);
    if (spoken) {
      void submit(spoken);
    } else if (voice.status !== "error") {
      setNotice(t("voice-catch-deferred"));
    }
  }, [submit, t, voice.status, setNotice]);

  // Grace state: after a long stretch of no speech while listening, reassure the
  // student instead of timing them out. Never emits failure copy on our own.
  // The message count is read through the ref on every tick — reading it from
  // the closure would freeze it at mount and fire a false nudge mid-answer.
  useEffect(() => {
    if (voice.status !== "listening" || baseRef.current === null) return;
    // Pinned to the window it started in: a tick that finds the student has
    // moved on retires the timer instead of nudging them.
    const windowKey = baseKey;
    let lastCount = voiceRef.current.messages.length;
    let lastChangedAt = Date.now();
    const timer = setInterval(() => {
      if (windowKey !== windowKeyRef.current) {
        clearInterval(timer);
        return;
      }
      const count = voiceRef.current.messages.length;
      if (count !== lastCount) {
        if (noticeRef.current) clearNotice();
        lastCount = count;
        lastChangedAt = Date.now();
        return;
      }
      if (Date.now() - lastChangedAt >= 7000) {
        setNotice(t("voice-still-listening"));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [voice.status, baseKey, clearNotice, setNotice, t]);

  const captured = transcriptOf(voice.messages, baseRef.current ?? 0);
  const lastJustSaid = captured || undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3">
        {effectiveText ? (
          <div className="grid size-40 place-items-center rounded-full border-2 border-border border-dashed text-muted-foreground/40 dark:border-white/20">
            <MicOff className="size-10" aria-hidden="true" />
          </div>
        ) : (
          <VoxideRing
            autoArm={false}
            // Planned: arm the mic when the phase opens (pass
            // state.phase === "recall" || state.phase === "retest"
            // once VoxideRing's voice-first flow ships).
          />
        )}

        {!effectiveText && (
          <p
            className="max-w-md text-center font-medium text-foreground/80 text-sm leading-6"
            aria-live="polite"
          >
            {captureCaption(voice.status, state.phase, t)}
          </p>
        )}

        {!effectiveText && voice.status === "listening" && <ElapsedTimer />}

        {busy && (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <InkSettling />
            {t("recall-reading")}
          </p>
        )}

        {voice.errorCode === "usage_limit" && (
          <p className="max-w-md rounded-lg border border-rust/30 bg-rust/10 px-3 py-2 text-muted-foreground text-xs leading-5">
            {t("voice-service-busy")}
          </p>
        )}
      </div>

      {/* What you said, read back — rendered exactly once. */}
      {lastJustSaid && (
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

      {effectiveText && (
        <TextRecorder busy={busy} submit={submit} placeholder={placeholder} />
      )}

      {!voiceDead && (
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

// The ring is push-to-talk, so these captions can't reuse the `vt-*` strings
// the always-on Voxide ring uses — same states, but the verbs differ ("tap the
// ring when you're done" vs "tap again to stop me"). The idle line also swaps
// on the retest pass, because recalling and answering want different prompts.
const CAPTION_KEYS: Record<string, Record<string, MessageKey>> = {
  recall: {
    idle: "st-recall-idle",
    armed: "st-armed",
    connecting: "st-connecting",
    listening: "st-listening",
    thinking: "st-thinking",
    speaking: "st-speaking",
    executing: "st-executing",
    error: "st-error",
  },
  answer: {
    idle: "st-answer-idle",
    armed: "st-armed",
    connecting: "st-connecting",
    listening: "st-listening",
    thinking: "st-thinking",
    speaking: "st-speaking",
    executing: "st-executing",
    error: "st-error",
  },
};

function captureCaption(
  status: VoxideStatus,
  phase: string,
  t: Translate,
): string {
  const table = phase === "retest" ? CAPTION_KEYS.answer : CAPTION_KEYS.recall;
  return t(table[status] ?? table.idle);
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

function RecallPhase() {
  const { state, submitRecall } = useStudy();
  const { t } = useLanguage();
  // Stable so VoiceCapture's capture effects can depend on it honestly instead
  // of re-running on every render of an inline arrow.
  const submitText = useCallback(
    (text: string) => submitRecall(text),
    [submitRecall],
  );
  const demoRoom = getDemoUser();

  if (state.queued?.kind === "recall") {
    return (
      <div className="space-y-6">
        <PhaseHeading title={t("recall-title")} text={t("recall-text")} />
        <QueuedPanel text={t("queued-recall")} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PhaseHeading title={t("recall-title")} text={t("recall-text")} />
      <VoiceCapture
        submit={submitText}
        textDefault={!hasVoxideKey()}
        busy={state.busy}
      />
      {!demoRoom && <FirstRunHint />}
      {demoRoom && (
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
    </div>
  );
}

function GapsPhase() {
  const { state, fetchLesson, startRetest } = useStudy();
  const { t } = useLanguage();
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
      />
      <div className="space-y-2 pt-2">
        <Button
          className="w-full justify-center"
          disabled={state.busy}
          onClick={() => void fetchLesson()}
        >
          {state.busy ? t("preparing") : t("see-study-plan")}
        </Button>
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

// The lesson-phase plan: the roadmap is what the student reads first.
// The links below never come from the model — only the search topic does, and
// the client compiles the URLs, so a hallucinated address is structurally
// impossible.
function searchUrls(topic: string): { video: string; article: string } {
  const q = encodeURIComponent(topic);
  return {
    video: `https://www.youtube.com/results?search_query=${q}`,
    article: `https://www.google.com/search?q=${q}`,
  };
}

function PlanView({
  plan,
  lessonText,
  recording,
  narrate,
  stopReading,
}: {
  plan: StudyPlan;
  lessonText: string | null;
  recording: boolean;
  narrate: (text: string) => void;
  stopReading: () => void;
}) {
  const { t } = useLanguage();
  const sentences = useMemo(
    () => splitSentences(lessonText ?? ""),
    [lessonText],
  );
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("plan-minutes", { n: plan.estMinutes })}
      </p>
      <ol className="space-y-3">
        {plan.steps.map((step, i) => {
          const links = step.searchTopic ? searchUrls(step.searchTopic) : null;
          return (
            <li
              key={`${step.gapType}-${step.concept}`}
              className="rounded-2xl border border-border/70 bg-card/50 p-4 dark:border-white/10"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-[0.72rem] text-muted-foreground">
                  {t("plan-step-of", { a: i + 1, b: plan.steps.length })}
                </p>
                {step.gapType === "misconception" ? (
                  <span className="rounded-full border border-rust/30 bg-rust/10 px-2.5 py-0.5 font-medium text-[0.7rem] text-rust">
                    {t("plan-gap-fix-first")}
                  </span>
                ) : (
                  <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 font-medium text-[0.7rem] text-muted-foreground">
                    {t("plan-missing")}
                  </span>
                )}
              </div>
              <p className="mt-1.5 font-medium text-[0.95rem] text-foreground leading-6">
                {step.concept}
              </p>
              {step.whyFirst && (
                <p className="mt-1 text-muted-foreground text-sm leading-6">
                  {step.whyFirst}
                </p>
              )}
              {links && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={links.video}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium text-[0.78rem] transition-colors duration-200 hover:border-gold/40 hover:text-gold"
                  >
                    <Play className="size-3.5" aria-hidden="true" />
                    {t("plan-video", { topic: step.searchTopic ?? "" })}
                  </a>
                  <a
                    href={links.article}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium text-[0.78rem] transition-colors duration-200 hover:border-gold/40 hover:text-gold"
                  >
                    <Search className="size-3.5" aria-hidden="true" />
                    {t("plan-article", { topic: step.searchTopic ?? "" })}
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {lessonText && (
        <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 dark:border-white/10">
          <p className="k-label mb-2">{t("plan-preview-label")}</p>
          <div className="read-panel px-0 py-0 text-[0.95rem] leading-7">
            {sentences.length > 1
              ? sentences.map((sentence, i) => (
                  <span key={`${i}-${sentence}`}>{sentence} </span>
                ))
              : lessonText}
          </div>
          <div className="mt-3 flex justify-end">
            {recording ? (
              <Button variant="outline" size="sm" onClick={stopReading}>
                <Square className="size-3.5" aria-hidden="true" />
                {t("stop-reading")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => narrate(lessonText)}
              >
                <Volume2 className="size-4" aria-hidden="true" />
                {t("read-it-to-me")}
              </Button>
            )}
          </div>
        </div>
      )}
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
            <Button variant="outline" size="sm" onClick={stopReading}>
              <Square className="size-3.5" aria-hidden="true" />
              {t("stop-reading")}
            </Button>
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
  const narratedRef = useRef<string | null>(null);
  // A single acknowledged "something is being read aloud" state for both
  // engines: the agent's natural voice and the browser-TTS fallback.
  // Every interaction flips it immediately, so a tap on the button is never
  // answered with dead air or a silent button.
  const [reading, setReading] = useState(false);
  const stopRef = useRef<() => void>(null);
  // The lesson phase is a PLAN by default; the single-lesson view is handed
  // over behind the classic-lesson (Beta) toggle so we can test both shapes.
  const [view, setView] = useState<"plan" | "classic">("plan");
  const plan = state.plan;
  const hasPlan = Boolean(plan && plan.steps.length > 0);
  const showPlan = hasPlan && view === "plan";
  const [activeSentence, setActiveSentence] = useState<number | null>(null);
  const sentences = useMemo(
    () => splitSentences(state.lessonText ?? ""),
    [state.lessonText],
  );
  // Points at the current `narrate` (defined below) so the auto-narrate effect
  // can call it without depending on its identity.
  const narrateRef = useRef<
    ((text: string, mode?: "auto" | "button") => Promise<void>) | null
  >(null);

  // Voice + TEXT: the micro-lesson is meant to be taught, not just read. When
  // a voice conversation is possible, hand the lesson text to the agent so it
  // reads it with its natural voice while the text stays on screen. The agent
  // connects on demand — a student who typed their recall gets the same
  // spoken lesson as one who talked. The robotic browser voice is never used
  // automatically — only from the button, as a deliberate fallback.
  // (Voice-first auto-arming of the ring is planned, not active — see
  // VoxideRing.)
  useEffect(() => {
    const text = state.lessonText;
    if (!text || text === narratedRef.current) return;
    narratedRef.current = text;
    if (!hasVoxideKey()) return;
    const client = getVoxideClient();
    if (!client) return;
    // Through a ref: `narrate` is rebuilt every render, and depending on it
    // would re-arm the narration on every render. The lesson text is the only
    // thing that should start a read-aloud.
    void narrateRef.current?.(text, "auto");
  }, [state.lessonText]);

  // One narration entry point. Acknowledges immediately (reading state),
  // prefers the agent's natural voice, and falls back to the browser voice
  // with a sentence read-along. `mode: "auto"` never falls back to browser
  // TTS — only the explicit button does.
  const narrate = async (t: string, mode: "auto" | "button" = "button") => {
    if (!t) return;
    // Stop anything already playing so a second "Read it to me" replaces
    // the first instead of stacking a double read-back.
    stopRef.current?.();
    setReading(true);
    setActiveSentence(mode === "auto" ? null : sentences.length > 1 ? 0 : null);
    const voiced = await speakViaVoxide(t);
    if (voiced) return; // agent read it; stays "reading" until stopped
    if (mode === "auto") {
      setReading(false);
      setActiveSentence(null);
      return;
    }
    // acknowledged fallback: Voxide failed/absent → browser TTS.
    setReading(true);
    setActiveSentence(sentences.length > 1 ? 0 : null);
    speakAloud(
      t,
      (i) => setActiveSentence(i),
      () => {
        setReading(false);
        setActiveSentence(null);
      },
    );
  };

  narrateRef.current = narrate;

  const stopReading = () => {
    stopReadingAloud();
    stopVoiceNarration();
    setReading(false);
    setActiveSentence(null);
  };

  stopRef.current = stopReading;

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
          <PlanView
            plan={plan}
            lessonText={state.lessonText}
            recording={reading}
            narrate={(text) => void narrate(text, "button")}
            stopReading={stopReading}
          />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setView("classic")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium text-muted-foreground text-xs transition-colors duration-200 hover:border-gold/40 hover:text-gold"
            >
              {t("plan-classic-lesson")}
            </button>
          </div>
          <p className="text-center text-muted-foreground text-xs">
            {t("plan-classic-caption")}
          </p>
        </>
      ) : hasPlan ? (
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
                void narrate(`${section.what} ${section.recall}`, "button")
              }
            />
          ) : (
            <LessonTextPanel
              lessonText={state.lessonText}
              sentences={sentences}
              activeSentence={activeSentence}
              recording={reading}
              narrate={() => void narrate(state.lessonText ?? "", "button")}
              stopReading={stopReading}
              onReplaySentence={(i) =>
                void narrate(sentences[i] ?? "", "button")
              }
            />
          )}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setView("plan")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium text-muted-foreground text-xs transition-colors duration-200 hover:border-gold/40 hover:text-gold"
            >
              {t("plan-back")}
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
                void narrate(`${section.what} ${section.recall}`, "button")
              }
            />
          ) : (
            <LessonTextPanel
              lessonText={state.lessonText}
              sentences={sentences}
              activeSentence={activeSentence}
              recording={reading}
              narrate={() => void narrate(state.lessonText ?? "", "button")}
              stopReading={stopReading}
              onReplaySentence={(i) =>
                void narrate(sentences[i] ?? "", "button")
              }
            />
          )}
        </>
      )}

      <div className="space-y-2 pt-1">
        <Button
          className="w-full justify-center"
          disabled={state.busy}
          onClick={() => void startRetest()}
        >
          {t("ready-to-be-tested")}
        </Button>
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

function RetestPhase() {
  const { state, submitAnswer, fetchResult } = useStudy();
  const { t, lang } = useLanguage();
  const { questions, currentQuestion, answered } = state;
  const done = currentQuestion >= questions.length;
  const submitText = useCallback(
    (text: string) => submitAnswer(text),
    [submitAnswer],
  );

  return (
    <div className="space-y-6">
      <PhaseHeading
        title={t("retest-title")}
        text={done ? t("retest-done-text") : t("retest-text")}
      />
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
          {questions[currentQuestion]?.focus?.length ? (
            <p className="mb-2 font-medium text-[0.78rem] text-muted-foreground">
              {t("retest-checking", {
                focus: questions[currentQuestion].focus.join(", "),
              })}
            </p>
          ) : null}
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
                textDefault={!hasVoxideKey()}
                busy={state.busy}
                placeholder={t("type-answer-out-loud")}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {answered.length > 0 && (
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
                      a.correct
                        ? "bg-sage/15 text-sage"
                        : "bg-rust/15 text-rust",
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
          )}
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
            <Button
              className="w-full justify-center"
              disabled={busy}
              onClick={() => void onDone()}
            >
              {t("done-for-now")}
            </Button>
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
