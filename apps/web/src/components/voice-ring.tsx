import { Loader2, Mic, Square, Volume2 } from "lucide-react";

import { cn } from "@kiftet/ui/lib/utils";
import type { VoiceState } from "@/lib/voice";

type VoiceRingProps = {
  state: VoiceState;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
};

const LABEL: Record<VoiceState, string> = {
  idle: "Tap and speak",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export function VoiceRing({ state, onStart, onStop, disabled }: VoiceRingProps) {
  const isActive = state === "listening" || state === "speaking";
  const isThinking = state === "thinking";

  return (
    <div className="relative grid place-items-center">
      {isActive && <span className="absolute inset-0 animate-ping rounded-full bg-gold/20" />}
      <button
        type="button"
        onClick={state === "listening" ? onStop : onStart}
        disabled={disabled || isThinking}
        aria-label={LABEL[state]}
        className={cn(
          "relative grid size-40 place-items-center rounded-full border-2 bg-night-raised transition-colors duration-300",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold",
          disabled && "cursor-not-allowed opacity-50",
          state === "idle" && "border-gold/40 text-gold/80 hover:border-gold hover:text-gold",
          state === "listening" && "border-gold text-gold",
          state === "thinking" && "border-manuscript/30 text-manuscript/60",
          state === "speaking" && "border-gold/70 text-gold",
        )}
      >
        {state === "listening" ? (
          <Square className="size-12 fill-current" />
        ) : state === "thinking" ? (
          <Loader2 className="size-12 animate-spin" />
        ) : state === "speaking" ? (
          <Volume2 className="size-12" />
        ) : (
          <Mic className="size-12" />
        )}
      </button>
    </div>
  );
}