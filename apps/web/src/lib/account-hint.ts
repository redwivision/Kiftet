// A non-secret memory that this browser has signed in before.
//
// The session itself is an HttpOnly cookie and the auth atom starts empty on a
// fresh page load. Offline, the session read cannot answer, so routes used to
// bounce a signed-in student to /login — the one screen that certainly cannot
// work without a connection. This flag lets those routes render their cached
// room while offline. It never authenticates anything: requests still carry the
// real cookie, and the moment the session resolves to null online the routes
// redirect as before.

const KEY = "kiftet-has-account";

export function rememberAccount(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Private mode / storage disabled: losing the hint only costs a redirect.
  }
}

export function forgetAccount(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

export function hasAccountHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Stay on the cached app only when the platform is unreachable. Online, the
 *  real session remains the sole authority. */
export function canContinueOffline(online: boolean): boolean {
  return !online && hasAccountHint();
}
