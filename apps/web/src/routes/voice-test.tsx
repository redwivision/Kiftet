import { useEffect, useState } from "react";

import { hasVoxideKey } from "@/components/assistant";

const CAPABILITIES = [
  "listChapters",
  "startStudy",
  "recall",
  "getMicrolesson",
  "startRetest",
  "answerRetest",
  "getSessionResult",
  "completeSession",
] as const;

export default function VoiceTest() {
  const [ready, setReady] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    setReady(true);
    setHasKey(hasVoxideKey());
  }, []);

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
        <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : !hasKey ? (
        <div className="rounded-lg border border-rust/50 bg-rust/10 px-4 py-3 text-sm text-manuscript/85">
          <p className="font-medium mb-1">Voxide key missing</p>
          <p className="text-manuscript/60">
            Set <code className="bg-night-deep px-1 rounded">VITE_VOXIDE_KEY</code> in
            your <code className="bg-night-deep px-1 rounded">apps/web/.env</code> with
            the publishable key from{" "}
            <a href="https://voxide.app/dashboard" className="underline" target="_blank" rel="noreferrer">
              voxide.app/dashboard
            </a>.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-manuscript/85">
            <p className="font-medium mb-1">Voxide connected</p>
            <p className="text-manuscript/60">
              Tap the orb below and speak naturally. Try: &quot;List my chapters&quot; or &quot;Start studying&quot;.
            </p>
          </div>

          <div className="min-h-28 rounded-lg border border-manuscript/15 bg-night-raised px-4 py-3">
            <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              Registered capabilities
            </p>
            <ul className="space-y-1">
              {CAPABILITIES.map((name) => (
                <li key={name} className="flex items-center gap-2 text-sm text-manuscript/80">
                  <span className="size-1.5 rounded-full bg-sage" />
                  {name}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            The Voxide widget (orb) appears at the bottom-right of every page.
            It is always mounted — calls survive navigation.
          </p>
        </>
      )}
    </main>
  );
}