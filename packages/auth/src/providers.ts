import type { BetterAuthOptions } from "better-auth";

// Taken from Better Auth's own options rather than hand-written, so a
// misspelled or renamed provider option is a compile error here instead of a
// key Better Auth quietly ignores. That matters most for `mapProfileToUser`
// below: an ignored fallback is invisible until the phone-only Facebook account
// it exists for cannot sign in.
//
// The provider value is a function rather than a bare object because that is
// the form Better Auth's types accept (the runtime tolerates both). Writing it
// this way means TypeScript still checks the returned object against
// FacebookOptions/GoogleOptions, so `scopes` or `mapProfileToUser` losing its
// real name is a build failure instead of a runtime surprise.
type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

export type SocialProviderId = "google" | "facebook" | "github";

export type SocialProviderEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

/**
 * Which providers to offer, and how.
 *
 * This is the one place a provider is named. The auth config and the endpoint
 * the browser asks "what can I show?" both read it, so a button cannot appear
 * for a provider that has no credentials behind it, and a provider with
 * credentials cannot go missing because nobody remembered to add a button.
 *
 * Both providers are optional. Kiftet ships and boots with neither configured —
 * a student with no Google account and no Facebook account still signs in with
 * a password — and each one appears the moment its client id and secret are
 * both set. Partial credentials are treated as absent rather than as a broken
 * provider: Better Auth only logs a warning for a missing clientId and builds
 * the provider anyway, so half a configuration would surface a button that
 * fails at the provider's own callback instead of quietly not existing.
 */
export function enabledSocialProviders(
  env: SocialProviderEnv,
): SocialProviderId[] {
  const enabled: SocialProviderId[] = [];
  if (env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim())
    enabled.push("google");
  if (env.FACEBOOK_CLIENT_ID?.trim() && env.FACEBOOK_CLIENT_SECRET?.trim())
    enabled.push("facebook");
  if (env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim())
    enabled.push("github");
  return enabled;
}

export function socialProviderConfig(env: SocialProviderEnv): SocialProviders {
  const socialProviders: SocialProviders = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = () => ({
      clientId: env.GOOGLE_CLIENT_ID as string,
      clientSecret: env.GOOGLE_CLIENT_SECRET as string,
    });
  }

  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) {
    socialProviders.facebook = () => ({
      clientId: env.FACEBOOK_CLIENT_ID as string,
      clientSecret: env.FACEBOOK_CLIENT_SECRET as string,
      scopes: ["email", "public_profile"],
      // Facebook omits the address entirely for phone-only accounts, for
      // revoked consent, and for addresses Meta has flagged — all common in
      // this market. Every user row needs an email, so fall back to the
      // app-scoped profile id rather than failing the sign-in. Better Auth
      // spreads this over the provider's own profile, so it wins.
      //
      // requireEmailVerification is deliberately NOT set: Graph exposes no
      // per-email verification flag, so there is nothing truthful to check, and
      // gating on it would block every Facebook sign-in. Google does report it
      // and is the provider to gate the day verification is switched on.
      mapProfileToUser: (profile) => {
        // FacebookProfile is a union: the Graph profile identifies an account
        // by `id`, while the limited-login / id-token profile uses `sub`. Either
        // is stable, and the union is why this cannot just read `profile.id`.
        const identifier = "id" in profile ? profile.id : profile.sub;
        // Blank counts as missing: `??` alone lets an empty string through, and
        // an empty address on a NOT NULL, format-checked user row is a failed
        // sign-in rather than a graceful one.
        const address = profile.email?.trim();
        return {
          email: address || `${identifier}@facebook.invalid`,
          name: profile.name ?? "Student",
        };
      },
    });
  }

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = () => ({
      clientId: env.GITHUB_CLIENT_ID as string,
      clientSecret: env.GITHUB_CLIENT_SECRET as string,
      scopes: ["read:user", "user:email"],
    });
  }

  return socialProviders;
}
