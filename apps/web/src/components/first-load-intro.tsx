import { cn } from "@kiftet/ui/lib/utils";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { useLanguage } from "@/components/language-provider";
import { signalIntroDone } from "@/lib/intro-done";

/**
 * The first load, told in one breath.
 *
 * On a phone most visitors never scroll far enough to meet the hero film, so
 * the first thing they see is the whole idea distilled: the open ring draws
 * itself in under a second, the wordmark and one line land, and the page is
 * handed over. It is an entry, not a gate — it plays once per session, never
 * on a repeat load, and is skipped entirely under `prefers-reduced-motion`.
 *
 * Whether it shows is decided *before first paint* by an inline script in
 * `root.tsx` that stamps `data-intro` on <html>; the CSS keys the overlay off
 * that attribute, so it is already up in the server-rendered markup instead of
 * flashing in over an already-painted page.
 */
export function FirstLoadIntro() {
  const { t } = useLanguage();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-intro")) return;
    // Mark the session immediately so a reload mid-intro never replays it.
    try {
      sessionStorage.setItem("kiftet-intro", "1");
    } catch {
      /* private mode — it will simply play again next load, which is fine. */
    }
    const leave = setTimeout(() => setLeaving(true), 1100);
    const done = setTimeout(() => {
      root.removeAttribute("data-intro");
      // Release the hero film only once the overlay is fully gone, so its
      // opening beat never plays behind the veil.
      signalIntroDone();
    }, 1400);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, []);

  return (
    <div
      data-intro-overlay=""
      aria-hidden="true"
      className={cn(
        "fixed inset-0 z-[100] flex-col items-center justify-center gap-6 bg-background text-center",
        leaving && "intro-leave",
      )}
    >
      <div className="relative grid size-24 place-items-center">
        <BrandMark size={84} className="text-gold" closing />
        {/* A short burst of voice while the ring "listens" — the one thing the
            product does, drawn in a breath. */}
        <div className="absolute flex h-6 items-center gap-[3px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="w-[3px] animate-hero-wave rounded-full bg-gold/70"
              style={{
                height: `${10 + ((i * 4) % 12)}px`,
                animationDelay: `${(i % 5) * 90}ms`,
                transformOrigin: "center",
              }}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p
          className="animate-fade-up font-display font-semibold text-2xl tracking-tight"
          style={{ animationDelay: "0.25s" }}
        >
          Kiftet
        </p>
        <p
          className="animate-fade-up text-muted-foreground text-sm"
          style={{ animationDelay: "0.6s" }}
        >
          {t("intro-line")}
        </p>
      </div>
    </div>
  );
}
