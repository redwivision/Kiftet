import { cn } from "@kiftet/ui/lib/utils";

/**
 * The book becoming usable — a black page where ivory lines resolve into
 * place, like text appearing on paper. Used while a textbook is being read
 * on-device, so the wait shows the product's actual unique move (client-side
 * reading, auto-chunked loops) instead of a generic spinner.
 *
 * Lines wipe in with a staggered `beam-loop` that cycles forever — they
 * collapse back out and rewrite, so a wait that outlasts the entrance (every
 * import does) never freezes into a static picture. `prefers-reduced-motion`
 * collapses it to the written frame via the global rule in index.css.
 */

const LINES = [92, 78, 86, 64, 88, 72, 44];

export function InkPage({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-44 rounded-xl border border-white/10 bg-panel p-4 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)]",
        className,
      )}
      aria-hidden="true"
    >
      <div
        className="mb-3 h-2 w-1/2 origin-left animate-beam-loop rounded-full bg-gold/70"
        style={{ animationDelay: "0.05s" }}
      />
      {LINES.map((width, i) => (
        <div
          key={i}
          className="mb-2 h-1.5 origin-left animate-beam-loop rounded-full bg-gold/40"
          style={{
            width: `${width}%`,
            animationDelay: `${0.15 + i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}
