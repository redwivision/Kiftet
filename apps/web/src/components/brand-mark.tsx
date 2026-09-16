/**
 * The Kiftet brand mark — gold brackets `[ ]` with a `?` between them,
 * on a Night Indigo field. The unanswered question sitting inside the
 * gap that's about to close.
 *
 * Rendered as inline SVG so the `?` resolves Fraunces from the page's
 * CSS @font-face — no external font lookup inside `<img>` tags.
 */
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
			viewBox="0 0 120 120"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			aria-hidden="true"
		>
			<circle cx="60" cy="60" r="58" fill="#1B2340" />
			{/* Left bracket [ */}
			<path
				d="M42 32 L34 32 L34 88 L42 88"
				stroke="#E8A33D"
				strokeWidth="6"
				strokeLinecap="round"
			/>
			{/* Right bracket ] */}
			<path
				d="M78 32 L86 32 L86 88 L78 88"
				stroke="#E8A33D"
				strokeWidth="6"
				strokeLinecap="round"
			/>
			{/* ? — Fraunces resolves from the page's loaded Google Fonts */}
			<text
				x="60"
				y="73"
				fontSize="42"
				fontWeight="500"
				fill="#E8A33D"
				textAnchor="middle"
				fontFamily="Fraunces, Georgia, serif"
			>
				?
			</text>
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
