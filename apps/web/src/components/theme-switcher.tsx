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
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";

export const THEMES = [
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
  const { t } = useLanguage();

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
            size="icon-sm"
            aria-label={t("choose-theme")}
            className="relative"
          />
        }
      >
        <Palette className="size-[1.1rem]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="k-label px-2.5 pt-2 pb-1.5 text-[0.78rem]">
            {t("ink-for-the-room")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-1 mb-1 bg-border/70" />
          {THEMES.map((option) => {
            const active = theme === option.value;
            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "justify-between gap-3 rounded-xl px-2.5 py-2 focus:bg-gold/10 focus:text-foreground not-data-[variant=destructive]:focus:**:text-foreground data-highlighted:bg-gold/10 data-highlighted:text-foreground",
                  active && "bg-gold/10",
                )}
              >
                <span className="inline-flex items-center gap-2.5">
                  <span
                    className={cn("size-5 shrink-0 rounded-full", option.chip)}
                    style={{ background: option.swatch }}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="font-medium">{option.label}</span>
                    <span className="truncate text-[0.72rem] text-muted-foreground">
                      {option.note}
                    </span>
                  </span>
                </span>
                {active && (
                  <Check
                    className="size-3.5 shrink-0 text-gold"
                    aria-hidden="true"
                  />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
