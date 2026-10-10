import { useEffect } from "react";

import { useLanguage } from "@/components/language-provider";
import type { Phase } from "@/components/study-provider";
import { type Language, type MessageKey, t as translate } from "@/lib/messages";

// Tier 3: the browser tab is a second surface for the loop. The page title
// names the phase the student is in, and the favicon is the brand mark itself
// — a ring with a gap (ክፍተት) — closing as the loop advances. At the result the
// ring is whole, which is exactly what the result screen is about.
//
// This is deliberately quiet: it is not a notification, has no badge, and
// reverts to the open-ring mark the moment the study route is left. It exists
// so a student juggling tabs can read "where am I" without coming back.

const PHASE_TITLE: Record<Phase, MessageKey> = {
  recall: "tab-recall",
  gaps: "tab-gaps",
  lesson: "tab-lesson",
  retest: "tab-retest",
  result: "tab-result",
};

// How closed the ring is, per phase. Never zero — an empty ring is invisible
// in a dark tab bar, and the student is never nowhere. The last step snaps
// fully shut so the result reads as the gap closed.
const PHASE_PROGRESS: Record<Phase, number> = {
  recall: 0.25,
  gaps: 0.5,
  lesson: 0.75,
  retest: 0.9,
  result: 1,
};

// Geometry shared with public/logo-mark.svg (r=44 on a 120 tile, 10 stroke),
// so the tab mark and the on-screen mark are the same drawing.
const RADIUS = 44;
const CENTER = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const ICON_LINK_ID = "app-icon";
const DEFAULT_ICON = "/logo-mark.svg";

function ringFavicon(progress: number): string {
  const drawn = (CIRCUMFERENCE * progress).toFixed(2);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" ' +
    'viewBox="0 0 120 120" fill="none">' +
    `<circle cx="${CENTER}" cy="${CENTER}" r="60" fill="#0A0B0D"/>` +
    `<circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" stroke="#F2EFE9" ` +
    `stroke-width="10" stroke-linecap="round" ` +
    `stroke-dasharray="${drawn} ${CIRCUMFERENCE.toFixed(2)}" ` +
    `transform="rotate(-90 ${CENTER} ${CENTER})"/>` +
    "</svg>";
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** The tab's title and favicon for one phase, in one language. Pure, so the
 *  mapping can be asserted without a DOM. */
export function loopTab(
  phase: Phase,
  lang: Language,
): { title: string; href: string } {
  return {
    title: translate(lang, PHASE_TITLE[phase]),
    href: ringFavicon(PHASE_PROGRESS[phase]),
  };
}

/**
 * Keep the tab's title and favicon in step with the study loop. Call once from
 * the screen that owns `phase`; this leaves the title alone on unmount (the
 * next route's own meta owns it) and only restores the default icon.
 */
export function useLoopTabChrome(phase: Phase) {
  const { lang } = useLanguage();

  useEffect(() => {
    const { title, href } = loopTab(phase, lang);
    document.title = title;
    const link = document.getElementById(ICON_LINK_ID);
    if (link instanceof HTMLLinkElement) link.href = href;
    return () => {
      const restore = document.getElementById(ICON_LINK_ID);
      if (restore instanceof HTMLLinkElement) restore.href = DEFAULT_ICON;
    };
  }, [phase, lang]);
}
