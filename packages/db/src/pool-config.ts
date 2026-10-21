/**
 * Pure connection-budget arithmetic, kept out of `index.ts` so it can be
 * tested without a database. The pool sizes are the app's half of a shared
 * budget: Neon's pooled endpoint multiplexes up to 10,000 client connections
 * but caps *active transactions* per user/per database at 90% of the compute's
 * `max_connections`, so the app should queue in its own pool (cheap) rather
 * than in PgBouncer (waits up to 120s, then errors).
 */
export const DEFAULT_POOL_MAX = 5;
export const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
export const DEFAULT_CONNECT_RETRIES = 6;

/** Parse an env value that may arrive as a string or number; ignore nonsense
 *  and clamp to a floor of 1 so a typo cannot silently disarm a pool. */
export function intFrom(
  raw: number | string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}
