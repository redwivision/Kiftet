import { useEffect, useRef, useState } from "react";

import { hasAccountHint } from "@/lib/account-hint";

// Long enough for a session read to finish on a weak link, short enough that
// an expired session doesn't strand someone in a room whose API calls 401.
const RECONNECT_GRACE_MS = 12_000;

/** True briefly after coming back online with a remembered account.
 *
 *  The auth atom still holds the empty result of the read that failed while
 *  offline. Routes would otherwise bounce a signed-in student to /login the
 *  instant the network returns, before the session retry has answered. Give
 *  that retry one grace period; when it lapses the caller re-renders and can
 *  redirect if the session is still missing.
 */
export function useReconnectGrace(online: boolean): boolean {
  const wasOffline = useRef(!online);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setReconnecting(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    if (!hasAccountHint()) return;
    setReconnecting(true);
    const timer = setTimeout(() => setReconnecting(false), RECONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [online]);

  return reconnecting;
}
