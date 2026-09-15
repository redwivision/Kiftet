import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useVoxideVoice, type VoxideStatus } from "@voxide/react";

import type { Route } from "./+types/study.$sessionId";
import { Button } from "@kiftet/ui/components/button";
import { Textarea } from "@kiftet/ui/components/textarea";
import { cn } from "@kiftet/ui/lib/utils";
import { Loader2, MicOff } from "lucide-react";

import { getVoxideClient, hasVoxideKey } from "@/components/assistant";
import { GapList } from "@/components/gap-list";
import { StudyProvider, useStudy } from "@/components/study-provider";
import { VoxideRing } from "@/components/voxide-ring";

const ACTIVE: VoxideStatus[] = ["connecting", "listening", "speaking", "thinking", "executing"];

const RECALL_CAPTION: Record<string, string> = {
  idle: "Say everything you remember out loud, then tap the ring again when you're done — I'll grade it right away.",
  armed: "Wake word armed — tap to start.",
  connecting: "Connecting…",
  listening: "Listening… tap the ring when you're done.",
  thinking: "Thinking…",
  speaking: "Speaking…",
  executing: "Working…",
  error: "Couldn't reach the voice service. Tap to retry, or type below.",
};

const ANSWER_CAPTION: Record<string, string> = {
  idle: "Tap the ring locked you in: say your full answer out loud, then tap the ring again when you're done — I'll grade you right away.",
  armed: "Wake word armed — tap to start.",
  connecting: "Connecting…",
  listening: "Listening… tap the ring when you're done.",
  thinking: "Thinking…",
  speaking: "Speaking…",
  executing: "Working…",
  error: "Couldn't reach the voice service. Tap to retry, or type below.",
};

export default function StudyRoute({ params }: Route.ComponentProps) {
  return (
    <StudyProvider sessionId={params.sessionId}>
      <StudyScreen />
    </StudyProvider>
  );
}

