import { useEffect, useRef, useState } from "react";

/**
 * Toggles `shown` once when the element scrolls into view. The caller adds
 * the `kft-in` class, and the pure-CSS reveal utilities in packages/ui
 * globals.css play on entrance. All animation is transforms + opacity, so
 * the runtime cost is a single IntersectionObserver — a few hundred bytes.
 */
export function useOnScreen<T extends HTMLElement>(options?: {
	threshold?: number;
	rootMargin?: string;
}) {
	const ref = useRef<T | null>(null);
	const [shown, setShown] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			setShown(true);
			return;
		}
		if (typeof IntersectionObserver === "undefined") {
			setShown(true);
			return;
		}
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setShown(true);
					io.disconnect();
				}
			},
			{
				threshold: options?.threshold ?? 0.15,
				rootMargin: options?.rootMargin ?? "0px 0px 12% 0px",
			},
		);
		io.observe(el);
		return () => io.disconnect();
	}, [options?.threshold, options?.rootMargin]);

	return { ref, shown };
}