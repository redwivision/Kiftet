import { afterEach, expect, test } from "bun:test";
import { onIntroDone, signalIntroDone } from "./intro-done";

/**
 * The hero film must not race the first-load intro. These pin the contract the
 * film depends on: resolve at once when there is nothing to wait for, and
 * resolve exactly once when the intro lifts.
 *
 * The module reads the DOM lazily through `typeof document` / `typeof window`,
 * so the tests swap those globals in via `Reflect` — no DOM library needed.
 */

const hadDocument = "document" in globalThis;
const hadWindow = "window" in globalThis;

afterEach(() => {
  if (!hadDocument) Reflect.deleteProperty(globalThis, "document");
  if (!hadWindow) Reflect.deleteProperty(globalThis, "window");
});

function introPlaying() {
  Reflect.set(globalThis, "document", {
    documentElement: { hasAttribute: () => true },
  });
  Reflect.set(globalThis, "window", new EventTarget());
}

test("with no intro to wait for, it answers at once", () => {
  // No DOM at all in the Bun test environment — the reduced-motion / repeat
  // session path, where the film should start immediately.
  let fired = 0;
  onIntroDone(() => fired++);
  expect(fired).toBe(1);
});

test("waits for the intro, then fires once", () => {
  introPlaying();
  let fired = 0;
  onIntroDone(() => fired++);
  expect(fired).toBe(0);
  signalIntroDone();
  expect(fired).toBe(1);
});

test("unsubscribing before the intro ends never fires", () => {
  introPlaying();
  let fired = 0;
  const unsubscribe = onIntroDone(() => fired++);
  unsubscribe();
  signalIntroDone();
  expect(fired).toBe(0);
});
