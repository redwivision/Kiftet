import { BookOpen, House } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink } from "react-router";

import { BrandMark } from "./brand-mark";
import { useLanguage } from "./language-provider";
import { LanguageSwitcher } from "./language-switcher";
import { OfflineBanner } from "./offline-banner";
import { ThemeSwitcher } from "./theme-switcher";
import UserMenu from "./user-menu";

function Brand() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2.5 sm:gap-3">
      <BrandMark
        size={36}
        className="shrink-0 rounded-full ring-1 ring-gold/40"
      />
      <div className="min-w-0 leading-tight">
        <div className="font-display font-semibold text-[1.06rem] text-foreground tracking-tight">
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

// A phone has 343px to work with once the page gutter is paid, and the header
// has to hold a brand, two nav links and three controls inside it. Measured at
// 14px Inter that is roughly 456px of content — so the row used to overflow and
// the controls sat on top of the nav links. Both text runs yield instead of the
// brand, because both are repeats of something already on screen: the link's
// own accessible name and the account name inside the menu that opens from it.
const NAV = [
  { to: "/", labelKey: "nav-home", Icon: House },
  { to: "/dashboard", labelKey: "nav-study", Icon: BookOpen },
] as const satisfies readonly {
  to: string;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
}[];

export default function Header() {
  const { t } = useLanguage();

  return (
    // bg-panel, not a literal: this used to be #0f1523, a blue-black from
    // before the room system existed, so every one of the eight tinted rooms
    // inherited a header that belonged to none of them.
    <header className="sticky top-0 z-30 border-border/70 border-b bg-panel/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          <NavLink
            to="/"
            className="min-w-0 shrink rounded-full focus:outline-none focus-visible:outline-2 focus-visible:outline-gold/80"
          >
            <Brand />
          </NavLink>
          <nav
            aria-label={t("nav-primary")}
            className="flex shrink items-center gap-0.5 sm:gap-1"
          >
            {NAV.map(({ to, labelKey, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                aria-label={t(labelKey)}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm transition-colors duration-200 sm:px-3 ${
                    isActive
                      ? "bg-gold/12 font-medium text-gold"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`
                }
              >
                <Icon
                  className="size-4 shrink-0 sm:hidden"
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{t(labelKey)}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          <ThemeSwitcher />
          <UserMenu />
        </div>
      </div>
      <OfflineBanner />
    </header>
  );
}
