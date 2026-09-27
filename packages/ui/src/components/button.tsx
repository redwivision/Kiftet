import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@kiftet/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";

/* The control layer is where a product is judged — it is what the hand
   touches, so it has to speak the same language as the brand layer. The
   shape language is the pill (`rounded-full`), matching the nav, the step
   pills and the voice ring. Heights start at 44px for the default size so
   the primary action clears the touch-target floor on a phone, which is
   the device this is designed for. */
const buttonVariants = cva(
	"group/button inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-transparent bg-clip-padding font-medium outline-none transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_8px_24px_-12px_var(--brand-accent)] hover:bg-primary/80",
				outline:
					"border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
				destructive:
					"bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:outline-destructive/70 dark:bg-destructive/20 dark:hover:bg-destructive/30",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default:
					"h-11 px-5 text-[0.95rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
				xs: "h-7 gap-1 px-3 text-xs has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-9 gap-1.5 px-4 text-sm has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
				lg: "h-12 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
				icon: "size-10",
				"icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-5",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	loading = false,
	disabled,
	children,
	...props
}: ButtonPrimitive.Props &
	VariantProps<typeof buttonVariants> & {
		/** Shows a spinner, marks the control busy, and blocks re-entry. Async
		 *  actions were previously hand-rolled three different ways across the app
		 *  (swap the whole button, swap the label text, just disable) — this makes
		 *  one of them the default. */
		loading?: boolean;
	}) {
	return (
		<ButtonPrimitive
			data-slot="button"
			aria-busy={loading || undefined}
			// `disabled` has to be destructured out of props rather than merged
			// before the spread, or the trailing {...props} writes the caller's
			// value back over the loading one and a busy button stays clickable.
			disabled={loading || disabled}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		>
			{loading && <Loader2Icon className="animate-spin" />}
			{children}
		</ButtonPrimitive>
	);
}

export { Button, buttonVariants };
