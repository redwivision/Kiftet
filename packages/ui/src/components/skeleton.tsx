import { cn } from "@kiftet/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			// Rounded to match the surface it stands in for, filled with a trace of
			// the room's own candle so it belongs to the room it is loading into.
			className={cn(
				"animate-ink-rise rounded-2xl bg-[color-mix(in_srgb,var(--brand-accent)_12%,transparent)]",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
