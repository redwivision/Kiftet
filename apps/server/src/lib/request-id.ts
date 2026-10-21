/**
 * One id per request, so every line a request produces — the access line, an
 * unhandled error, a downstream warning — can be stitched back together when
 * something goes wrong at 3am. Without it, a backgrounded error and the request
 * that caused it are two unrelated lines in a stream of thousands.
 *
 * The id comes from the client's proxy when it sends one (`X-Request-Id` is the
 * de-facto standard), so a single id spans the whole edge → app path and can be
 * searched from the platform's logs. When it is absent we mint one.
 */

/** A sane upper bound. A request id is a correlation token, not a payload. */
const MAX_ID_LENGTH = 200;

/**
 * Accept an inbound id only if it is short and boring. A header is attacker
 * input: an unvalidated value goes straight into every log line this request
 * emits, so a newline in it forges log entries and a huge one is a log-flood
 * lever. Anything failing these checks is discarded and replaced with a fresh
 * id, which loses correlation but never corrupts the log.
 */
export function sanitizeRequestId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_ID_LENGTH) return null;
  // Visible ASCII minus whitespace and control characters: the shape every id
  // scheme (uuid, nanoid, trace ids) actually uses.
  if (!/^[A-Za-z0-9._:+/-]+$/.test(value)) return null;
  return value;
}

/** The id for this request: the inbound one if it is usable, else a fresh uuid. */
export function resolveRequestId(
  inbound: unknown,
  mint: () => string = () => crypto.randomUUID(),
): string {
  return sanitizeRequestId(inbound) ?? mint();
}

/**
 * Stamp every request with an id and echo it back. Mounted before the request
 * logger so the access line already carries it, and before the body parsers so
 * even a 413 (which rejects before routing) is correlated.
 *
 * The id lives on `req` for the logger and error handler, and is sent back in
 * `X-Request-Id` so a student can report it (or the browser's network tab shows
 * it) and an operator can grep one request out of the stream.
 */
export function requestIdMiddleware() {
  return function assignRequestId(
    req: { headers: Record<string, unknown>; requestId?: string },
    res: { setHeader: (name: string, value: string) => void },
    next: () => void,
  ): void {
    const id = resolveRequestId(req.headers["x-request-id"]);
    req.requestId = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}
