import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "@kiftet/db";
import { sendEmail } from "./email";
import { type AuthConfig, createAuth } from "./index";
import {
  enabledSocialProviders,
  type SocialProviderId,
  socialProviderConfig,
} from "./providers";

const BASE_ENV: AuthConfig = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-not-used-in-tests-test-secret",
  CORS_ORIGIN: "http://localhost:3000",
  REQUIRE_EMAIL_VERIFICATION: false,
  AUTH_EMAIL_TRANSPORT: "console",
};

function auth(env: Partial<AuthConfig> = {}) {
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

test("no credentials means no buttons, so Kiftet still ships with auth", () => {
  expect(enabledSocialProviders({})).toEqual([]);
  expect(enabledSocialProviders(BASE_ENV)).toEqual([]);
});

test("every origin CORS_ORIGIN trusts is also trusted by Better Auth", async () => {
  // The CORS layer and the auth middleware both split CORS_ORIGIN on commas.
  // If trustedOrigins took the raw string, a multi-origin config would pass the
  // edge and then be refused by Better Auth's own origin check — a login that
  // fails for no stated reason, on exactly the split deploy that needs the list.
  const { trustedOrigins } = (
    await auth({
      CORS_ORIGIN: "https://app.example.com/, https://app.ethiodeploy.com",
    }).$context
  ).options;

  expect(trustedOrigins).toEqual([
    "https://app.example.com",
    "https://app.ethiodeploy.com",
  ]);
  // A trailing slash is a different origin to a browser, and a lone comma must
  // not become an empty trusted entry.
  expect(trustedOrigins).not.toContain("");
});

test("desktop origins join the same list rather than replacing it", async () => {
  const { trustedOrigins } = (
    await auth({ CORS_ORIGIN: "https://app.example.com" }).$context
  ).options;
  expect(trustedOrigins).toEqual(["https://app.example.com"]);

  const withDesktop = createAuth(
    { ...BASE_ENV, CORS_ORIGIN: "https://app.example.com" },
    {} as Database,
    ["capacitor://localhost", "http://localhost"],
  );
  const { trustedOrigins: both } = (await withDesktop.$context).options;
  expect(both).toEqual([
    "https://app.example.com",
    "capacitor://localhost",
    "http://localhost",
  ]);
});

test("half a pair is not a provider", () => {
  // An id with no secret is the shape of a deploy where someone pasted the
  // public half of the credentials and stopped. Offering a button there sends
  // the student to the provider to be refused, which looks like our bug.
  expect(
    enabledSocialProviders({
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
    }),
  ).toEqual([]);
  expect(enabledSocialProviders({ FACEBOOK_CLIENT_SECRET: "shh" })).toEqual([]);
});

test("a provider appears the moment both halves are present", () => {
  expect(
    enabledSocialProviders({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    }),
  ).toEqual(["google"]);
  expect(
    enabledSocialProviders({
      FACEBOOK_CLIENT_ID: "id",
      FACEBOOK_CLIENT_SECRET: "secret",
    }),
  ).toEqual(["facebook"]);
  expect(
    enabledSocialProviders({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      FACEBOOK_CLIENT_ID: "id",
      FACEBOOK_CLIENT_SECRET: "secret",
    }),
  ).toEqual(["google", "facebook"]);
});

test("the button list and the auth config can never disagree", () => {
  // The endpoint the browser asks and the provider list Better Auth builds are
  // the same function; this asserts both still agree after any edit.
  const env = {
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    FACEBOOK_CLIENT_ID: "id",
    FACEBOOK_CLIENT_SECRET: "secret",
  };
  expect(enabledSocialProviders(env)).toEqual(
    Object.keys(socialProviderConfig(env)) as SocialProviderId[],
  );
});

test("a Facebook phone-only account still becomes a user", async () => {
  const { mapProfileToUser } = await facebookConfig();
  if (!mapProfileToUser) throw new Error("mapProfileToUser missing");

  // The ordinary case: Meta returned an address.
  const withEmail = await mapProfileToUser({
    id: "1",
    name: "Abebe",
    email: "abebe@example.com",
    picture: { data: { height: 0, is_silhouette: true, url: "", width: 0 } },
  });
  expect(withEmail).toEqual({
    email: "abebe@example.com",
    name: "Abebe",
  });

  // The case this exists for. FacebookGraphProfile types `email` as optional —
  // Meta omits it for phone-only accounts and revoked consent, both ordinary
  // here — so there is no address to read and the sign-in must still complete.
  const phoneOnly = await mapProfileToUser({
    id: "fb.7712",
    name: "Kidame",
    picture: { data: { height: 0, is_silhouette: true, url: "", width: 0 } },
  });
  expect(phoneOnly.email).toContain("fb.7712");
  expect(phoneOnly.email).toMatch(/^[^@\s]+@[^@\s]+$/);

  // Two phone-only students must not land on the same user row.
  const other = await mapProfileToUser({
    id: "fb.9999",
    name: "Selam",
    picture: { data: { height: 0, is_silhouette: true, url: "", width: 0 } },
  });
  expect(other.email).not.toBe(phoneOnly.email);

  // The union's other arm: limited-login profiles identify by `sub`, not `id`.
  // Reading only `id` here would produce "undefined@facebook.invalid" and
  // silently merge every limited-login account into one user.
  const limited = await mapProfileToUser({
    sub: "fb.4242",
    email: "limited@example.com",
    name: "Marta",
    picture: "",
  });
  expect(limited.email).toBe("limited@example.com");

  const limitedNoEmail = await mapProfileToUser({
    sub: "fb.4243",
    email: "",
    name: "Yonas",
    picture: "",
  });
  expect(limitedNoEmail.email).toContain("fb.4243");
});

test("Facebook is never asked to verify an address it cannot prove", async () => {
  const facebook = await facebookConfig();
  // Graph exposes no email_verified flag, so requiring it would block every
  // Facebook sign-in. Google is the provider to gate when verification is on.
  expect("requireEmailVerification" in facebook).toBe(false);
});

test("a student who switches providers keeps one account", async () => {
  const ctx = await auth({
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    FACEBOOK_CLIENT_ID: "id",
    FACEBOOK_CLIENT_SECRET: "secret",
  }).$context;

  const linking = ctx.options.account?.accountLinking as
    | {
        enabled?: boolean;
        trustedProviders?: string[];
        allowDifferentEmails?: boolean;
      }
    | undefined;
  // Without this, Facebook-then-Google is two accounts and the study history
  // in the first one is invisible in the app.
  expect(linking?.enabled).toBe(true);
  expect(linking?.trustedProviders).toEqual([
    "google",
    "facebook",
    "email-password",
  ]);
  // Linking on an unverified address would let anyone walk into an account.
  expect(linking?.allowDifferentEmails).toBe(false);
});

test("the installed Better Auth is the exact version the catalog promises", () => {
  // The pin in package.json is the whole upgrade guard: no caret means an
  // install cannot float to a version whose option names have moved. This
  // asserts that promise still holds, so widening the pin to a range — the one
  // edit that quietly disables it — fails here instead of at the next deploy.
  const root = JSON.parse(
    readFileSync(join(import.meta.dir, "../../../package.json"), "utf8"),
  ) as { workspaces?: { catalog?: Record<string, string> } };
  const pinned = root.workspaces?.catalog?.["better-auth"] ?? "";

  expect(pinned).toBe("1.7.3");
  // An exact version, not "1.7.3" with a range character in front of it.
  expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);

  const installed = JSON.parse(
    readFileSync(
      join(
        import.meta.dir,
        "../../../apps/web/node_modules/better-auth/package.json",
      ),
      "utf8",
    ),
  ) as { version: string };
  expect(installed.version).toBe(pinned);
});

/**
 * Resolve the Facebook provider's options. Better Auth types a provider value
 * as a (possibly async) factory, so the tests call it the same way the runtime
 * does rather than casting the factory to an options object.
 */
async function facebookConfig() {
  const entry = socialProviderConfig({
    FACEBOOK_CLIENT_ID: "id",
    FACEBOOK_CLIENT_SECRET: "secret",
  }).facebook;
  if (typeof entry !== "function") throw new Error("facebook misconfigured");
  return await entry();
}
