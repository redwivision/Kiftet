import { Button } from "@kiftet/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
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
		value: "dark",
		label: "Ink",
		note: "Black and ivory, quiet",
		swatch: "#0a0b0d",
		chip: "ring-1 ring-gold/60",
	},
	{
		value: "ember",
		label: "Ember",
		note: "The brazier, after dark",
		swatch: "#e26d2a",
		chip: "ring-1 ring-gold/40",
	},
	{
		value: "jade",
		label: "Jade",
		note: "The lake at night",
		swatch: "#41bf9c",
		chip: "ring-1 ring-gold/40",
	},
	{
		value: "violet",
		label: "Violet",
		note: "The dusk before study",
		swatch: "#8b7cf6",
		chip: "ring-1 ring-gold/40",
	},
	{
		value: "ochre",
		label: "Ochre",
		note: "Sunset saffron, soft and warm",
		swatch: "#d9a441",
		chip: "ring-1 ring-gold/40",
	},
	{
		value: "midnight",
		label: "Midnight",
		note: "Deep indigo-blue, dusk focus",
		swatch: "#6c78e0",
		chip: "ring-1 ring-gold/40",
	},
	{
		value: "meadow",
		label: "Meadow",
		note: "Deep leaf green on black",
		swatch: "#6fae7c",
		chip: "ring-1 ring-gold/40",
	},
	{
		value: "copper",
		label: "Copper",
		note: "Muted ember rust, roastery",
		swatch: "#cd7652",
		chip: "ring-1 ring-gold/40",
	},
	{
		value: "light",
		label: "Sunlight",
		note: "Paper and morning light",
		swatch: "#f3efe4",
		chip: "ring-1 ring-ink/20",
	},
] as const;

const THEME_COLOR: Record<string, string> = {
	dark: "#0a0b0d",
	ember: "#140d08",
	jade: "#0a1410",
	violet: "#110d1c",
	ochre: "#191207",
	midnight: "#0c0e1a",
	meadow: "#0c1510",
	copper: "#170f0b",
	light: "#f6f1e6",
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
				<DropdownMenuGroup>
					<DropdownMenuLabel className="px-3 py-2">
						Ink for the room
					</DropdownMenuLabel>
				</DropdownMenuGroup>
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
