import { cn } from "@kiftet/ui/lib/utils";
import { BookOpen, BookText, House } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink } from "react-router";

import { useLanguage } from "@/components/language-provider";
import { useIsAppRoute } from "@/lib/app-nav";
import { BrandMark } from "./brand-mark";
import { LanguageSwitcher } from "./language-switcher";
import { OfflineBanner } from "./offline-banner";
import { PublicHeaderMenu } from "./public-header-menu";
import { ThemeSwitcher } from "./theme-switcher";
import UserMenu from "./user-menu";

function Brand() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-1.5 sm:gap-3">
      <BrandMark
        size={28}
        className="shrink-0 rounded-full ring-1 ring-gold/40 sm:size-[36px]"
      />
      <div className="min-w-0 leading-tight">
        <div className="font-display font-semibold text-[0.95rem] text-foreground tracking-tight sm:text-[1.06rem]">
          Kiftet
        </div>
        {/* The tagline is the widest thing in the brand block, and at 320px
				    it is what pushes the nav off-screen. It is decoration, so it
				    yields before the links do. */}
        <div className="hidden truncate font-medium text-[0.78rem] text-muted-foreground sm:block">
          {t("tagline")}
        </div>
      </div>
    </div>
  );
}

// The app uses three compact destinations on desktop and moves them into the
// phone's thumb zone below `sm`. Public pages keep their own simpler nav.
const APP_NAV = [
  { to: "/dashboard", labelKey: "nav-home", Icon: House },
  { to: "/study", labelKey: "nav-study", Icon: BookOpen },
  { to: "/textbooks", labelKey: "nav-books", Icon: BookText },
] as const satisfies readonly {
  to: string;
  labelKey: string;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[];

const PUBLIC_NAV = [
  { to: "/", labelKey: "nav-home", Icon: House },
  { to: "/plans", labelKey: "nav-plans", Icon: BookOpen },
] as const satisfies readonly {
  to: string;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
}[];

export default function Header() {
  const { t } = useLanguage();
  // App navigation moves to the bottom bar on phones; public pages keep the
  // landing and plans links in the header.
  const isApp = useIsAppRoute();

  return (
    // bg-panel, not a literal: this used to be #0f1523, a blue-black from
    // before the room system existed, so every one of the eight tinted rooms
    // inherited a header that belonged to none of them.
    <header className="safe-area-top sticky top-0 z-30 border-border/70 border-b bg-panel/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          <NavLink
            to={isApp ? "/dashboard" : "/"}
            prefetch="intent"
            className="min-w-0 shrink rounded-full focus:outline-none focus-visible:outline-2 focus-visible:outline-gold/80"
          >
            <Brand />
          </NavLink>
          <nav
            aria-label={t("nav-primary")}
            className={cn(
              "flex shrink items-center gap-0.5 rounded-full border border-border/70 bg-background/60 p-1 shadow-sm sm:gap-1",
            )}
          >
            {(isApp ? APP_NAV : PUBLIC_NAV).map(({ to, labelKey, Icon }) => (
              <NavLink
                key={to}
                to={to}
                prefetch="intent"
                end={to === "/" || to === "/dashboard"}
                aria-label={t(labelKey)}
                className={({ isActive }) =>
                  `group flex min-h-9 items-center gap-2 rounded-full px-2 py-1.5 font-medium text-sm transition-[transform,color,background-color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 sm:min-h-10 sm:px-3 ${
                    isActive
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`
                }
              >
                <Icon
                  className="size-4 shrink-0 transition-transform duration-200 group-hover:scale-110"
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{t(labelKey)}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <span className="hidden sm:inline">
            <LanguageSwitcher />
          </span>
          <span className="hidden sm:inline">
            <ThemeSwitcher />
          </span>
          {!isApp && <PublicHeaderMenu />}
          <UserMenu />
        </div>
      </div>
      <OfflineBanner />
    </header>
  );
}
