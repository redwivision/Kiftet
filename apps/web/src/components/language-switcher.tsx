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
import { Check, Languages } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

export const OPTIONS = [
  { value: "en", label: "English", script: "EN" },
  { value: "am", label: "አማርኛ", script: "አማ" },
] as const;

export function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={t("select-language")}
            className="relative"
          />
        }
      >
        <Languages className="size-[1.1rem]" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="k-label px-2.5 pt-2 pb-1.5 text-[0.78rem]">
            {t("select-language")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-1 mb-1 bg-border/70" />
          {OPTIONS.map((option) => {
            const active = lang === option.value;
            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setLang(option.value)}
                className={cn(
                  "justify-between gap-3 rounded-xl px-2.5 py-2 focus:bg-gold/10 focus:text-foreground not-data-[variant=destructive]:focus:**:text-foreground data-highlighted:bg-gold/10 data-highlighted:text-foreground",
                  active && "bg-gold/10",
                )}
              >
                <span className="inline-flex min-w-0 items-center gap-2.5">
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded-full font-medium text-[0.6rem] text-muted-foreground tracking-tight ring-1 ring-border dark:ring-white/15"
                    aria-hidden="true"
                  >
                    {option.script}
                  </span>
                  <span className="truncate leading-tight">{option.label}</span>
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
