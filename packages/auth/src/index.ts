import type { Database } from "@kiftet/db";
import * as schema from "@kiftet/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      // Resolve the real client IP so auth rate limiting keys per user
      // instead of collapsing to one shared bucket when served behind
      // Cloudflare (every EthioDeploy project sits behind it). These are
      // Cloudflare's published edge ranges — refresh occasionally from
      // https://www.cloudflare.com/ips-v4 and /ips-v6.
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for", "cf-connecting-ip"],
        trustedProxies: [
          // Cloudflare IPv4
          "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22",
          "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
          "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22",
          "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
          "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
          // Cloudflare IPv6
          "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
          "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29",
          "2c0f:f248::/32",
          // Local development
          "127.0.0.1", "::1",
        ],
      },
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [],
  });
}
