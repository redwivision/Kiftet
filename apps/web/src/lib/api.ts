import { getDemoUser } from "@/lib/demo";

const API = (import.meta.env.VITE_SERVER_URL as string) || "";

// Long enough for a graded recall (Gemini is guarded at 20s server-side), short
// enough that a dead connection doesn't leave the student staring at "…" for a
// minute. The server request cap is 60s; this fires well inside it.
const REQUEST_TIMEOUT_MS = 30_000;

function resolveServerRoot(): string {
  if (typeof window === "undefined") return API || "/api";
  const envRoot = API.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  const isLocalOverride = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
    envRoot,
  );
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
// Platform-health probe target for connectivity. `/health` (not `/healthz`)
// does a real `SELECT 1` on the server, so "offline" genuinely means "Kiftet's
// grading platform can't be reached" — not just "the browser lost its signal".
export const healthUrl = () => `${serverRoot}/health`;

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
// Every branch names what happened AND what to do about it. A bare status code
// is the shape of this message we are trying to retire: "Request failed (503)"
// tells a student nothing they can act on, and sending them to guess is how a
// temporary blip becomes a lost chapter of work.
function statusMessage(status: number): string {
  switch (status) {
    case 400:
      return "We couldn't read that request. Check the details and try again.";
    case 401:
      return "Your session expired. Sign in again to pick up where you left off.";
    case 403:
      return "You don't have access to that. If it's your account, sign in again.";
    case 404:
      return "We couldn't find that — it may have been deleted. Go back and pick another.";
    case 409:
      return "That conflicts with something already saved. Reload and try again.";
    case 413:
      return "That's too big to accept. Try a smaller file, or one chapter at a time.";
    case 429:
      return "You've used all your requests for this minute. Your dashboard counts down when more are available.";
    default:
      break;
  }
  if (status >= 500) {
    return "Kiftet ran into a problem on our side. Wait a moment and try again — nothing you saved is lost.";
  }
  return "That didn't work. Try again in a moment.";
}

function describeNetworkError(error: unknown): string {
  // DOMException (AbortError) is not an Error instance, so check by name.
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  ) {
    return "That took longer than expected. Try again, or import one chapter at a time.";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    /failed to fetch|networkerror|load failed|network request failed/i.test(
      message,
    )
  ) {
    return "Can't reach Kiftet — you're offline, or the connection dropped. Reconnect and try again; your work is saved on this device.";
  }
  // An unrecognised failure is nearly always our bug, and its message reads
  // like "Cannot read properties of undefined" — developer language that tells a
  // student nothing and invites a bug report they can't file. It goes to the
  // console for us; they get the retry.
  console.error("[api] unexpected failure", error);
  return "Something went wrong on our side. Try again in a moment.";
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
  return "Something went wrong. Try again in a moment.";
}
