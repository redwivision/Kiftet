import { cn } from "@kiftet/ui/lib/utils";

/**
 * A ring that fills as concepts land.
 *
 * This is the brand's own gesture — the open ring with a gap in it — turned
 * into a readout. A student is not "at 62%"; they are watching a gap close.
 * The arc sweeps clockwise from twelve o'clock in the sage that already means
 * "solid" everywhere else in the app, and the unfilled remainder stays a faint
 * track rather than a red one, because an open gap is the normal state, not a
 * failure.
 *
 * Decorative: the number is already in the DOM as text for anyone who cannot
 * see the arc, so the SVG is hidden from assistive tech rather than described.
 */
export function MasteryRing({
  percent,
  size = 132,
  className,
  estimated = false,
}: {
  percent: number;
  size?: number;
  className?: string;
  estimated?: boolean;
}) {
  const stroke = Math.max(6, Math.round(size * 0.062));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, percent));
  const filled = (pct / 100) * c;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
        className="-rotate-90"
      >
        {/* The gap waiting to be closed. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-sage)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700 motion-safe:ease-out"
          style={{
            filter: estimated
              ? "opacity(0.55)"
              : "drop-shadow(0 0 6px color-mix(in srgb, var(--color-sage) 35%, transparent))",
          }}
        />
      </svg>
    </div>
  );
}

/**
 * A ring divided into one segment per question, so a test reads as a circle
 * filling rather than a "3 of 7" bar. Each segment takes the answer's own
 * colour — sage for right, rust for wrong — and the segment being asked now
 * pulses gold. Decorative: the count is in the DOM as text nearby.
 */
export function SegmentedRing({
  states,
  size = 40,
  className,
}: {
  states: ("correct" | "wrong" | "current" | "pending")[];
  size?: number;
  className?: string;
}) {
  const stroke = Math.max(3, Math.round(size * 0.1));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const n = Math.max(1, states.length);
  const seg = c / n;
  const gap = Math.min(5, seg * 0.32);
  const dash = Math.max(0.001, seg - gap);
  const color: Record<string, string> = {
    correct: "var(--color-sage)",
    wrong: "var(--color-rust)",
    current: "var(--color-gold)",
    pending: "var(--border)",
  };

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--border)"
          strokeWidth={stroke}
          opacity={0.5}
        />
        {states.map((s, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color[s]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-i * seg}
            className={cn(s === "current" && "motion-safe:animate-pulse-soft")}
          />
        ))}
      </svg>
    </span>
  );
}

/**
 * One concept's arc: 0 is an empty ring, 1 a quarter sweep, 2 a full ring in
 * rust, 3 a full ring in sage. Level 2 being *full* is the point — the student
 * filled this concept with the wrong thing, and the ring should not pretend
 * there is room left in it.
 */
export function ConceptRing({
  level,
  size = 28,
  className,
}: {
  level: 0 | 1 | 2 | 3;
  size?: number;
  className?: string;
}) {
  const stroke = Math.max(2, Math.round(size * 0.11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sweep = [0, 0.28, 1, 1][level] * c;

  const color =
    level === 2
      ? "var(--color-rust)"
      : level === 3
        ? "var(--color-sage)"
        : level === 1
          ? "var(--color-gold)"
          : "var(--border)";

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={level === 0 ? "var(--border)" : `${color}55`}
          strokeWidth={stroke}
        />
        {level > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${sweep} ${c - sweep}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-500"
          />
        )}
      </svg>
    </span>
  );
}
