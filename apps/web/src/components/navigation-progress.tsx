import { cn } from "@kiftet/ui/lib/utils";
import { useNavigation } from "react-router";

/**
 * The in-between signal for route changes.
 *
 * On a weak connection a student taps "Study" and the app used to simply do
 * nothing for a beat before the page appeared — indistinguishable from a dead
 * tap. This draws a line of ink across the top while a route resolves.
 *
 * Deliberately not a Suspense skeleton: every route here is code-split, so a
 * skeleton boundary around the outlet would replace the whole page on each
 * navigation and read as a flash. This sits above the chrome and touches
 * nothing. It is announced politely rather than assertively, because a screen
 * reader user already gets the new page's own heading.
 */
export function NavigationProgress() {
	const navigation = useNavigation();
	const busy = navigation.state !== "idle";

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]"
		>
			<div
				data-busy={busy || undefined}
				className={cn(
					"h-full w-full origin-left bg-gold/80 transition-opacity duration-300 ease-out",
					busy ? "animate-ink-sweep opacity-100" : "opacity-0",
				)}
			/>
		</div>
	);
}
