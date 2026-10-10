// Tier 3: after a student finishes their first loop, offer to put Kiftet on
// their home screen. It is a one-time nudge on the result screen — the moment
// the work pays off is the moment the offer is worth making, and never again.

export const INSTALL_HINT_KEY = "kiftet-add-home-hint-offered";

export interface InstallEnv {
  offered: boolean;
  standalone: boolean;
  coarsePointer: boolean;
  touchPoints: number;
}

/**
 * Pure gate, so every reason to stay quiet is one testable line.
 *
 * - `offered`: already shown once — a nudge, not a recurring banner.
 * - `standalone`: already installed; there is nowhere to add it to.
 * - touch: the copy promises a *home screen*, which is a phone thing. A
 *   desktop student gets no prompt to add it to a browser they already use.
 */
export function shouldOfferInstall(env: InstallEnv): boolean {
  if (env.offered) return false;
  if (env.standalone) return false;
  return env.coarsePointer || env.touchPoints > 0;
}

export function readInstallEnv(): InstallEnv {
  const offered = wasInstallHintOffered();
  if (typeof window === "undefined") {
    return { offered, standalone: false, coarsePointer: false, touchPoints: 0 };
  }
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const standalone =
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const touchPoints =
    typeof navigator !== "undefined" ? (navigator.maxTouchPoints ?? 0) : 0;
  return { offered, standalone, coarsePointer, touchPoints };
}

export function wasInstallHintOffered(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INSTALL_HINT_KEY) === "1";
  } catch {
    // Private mode: treat as not offered; the worst case is showing it twice.
    return false;
  }
}

export function markInstallHintOffered(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSTALL_HINT_KEY, "1");
  } catch {
    // Private mode: the hint may reappear next loop. Not worth an error.
  }
}
