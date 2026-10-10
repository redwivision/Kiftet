// Desktop keyboard shortcuts for the loop. The predicates here are pure so the
// decisions — "does a bare Space belong to this element?" — are testable
// without a DOM.

/** True when focus is in a field where a bare Space belongs to the field. */
export function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * True when focus is on something that should answer Space itself — a button or
 * a link activates on Space natively, a field inserts a space. In those cases
 * the ring must not steal the key.
 */
export function isInteractiveTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "BUTTON" || tag === "A" || isEditableTarget(el);
}

/** Space toggles the ring only when it is not already the business of whatever
 *  has focus. */
export function shouldHandleSpace(el: Element | null): boolean {
  return !isInteractiveTarget(el);
}
