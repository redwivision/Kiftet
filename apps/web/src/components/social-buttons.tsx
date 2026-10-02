import { Button } from "@kiftet/ui/components/button";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

import { useLanguage } from "./language-provider";

export type SocialProviderId = "google" | "facebook";

/**
 * The social buttons to offer, as told by the server.
 *
 * Nothing here hardcodes "google and facebook exist". A provider is drawn only
 * once the server reports it configured, so adding credentials to a deployed
 * app makes its button appear with no frontend change, and removing them takes
 * it away — rather than leaving a student clicking a button that bounces them
 * to a provider error page.
 */
function useSocialProviders(): SocialProviderId[] {
  const [providers, setProviders] = useState<SocialProviderId[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/auth-providers"))
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { providers?: SocialProviderId[] } | null) => {
        if (!cancelled && body?.providers) setProviders(body.providers);
      })
      // A failed lookup leaves the list empty, which is the correct outcome:
      // password sign-in still works and no button leads anywhere.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}

const LABELS: Record<SocialProviderId, string> = {
  google: "Google",
  facebook: "Facebook",
};

/** Drawn rather than fetched: two marks the app already ships, working offline. */
function ProviderMark({ provider }: { provider: SocialProviderId }) {
  if (provider === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0">
        <path
          fill="#1877F2"
          d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.5 5.5 0 0 1-2.39 3.61v3h3.86c2.26-2.09 3.6-5.17 3.6-8.79"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.92-2.94l-3.86-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.94H1.28v3.09A12 12 0 0 0 12 24"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27a7.2 7.2 0 0 1 0-4.54V6.64H1.28a12 12 0 0 0 0 10.72z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.64l4 3.09C6.23 6.86 8.88 4.75 12 4.75"
      />
    </svg>
  );
}

export default function SocialButtons() {
  const providers = useSocialProviders();
  const { t } = useLanguage();

  if (providers.length === 0) return null;

  const start = async (provider: SocialProviderId) => {
    // callbackURL has to be absolute and on a trusted origin, so build it from
    // where the browser actually is rather than hardcoding a host. Without it
    // Better Auth redirects to its own configured base, which is the API host —
    // so an unauthenticated student would land on a bare JSON response.
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: `${window.location.origin}/dashboard`,
    });
    if (error) {
      // Popup blocked, or the provider refused. The password form is still
      // usable, so this only reaches the console.
      console.error(`[auth] ${provider} sign-in failed`, error);
    }
  };

  return (
    // The gap above is the point: this sits directly after the submit button,
    // and with no margin the "or continue with" rule landed flush against the
    // bottom edge of a 44px button — the two read as one broken control.
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-mist text-xs">
          {t("auth-or-continue-with")}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          onClick={() => void start(provider)}
          className="w-full justify-center"
        >
          <ProviderMark provider={provider} />
          {t("auth-continue-with", { provider: LABELS[provider] })}
        </Button>
      ))}
    </div>
  );
}
