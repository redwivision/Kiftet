import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";

import { buttonVariants } from "@kiftet/ui/components/button";
import { cn } from "@kiftet/ui/lib/utils";
import { VoiceRing } from "@/components/voice-ring";
import { useVoiceSession } from "@/hooks/use-voice-session";

const SAMPLE_LESSON =
  "Thermal equilibrium is the state when two objects have reached the same temperature and heat stops flowing between them. Karana? When you hold a warm bottle, energy moves into your hand until both reach the same temperature — that is equilibrium.";

export default function VoiceTest() {
  const { state, transcript, interim, error, isSupported, start, stop, speak } = useVoiceSession();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <main className="mx-auto grid w-full max-w-md content-center gap-8 px-6 py-12">
      <div className="space-y-2 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-manuscript">
          Voice test
        </h1>
        <p className="text-sm text-muted-foreground">
          Phase 1 · prove the app can hear you and talk back.
        </p>
      </div>

      {!ready ? (
        <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">
          Loading voice…
        </div>
      ) : !isSupported ? (
        <div className="rounded-lg border border-rust/50 bg-rust/10 px-4 py-3 text-sm text-manuscript/85">
          Voice isn&apos;t supported in this browser. Use a recent version of
          Google Chrome (desktop or Android) where the mic permission is granted.
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-4">
            <VoiceRing state={state} onStart={start} onStop={stop} />
            <p className="h-5 text-sm font-medium text-manuscript/70">
              {state === "idle" ? "Tap the ring and explain a concept out loud." : null}
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-rust/50 bg-rust/10 px-4 py-3 text-sm text-manuscript/85">
              {error}
            </div>
          )}

          <div className="min-h-28 rounded-lg border border-manuscript/15 bg-night-raised px-4 py-3">
            <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
              What you said
            </p>
            {transcript || interim ? (
              <p className="text-sm leading-relaxed text-manuscript/90">
                {transcript}
                {interim && <span className="text-manuscript/40">{interim}</span>}
              </p>
            ) : (
              <p className="text-sm text-manuscript/40">…</p>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => void speak(SAMPLE_LESSON)}
              className={cn(buttonVariants({ variant: "outline" }), "w-full max-w-72 gap-2")}
            >
              <Volume2 className="size-4" />
              Hear a sample lesson
            </button>
            <p className="text-xs text-muted-foreground">
              Tests text-to-speech — the &quot;speak the gap lesson&quot; side of the product.
            </p>
          </div>
        </>
      )}
    </main>
  );
}