function StudyScreen() {
  const navigate = useNavigate();
  const { state, retryAgain, retryLast, completeSession, clearError } = useStudy();

  if (state.chapterLoading) {
    return (
      <main className="mx-auto grid w-full max-w-md content-center justify-items-center gap-4 px-6 py-12 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Opening your study session…</p>
      </main>
    );
  }

  if (state.sessionNotFound || !state.chapter) {
    return (
      <main className="mx-auto grid w-full max-w-md content-center gap-4 px-6 py-12 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-manuscript">
          This session isn&apos;t here
        </h1>
        <p className="text-sm text-muted-foreground">
          It may have been created in another browser, or the link has a typo.
        </p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          Back to chapters
        </Button>
      </main>
    );
  }

  const done = async () => {
    await completeSession();
    navigate("/dashboard");
  };

  return (
    <main className="mx-auto grid w-full max-w-md content-start gap-6 px-6 py-8">
      <StudyHeader subject={state.chapter.subject} title={state.chapter.title} />

      {state.error && (
        <div className="rounded-lg border border-rust/50 bg-rust/10 px-4 py-3 text-sm text-manuscript/85">
          <p className="font-medium mb-1">Something went wrong</p>
          <p className="text-manuscript/60">{state.error}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void retryLast()}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {state.phase === "recall" && <RecallPhase />}
      {state.phase === "gaps" && <GapsPhase />}
      {state.phase === "lesson" && <LessonPhase />}
      {state.phase === "retest" && <RetestPhase />}
      {state.phase === "result" && <ResultPhase onDone={done} onTryAgain={retryAgain} />}
    </main>
  );
}

function StudyHeader({ subject, title }: { subject: string; title: string }) {
  return (
    <header className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-widest text-gold/80">{subject}</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-manuscript">{title}</h1>
    </header>
  );
}

// ── Voice capture ───────────────────────────────────────────────

function VoiceCapture({
  submit,
  textDefault,
  busy,
}: {
  submit: (text: string) => Promise<void>;
  textDefault: boolean;
  busy: boolean;
}) {
  const { state, setNotice, clearNotice } = useStudy();
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
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const noticeRef = useRef<string | null>(state.notice);
  noticeRef.current = state.notice;

  const baseKey =
    state.phase === "retest" ? `retest:${state.currentQuestion}` : `phase:${state.phase}`;

  useEffect(() => {
    baseRef.current = voice.messages.length;
    wasActiveRef.current = ACTIVE.includes(voice.status);
    clearNotice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);

  // Listen → hang up: finalize the capture and send the last thing the student said.
  // If the window looks empty, GRACE it: disconnect() hard-closes the socket the
  // moment the ring stops listening, and the SDK's turn_complete can land a beat
  // later (it carries the final user transcript). Declaring a miss instantly
  // would grade an empty window even though the student spoke clearly. So we
  // wait a short quiet beat, re-poll the slice, and only then say anything.
  useEffect(() => {
    if (busyRef.current) return;
    const wasActive = wasActiveRef.current;
    const isActive = ACTIVE.includes(voice.status);
    wasActiveRef.current = isActive;
    if (!wasActive || isActive || baseRef.current === null || busyRef.current) return;
    const start = baseRef.current;

    const finalize = () => {
      const spoken = voice.messages
        .slice(start)
        .filter((m) => m.role === "user" && m.partial !== true && Boolean(m.text.trim()));
      const last = spoken[spoken.length - 1];
      if (last && last.text.trim()) {
        void submit(last.text.trim());
      } else if (voice.status !== "error") {
        setNotice("I didn't catch that — no rush. Tap the ring and try again whenever you're ready.");
      }
    };

    const spokenNow = voice.messages
      .slice(baseRef.current)
      .filter((m) => m.role === "user" && m.partial !== true && Boolean(m.text.trim()));
    if (spokenNow[spokenNow.length - 1]?.text.trim()) {
      void submit(spokenNow[spokenNow.length - 1].text.trim());
      return;
    }

    // The narrow window missed, but the student may have already said something
    // this very phase whose message wasn't yet finalized when we sliced. Falling
    // back to the most recent user utterance in the whole phase means a clearly
    // spoken answer still gets graded instead of being stranded. Only when the
    // ENTIRE phase has no user text do we follow the calm wait-for-them path.
    const wholePhase = voice.messages
      .slice(baseRef.current)
      .filter((m) => m.role === "user" && m.partial !== true && Boolean(m.text.trim()));
    const phaseFallback = wholePhase[wholePhase.length - 1];
    if (phaseFallback && phaseFallback.text.trim() && voice.status !== "error") {
      void submit(phaseFallback.text.trim());
      return;
    }

    // Nothing finalized yet — give the socket a graceful beat before deciding.
    const t = setTimeout(finalize, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.status]);

  // Grace state: after a long stretch of no speech while listening, reassure the
  // student instead of timing them out. Never emits failure copy on our own.
  useEffect(() => {
    if (voice.status !== "listening" || baseRef.current === null) return;
    let lastCount = voice.messages.length;
    let lastChangedAt = Date.now();
    const timer = setInterval(() => {
      if (voice.messages.length !== lastCount) {
        if (noticeRef.current) clearNotice();
        lastCount = voice.messages.length;
        lastChangedAt = Date.now();
        return;
      }
      if (Date.now() - lastChangedAt >= 7000) {
        setNotice("Still listening — take your time.");
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.status, baseKey]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2">
        {effectiveText ? (
          <div className="grid size-40 place-items-center rounded-full border-2 border-dashed border-manuscript/25 text-muted-foreground/40">
            <MicOff className="size-10" />
          </div>
        ) : (
          <VoxideRing />
        )}

        {!effectiveText && (
          <p className="text-sm font-medium text-manuscript/70" aria-live="polite">
            {captureCaption(voice.status, state.phase)}
          </p>
        )}

        <div className="mt-4 flex w-full max-w-sm flex-col gap-2 text-left text-sm" aria-live="polite">
          {voice.messages
            .slice(baseRef.current ?? 0)
            .filter((m) => m.role === "user" && m.partial !== true && Boolean(m.text.trim()))
            .map((m, i) => (
              <div key={i} className="rounded-lg border border-sage/20 bg-sage/5 px-3 py-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-sage">You said</span>
                <p className="mt-0.5 text-manuscript">{m.text.trim()}</p>
              </div>
            ))}
          {state.notice && (
            <div className="rounded-lg border border-sky/20 bg-sky/5 px-3 py-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-sky">I'll read back</span>
              <p className="mt-0.5 text-manuscript">{state.notice}</p>
              <button
                type="button"
                onClick={() => {
                  const t = state.notice === null ? "" : state.notice;
                  if (!t) return;
                  const u = new SpeechSynthesisUtterance(t);
                  u.lang = "en-US";
                  window.speechSynthesis.cancel();
                  window.speechSynthesis.speak(u);
                }}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky underline underline-offset-2 hover:text-sky/80"
              >
                Read it to me
              </button>
            </div>
          )}
        </div>

        {(() => {
          const base = baseRef.current ?? 0;
          return (
            <div className="mt-4 flex w-full max-w-sm flex-col gap-2 text-left text-sm" aria-live="polite">
              {voice.messages
                .slice(base)
                .filter((m) => m.role === "user" && m.partial !== true && Boolean(m.text.trim()))
                .map((m, i) => (
                  <div key={`${base}-${i}`} className="rounded-lg border border-sage/20 bg-sage/5 px-3 py-1.5">
                    <span className="text-xs font-medium uppercase tracking-wide text-sage">You said</span>
                    <p className="mt-0.5 text-manuscript">{m.text.trim()}</p>
                  </div>
                ))}
              {state.notice && (
                <div className="rounded-lg border border-rust/25 bg-rust/5 px-3 py-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-rust">I'll read back</span>
                  <p className="mt-0.5 text-manuscript">{state.notice}</p>
                </div>
              )}
            </div>
          );
        })()}

        {voice.errorCode === "usage_limit" && (
          <p className="rounded-sm border border-rust/40 bg-rust/10 px-3 py-2 text-xs text-manuscript/70">
            The voice service is out of sessions right now — the text version still works.
          </p>
        )}
      </div>

      {effectiveText && <TextRecorder busy={busy} submit={submit} />}

      {!voiceDead && (
        <div className="text-center">
          {showText ? (
            <button
              type="button"
              className="text-xs underline underline-offset-4 text-muted-foreground hover:text-manuscript"
              onClick={() => setShowText(false)}
            >
              Try voice instead
            </button>
          ) : (
            <button
              type="button"
              className="text-xs underline underline-offset-4 text-muted-foreground hover:text-manuscript"
              onClick={() => setShowText(true)}
            >
              Prefer typing?
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function captureCaption(status: VoxideStatus, phase: string): string {
  const table = phase === "retest" ? ANSWER_CAPTION : RECALL_CAPTION;
  return table[status] ?? RECALL_CAPTION.idle;
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
  const [text, setText] = useState("");

  const doSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setText("");
    await submit(trimmed);
  };

  return (
    <div className="space-y-2">
      <Textarea
        name="recall"
        aria-label="Type how much of the chapter you remember — this gets graded exactly like a spoken recall"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? "Type your answer…"}
        className="border-manuscript/15 bg-night-raised text-manuscript placeholder:text-muted-foreground/60"
      />
      <Button onClick={() => void doSubmit()} disabled={!text.trim() || busy}>
        {buttonLabel ?? "Submit"}
      </Button>
    </div>
  );
}

// ── Phases ──────────────────────────────────────────────────────

function RecallPhase() {
  const { submitRecall } = useStudy();

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight text-manuscript">
          Remember out loud
        </h2>
        <p className="text-sm text-muted-foreground">
          Tell the ring everything you know about this chapter in your own words. Missing some is
          the whole point — nobody covers everything cold.
        </p>
      </div>

      <VoiceCapture submit={(text) => submitRecall(text)} textDefault={!hasVoxideKey()} busy={false} />
    </div>
  );
}

function GapsPhase() {
  const { state, fetchLesson, startRetest } = useStudy();
  const gaps = state.gaps;

  if (!gaps) return null;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight text-manuscript">
          Your starting picture
        </h2>
        <p className="text-sm text-muted-foreground">
          Solid ideas are marked in sage. The rust gaps are what the short version will fix.
        </p>
      </div>

      <GapList covered={gaps.covered} missing={gaps.missing} />

      <div className="space-y-2 pt-2">
        <Button className="w-full" disabled={state.busy} onClick={() => void fetchLesson()}>
          {state.busy ? "Preparing it…" : "Hear the short version"}
        </Button>
        <button
          type="button"
          className="w-full text-center text-xs underline underline-offset-4 text-muted-foreground hover:text-manuscript"
          onClick={() => void startRetest()}
        >
          Skip the lesson — take the test
        </button>
      </div>
    </div>
  );
}

function LessonPhase() {
  const { state, startRetest, viewGaps } = useStudy();

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight text-manuscript">
          The short version
        </h2>
        <p className="text-sm text-muted-foreground">Just what you missed — nothing more.</p>
      </div>

      <div className="whitespace-pre-wrap rounded-lg border border-manuscript/15 bg-night-raised px-4 py-4 text-[0.95rem] leading-relaxed text-manuscript/90">
        {state.lessonText ?? "Writing it…"}
      </div>

      <div className="space-y-2 pt-2">
        <Button className="w-full" disabled={state.busy} onClick={() => void startRetest()}>
          I&apos;m ready to be tested
        </Button>
        <button
          type="button"
          className="w-full text-center text-xs underline underline-offset-4 text-muted-foreground hover:text-manuscript"
          onClick={viewGaps}
        >
          Back to my gaps
        </button>
      </div>
    </div>
  );
}

function RetestPhase() {
  const { state, submitAnswer, fetchResult } = useStudy();
  const { questions, currentQuestion, answered } = state;
  const done = currentQuestion >= questions.length;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight text-manuscript">
          A short retest
        </h2>
        <p className="text-sm text-muted-foreground">
          {done ? "That was the last one." : `Question ${currentQuestion + 1} of ${questions.length}.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
        {questions.map((q, i) => {
          const a = answered[i];
          return (
            <span
              key={q}
              className={cn(
                "size-2.5 rounded-full border",
                a
                  ? a.correct
                    ? "border-sage bg-sage"
                    : "border-rust bg-transparent"
                  : i === currentQuestion
                    ? "border-gold bg-gold/30"
                    : "border-muted-foreground/30 bg-transparent",
              )}
            />
          );
        })}
      </div>

      <ul className="space-y-3">
        {answered.map((a, i) => (
          <li key={i} className="rounded-lg border border-manuscript/15 bg-night-raised px-4 py-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-manuscript">Q{i + 1}.</span> {a.question}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  a.correct ? "bg-sage" : "border border-rust bg-transparent",
                )}
              />
              <span className={a.correct ? "text-sage" : "text-rust"}>
                {a.correct ? "Right" : "Not quite"}
              </span>
            </p>
          </li>
        ))}
      </ul>

      {!done ? (
        <div className="rounded-lg border border-manuscript/15 bg-night-raised px-4 py-4">
          <p className="font-display text-lg font-medium tracking-tight text-manuscript">
            {questions[currentQuestion] ?? ""}
          </p>
          <div className="mt-4">
            <VoiceCapture
              submit={(text) => submitAnswer(text)}
              textDefault={!hasVoxideKey()}
              busy={state.busy}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          <p className="text-sm text-muted-foreground">
            All answered. See whether the short version closed your gaps.
          </p>
          <Button className="w-full" disabled={state.busy} onClick={() => void fetchResult()}>
            {state.busy ? "Grading…" : "See your result"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ResultPhase({ onDone, onTryAgain }: { onDone: () => Promise<void>; onTryAgain: () => void }) {
  const { state } = useStudy();
  const result = state.result;
  const busy = state.busy;

  if (!result) {
    return (
      <div className="grid min-h-40 place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const improved = (result.delta ?? 0) > 0;

  if (state.allCovered) {
    return (
      <ResultPanel
        tone="sage"
        headline="You covered everything."
        body="Every idea in this chapter came out solid. That is exactly what this is for."
        metric={[{ label: "Recall", value: `${result.before ?? 0}%` }]}
        actions={
          <Button className="w-full" disabled={busy} onClick={() => void onDone()}>
            Done for now
          </Button>
        }
      />
    );
  }

  if (improved) {
    return (
      <ResultPanel
        tone="sage"
        headline="Gap closed."
        body={`The short version fixed what was missing. You came out ${result.delta} points further along than when you started.`}
        metric={[
          { label: "Before", value: `${result.before ?? 0}%` },
          { label: "After", value: `${result.after ?? 0}%` },
        ]}
        actions={
          <Button className="w-full" disabled={busy} onClick={() => void onDone()}>
            Done for now
          </Button>
        }
      />
    );
  }

  return (
    <ResultPanel
      tone="rust"
      headline="Some concepts need another pass."
      body="That's normal — not everything sticks on the first try. Now you have a clear picture of what to come back to."
      metric={[
        { label: "Before", value: `${result.before ?? 0}%` },
        { label: "After", value: `${result.after ?? 0}%` },
      ]}
      actions={
        <div className="space-y-3">
          <Button className="w-full" disabled={busy} onClick={onTryAgain}>
            Try again
          </Button>
          {state.attempts >= 2 && (
            <button
              type="button"
              className="w-full text-center text-xs underline underline-offset-4 text-muted-foreground hover:text-manuscript"
              onClick={() => void onDone()}
            >
              Come back to this later
            </button>
          )}
        </div>
      }
    />
  );
}

function ResultPanel({
  tone,
  headline,
  body,
  metric,
  actions,
}: {
  tone: "sage" | "rust";
  headline: string;
  body: string;
  metric: { label: string; value: string }[];
  actions: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div
        className={cn(
          "rounded-lg border px-4 py-5",
          tone === "sage" ? "border-sage/40 bg-sage/10" : "border-rust/40 bg-rust/10",
        )}
      >
        <h2
          className={cn(
            "font-display text-2xl font-semibold tracking-tight",
            tone === "sage" ? "text-sage" : "text-rust",
          )}
        >
          {headline}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-manuscript/80">{body}</p>
      </div>

      <div className="rounded-lg border border-manuscript/15 bg-night-raised px-4 py-1 text-sm">
        {metric.map((m) => (
          <p key={m.label} className="flex items-baseline justify-between py-2">
            <span className="font-medium text-muted-foreground">{m.label}</span>
            <span className="font-display text-lg font-semibold text-manuscript">{m.value}</span>
          </p>
        ))}
      </div>

      <div className="pt-1">{actions}</div>
    </div>
  );
}