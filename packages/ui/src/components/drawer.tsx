"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@kiftet/ui/lib/utils";

function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerBackdrop({
  className,
  ...props
}: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-backdrop"
      className={cn(
        // The look tracks the drag: opacity falls as the sheet is pulled away,
        // and the swipe progress var Base UI publishes lets the fade follow the
        // finger instead of sitting at a fixed 50% until release.
        "fixed inset-0 z-50 min-h-dvh bg-black/60 opacity-[calc(1_-_var(--drawer-swipe-progress))] backdrop-blur-sm transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-swiping:duration-0",
        className,
      )}
      {...props}
    />
  );
}

function DrawerViewport({
  className,
  ...props
}: DrawerPrimitive.Viewport.Props) {
  return (
    <DrawerPrimitive.Viewport
      data-slot="drawer-viewport"
      className={cn(
        // Anchored to the bottom edge — the whole point is that a thumb can
        // reach it without the palm leaving the phone.
        "fixed inset-0 z-50 flex items-end justify-center",
        className,
      )}
      {...props}
    />
  );
}

function DrawerPopup({ className, ...props }: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPrimitive.Popup
      data-slot="drawer-popup"
      className={cn(
        "w-full max-w-lg rounded-t-3xl bg-panel/95 text-foreground shadow-[0_-24px_64px_-24px_rgba(0,0,0,0.7)] outline-none ring-1 ring-border/70 backdrop-blur-md",
        "max-h-[88dvh] overflow-y-auto overscroll-contain",
        // The sheet rides the drag on the Y axis; the enter/exit offset rides
        // `translate` so the two compose rather than clobber each other.
        "transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] [transform:translateY(var(--drawer-swipe-movement-y))]",
        "data-ending-style:translate-y-full data-starting-style:translate-y-full data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
        "data-swiping:select-none",
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({ className, ...props }: DrawerPrimitive.Content.Props) {
  return (
    <DrawerPrimitive.Content
      data-slot="drawer-content"
      className={cn("w-full", className)}
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-display font-semibold text-lg tracking-[-0.02em]",
        className,
      )}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

export {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerPopup,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  DrawerViewport,
};
