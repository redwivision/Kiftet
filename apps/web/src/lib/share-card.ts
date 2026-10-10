import type { Language } from "@/lib/messages";

// Tier 3: a closed gap a student can choose to share. The image carries the
// brand and nothing else — no name, no answers, no topic, no score. Sharing is
// entirely on the student, from a button they press; nothing is generated or
// sent unless they ask.

export const SHARE_CARD_SIZE = 1080;

// The brand mark geometry, kept identical to components/brand-mark.tsx so the
// card's ring and the on-screen ring cannot drift apart.
const BRAND_ARC = "M 93.46 43.12 A 44 44 0 1 1 56.88 6.54";
const INK = "#0A0B0D";
const IVORY = "#F2EFE9";
const FONT =
  "system-ui, -apple-system, 'Noto Sans Ethiopic', 'Segoe UI', sans-serif";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The shareable card as an SVG string. Pure: it takes the one line it draws
 * and nothing else, which is the point — there is no slot for a name or a
 * number to leak into even by accident.
 */
export function shareCardSvg(caption: string): string {
  const line = escapeXml(caption);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_CARD_SIZE}" height="${SHARE_CARD_SIZE}" viewBox="0 0 ${SHARE_CARD_SIZE} ${SHARE_CARD_SIZE}">
  <rect width="${SHARE_CARD_SIZE}" height="${SHARE_CARD_SIZE}" fill="${INK}"/>
  <g transform="translate(330 200) scale(4.2)">
    <path d="${BRAND_ARC}" fill="none" stroke="${IVORY}" stroke-width="8" stroke-linecap="round"/>
  </g>
  <text x="540" y="770" text-anchor="middle" font-family="${FONT}" font-size="54" fill="${IVORY}">${line}</text>
  <text x="540" y="884" text-anchor="middle" font-family="${FONT}" font-size="46" font-weight="600" fill="rgba(242,239,233,0.6)">Kiftet</text>
</svg>`;
}

export type ShareOutcome =
  | "shared"
  | "downloaded"
  | "cancelled"
  | "unsupported";

function svgToPngBlob(svg: string, size: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0, size, size);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Render the card to a PNG and hand it to the platform share sheet, falling
 * back to a plain download where sharing files isn't supported. Returns what
 * happened so the caller can stay quiet on a cancelled share.
 */
export async function shareClosedGapCard(
  caption: string,
  lang: Language = "en",
): Promise<ShareOutcome> {
  const blob = await svgToPngBlob(shareCardSvg(caption), SHARE_CARD_SIZE);
  if (!blob) return "unsupported";
  const filename = `kiftet-gap-closed-${lang}.png`;
  const file = new File([blob], filename, { type: "image/png" });

  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data?: ShareData) => boolean;
  };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return "shared";
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return "cancelled";
      // Any other failure falls through to the download path below.
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}
