import { cn } from "@kiftet/ui/lib/utils";
import { useVoxideVoice } from "@voxide/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getVoxideClient, hasVoxideKey } from "@/components/assistant";
import { VoxideRing } from "@/components/voxide-ring";

// Dev-only harness: exercises the raw voice ring without the study loop.
// In a production build the route renders a quiet dead end instead — the
// page is part of the demo story only in development.

const STATUS_LABEL: Record<string, string> = {
	idle: "Tap the ring and talk — anything.",
	armed: "Ready.",
	connecting: "Connecting to the voice agent…",
	listening: "Listening… tap the ring again to stop me.",
	thinking: "Thinking… tap the ring again to cancel.",
	speaking: "Speaking… tap the ring again to cut me off.",
	executing: "Running the action… tap the ring again to cancel.",
	error: "Something went wrong. Tap to retry.",
};

export default function VoiceTest() {
	const [ready, setReady] = useState(false);
	const [hasKey, setHasKey] = useState(false);

	useEffect(() => {
		setReady(true);
		setHasKey(hasVoxideKey());
	}, []);

	// Production builds never expose the harness — just a calm way back.
	if (import.meta.env.PROD) {
		return (
			<main className="mx-auto grid w-full max-w-md content-center justify-items-center gap-4 px-6 py-24 text-center">
				<h1 className="font-display font-semibold text-2xl text-foreground tracking-tight">
					Nothing to see here
				</h1>
				<p className="text-muted-foreground text-sm">
					The study room lives in the chapters, not the test bench.
				</p>
				<Link
					to="/dashboard"
					className="font-medium text-gold text-sm underline underline-offset-4 hover:text-gold-soft"
				>
					Go to your chapters
				</Link>
			</main>
		);
	}

	const voice = useVoxideVoice(ready && hasKey ? getVoxideClient() : null);

	return (
		<main className="mx-auto grid w-full max-w-md content-center gap-8 px-6 py-12">
			<div className="space-y-2 text-center">
				<h1 className="font-display font-semibold text-2xl text-manuscript tracking-tight">
					Voice test
				</h1>
				<p className="text-muted-foreground text-sm">
					Phase 1+2 · Voxide voice agent + study capabilities.
				</p>
			</div>

			{!ready ? (
				<div className="grid min-h-40 place-items-center text-muted-foreground text-sm">
					Loading…
				</div>
			) : !hasKey ? (
				<div className="rounded-lg border border-rust/50 bg-rust/10 px-4 py-3 text-manuscript/85 text-sm">
					<p className="mb-1 font-medium">Voxide key missing</p>
					<p className="text-manuscript/60">
						Set{" "}
						<code className="rounded bg-night-deep px-1">VITE_VOXIDE_KEY</code>{" "}
						in <code className="rounded bg-night-deep px-1">apps/web/.env</code>{" "}
						with the publishable key from{" "}
						<a
							href="https://voxide.app/dashboard"
							className="underline"
							target="_blank"
							rel="noreferrer"
						>
							voxide.app/dashboard
						</a>
						.
					</p>
				</div>
			) : (
				<>
					<div className="flex flex-col items-center gap-4">
						<VoxideRing />
						<p className="h-5 font-medium text-manuscript/70 text-sm">
							{STATUS_LABEL[voice.status] ?? ""}
						</p>
					</div>

					<div className="flex min-h-28 flex-col gap-2 rounded-lg border border-manuscript/15 bg-night-raised px-4 py-3">
						<p className="text-muted-foreground text-xs uppercase tracking-widest">
							Transcript
						</p>
						{voice.messages.length ? (
							voice.messages.map((m, i) => (
								<p
									key={i}
									className={cn(
										"text-sm leading-relaxed",
										m.role === "ai"
											? "text-manuscript/90"
											: "text-manuscript/60",
									)}
								>
									<span className="font-semibold text-gold/80">
										{m.role === "ai" ? "Kiftet" : "You"}
									</span>
									: {m.text}
								</p>
							))
						) : (
							<p className="text-manuscript/40 text-sm">
								Nothing yet — say something…
							</p>
						)}
					</div>
				</>
			)}
		</main>
	);
}
