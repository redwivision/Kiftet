import { cn } from "@kiftet/ui/lib/utils";
import { Mic, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InkSettling } from "@/components/ink-settling";
import { ShortcutHint } from "@/components/shortcut-hint";
import { shouldHandleSpace } from "@/lib/shortcuts";
import type { VoiceState } from "@/lib/voice";

/** The push-to-talk ring, presentational only. It reads a single `VoiceState`
 *  and calls `onToggle` on tap or Space — the browser voice session that backs
 *  it lives in `useVoiceSession`, not here (see docs/howItWorks/dataflow.md §5).
 *  Same ink vocabulary as the rest of the loop: a slow breathing idle halo, one
 *  shot ripple the moment recording starts, a pulse while reading aloud. */
export function VoiceRing({
  state,
  onToggle,
  ariaLabel,
  shortcutLabel,
  ready = true,
}: {
  state: VoiceState;
  onToggle: () => void;
  ariaLabel: string;
  shortcutLabel: string;
  ready?: boolean;
}) {
  // One quick ivory ripple the moment recording actually begins — a tap
  // confirm, not a loop. Incrementing the count re-keys the span so the
  // one-shot animation replays on each start.
  const [ripples, setRipples] = useState(0);
  const lastState = useRef(state);
  useEffect(() => {
    if (state === "listening" && lastState.current !== "listening") {
      setRipples((n) => n + 1);
    }
    lastState.current = state;
  }, [state]);

  // On a desktop the ring is the primary control, so Space toggles it the same
  // way a tap does. It stays out of the way when the key already belongs to
  // something: a field keeps its space, and a focused button or link activates
  // normally.
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  useEffect(() => {
    if (!ready) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (!shouldHandleSpace(document.activeElement)) return;
      event.preventDefault();
      onToggleRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ready]);

  const isProcessing = state === "thinking";
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";

  return (
    <div className="group relative grid place-items-center" aria-live="polite">
      {ready && state === "idle" && (
        <span className="absolute -inset-2 animate-breathe rounded-full bg-gold/15" />
      )}
      {ready && ripples > 0 && (
        <span
          key={ripples}
          className="absolute inset-0 animate-ripple-once rounded-full bg-gold/25"
        />
      )}
      {ready && isSpeaking && (
        <span className="absolute inset-0 animate-ring-pulse rounded-full bg-gold/20" />
      )}
      {ready && !isProcessing && (
        <div className="absolute top-1/2 left-full ml-3 -translate-y-1/2">
          <ShortcutHint keys="Space" label={shortcutLabel} />
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        disabled={!ready}
        aria-label={ariaLabel}
        aria-keyshortcuts="Space"
        className={cn(
          "relative grid size-40 place-items-center rounded-full border-2 bg-night-raised transition-colors duration-300",
          "focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-4",
          !ready && "border-border/40 text-foreground/40",
          ready &&
            state === "idle" &&
            "border-gold/40 text-gold/80 hover:border-gold hover:text-gold",
          ready && isListening && "border-gold text-gold",
          ready && isSpeaking && "border-gold/70 text-gold",
          ready && isProcessing && "border-manuscript/30 text-manuscript/60",
        )}
      >
        {!ready ? (
          <InkSettling barClassName="h-1 w-6" className="text-foreground/50" />
        ) : isListening ? (
          <Square className="size-12 fill-current" />
        ) : isProcessing ? (
          <InkSettling barClassName="h-1 w-6" />
        ) : isSpeaking ? (
          <Volume2 className="size-12" />
        ) : (
          <Mic className="size-12" />
        )}
      </button>
    </div>
  );
}
