import type { ReactNode } from "react";

/**
 * A keyboard shortcut hint that fades in when its `group` is hovered or
 * focused. Desktop only — a touch device has no hover and no keyboard, so it
 * hides itself rather than reserving dead space.
 *
 * The keycap ("Space", "Esc") is a key label, not prose, so it is not
 * translated; the control it belongs to carries `aria-keyshortcuts` for
 * assistive tech. The whole hint is decorative to screen readers.
 */
export function ShortcutHint({
  keys,
  label,
}: {
  keys: string;
  label: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-background/90 px-2 py-1 text-[0.7rem] text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 dark:border-white/10 [@media(hover:none)]:hidden"
    >
      <kbd className="rounded border border-border/70 bg-muted px-1.5 py-0.5 font-medium font-sans text-[0.68rem] text-foreground/75 dark:border-white/15">
        {keys}
      </kbd>
      {label}
    </span>
  );
}
