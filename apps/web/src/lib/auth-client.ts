import { createAuthClient } from "better-auth/react";
import { resolveBrowserServerRoot } from "./server-url";

function getServerUrl(): string {
  if (typeof window !== "undefined") {
    return resolveBrowserServerRoot(
      window.location.hostname,
      window.location.origin,
      import.meta.env.VITE_SERVER_URL as string | undefined,
    );
  }

  const processEnv = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;

  if (processEnv?.SERVER_URL) {
    return processEnv.SERVER_URL.endsWith("/")
      ? processEnv.SERVER_URL.slice(0, -1)
      : processEnv.SERVER_URL;
  }

  const vercelUrl =
    processEnv?.VERCEL_ENV === "production"
      ? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
      : (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelUrl) {
    const origin = vercelUrl.startsWith("http")
      ? vercelUrl
      : `https://${vercelUrl}`;
    return origin.endsWith("/") ? origin.slice(0, -1) : origin;
  }

  return "http://localhost:3000";
}

console.log("[auth-client] baseURL will resolve from:", getServerUrl());
export const authClient = createAuthClient({
  // better-auth derives its route-matching base from this URL's path, so the
  // public auth path must equal the server-side mount (/api/auth everywhere)
  baseURL: new URL("/api/auth", getServerUrl()).toString(),
  // better-auth refetches the session whenever the tab/window becomes visible
  // again, and flips the atom's `isPending` back to true while it does so. On a
  // spot with no signed-in user (the demo room), that re-mounts the study route
  // and replays its startup loader every time a student switches windows or tabs
  // and comes back — a loading screen in the middle of a study loop. Freshness
  // is already handled: cross-tab sign-out arrives over the auth
  // BroadcastChannel, and every real API call resolves the session server-side.
  sessionOptions: { refetchOnWindowFocus: false },
});
