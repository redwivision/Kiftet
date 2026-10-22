import { buttonVariants } from "@kiftet/ui/components/button";
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerPopup,
  DrawerPortal,
  DrawerTitle,
  DrawerViewport,
} from "@kiftet/ui/components/drawer";
import { cn } from "@kiftet/ui/lib/utils";
import { Check } from "lucide-react";
import { Link } from "react-router";

import { useLanguage } from "@/components/language-provider";
import { OPTIONS } from "@/components/language-switcher";
import { useTheme } from "@/components/theme-provider";
import { THEMES } from "@/components/theme-switcher";

/* The bottom "More" tab opens this instead of a dropdown. On a phone a popover
   anchored to a 40px icon is the wrong shape for nine themes and two languages:
   it fights the thumb, the tap targets are small, and it can't be dismissed by
   dragging. A sheet gives every row a full-width 44px target and swipes away. */
export function SettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLanguage();

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <DrawerPortal>
        <DrawerBackdrop />
        <DrawerViewport>
          <DrawerPopup>
            <DrawerContent className="flex flex-col gap-6 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {/* The grabber says "drag me" without a word of copy. It is also
                  the most natural place a thumb lands, so the swipe starts
                  where the hand already is. */}
              <div
                aria-hidden="true"
                className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
              />
              <DrawerTitle className="sr-only">
                {t("settings-title")}
              </DrawerTitle>
              <section className="space-y-3">
                <p className="k-label">{t("ink-for-the-room")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((option) => {
                    const active = theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200",
                          active
                            ? "border-gold/50 bg-gold/10"
                            : "border-border/70 bg-background/40 active:bg-muted/60",
                        )}
                      >
                        <span
                          className={cn(
                            "size-7 shrink-0 rounded-full",
                            option.chip,
                          )}
                          style={{ background: option.swatch }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate font-medium text-sm">
                            {option.label}
                          </span>
                          <span className="block truncate text-[0.78rem] text-muted-foreground">
                            {option.note}
                          </span>
                        </span>
                        {active && (
                          <Check
                            className="ms-auto size-4 shrink-0 text-gold"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="space-y-3">
                <p className="k-label">{t("select-language")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {OPTIONS.map((option) => {
                    const active = lang === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLang(option.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200",
                          active
                            ? "border-gold/50 bg-gold/10"
                            : "border-border/70 bg-background/40 active:bg-muted/60",
                        )}
                      >
                        <span
                          className="grid size-7 shrink-0 place-items-center rounded-full font-medium text-[0.6rem] text-muted-foreground tracking-tight ring-1 ring-border dark:ring-white/15"
                          aria-hidden="true"
                        >
                          {option.script}
                        </span>
                        <span className="truncate font-medium text-sm">
                          {option.label}
                        </span>
                        {active && (
                          <Check
                            className="ms-auto size-4 shrink-0 text-gold"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
              {/* Where the student is, and how they want their past treated.
                  The theme and the language are set once and forgotten; this
                  changes as the term moves on, so it gets a link to its own
                  screen rather than a row of controls here. */}
              <DrawerClose
                render={
                  <Link
                    to="/settings"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full",
                    )}
                  />
                }
              >
                {t("settings-study-title")}
              </DrawerClose>
              <DrawerClose
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                {t("done")}
              </DrawerClose>{" "}
            </DrawerContent>
          </DrawerPopup>
        </DrawerViewport>
      </DrawerPortal>
    </Drawer>
  );
}
