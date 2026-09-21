/**
 * The concept graph — the quiet picture of what Kiftet actually does.
 *
 * Faint ink dots joined by thin lines: the concept checklist underneath
 * every chapter. Filled dots are concepts already closed; hollow dots are
 * the gaps still open. Drawn in `currentColor` so it is faint ivory on the
 * black rooms and faint ink on paper. Purely decorative — it never carries
 * meaning the surrounding copy doesn't already say.
 *
 * Motion is a slow settling, never a loop: each edge draws itself in and
 * each node fades into place, so the graph reads as ink arriving on a page,
 * not as a loading spinner. `prefers-reduced-motion` collapses it to the
 * finished frame via the global rule in index.css.
 */

type Node = { x: number; y: number; closed: boolean };

/* Hand-placed so the mesh reads like a real knowledge graph — uneven,
   with air — rather than a lattice. Two dots stay hollow: the gaps. */
const NODES: Node[] = [
	{ x: 46, y: 60, closed: true },
	{ x: 108, y: 32, closed: false },
	{ x: 150, y: 74, closed: true },
	{ x: 214, y: 40, closed: true },
	{ x: 268, y: 78, closed: false },
	{ x: 86, y: 124, closed: true },
	{ x: 150, y: 142, closed: false },
	{ x: 216, y: 116, closed: true },
	{ x: 272, y: 152, closed: true },
];

const EDGES: [number, number][] = [
	[0, 1],
	[1, 2],
	[2, 3],
	[3, 4],
	[0, 5],
	[2, 5],
	[2, 7],
	[3, 7],
	[4, 7],
	[5, 6],
	[6, 7],
	[6, 8],
	[7, 8],
];

export function ConceptGraph({
	className,
	animate = true,
}: {
	className?: string;
	animate?: boolean;
}) {
	return (
		<svg
			viewBox="0 0 316 184"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			aria-hidden="true"
		>
			{EDGES.map(([from, to], i) => {
				const a = NODES[from];
				const b = NODES[to];
				if (!a || !b) return null;
				return (
					<line
						key={`e${i}`}
						x1={a.x}
						y1={a.y}
						x2={b.x}
						y2={b.y}
						pathLength={1}
						stroke="currentColor"
						strokeWidth={1}
						strokeOpacity={0.16}
						strokeLinecap="round"
						{...(animate
							? {
									strokeDasharray: 1,
									className: "animate-ink-draw",
									style: { animationDelay: `${0.15 + i * 0.05}s` },
								}
							: {})}
					/>
				);
			})}

			{NODES.map((node, i) => {
				const delay = `${0.35 + i * 0.06}s`;
				const motion = animate
					? {
							className: "animate-node-settle",
							style: { animationDelay: delay },
						}
					: {};
				return node.closed ? (
					<circle
						key={`n${i}`}
						cx={node.x}
						cy={node.y}
						r={3.1}
						fill="currentColor"
						fillOpacity={0.62}
						{...motion}
					/>
				) : (
					<circle
						key={`n${i}`}
						cx={node.x}
						cy={node.y}
						r={3.6}
						stroke="currentColor"
						strokeWidth={1.1}
						strokeOpacity={0.42}
						{...motion}
					/>
				);
			})}
		</svg>
	);
}
