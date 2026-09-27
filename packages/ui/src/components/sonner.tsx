"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/* Sonner only understands light/dark, but this app has nine rooms. Anything
   that isn't the paper "light" room is a dark room, so map the resolved theme
   onto the two Sonner actually knows about. Passing the raw room name through
   (e.g. "ember") left Sonner guessing from the OS and picking the wrong
   foreground on seven of the nine rooms. */
const DARK_ROOMS = new Set([
  "dark",
  "ember",
  "jade",
  "violet",
  "ochre",
  "midnight",
  "meadow",
  "copper",
]);

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  const mode = DARK_ROOMS.has(resolvedTheme ?? "") ? "dark" : "light";

  return (
    <Sonner
      theme={mode}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-sage" />,
        info: <InfoIcon className="size-4 text-gold" />,
        warning: <TriangleAlertIcon className="size-4 text-rust" />,
        error: <OctagonXIcon className="size-4 text-rust" />,
        loading: <Loader2Icon className="size-4 animate-spin text-gold" />,
      }}
      style={
        {
          // One voice for every toast, drawn from the room it appears in. This
          // app previously ran Sonner's `richColors`, which injected its own
          // saturated green and red — the only off-brand colours in the product,
          // and a second semantic palette competing with rust ("needs
          // attention") and sage ("solid"). The icon carries the meaning now.
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "1rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "k-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
