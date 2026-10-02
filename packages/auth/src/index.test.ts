import { expect, test } from "bun:test";
import type { Database } from "@kiftet/db";
import { sendEmail } from "./email";
import { createAuth } from "./index";

const BASE_ENV = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-not-used-in-tests-test-secret",
  CORS_ORIGIN: "http://localhost:3000",
  REQUIRE_EMAIL_VERIFICATION: false,
  AUTH_EMAIL_TRANSPORT: "console",
};

function auth(env: Partial<typeof BASE_ENV> = {}) {
  return createAuth({ ...BASE_ENV, ...env }, {} as Database, []);
}

test("the password floor is enforced on the server, not just the form", async () => {
  const ctx = await auth().$context;
  const options = ctx.options.emailAndPassword;

  expect(options?.minPasswordLength).toBe(8);
  // scrypt hashes the entire input, so an uncapped password is free CPU for
  // anyone who can reach sign-up.
  expect(options?.maxPasswordLength).toBe(256);
});

test("a reset is a remedy: the old sessions die and the link expires", async () => {
  const ctx = await auth().$context;
  const options = ctx.options.emailAndPassword;

  expect(options?.revokeSessionsOnPasswordReset).toBe(true);
  expect(options?.resetPasswordTokenExpiresIn).toBe(60 * 30);
});

test("a reset request reaches a transport even when nobody is signed in", async () => {
  const ctx = await auth().$context;

  expect(typeof options_sendReset(ctx)).toBe("function");
  expect(typeof ctx.options.emailVerification?.sendVerificationEmail).toBe(
    "function",
  );
});

function options_sendReset(ctx: { options: Record<string, unknown> }) {
  const emailAndPassword = ctx.options.emailAndPassword as
    | { sendResetPassword?: unknown }
    | undefined;
  return emailAndPassword?.sendResetPassword;
}

test("sign-in stays reachable from a shared address", async () => {
  const ctx = await auth().$context;
  const rateLimit = ctx.options.rateLimit;

  expect(rateLimit?.enabled).toBe(true);
  // Better Auth's default for sensitive endpoints is 3 per 10s keyed by IP. In
  // this audience one public address is routinely shared by a whole class
  // behind a school NAT or a carrier CGNAT, so the floor has to be well above
  // that or a correctly-typed student gets locked out.
  expect(rateLimit?.customRules?.["/api/auth/sign-in/email"]?.max).toBe(30);
});

test("requiring verification is opt-in, and off by default", async () => {
  const off = await auth().$context;
  const on = await auth({ REQUIRE_EMAIL_VERIFICATION: true }).$context;

  expect(off.options.emailAndPassword?.requireEmailVerification).toBe(false);
  expect(on.options.emailAndPassword?.requireEmailVerification).toBe(true);
});

test("the console transport prints the link instead of dropping the mail", async () => {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    lines.push(args.join(" "));
  };
  try {
    await sendEmail(BASE_ENV, {
      to: "student@example.com",
      subject: "Reset your password",
      text: "https://example.com/reset?token=abc",
    });
  } finally {
    console.info = original;
  }

  const printed = lines.join("\n");
  expect(printed).toContain("student@example.com");
  expect(printed).toContain("https://example.com/reset?token=abc");
});

test("an unimplemented transport fails loudly instead of dropping mail", async () => {
  await expect(
    sendEmail(
      { AUTH_EMAIL_TRANSPORT: "carrier-pigeon" },
      {
        to: "student@example.com",
        subject: "Confirm your email address",
        text: "https://example.com/verify?token=abc",
      },
    ),
  ).rejects.toThrow(/no transport/);
});
