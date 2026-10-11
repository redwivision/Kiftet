import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useLanguage } from "@/components/language-provider";
import { VoiceRing } from "@/components/voice-ring";
import { useVoiceSession } from "@/hooks/use-voice-session";
import type { MessageKey } from "@/lib/messages";
import type { VoiceState } from "@/lib/voice";

// Dev-only harness: exercises the raw push-to-talk ring without the study
// loop. In a production build the route renders a quiet dead end instead —
// the page is part of the demo story only in development.

const STATE_LABEL: Record<VoiceState, MessageKey> = {
  idle: "vt-idle",
  listening: "vt-listening",
  thinking: "vt-thinking",
  speaking: "vt-speaking",
};

export default function VoiceTest() {
  const { t } = useLanguage();
  const [ready, setReady] = useState(false);
  const voice = useVoiceSession();

  // The browser voice layer only exists on the client, and only where
  // SpeechRecognition does — decide after mount so the first paint matches.
  useEffect(() => setReady(true), []);

  // Production builds never expose the harness — just a calm way back.
  if (import.meta.env.PROD) {
    return (
      <main className="mx-auto grid w-full max-w-md content-center justify-items-center gap-4 px-6 py-24 text-center">
        <h1 className="font-display font-semibold text-2xl text-foreground tracking-tight">
          {t("vt-nothing")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("vt-nothing-text")}</p>
        <Link
          to="/dashboard"
          className="font-medium text-gold text-sm underline underline-offset-4 transition-colors duration-200 hover:text-gold-soft"
        >
          {t("go-to-chapters")}
        </Link>
      </main>
    );
  }

  const toggle = () => {
    if (voice.state === "listening") {
      voice.stop();
    } else if (voice.state === "idle") {
      voice.start();
    }
  };

  const spoken = `${voice.transcript} ${voice.interim}`.trim();
  const label = t(STATE_LABEL[voice.state]);

  return (
    <main className="mx-auto grid w-full max-w-md content-center gap-8 px-6 py-12">
      <div className="space-y-2 text-center">
        <h1 className="font-display font-semibold text-2xl text-manuscript tracking-tight">
          {t("voice-test")}
        </h1>
        <p className="text-muted-foreground text-sm">
          Browser voice · push-to-talk harness.
        </p>
      </div>

      {!ready ? (
        <div className="grid min-h-40 place-items-center text-muted-foreground text-sm">
          {t("loading")}
        </div>
      ) : !voice.isSupported ? (
        <div className="rounded-lg border border-rust/50 bg-rust/10 px-4 py-3 text-manuscript/85 text-sm">
          {t("voice-unsupported")}
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-4">
            <VoiceRing
              state={voice.state}
              onToggle={toggle}
              ariaLabel={label}
              shortcutLabel={t("shortcut-talk-label")}
            />
            <p className="h-5 font-medium text-manuscript/70 text-sm">
              {label}
            </p>
          </div>

          <div className="flex min-h-28 flex-col gap-2 rounded-lg border border-manuscript/15 bg-night-raised px-4 py-3">
            <p className="text-muted-foreground text-xs uppercase tracking-widest">
              {t("transcript")}
            </p>
            {spoken ? (
              <p className="text-manuscript/90 text-sm leading-relaxed">
                {spoken}
              </p>
            ) : (
              <p className="text-manuscript/40 text-sm">{t("nothing-yet")}</p>
            )}
            {voice.error && (
              <p className="text-rust text-sm">{t("voice-error")}</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
