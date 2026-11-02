/**
 * Send one real message through the configured auth mail transport.
 *
 * The sign-up and password-reset flows can only prove delivery by creating an
 * account and waiting, which is a poor way to find out an app password or
 * sender was wrong. This sends one message to an address you choose, using the
 * exact `sendEmail` the auth routes use, and prints the provider's rejection
 * verbatim when it fails.
 *
 * Usage:
 *   bun run --cwd apps/server auth:test-email -- --to=you@example.com
 *
 * Reads apps/server/.env (Bun loads it automatically). Never prints the app
 * password or API key.
 */

import { assertEmailTransportConfigured, sendEmail } from "@kiftet/auth/email";
import { z } from "zod";

import { env } from "../src/env.server";

const args = Bun.argv.slice(2);

/** `--to=value` or `--to value`. Null when not passed. */
function flagValue(prefix: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === prefix) return args[i + 1] ?? null;
    if (arg?.startsWith(`${prefix}=`)) return arg.slice(prefix.length + 1);
  }
  return null;
}

const to = flagValue("--to");
if (!to || !z.email().safeParse(to).success) {
  console.error(
    "\nUsage: bun run --cwd apps/server auth:test-email -- --to=you@example.com\n",
  );
  process.exit(1);
}

const from =
  env.AUTH_EMAIL_FROM?.trim() ||
  (env.AUTH_EMAIL_TRANSPORT === "smtp" ? env.AUTH_SMTP_USER?.trim() : "") ||
  "(not set)";

console.log("\nKiftet email test\n");
console.log(`  transport  ${env.AUTH_EMAIL_TRANSPORT}`);
if (env.AUTH_EMAIL_TRANSPORT === "smtp") {
  console.log(
    `  server     ${env.AUTH_SMTP_HOST?.trim() || "smtp.gmail.com"}:${env.AUTH_SMTP_PORT || 587}`,
  );
}
console.log(
  `  from       ${env.AUTH_EMAIL_FROM_NAME?.trim() || "Kiftet"} <${from}>`,
);
console.log(`  to         ${to}\n`);

try {
  assertEmailTransportConfigured(env);
  await sendEmail(env, {
    to,
    subject: "Kiftet email test",
    text: [
      "This is a test message from Kiftet.",
      "",
      "If it arrived, the auth mail transport is configured correctly.",
    ].join("\n"),
  });
} catch (error) {
  console.error(
    `  FAIL ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}

if (env.AUTH_EMAIL_TRANSPORT === "smtp") {
  console.log(
    "  Sent. Check the inbox and spam folder for the test message.\n",
  );
} else if (env.AUTH_EMAIL_TRANSPORT === "brevo") {
  console.log(
    "  Sent. Check Brevo → Transactional → Logs for the delivery status.\n",
  );
} else {
  console.log("  Printed above (console transport). Nothing was sent.\n");
}
