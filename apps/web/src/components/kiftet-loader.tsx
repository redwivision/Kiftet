import { cn } from "@kiftet/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

/* Same geometry as the brand mark: a ring with a 72° gap at the top-right. */
const OPEN_ARC = "M 93.46 43.12 A 44 44 0 1 1 56.88 6.54";

/**
 * The Kiftet loader — a short bright arc travelling around the open ring while
 * the rest of the ring sits faint beneath it, so a wait reads as ink being
 * written around the gap rather than a stock spinner. `prefers-reduced-motion`
 * stills the nib anywhere on the ring (never empties it), so the reduced frame
 * is still a ring.
 */
export function KiftetLoader({
  size = 44,
  label,
  className,
}: {
  size?: number;
  /** Accessible name. Omit when a visible caption already names the wait. */
  label?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        d={OPEN_ARC}
        stroke="currentColor"
        strokeWidth={8}
        strokeLinecap="round"
        className="text-gold/20"
      />
      <g className="loader-nib animate-mark-travel text-gold">
        <path
          d={OPEN_ARC}
          stroke="currentColor"
          strokeWidth={8}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.22 1"
        />
      </g>
    </svg>
  );
}

/** Show a flag only after it has held for `delayMs`, then keep it up for at
 *  least `minMs`, so a fast action never flashes the veil and a slow one is
 *  never announced a beat late. */
function useSteadyFlag(active: boolean, delayMs = 180, minMs = 420) {
  const [shown, setShown] = useState(false);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const shownAtRef = useRef(0);
  useEffect(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
    if (!active) {
      shownAtRef.current = 0;
      setShown(false);
      return;
    }
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      shownAtRef.current = performance.now();
      setShown(true);
    }, delayMs);
    timersRef.current.add(id);
    return () => {
      for (const timer of timersRef.current) clearTimeout(timer);
      timersRef.current.clear();
      if (!shownAtRef.current) return;
      const elapsed = performance.now() - shownAtRef.current;
      shownAtRef.current = 0;
      if (elapsed < minMs) {
        const hideId = setTimeout(() => setShown(false), minMs - elapsed);
        timersRef.current.add(hideId);
      } else {
        setShown(false);
      }
    };
  }, [active, delayMs, minMs]);
  return shown;
}

/**
 * Full-surface wait veil for an in-page action (building the plan, grading a
 * recall, writing the retest). Fades in, and is steadied so it does not blink
 * on a fast response. Rendered above the content but below toasts.
 */
export function LoadingVeil({
  show,
  label,
  className,
}: {
  show: boolean;
  label: string;
  className?: string;
}) {
  const visible = useSteadyFlag(show);
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-background/70 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <KiftetLoader size={64} />
        <p className="font-medium text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  );
}
