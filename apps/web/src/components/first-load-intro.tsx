import { cn } from "@kiftet/ui/lib/utils";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { useLanguage } from "@/components/language-provider";

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
    const leave = setTimeout(() => setLeaving(true), 1000);
    const done = setTimeout(() => root.removeAttribute("data-intro"), 1360);
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
      <BrandMark size={84} className="text-gold" closing />
      <div>
        <p className="font-display font-semibold text-2xl tracking-tight">
          Kiftet
        </p>
        <p className="mt-1.5 text-muted-foreground text-sm">
          {t("intro-tagline")}
        </p>
      </div>
    </div>
  );
}
