import type { Database } from "@kiftet/db";
import * as schema from "@kiftet/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { sendEmail } from "./email";
import { socialProviderConfig } from "./providers";

// Re-exported so the server can answer "which providers are on?" from the same
// function that decided which providers are on.
export {
  enabledSocialProviders,
  type SocialProviderEnv,
  type SocialProviderId,
} from "./providers";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  REQUIRE_EMAIL_VERIFICATION: boolean;
  AUTH_EMAIL_TRANSPORT: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    // Split on commas, like the CORS layer and the auth middleware already do.
    // These three read one env var, and if only two of them honour a list then
    // a comma-separated CORS_ORIGIN passes the edge and is then rejected by
    // Better Auth's own origin check — which reads as a login that fails for no
    // stated reason. Normalising trailing slashes here too, because a browser
    // sends a slash-less origin and "https://app.example/" is otherwise a
    // different origin to the one that was configured.
    trustedOrigins: [
      ...env.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean),
      ...desktopOrigins,
    ],
    socialProviders: socialProviderConfig(env),
    emailAndPassword: {
      enabled: true,
      // The sign-up form already refuses a shorter password; this is the server
      // refusing it too, because the form is a convenience, not a boundary.
      minPasswordLength: 8,
      // scrypt hashes the whole input, so an unbounded password is free CPU for
      // anyone who can reach /sign-up/email. This is the only reason to cap it;
      // a cap low enough to bother a real student would be the wrong trade.
      maxPasswordLength: 256,
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
      resetPasswordTokenExpiresIn: 60 * 30,
      // Someone who reset a password did so because they did not control the
      // account. Leaving the thief's session alive would make the reset a
      // suggestion rather than a remedy.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Reset your password",
          text: [
            "Someone asked to reset the password on this account.",
            "",
            url,
            "",
            "The link works once, and expires in 30 minutes.",
            "",
            "If that was not you, nothing has changed — you can ignore this, and the account is still yours.",
          ].join("\n"),
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Confirm your email address",
          text: [
            "Confirm this address to finish setting up your account.",
            "",
            url,
            "",
            "The link expires in 24 hours. If you did not sign up, ignore this.",
          ].join("\n"),
        });
      },
    },
    rateLimit: {
      enabled: true,
      // In-memory on purpose: there is one long-running Express server, and the
      // rateLimit table does not exist in the schema. Memory means a restart
      // clears the counters, which is an acceptable price for not carrying a
      // table whose only job is to throttle credential stuffing.
      storage: "memory",
      window: 60,
      max: 60,
      // Better Auth's default for sensitive endpoints is 3 requests per 10
      // seconds, keyed by IP. These are deliberately more generous, because in
      // this audience the shared address is the normal case rather than the
      // attack: a school behind one NAT, or a carrier CGNAT, hands the same
      // public IP to every student on it, and a limit tuned to stop guessing
      // ends up locking out a class that is signing in correctly. A student
      // who cannot log in has no flow to fall back on, so the dial is set
      // toward the lockout, and raised further if the noise shows it needs to be.
      customRules: {
        "/api/auth/sign-in/email": { window: 60, max: 30 },
        "/api/auth/sign-up/email": { window: 60, max: 10 },
        "/api/auth/request-password-reset": { window: 60, max: 5 },
      },
    },
    account: {
      // A student who signs up with Facebook and later tries Google with the
      // same address must land on the account they already have, not a second
      // one with their study history missing. Trusting the providers covers
      // that; allowDifferentEmails stays off so an unverified address can never
      // be used to walk into an existing account.
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "facebook", "email-password"],
        allowDifferentEmails: false,
      },
    },
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
          "173.245.48.0/20",
          "103.21.244.0/22",
          "103.22.200.0/22",
          "103.31.4.0/22",
          "141.101.64.0/18",
          "108.162.192.0/18",
          "190.93.240.0/20",
          "188.114.96.0/20",
          "197.234.240.0/22",
          "198.41.128.0/17",
          "162.158.0.0/15",
          "104.16.0.0/13",
          "104.24.0.0/14",
          "172.64.0.0/13",
          "131.0.72.0/22",
          // Cloudflare IPv6
          "2400:cb00::/32",
          "2606:4700::/32",
          "2803:f800::/32",
          "2405:b500::/32",
          "2405:8100::/32",
          "2a06:98c0::/29",
          "2c0f:f248::/32",
          // Local development
          "127.0.0.1",
          "::1",
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
