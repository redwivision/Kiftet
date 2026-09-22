import { useEffect, useState } from "react";

// Whether the BROWSER currently thinks it has a connection. Server builds
// (SSR) default to "online" — the banner renders on the client only, and a
// client that can't reach the server marks itself offline through the outbox
// path even if navigator.onLine is optimistic.
export function useOnline(): boolean {
	const [online, setOnline] = useState(
		() => typeof navigator === "undefined" || navigator.onLine,
	);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const up = () => setOnline(true);
		const down = () => setOnline(false);
		window.addEventListener("online", up);
		window.addEventListener("offline", down);
		return () => {
			window.removeEventListener("online", up);
			window.removeEventListener("offline", down);
		};
	}, []);

	return online;
}
