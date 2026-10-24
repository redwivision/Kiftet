import { Button } from "@kiftet/ui/components/button";
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
import { BookOpen, Check, House, Menu } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router";
import { useLanguage } from "@/components/language-provider";
import { OPTIONS } from "@/components/language-switcher";
import { useTheme } from "@/components/theme-provider";
import { THEMES } from "@/components/theme-switcher";

const PUBLIC_NAV = [
  { to: "/", labelKey: "nav-home", Icon: House },
  { to: "/plans", labelKey: "nav-plans", Icon: BookOpen },
] as const;

export function PublicHeaderMenu() {
  const [open, setOpen] = useState(false);
  const { t, lang, setLang } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("nav-more")}
        onClick={() => setOpen(true)}
        className="sm:hidden"
      >
        <Menu className="size-4" aria-hidden="true" />
      </Button>
      <Drawer open={open} onOpenChange={setOpen} swipeDirection="down">
        <DrawerPortal>
          <DrawerBackdrop />
          <DrawerViewport>
            <DrawerPopup>
              <DrawerContent className="flex flex-col gap-6 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div
                  aria-hidden="true"
                  className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
                />
                <DrawerTitle className="sr-only">{t("nav-more")}</DrawerTitle>
                <section className="space-y-3">
                  <p className="k-label">{t("nav-primary")}</p>
                  <div className="flex flex-col gap-1">
                    {PUBLIC_NAV.map(({ to, labelKey, Icon }) => (
                      <DrawerClose
                        key={to}
                        render={
                          <NavLink
                            to={to}
                            prefetch="intent"
                            end={to === "/"}
                            className={({ isActive }) =>
                              cn(
                                "flex items-center gap-2 rounded-2xl px-3 py-2.5 font-medium text-sm transition-colors",
                                isActive
                                  ? "bg-foreground text-background"
                                  : "hover:bg-muted/70",
                              )
                            }
                          >
                            <Icon className="size-4" aria-hidden="true" />
                            <span>{t(labelKey)}</span>
                          </NavLink>
                        }
                      />
                    ))}
                  </div>
                </section>
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
              </DrawerContent>
            </DrawerPopup>
          </DrawerViewport>
        </DrawerPortal>
      </Drawer>
    </>
  );
}
