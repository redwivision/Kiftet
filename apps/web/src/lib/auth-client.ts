import { createAuthClient } from "better-auth/react";

// varlock's env proxy reads process.env, which does not exist in the browser,
// so VITE_SERVER_URL must come from import.meta.env (Vite wires .env there)
// or fall back to the page origin / a dev default — never crash on undefined.
function getServerUrl(): string {
  const clientUrl =
    typeof window !== "undefined"
      ? (import.meta.env.VITE_SERVER_URL as string | undefined)
      : undefined;

  if (clientUrl) {
    const normalized = clientUrl.endsWith("/") ? clientUrl.slice(0, -1) : clientUrl;
    if (!normalized.startsWith("/")) return normalized;
    if (typeof window !== "undefined") return `${window.location.origin}${normalized}`;
  }

  if (typeof window !== "undefined") return window.location.origin;

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
    const origin = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return origin;
  }

  return "http://localhost:3000";
}
export const authClient = createAuthClient({
  // better-auth derives its route-matching base from this URL's path, so the
  // public auth path must equal the server-side mount (/api/auth everywhere)
  baseURL: new URL("/api/auth", getServerUrl()).toString(),
});
