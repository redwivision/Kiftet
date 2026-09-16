import { Button } from "@kiftet/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@kiftet/ui/components/dropdown-menu";
import { cn } from "@kiftet/ui/lib/utils";
import { Check, Palette } from "lucide-react";
import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";

const THEMES = [
	{
		value: "light",
		label: "Sunlight",
		note: "Paper and morning light",
		swatch: "#f3efe4",
		chip: "ring-1 ring-ink/20",
	},
	{
		value: "forest",
		label: "Forest",
		note: "Deep sage study room",
		swatch: "#2c3d35",
		chip: "ring-1 ring-sage/60",
	},
	{
		value: "dark",
		label: "Night",
		note: "Indigo, gold, quiet",
		swatch: "#1b2340",
		chip: "ring-1 ring-gold/60",
	},
	{
		value: "gold",
		label: "Gold",
		note: "Meskel gold after dark",
		swatch: "#332a16",
		chip: "ring-1 ring-gold/60",
	},
] as const;

const THEME_COLOR: Record<string, string> = {
	light: "#f6f1e6",
	forest: "#1d2b25",
	dark: "#101728",
	gold: "#211809",
};

export function ThemeSwitcher() {
	const { theme, setTheme } = useTheme();

	useEffect(() => {
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute(
				"content",
				THEME_COLOR[theme ?? "dark"] ?? THEME_COLOR.dark,
			);
	}, [theme]);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="outline"
						size="icon"
						aria-label="Choose a theme"
						className="relative"
					/>
				}
			>
				<Palette className="size-[1.1rem]" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuLabel className="px-3 py-2">
					Ink for the room
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{THEMES.map((t) => {
					const active = theme === t.value;
					return (
						<DropdownMenuItem
							key={t.value}
							onClick={() => setTheme(t.value)}
							className={cn("justify-between", active && "bg-muted/70")}
						>
							<span className="inline-flex items-center gap-2.5">
								<span
									className={`size-4 rounded-full ${t.chip}`}
									style={{ background: t.swatch }}
									aria-hidden="true"
								/>
								<span className="flex flex-col leading-tight">
									<span className="font-medium">{t.label}</span>
									<span className="text-[0.65rem] text-muted-foreground">
										{t.note}
									</span>
								</span>
							</span>
							{active && (
								<Check className="size-3.5 text-gold" aria-hidden="true" />
							)}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
