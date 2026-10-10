import { cn } from "@kiftet/ui/lib/utils";

import { useVoxideVoice, type VoxideStatus } from "@voxide/react";
import { Mic, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getVoxideClient } from "@/components/assistant";
import { InkSettling } from "@/components/ink-settling";
import { useLanguage } from "@/components/language-provider";
import { ShortcutHint } from "@/components/shortcut-hint";
import type { MessageKey } from "@/lib/messages";
import { shouldHandleSpace } from "@/lib/shortcuts";

/* The voice state captions. These keys have been bilingual since bet 4 — the
   ring was simply never wired to them, so an Amharic reader was told
   "Listening…" in English at the exact moment they were speaking. */
const LABEL_KEY: Record<VoxideStatus, MessageKey> = {
  idle: "vt-idle",
  armed: "vt-armed",
  connecting: "vt-connecting",
  listening: "vt-listening",
  thinking: "vt-thinking",
  speaking: "vt-speaking",
  executing: "vt-executing",
  error: "vt-error",
};

const PROCESSING: VoxideStatus[] = ["connecting", "thinking", "executing"];

export function VoxideRing({
  autoArm = false,
}: {
  /** Reserved for the planned voice-first flow: the ring opening the mic on
   *  its own when a phase opens, so speaking needs no tap. NOT active yet —
   *  the ring always waits for an explicit tap, which also keeps the browser
   *  mic-permission prompt from appearing unannounced. The prop is threaded
   *  through already so enabling the flow is a one-line change. See
   *  docs/howItWorks/dataflow.md §5. */
  autoArm?: boolean;
}) {
  const client = getVoxideClient();
  const voice = useVoxideVoice(client);
  const { status } = voice;
  const { t } = useLanguage();

  const [initReady, setInitReady] = useState(() =>
    client ? client.isInitialized : false,
  );

  // One quick ivory ripple the moment recording actually begins — a tap
  // confirm, not a loop (no generic pulsing-dot mic). Incrementing the count
  // re-keys the span so the one-shot animation replays on each start.
  const [ripples, setRipples] = useState(0);
  const lastStatus = useRef(status);
  useEffect(() => {
    if (status === "listening" && lastStatus.current !== "listening") {
      setRipples((n) => n + 1);
    }
    lastStatus.current = status;
  }, [status]);

  // Voice-first (planned): the mic would open automatically when autoArm flips
  // on and the ring is ready — mirroring a tap. Not active yet: the ring is
  // tap-to-talk only until the voice-first flow ships.
  const prevAutoArm = useRef(false);
  useEffect(() => {
    // Planned (not yet enabled): when autoArm flips false→true while the ring
    // is quiet, the mic would open on its own. Until that ships, the prop is
    // effectively inert and the ring is tap-to-talk only.
    const connectWhenQuiet =
      initReady &&
      autoArm &&
      !prevAutoArm.current &&
      (voice.status === "idle" ||
        voice.status === "armed" ||
        voice.status === "error");
    if (connectWhenQuiet) {
      void voice.connect();
    } else if (!autoArm && prevAutoArm.current) {
      void voice.disconnect();
    }
    prevAutoArm.current = autoArm;
  }, [autoArm, initReady, voice.status, voice.connect, voice.disconnect]);
  useEffect(() => {
    if (!client || client.isInitialized) return;
    const unsubscribe = client.on("ready", () => setInitReady(true));
    return unsubscribe;
  }, [client]);

  const isProcessing = PROCESSING.includes(status);
  const isListening = status === "listening";
  const isSpeaking = status === "speaking";

  // Tap once → start talking. Tap again while a session is active → hang up.
  // (connect()/disconnect() mirror the vendor's own mic-toggle semantics.)
  const onClick = () => {
    if (!initReady) return;
    if (status === "idle" || status === "armed" || status === "error") {
      void voice.connect();
    } else {
      void voice.disconnect();
    }
  };

  // On a desktop the ring is the primary control, so Space toggles it the same
  // way a tap does — the one shortcut a keyboard student expects from a mic.
  // It stays out of the way when the key already belongs to something: a field
  // keeps its space, and a focused button or link activates normally.
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  useEffect(() => {
    if (!initReady) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (!shouldHandleSpace(document.activeElement)) return;
      event.preventDefault();
      onClickRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [initReady]);

  const label = initReady ? t(LABEL_KEY[status]) : t("loading");

  return (
    <div className="group relative grid place-items-center" aria-live="polite">
      {/* Resting heartbeat: the quiet ring breathes in flat ivory, ~3s.
			    Sits just proud of the ring so the motion reads as a soft halo. */}
      {initReady && (status === "idle" || status === "armed") && (
        <span className="absolute -inset-2 animate-breathe rounded-full bg-gold/15" />
      )}
      {initReady && ripples > 0 && (
        <span
          key={ripples}
          className="absolute inset-0 animate-ripple-once rounded-full bg-gold/25"
        />
      )}
      {initReady && isSpeaking && (
        <span className="absolute inset-0 animate-ring-pulse rounded-full bg-gold/20" />
      )}
      {initReady && !isProcessing && (
        <div className="absolute top-1/2 left-full ml-3 -translate-y-1/2">
          <ShortcutHint keys="Space" label={t("shortcut-talk-label")} />
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-keyshortcuts="Space"
        className={cn(
          "relative grid size-40 place-items-center rounded-full border-2 bg-night-raised transition-colors duration-300",
          "focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-4",
          !initReady && "border-border/40 text-foreground/40",
          initReady &&
            status === "idle" &&
            "border-gold/40 text-gold/80 hover:border-gold hover:text-gold",
          initReady && status === "armed" && "border-gold/40 text-gold/80",
          initReady && isListening && "border-gold text-gold",
          initReady && isSpeaking && "border-gold/70 text-gold",
          initReady &&
            isProcessing &&
            "border-manuscript/30 text-manuscript/60",
          initReady && status === "error" && "border-rust/60 text-rust",
        )}
      >
        {!initReady ? (
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
