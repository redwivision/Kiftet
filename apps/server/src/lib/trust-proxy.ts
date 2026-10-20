/**
 * Turn the `TRUST_PROXY` env value into an Express `trust proxy` setting.
 *
 * Express needs to be told how far to trust the `X-Forwarded-For` header before
 * it will use it to set `req.ip`. Get this wrong and every per-IP limiter in the
 * app — demo starts, waitlist signups, the waitlist's own hourly cap — silently
 * degrades from "per visitor" to "per edge server", which is effectively one
 * global bucket. That failure is invisible in local development (no proxy, so
 * `req.ip` is already the real client) and only shows up under a real launch,
 * which is exactly the worst time to find it.
 *
 * Accepted forms:
 *   - "" / undefined  → the caller's default (production "1", dev "loopback")
 *   - a positive integer string ("1", "2") → that many hops from the edge
 *   - "false" / "0"   → trust nothing; `req.ip` is the socket address
 *   - "true"          → trust everything (only safe when the app is never
 *                       reachable except through a proxy you control)
 *   - anything else   → passed through as an Express trust expression
 *                       ("loopback", "10.0.0.0/8", a comma list, …)
 */
export type TrustProxySetting = number | boolean | string;

export function resolveTrustProxy(
  raw: string | undefined,
  isProd: boolean,
): TrustProxySetting {
  const value = raw?.trim() ?? "";
  if (value === "") return isProd ? 1 : "loopback";

  const lower = value.toLowerCase();
  if (lower === "false" || value === "0") return false;
  if (lower === "true") return true;

  // A bare positive integer is a hop count, and must be a number rather than the
  // string "1" — Express reads the string form as a subnet/expression.
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return hops > 0 ? hops : false;
  }

  // "loopback", CIDRs, named subnets, comma-separated lists — hand to Express.
  return value;
}
