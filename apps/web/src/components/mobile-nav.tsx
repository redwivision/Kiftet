import { cn } from "@kiftet/ui/lib/utils";
import { BookText, Ellipsis } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { NavLink } from "react-router";

import { useLanguage } from "@/components/language-provider";
import { SettingsSheet } from "@/components/settings-sheet";
import type { MessageKey } from "@/lib/messages";

/* The study room's thumb zone. The header still owns the desktop nav; below
   `sm` the same destinations move to the bottom edge where a hand actually
   rests, and the theme + language controls — crowded as icon buttons up top —
   move into a sheet behind "More". */
const TABS = [
  { to: "/textbooks", labelKey: "nav-books", Icon: BookText, end: false },
] as const satisfies readonly {
  to: string;
  labelKey: MessageKey;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  end: boolean;
}[];

const TAB_CLASS =
  "flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 font-medium text-[0.72rem] transition-[transform,color,background-color,box-shadow] duration-200 active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-[-2px] motion-reduce:transition-none motion-reduce:active:scale-100";

export function MobileNav() {
  const { t } = useLanguage();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <nav
        aria-label={t("nav-primary")}
        className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-border/70 border-t bg-panel/90 backdrop-blur-md sm:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
          {TABS.map(({ to, labelKey, Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                prefetch="intent"
                end={end}
                aria-label={t(labelKey)}
                className={({ isActive }) =>
                  cn(
                    TAB_CLASS,
                    isActive
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "grid h-7 place-items-center rounded-full px-4 transition-transform duration-200",
                        isActive && "scale-105",
                      )}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    {t(labelKey)}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label={t("settings-title")}
              aria-haspopup="dialog"
              className={cn(TAB_CLASS, "text-muted-foreground")}
            >
              <span className="grid h-7 place-items-center rounded-full px-4">
                <Ellipsis className="size-5" aria-hidden="true" />
              </span>
              {t("nav-more")}
            </button>
          </li>
        </ul>
      </nav>
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
