export function resolveBrowserServerRoot(
  hostname: string,
  origin: string,
  configuredServerUrl: string | undefined,
): string {
  const envRoot = (configuredServerUrl ?? "")
    .replace(/\/api\/?$/, "")
    .replace(/\/+$/, "");
  const isLocalOverride = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
    envRoot,
  );
  const onLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

  // A localhost dev URL is only reachable from the same device. On other
  // hosts, fall back to the page origin unless a reachable API URL is set.
  if (envRoot && !(isLocalOverride && !onLocalHost)) return envRoot;
  return origin;
}
