import { isPlatformOnline, reportReachable } from "@/lib/connectivity";
import { getDemoUser } from "@/lib/demo";
import { resolveBrowserServerRoot } from "@/lib/server-url";

const API = (import.meta.env.VITE_SERVER_URL as string) || "";

// Reads get a short leash: a dead connection should hand control back to the
// cached copy quickly, not leave the room spinning for half a minute. AI calls
// that are genuinely bounded but slow opt into a longer timeout at the call
// site (`timeoutMs`).
const DEFAULT_TIMEOUT_MS = 12_000;

const OFFLINE_MESSAGE =
  "Can't reach Kiftet — you're offline, or the connection dropped. Reconnect and try again; your work is saved on this device.";

function resolveServerRoot(): string {
  if (typeof window === "undefined") return API || "/api";
  return resolveBrowserServerRoot(
    window.location.hostname,
    window.location.origin,
    API,
  );
}

const serverRoot = resolveServerRoot();
export const apiUrl = (path: string) => `${serverRoot}/api${path}`;
// Platform-health probe target for connectivity. `/health` is a cheap,
// dependency-free 200 from the server, so it answers "is Kiftet reachable?"
// without spending a database query on every heartbeat.
export const healthUrl = () => `${serverRoot}/health`;

// Carries the HTTP status (0 = never reached the server) so callers can tell a
// real 404 ("this session isn't here") apart from a transient network failure
// before they render "not found".
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;
  /**
   * True when the server refused a request with 401 while this browser was
   * carrying a demo id — i.e. the demo room has been cleared (they expire after
   * a day) and the cached id no longer resolves. The caller shows the "demo
   * ended" prompt instead of the generic "session expired" one, because there is
   * no account to sign back into.
   */
  readonly demoExpired: boolean;

  constructor(
    status: number,
    message: string,
    demoExpired = false,
    code: string | null = null,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.demoExpired = demoExpired;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ApiInit = RequestInit & {
  /** Override the default 12s deadline for a bounded but slow endpoint. */
  timeoutMs?: number;
  /** Bypass the known-offline fast-fail (manual retry after a reconnect). */
  force?: boolean;
  /** Set false to skip the one automatic retry safe GETs get. */
  retry?: boolean;
};

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

function isAbortError(error: unknown): boolean {
  // DOMException (AbortError) is not an Error instance, so check by name.
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function describeNetworkError(error: unknown): string {
  if (isAbortError(error)) {
    return "This request took too long. Check your connection and try again.";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    /failed to fetch|networkerror|load failed|network request failed|err_internet_disconnected|err_network/i.test(
      message,
    )
  ) {
    return OFFLINE_MESSAGE;
  }
  // An unrecognised failure is nearly always our bug, and its message reads
  // like "Cannot read properties of undefined" — developer language that tells a
  // student nothing and invites a bug report they can't file. It goes to the
  // console for us; they get the retry.
  console.error("[api] unexpected failure", error);
  return "Something went wrong on our side. Try again in a moment.";
}

function timeoutSignal(
  timeoutMs: number,
  callerSignal: AbortSignal | null | undefined,
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, controller.signal])
    : controller.signal;
  return { signal, clear: () => clearTimeout(timeout) };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const { signal, clear } = timeoutSignal(timeoutMs, init.signal);
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    clear();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Identical GETs fired from two places at once (dashboard panels, a route and
// its prefetch) share one request instead of competing for the same bandwidth.
// A caller-supplied signal opts out: one abort must not cancel everyone.
const inFlightGets = new Map<string, Promise<unknown>>();

function getRequestKey(path: string, demoUser: string | null) {
  return `${demoUser ?? ""}\u0000${path}`;
}

async function request<T>(
  path: string,
  init: ApiInit | undefined,
  demoUser: string | null,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const canRetry = method === "GET" && init?.retry !== false;
  const body = method === "GET" || method === "HEAD" ? undefined : init?.body;
  const {
    timeoutMs: _timeoutMs,
    force: _force,
    retry: _retry,
    ...fetchInit
  } = init ?? {};

  const run = async (): Promise<Response> => {
    const res = await fetchWithTimeout(
      apiUrl(path),
      {
        ...fetchInit,
        method,
        body,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(demoUser ? { "X-Demo-User-Id": demoUser } : {}),
          ...fetchInit.headers,
        },
      },
      timeoutMs,
    );
    // Any HTTP answer — even a 500 — proves the platform is reachable. That
    // immediately clears a stale offline flag without waiting for a probe.
    reportReachable();
    return res;
  };

  let res: Response;
  try {
    res = await run();
  } catch (error) {
    // Retry a safe read once on a fast network failure. A timeout already spent
    // the whole deadline, so retrying would only double the wait.
    if (canRetry && !isAbortError(error) && isPlatformOnline()) {
      await sleep(350);
      res = await run();
    } else {
      throw error;
    }
  }

  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({}));
    const message = responseBody.error ?? statusMessage(res.status);
    const retryAfter = Number(res.headers.get("Retry-After"));
    throw new ApiError(
      res.status,
      message,
      res.status === 401 && demoUser !== null,
      typeof responseBody.code === "string" ? responseBody.code : null,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function api<T = unknown>(
  path: string,
  init?: ApiInit,
): Promise<T> {
  const demoUser = getDemoUser();
  const method = (init?.method ?? "GET").toUpperCase();
  const key =
    method === "GET" && !init?.signal && !init?.force
      ? getRequestKey(path, demoUser)
      : null;

  if (key) {
    const existing = inFlightGets.get(key);
    if (existing) return existing as Promise<T>;
  }

  // Known offline: fail in milliseconds so callers reach their cached copy or
  // outbox immediately. Waiting 12–30s for a connection the heartbeat already
  // knows is gone is the "frozen" feeling this wrapper used to cause.
  if (!init?.force && !isPlatformOnline()) {
    throw new ApiError(0, OFFLINE_MESSAGE);
  }

  const promise = request<T>(path, init, demoUser).catch((error) => {
    if (error instanceof ApiError) throw error;
    // The request never got a usable response: offline, DNS down, or the
    // timeout above aborted a hung call.
    throw new ApiError(0, describeNetworkError(error));
  });

  if (key) {
    inFlightGets.set(key, promise);
    void promise
      .finally(() => {
        if (inFlightGets.get(key) === promise) inFlightGets.delete(key);
      })
      .catch(() => {});
  }

  return promise;
}

export function apiError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return describeNetworkError(err);
  return "Something went wrong. Try again in a moment.";
}
