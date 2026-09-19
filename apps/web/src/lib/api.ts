import { getDemoUser } from "@/lib/demo";

const API = (import.meta.env.VITE_SERVER_URL as string) || "";

// Long enough for a graded recall (Gemini is guarded at 20s server-side), short
// enough that a dead connection doesn't leave the student staring at "…" for a
// minute. The server request cap is 60s; this fires well inside it.
const REQUEST_TIMEOUT_MS = 30_000;

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

// Carries the HTTP status (0 = never reached the server) so callers can tell a
// real 404 ("this session isn't here") apart from a transient network failure
// before they render "not found".
export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

// Human copy for a response that failed without a server-provided message.
// 401/403/404/429 come up a lot in the study flow, so the student sees a real
// sentence instead of the raw status.
function statusMessage(status: number): string {
	switch (status) {
		case 401:
			return "Your session expired. Please sign in again.";
		case 403:
			return "You're not allowed to do that.";
		case 404:
			return "That can't be found anymore.";
		case 429:
			return "That's too many requests right now. Give it a moment.";
		default:
			return `Request failed (${status}). Please try again.`;
	}
}

function describeNetworkError(error: unknown): string {
	// DOMException (AbortError) is not an Error instance, so check by name.
	if (
		typeof error === "object" &&
		error !== null &&
		(error as { name?: unknown }).name === "AbortError"
	) {
		return "That took too long. Check your connection and try again.";
	}
	const message = error instanceof Error ? error.message : String(error);
	if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
		return "Can't reach Kiftet. Check your connection and try again.";
	}
	return message || "Something went wrong on our side. Please try again.";
}

export async function api<T = unknown>(
	path: string,
	init?: RequestInit,
): Promise<T> {
	const demoUser = getDemoUser();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const res = await fetch(apiUrl(path), {
			...init,
			signal: init?.signal ?? controller.signal,
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				...(demoUser ? { "X-Demo-User-Id": demoUser } : {}),
				...init?.headers,
			},
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			const message = body.error ?? statusMessage(res.status);
			throw new ApiError(res.status, message);
		}
		return res.json() as Promise<T>;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		// The request never got a usable response: offline, DNS down, or the
		// timeout above aborted a hung call.
		throw new ApiError(0, describeNetworkError(error));
	} finally {
		clearTimeout(timer);
	}
}

export function apiError(err: unknown): string {
	if (err instanceof ApiError) return err.message;
	if (err instanceof Error && err.message) return describeNetworkError(err);
	return "Something went wrong. Please try again.";
}