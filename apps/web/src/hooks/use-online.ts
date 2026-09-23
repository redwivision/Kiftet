import { useEffect, useState } from "react";
import { healthUrl } from "@/lib/api";

// Whether KIFTET'S PLATFORM is reachable — not the browser's opinion of the
// device. Big sites (GitHub, etc.) never consult `navigator.onLine`: the only
// honest check is "does a request to our server get a real answer?". Here that
// is `/health`, a `SELECT 1` against Postgres — if it answers, sessions,
// grading and the outbox all work; if it doesn't answer, "no connection" is
// ACCURATE, whatever the browser flags say.
//
// The best effort: probe on mount, then re-probe every heartbeat; also probe
// whenever the tab comes back to view or the window regains focus so a
// reconnect is noticed quickly (it self-heals, outbox included).
export function useOnline(): boolean {
	const [online, setOnline] = useState(true);

	useEffect(() => {
		if (typeof window === "undefined") return;
		let cancelled = false;
		let timer: ReturnType<typeof setInterval> | undefined;

		const probe = async () => {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 5_000);
			try {
				const res = await fetch(healthUrl(), {
					headers: { accept: "text/plain" },
					cache: "no-store",
					signal: controller.signal,
				});
				if (!cancelled) setOnline(res.ok);
			} catch {
				if (!cancelled) setOnline(false);
			} finally {
				clearTimeout(timeout);
			}
		};

		void probe();
		timer = setInterval(() => void probe(), 15_000);
		const onVisible = () => {
			if (document.visibilityState === "visible") void probe();
		};
		const onFocus = () => void probe();
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onFocus);
		return () => {
			cancelled = true;
			if (timer) clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", onFocus);
		};
	}, []);

	return online;
}
