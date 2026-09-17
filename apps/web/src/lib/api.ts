const API = (import.meta.env.VITE_SERVER_URL as string) || "http://localhost:3000/api";
const serverRoot = API.replace(/\/api\/?$/, "").replace(/\/+$/, "");
const apiUrl = (path: string) => `${serverRoot}/api${path}`;

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

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function apiError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}