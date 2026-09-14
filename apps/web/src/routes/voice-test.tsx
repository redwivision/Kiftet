import { useEffect, useState } from "react";
import { useVoxideVoice } from "@voxide/react";

import { cn } from "@kiftet/ui/lib/utils";
import { getVoxideClient, hasVoxideKey } from "@/components/assistant";
import { VoxideRing } from "@/components/voxide-ring";

const STATUS_LABEL: Record<string, string> = {
  idle: "Tap the ring and talk — anything.",
  armed: "Wake word loaded.",
  connecting: "Connecting to the voice agent…",
  listening: "Listening… tap the ring again to stop me.",
  thinking: "Thinking… tap the ring again to cancel.",
  speaking: "Speaking… tap the ring again to cut me off.",
  executing: "Running the action… tap the ring again to cancel.",
  error: "Something went wrong. Tap to retry.",
};

export default function VoiceTest() {
  const [ready, setReady] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    setReady(true);
    setHasKey(hasVoxideKey());
  }, []);

  const voice = useVoxideVoice(ready && hasKey ? getVoxideClient() : null);

  return (
    <main className="mx-auto grid w-full max-w-md content-center gap-8 px-6 py-12">
      <div className="space-y-2 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-manuscript">
          Voice test
        </h1>
        <p className="text-sm text-muted-foreground">
          Phase 1+2 · Voxide voice agent + study capabilities.
        </p>
      </div>

      {!ready ? (
        <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">Loading…</div>
      ) : !hasKey ? (
        <div className="rounded-lg border border-rust/50 bg-rust/10 px-4 py-3 text-sm text-manuscript/85">
          <p className="font-medium mb-1">Voxide key missing</p>
          <p className="text-manuscript/60">
            Set <code className="bg-night-deep px-1 rounded">VITE_VOXIDE_KEY</code> in{" "}
            <code className="bg-night-deep px-1 rounded">apps/web/.env</code> with the publishable
            key from{" "}
            <a
              href="https://voxide.app/dashboard"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              voxide.app/dashboard
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-4">
            <VoxideRing />
            <p className="h-5 text-sm font-medium text-manuscript/70">
              {STATUS_LABEL[voice.status] ?? ""}
            </p>
          </div>

          <div className="flex min-h-28 flex-col gap-2 rounded-lg border border-manuscript/15 bg-night-raised px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Transcript</p>
            {voice.messages.length ? (
              voice.messages.map((m, i) => (
                <p
                  key={i}
                  className={cn(
                    "text-sm leading-relaxed",
                    m.role === "ai" ? "text-manuscript/90" : "text-manuscript/60",
                  )}
                >
                  <span className="font-semibold text-gold/80">
                    {m.role === "ai" ? "Kiftet" : "You"}
                  </span>
                  : {m.text}
                </p>
              ))
            ) : (
              <p className="text-sm text-manuscript/40">Nothing yet — say something…</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}