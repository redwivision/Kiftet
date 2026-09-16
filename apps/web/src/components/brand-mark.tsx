/**
 * The Kiftet brand mark — an open ring.
 *
 * A circle with a segment missing: the gap (ክፍተት). It is the one
 * idea the whole product is about, drawn once so it can be read in a
 * frame: a whole that isn't whole — with a piece missing that gold
 * (the brand's "gap closed" colour) is the only thing that can fill.
 *
 * Rendered as inline SVG, stroke follows `currentColor` so the same
 * mark works on light and dark surfaces.
 */

const R = 44;

/* The 288° arc — the ring with a 72° segment missing at the top-right. */
const OPEN_ARC = "M 93.46 43.12 A 44 44 0 1 1 56.88 6.54";

/* The missing 72° segment — the gold piece that closes the gap. */
const GAP_ARC = "M 56.88 6.54 A 44 44 0 0 1 93.46 43.12";

/* Arc length of a 72° arc on the ring circle (2π·44 · 72/360). */
const GAP_LENGTH = (2 * Math.PI * R * 72) / 360;

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
 * The gap closing, live. The open ring plus the missing segment drawn in
 * gold as a growing arc — used where the product shows a gap being
 * closed (result crescents, "gap closed" moments).
 */
export function GapClosingMark({
	size = 56,
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
			<path
				d={GAP_ARC}
				stroke="#E8A33D"
				strokeWidth={STROKE}
				strokeLinecap="round"
				strokeDasharray={`${GAP_LENGTH} 70`}
				strokeDashoffset={GAP_LENGTH}
			>
				<animate
					attributeName="stroke-dashoffset"
					from={GAP_LENGTH}
					to="0"
					dur="1.4s"
					begin="0.15s"
					fill="freeze"
					calcMode="spline"
					keySplines="0.22 1 0.36 1"
				/>
			</path>
		</svg>
	);
}

/**
 * Large brand signature — used on empty states, CTAs, and anywhere
 * the brand wants to make a statement. Renders the mark at a hero
 * scale with a soft gold glow.
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
						"radial-gradient(circle, rgba(232,163,61,0.18) 0%, transparent 65%)",
					filter: "blur(20px)",
				}}
			/>
			<BrandMark size={size} className="relative" />
		</div>
	);
}
