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
    <div className="flex items-center gap-3">
      <BrandMark size={36} className="rounded-full ring-1 ring-gold/40" />
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

export default function Header() {
  const { t } = useLanguage();
  const links = [
    { to: "/", label: t("nav-home") },
    { to: "/dashboard", label: t("nav-study") },
  ] as const;

  return (
    // bg-panel, not a literal: this used to be #0f1523, a blue-black from
    // before the room system existed, so every one of the eight tinted rooms
    // inherited a header that belonged to none of them.
    <header className="sticky top-0 z-30 border-border/70 border-b bg-panel/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          <NavLink
            to="/"
            className="min-w-0 rounded-full focus:outline-none focus-visible:outline-2 focus-visible:outline-gold/80"
          >
            <Brand />
          </NavLink>
          <nav
            aria-label={t("nav-primary")}
            className="flex items-center gap-0.5 sm:gap-1"
          >
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `rounded-full px-2 py-1.5 text-sm transition-colors duration-200 sm:px-3 ${
                    isActive
                      ? "bg-gold/12 font-medium text-gold"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`
                }
              >
                {label}
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
