import { Button } from "@kiftet/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@kiftet/ui/components/dropdown-menu";
import { cn } from "@kiftet/ui/lib/utils";
import { Check, Languages } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

const OPTIONS = [
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
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuGroup>
					<DropdownMenuSeparator className="my-1" />
					{OPTIONS.map((o) => {
						const active = lang === o.value;
						return (
							<DropdownMenuItem
								key={o.value}
								onClick={() => setLang(o.value)}
								className={cn("justify-between", active && "bg-muted/70")}
							>
								<span className="inline-flex items-center gap-2.5">
									<span
										className="grid size-5 place-items-center rounded-full font-medium text-[0.6rem] text-muted-foreground tracking-tight ring-1 ring-border dark:ring-white/15"
										aria-hidden="true"
									>
										{o.script}
									</span>
									<span className="leading-tight">{o.label}</span>
								</span>
								{active && (
									<Check className="size-3.5 text-gold" aria-hidden="true" />
								)}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
