/**
 * The first-load intro is the page's first impression; the hero film is its
 * second. They must not race — the film waits until the intro has lifted, so a
 * visitor never misses the opening playing underneath the overlay.
 *
 * Whether the intro plays is decided before first paint by a `data-intro`
 * attribute on <html> (see the inline script in root.tsx). This subscribes to
 * the moment that attribute is removed, and answers immediately when there was
 * no intro to wait for: a repeat session, reduced motion, or the server render.
 */
const INTRO_DONE = "kiftet:intro-done";

export function onIntroDone(callback: () => void): () => void {
  if (typeof document === "undefined") {
    callback();
    return () => {};
  }
  if (!document.documentElement.hasAttribute("data-intro")) {
    callback();
    return () => {};
  }
  const handler = () => callback();
  window.addEventListener(INTRO_DONE, handler, { once: true });
  return () => window.removeEventListener(INTRO_DONE, handler);
}

export function signalIntroDone(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INTRO_DONE));
}
