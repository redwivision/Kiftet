import { apiUrl } from "@/lib/api";

const KEY = "kiftet-demo-user";

export function getDemoUser(): string | null {
	if (typeof window === "undefined") return null;
	return window.localStorage.getItem(KEY);
}

export function setDemoUser(userId: string): void {
	window.localStorage.setItem(KEY, userId);
}

export function clearDemoUser(): void {
	window.localStorage.removeItem(KEY);
}

export async function startDemo(): Promise<string> {
	const res = await fetch(apiUrl("/demo/start"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error ?? "Couldn't start the demo.");
	}
	const { userId } = (await res.json()) as { userId: string };
	return userId;
}