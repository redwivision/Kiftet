import type { ReactNode } from "react";

import { BrandMark, BrandSignature } from "@/components/brand-mark";

/**
 * The study-room door. Auth is the first surface a new student touches
 * after the landing page, so it wears the same identity: a calm surface
 * on the themed stage, the open-ring mark, and ivory for the way forward.
 */
export default function AuthShell({
	title,
	subtitle,
	children,
	footer,
}: {
	title: string;
	subtitle: string;
	children: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<main className="mx-auto grid w-full max-w-5xl place-items-center px-4 py-12 sm:px-6">
			<div className="grid w-full gap-10 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16">
				<div className="mx-auto w-full max-w-md">
					<div className="surface p-7 sm:p-9">
						<div className="mb-7 flex items-center gap-3">
							<BrandMark
								size={30}
								className="rounded-full ring-1 ring-gold/40"
							/>
							<div className="leading-tight">
								<p className="font-display font-semibold text-[1.06rem] text-foreground tracking-tight">
									Kiftet
								</p>
								<p className="font-medium text-[0.72rem] text-muted-foreground">
									Close the gap
								</p>
							</div>
						</div>

						<div className="mb-7 space-y-1.5">
							<h1 className="font-display font-semibold text-2xl text-foreground tracking-[-0.02em] sm:text-3xl">
								{title}
							</h1>
							<p className="text-muted-foreground text-sm leading-6">
								{subtitle}
							</p>
						</div>

						{children}

						{footer && (
							<div className="mt-6 border-border/60 border-t pt-5 text-center dark:border-white/10">
								{footer}
							</div>
						)}
					</div>
				</div>

				{/* The quiet promise on the side panel — hidden when space is tight. */}
				<aside className="mx-auto hidden max-w-xs flex-col items-center gap-5 text-center lg:flex">
					<BrandSignature size={96} />
					<blockquote className="space-y-3">
						<p className="font-display font-medium text-foreground text-lg leading-7 tracking-[-0.01em]">
							&ldquo;Say what you remember. The gaps do the rest.&rdquo;
						</p>
						<p className="text-muted-foreground text-sm leading-6">
							Speak a chapter out loud, see exactly which ideas didn&rsquo;t
							stick, and close only those — before the exam finds them for you.
						</p>
					</blockquote>
					<p className="font-medium text-[0.72rem] text-gold">
						Ethiopian students · National exam
					</p>
				</aside>
			</div>
		</main>
	);
}
