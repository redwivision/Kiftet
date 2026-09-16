import { cn } from "@kiftet/ui/lib/utils";
import { Check, CircleAlert } from "lucide-react";

interface CoverageViewProps {
	covered: string[];
	missing: string[];
	className?: string;
}

/**
 * The one place the design spends its boldness.
 *
 * Before/after coverage is shown as a segmented strip: every idea in the
 * chapter is one segment. Solid ideas sit tall and filled (sage). Missing
 * ideas sit low and open (rust) — the gap is legible at a glance, not just
 * scored.
 */
export function CoverageView({
	covered,
	missing,
	className,
}: CoverageViewProps) {
	const total = covered.length + missing.length;
	const coveredPct = total > 0 ? Math.round((covered.length / total) * 100) : 0;

	return (
		<div className={cn("space-y-6", className)}>
			{/* Score */}
			<div className="flex items-end justify-between gap-4">
				<div className="space-y-1">
					<p className="font-display font-semibold text-5xl text-foreground tracking-[-0.03em] sm:text-6xl">
						{coveredPct}
						<span className="text-2xl text-muted-foreground">%</span>
					</p>
					<p className="text-muted-foreground text-sm">
						of the chapter&apos;s ideas came out solid
					</p>
				</div>
				<div className="pb-1.5 text-right text-[0.72rem] text-muted-foreground leading-4">
					<p>
						<span className="mr-1 inline-block size-2 rounded-full bg-sage align-baseline" />
						solid · {covered.length}
					</p>
					<p>
						<span className="mr-1 inline-block size-2 rounded-full border border-rust align-baseline" />
						gap · {missing.length}
					</p>
				</div>
			</div>

			{/* The gap, segmented */}
			<div
				className="flex h-9 items-end gap-1.5"
				role="img"
				aria-label={`${covered.length} of ${total} ideas covered, ${missing.length} still gaps`}
			>
				{covered.map((concept, i) => (
					<span
						key={concept}
						title={concept}
						className="h-full flex-1 animate-beam rounded-t-md bg-sage/85 transition-colors hover:bg-sage"
						style={{ animationDelay: `${0.08 * i}s` }}
					/>
				))}
				{missing.map((concept, i) => (
					<span
						key={concept}
						title={concept}
						className="h-[38%] flex-1 animate-beam rounded-t-md border border-rust/70 border-dashed bg-rust/10 transition-colors hover:bg-rust/20"
						style={{ animationDelay: `${0.08 * (covered.length + i)}s` }}
					/>
				))}
				{total === 0 && (
					<span className="flex h-2 w-full animate-pulse-soft rounded-full bg-muted" />
				)}
			</div>

			{/* The diagnosis, spelled out */}
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="inner-surface p-4">
					<p className="k-label mb-3 flex items-center gap-2">
						<Check className="size-3.5 text-sage" aria-hidden="true" />
						Already solid
					</p>
					{covered.length > 0 ? (
						<ul className="space-y-2">
							{covered.map((concept) => (
								<li
									key={concept}
									className="flex items-baseline gap-2 text-foreground/90 text-sm"
								>
									<span
										aria-hidden="true"
										className="mt-[7px] size-1.5 shrink-0 rounded-full bg-sage"
									/>
									{concept}
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-sm">
							Nothing landed yet — that&apos;s the starting point.
						</p>
					)}
				</div>

				<div className="inner-surface border-rust/25 p-4 dark:border-rust/30">
					<p className="k-label mb-3 flex items-center gap-2 text-rust">
						<CircleAlert className="size-3.5" aria-hidden="true" />
						Needs work
					</p>
					{missing.length > 0 ? (
						<ul className="space-y-2">
							{missing.map((concept) => (
								<li
									key={concept}
									className="flex items-baseline gap-2 text-foreground/90 text-sm"
								>
									<span
										aria-hidden="true"
										className="mt-[7px] size-1.5 shrink-0 rounded-full border border-rust"
									/>
									{concept}
								</li>
							))}
						</ul>
					) : (
						<p className="text-sage text-sm">Nothing. Every idea held.</p>
					)}
				</div>
			</div>
		</div>
	);
}
