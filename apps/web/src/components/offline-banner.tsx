import { Button } from "@kiftet/ui/components/button";
import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { useOnline } from "@/hooks/use-online";
import { flushOutbox, subscribeOutbox } from "@/lib/outbox";

// Bet 3 (STRATEGY.md): honest connectivity surfacing, site-wide.
//
// Three states, three honest messages:
//  - offline, nothing queued   → study data is local; grading needs a signal
//  - offline, items queued      → "N saved — will be graded when you're online"
//  - online, items queued       → "back online — grading N saved…", auto-flush
//                                 (plus a manual Retry, for a connection the
//                                 probe cadence hasn't caught yet)
//
// It deliberately NEVER shows a score: a queued submission is not graded yet.
// The banner disappears on its own when the last item flushes.

export function OfflineBanner() {
	const { t } = useLanguage();
	const online = useOnline();
	const [pending, setPending] = useState(0);
	const [syncing, setSyncing] = useState(false);
	const lastOnlineRef = useRef(online);

	useEffect(() => {
		return subscribeOutbox(setPending);
	}, []);

	// A reconnect flushes the queue once. The effect runs on mount too, but
	// guarded so a fresh load that's already online flushes only when there
	// IS something queued and we actually transitioned (or are online now).
	useEffect(() => {
		const wasOffline = !lastOnlineRef.current;
		lastOnlineRef.current = online;
		if (!online) {
			setSyncing(false);
			return;
		}
		if (!wasOffline && pending === 0) return;
		let cancelled = false;
		setSyncing(true);
		flushOutbox()
			.then((remaining) => {
				if (!cancelled) {
					setSyncing(remaining > 0);
					setPending(remaining);
				}
			})
			.catch(() => {
				if (!cancelled) setSyncing(false);
			});
		return () => {
			cancelled = true;
		};
	}, [online, pending]);

	const retry = async () => {
		setSyncing(true);
		const remaining = await flushOutbox().catch(() => 0);
		setSyncing(remaining > 0);
		setPending(remaining);
	};

	if (online && pending === 0) return null;

	const copy =
		pending === 1
			? online
				? syncing
					? t("back-grading", { n: 1 })
					: t("back-applied-one")
				: t("offline-queued-one")
			: online
				? syncing
					? t("back-grading", { n: pending })
					: t("back-applied-many", { n: pending })
				: pending > 0
					? t("offline-queued-many", { n: pending })
					: t("cl-offline");

	return (
		<div
			role="status"
			className={
				online
					? "border-border/70 border-b bg-gold/[0.08] dark:border-white/10"
					: "border-rust/40 border-b bg-rust/[0.08] dark:border-rust/30"
			}
		>
			<div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
				<div className="flex min-w-0 items-center gap-2">
					{online ? (
						<RefreshCw
							className={`size-3.5 shrink-0 text-gold ${syncing ? "animate-spin" : ""}`}
							aria-hidden="true"
						/>
					) : (
						<CloudOff
							className="size-3.5 shrink-0 text-rust"
							aria-hidden="true"
						/>
					)}
					<p className="text-foreground/85 text-xs leading-5">{copy}</p>
				</div>
				{!online && pending > 0 && (
					<Button
						size="sm"
						variant="outline"
						className="h-7 px-2.5 text-xs"
						onClick={() => void retry()}
						disabled={syncing}
					>
						{t("try-again")}
					</Button>
				)}
			</div>
		</div>
	);
}
