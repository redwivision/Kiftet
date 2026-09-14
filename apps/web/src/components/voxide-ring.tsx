import { useVoxideVoice, type VoxideStatus } from "@voxide/react";
import { Loader2, Mic, Square, Volume2 } from "lucide-react";

import { cn } from "@kiftet/ui/lib/utils";
import { getVoxideClient } from "@/components/assistant";

const LABEL: Record<VoxideStatus, string> = {
  idle: "Tap and speak",
  armed: "Wake word armed — tap to start",
  connecting: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  executing: "Running…",
  error: "Tap to retry",
};

const PROCESSING: VoxideStatus[] = ["connecting", "thinking", "executing"];
const ACTIVE: VoxideStatus[] = ["listening", "speaking", "connecting", "thinking", "executing"];

export function VoxideRing() {
  const client = getVoxideClient();
  const voice = useVoxideVoice(client);
  const { status } = voice;

  const isProcessing = PROCESSING.includes(status);
  const isActive = ACTIVE.includes(status);
  const isListening = status === "listening";
  const isSpeaking = status === "speaking";

  // Tap once → start talking. Tap again while anything is in flight → kill it.
  const onClick = () => {
    if (status === "idle" || status === "armed" || status === "error") {
      void voice.connect();
    } else {
      voice.interrupt();
    }
  };

  return (
    <div className="relative grid place-items-center" aria-live="polite">
      {isActive && <span className="absolute inset-0 animate-ping rounded-full bg-gold/20" />}
      <button
        type="button"
        onClick={onClick}
        aria-label={LABEL[status]}
        className={cn(
          "relative grid size-40 place-items-center rounded-full border-2 bg-night-raised transition-colors duration-300",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold",
          status === "idle" && "border-gold/40 text-gold/80 hover:border-gold hover:text-gold",
          status === "armed" && "border-gold/40 text-gold/80",
          isListening && "border-gold text-gold",
          isSpeaking && "border-gold/70 text-gold",
          isProcessing && "border-manuscript/30 text-manuscript/60",
          status === "error" && "border-rust/60 text-rust",
        )}
      >
        {isListening ? (
          <Square className="size-12 fill-current" />
        ) : isProcessing ? (
          <Loader2 className="size-12 animate-spin" />
        ) : isSpeaking ? (
          <Volume2 className="size-12" />
        ) : (
          <Mic className="size-12" />
        )}
      </button>
    </div>
  );
}