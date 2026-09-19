import { getDemoUser } from "@/lib/demo";

const API = (import.meta.env.VITE_SERVER_URL as string) || "";

function resolveServerRoot(): string {
	if (typeof window === "undefined") return API || "/api";
	const envRoot = API.replace(/\/api\/?$/, "").replace(/\/+$/, "");
	const isLocalOverride =
		/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(envRoot);
	const onLocalHost =
		window.location.hostname === "localhost" ||
		window.location.hostname === "127.0.0.1";
	// A localhost VITE_SERVER_URL (from a dev .env) must never hijack requests
	// from a real host — the app and API ship together, so same-origin wins.
	if (envRoot && !(isLocalOverride && !onLocalHost)) return envRoot;
	return window.location.origin;
}

const serverRoot = resolveServerRoot();
export const apiUrl = (path: string) => `${serverRoot}/api${path}`;

// Carries the HTTP status so callers can tell a real 404 ("this session isn't
// here") apart from a transient network failure before they render "not found".
export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

export async function api<T = unknown>(
	path: string,
	init?: RequestInit,
): Promise<T> {
	const demoUser = getDemoUser();
	const res = await fetch(apiUrl(path), {
		...init,
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			...(demoUser ? { "X-Demo-User-Id": demoUser } : {}),
			...init?.headers,
		},
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new ApiError(
			res.status,
			body.error ?? `Request failed (${res.status})`,
		);
	}
	return res.json() as Promise<T>;
}

export function apiError(err: unknown): string {
	if (err instanceof Error && err.message) return err.message;
	return "Something went wrong. Please try again.";
}
