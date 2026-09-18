import { NavLink } from "react-router";

import { BrandMark } from "./brand-mark";
import { ThemeSwitcher } from "./theme-switcher";
import UserMenu from "./user-menu";

function Brand() {
	return (
		<div className="flex items-center gap-3">
			<BrandMark size={36} className="rounded-full ring-1 ring-gold/40" />
			<div className="leading-tight">
				<div className="font-display font-semibold text-[1.06rem] text-foreground tracking-tight">
					Kiftet
				</div>
				<div className="font-medium text-[0.72rem] text-muted-foreground">
					Close the gap
				</div>
			</div>
		</div>
	);
}

export default function Header() {
	const links = [
		{ to: "/", label: "Home" },
		{ to: "/dashboard", label: "Study" },
	] as const;

	return (
		<header className="sticky top-0 z-30 border-border/70 border-b bg-background/90 dark:border-white/10 dark:bg-[#0f1523]/90">
			<div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
				<div className="flex items-center gap-5">
					<NavLink
						to="/"
						className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/80"
					>
						<Brand />
					</NavLink>
					<nav className="flex items-center gap-1">
						{links.map(({ to, label }) => (
							<NavLink
								key={to}
								to={to}
								end={to === "/"}
								className={({ isActive }) =>
									`rounded-full px-3 py-1.5 text-sm transition-colors ${
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

				<div className="flex items-center gap-2">
					<ThemeSwitcher />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
