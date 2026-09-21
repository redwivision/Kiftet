import { cn } from "@kiftet/ui/lib/utils";

/**
 * The loading mark — short ivory strokes settling into place on black, like
 * handwriting appearing, instead of a generic spinner. Three strokes wipe from
 * the left and fade, slowly and out of step, so a wait reads as ink-on-page
 * rather than decoration. Plain CSS; `prefers-reduced-motion` stills it via the
 * global rule in index.css.
 */
export function InkSettling({
	className,
	barClassName,
}: {
	className?: string;
	barClassName?: string;
}) {
	return (
		<span
			className={cn("inline-flex items-center gap-1.5", className)}
			aria-hidden="true"
		>
			{[0, 1, 2].map((i) => (
				<span
					key={i}
					className={cn(
						"h-[3px] w-4 origin-left animate-ink-settle rounded-full bg-gold/70",
						barClassName,
					)}
					style={{ animationDelay: `${i * 0.18}s` }}
				/>
			))}
		</span>
	);
}
