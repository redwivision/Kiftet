/**
 * The Kiftet brand mark — an open ring.
 *
 * A circle with a segment missing: the gap (ክፍተት). It is the one
 * idea the whole product is about, drawn once so it can be read in a
 * frame: a whole that isn't whole. The missing piece stays empty — an
 * honest gap, never painted over — while the rest of the interface
 * (actions, highlights, the beam) carries the brand colour.
 *
 * Rendered as inline SVG, stroke follows `currentColor` so the same
 * mark works on light and dark surfaces.
 */

/* The 288° arc — the ring with a 72° segment missing at the top-right. */
const OPEN_ARC = "M 93.46 43.12 A 44 44 0 1 1 56.88 6.54";

const STROKE = 8;

export function BrandMark({
	size = 36,
	className,
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 100 100"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			aria-hidden="true"
		>
			<path
				d={OPEN_ARC}
				stroke="currentColor"
				strokeWidth={STROKE}
				strokeLinecap="round"
			/>
		</svg>
	);
}

/**
 * The gap, left openly empty. Kept as its own component so call sites that
 * used "the gap closing" read the same intent clearly, but the missing
 * segment is never filled — it stays a pause in the ring.
 */
export function GapClosingMark({
	size = 56,
	className,
}: {
	size?: number;
	className?: string;
}) {
	return <BrandMark size={size} className={className} />;
}

/**
 * Large brand signature — used on empty states, CTAs, and anywhere
 * the brand wants to make a statement. Renders the mark at a hero
 * scale with a soft ivory glow in dark rooms (the candle) and a soft
 * shadow in the light one.
 */
export function BrandSignature({
	size = 96,
	className,
}: {
	size?: number;
	className?: string;
}) {
	return (
		<div
			className={`relative inline-flex items-center justify-center ${className ?? ""}`}
		>
			<span
				className="absolute inset-0 rounded-full"
				style={{
					background:
						"radial-gradient(circle, rgba(242,239,233,0.16) 0%, transparent 65%)",
					filter: "blur(20px)",
				}}
			/>
			<BrandMark size={size} className="relative" />
		</div>
	);
}
