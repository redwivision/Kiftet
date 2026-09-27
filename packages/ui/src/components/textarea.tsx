import { cn } from "@kiftet/ui/lib/utils";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content flex min-h-24 w-full resize-none rounded-2xl border border-input bg-transparent px-4 py-3 text-[0.95rem] leading-relaxed outline-none transition-[color,border-color,box-shadow] duration-200 placeholder:text-muted-foreground focus-visible:border-gold/50 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-[0.95rem] dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
