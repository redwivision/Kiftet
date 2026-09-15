import { cn } from "@kiftet/ui/lib/utils";

interface GapListProps {
  covered: string[];
  missing: string[];
  className?: string;
}

export function GapList({ covered, missing, className }: GapListProps) {
  const total = covered.length + missing.length;
  const coveredPct = total > 0 ? Math.round((covered.length / total) * 100) : 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <p className="font-display text-3xl font-semibold tracking-tight text-manuscript">
          {coveredPct}%
        </p>
        <p className="text-sm text-muted-foreground">
          of this chapter&apos;s ideas came out solid.
        </p>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="img"
        aria-label={`${covered.length} of ${total} concepts covered, ${missing.length} missing`}
      >
        {covered.map((concept) => (
          <span
            key={concept}
            aria-hidden="true"
            title={concept}
            className="size-3 rounded-full border border-sage bg-sage"
          />
        ))}
        {missing.map((concept) => (
          <span
            key={concept}
            aria-hidden="true"
            title={concept}
            className="size-3 rounded-full border border-rust bg-transparent"
          />
        ))}
      </div>

      {total > 0 && (
        <ul className="space-y-2 text-sm">
          {covered.map((concept) => (
            <li key={concept} className="flex items-start gap-2 text-muted-foreground">
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-sage" />
              <span>{concept}</span>
            </li>
          ))}
          {missing.map((concept) => (
            <li key={concept} className="flex items-start gap-2 text-muted-foreground">
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full border border-rust" />
              <span>{concept}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}