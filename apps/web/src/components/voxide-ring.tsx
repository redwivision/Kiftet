import { cn } from "@kiftet/ui/lib/utils";

import { useVoxideVoice, type VoxideStatus } from "@voxide/react";
import { Loader2, Mic, Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getVoxideClient } from "@/components/assistant";

const LABEL: Record<VoxideStatus, string> = {
	idle: "Tap and speak",
	armed: "Ready — tap to start",
	connecting: "Connecting…",
	listening: "Listening…",
	thinking: "Thinking…",
	speaking: "Speaking…",
	executing: "Running…",
	error: "Tap to retry",
};

const PROCESSING: VoxideStatus[] = ["connecting", "thinking", "executing"];
const ACTIVE: VoxideStatus[] = [
	"listening",
	"speaking",
	"connecting",
	"thinking",
	"executing",
];

export function VoxideRing() {
	const client = getVoxideClient();
	const voice = useVoxideVoice(client);
	const { status } = voice;

	const [initReady, setInitReady] = useState(() =>
		client ? client.isInitialized : false,
	);
	useEffect(() => {
		if (!client || client.isInitialized) return;
		const unsubscribe = client.on("ready", () => setInitReady(true));
		return unsubscribe;
	}, [client]);

	const isProcessing = PROCESSING.includes(status);
	const isActive = ACTIVE.includes(status);
	const isListening = status === "listening";
	const isSpeaking = status === "speaking";

	// Tap once → start talking. Tap again while a session is active → hang up.
	// (connect()/disconnect() mirror the vendor's own mic-toggle semantics.)
	const onClick = () => {
		if (!initReady) return;
		if (status === "idle" || status === "armed" || status === "error") {
			void voice.connect();
		} else {
			void voice.disconnect();
		}
	};

	const label = initReady ? LABEL[status] : "Starting…";

	return (
		<div className="relative grid place-items-center" aria-live="polite">
			{initReady && isActive && (
				<span className="absolute inset-0 animate-ping rounded-full bg-gold/20" />
			)}
			<button
				type="button"
				onClick={onClick}
				aria-label={label}
				className={cn(
					"relative grid size-40 place-items-center rounded-full border-2 bg-night-raised transition-colors duration-300",
					"focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-4",
					!initReady && "border-border/40 text-foreground/40",
					initReady &&
						status === "idle" &&
						"border-gold/40 text-gold/80 hover:border-gold hover:text-gold",
					initReady && status === "armed" && "border-gold/40 text-gold/80",
					initReady && isListening && "border-gold text-gold",
					initReady && isSpeaking && "border-gold/70 text-gold",
					initReady &&
						isProcessing &&
						"border-manuscript/30 text-manuscript/60",
					initReady && status === "error" && "border-rust/60 text-rust",
				)}
			>
				{!initReady ? (
					<Loader2 className="size-12 animate-spin text-foreground/40" />
				) : isListening ? (
					<Square className="size-12 fill-current" />
				) : isProcessing ? (
					<Loader2 className="size-12 animate-spin" />
				) : isSpeaking ? (
					<Volume2 className="size-12" />
				) : (
					<Mic className="size-12" />
				)}
			</button>
		</div>
	);
}
