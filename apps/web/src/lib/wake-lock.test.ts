import { expect, test } from "bun:test";
import { holdScreenAwake, type ScreenWakeLockApi } from "./wake-lock";

// A browser stand-in: the OS force-releases the lock the moment the tab hides,
// so `setVisibility("hidden")` marks the held sentinel released, exactly as a
// real browser does.
function scenario() {
  let visibility: DocumentVisibilityState = "visible";
  const listeners = new Set<() => void>();
  let held: { released: boolean; release(): Promise<void> } | null = null;
  const requests: { released: boolean }[] = [];

  const api: ScreenWakeLockApi = {
    async request() {
      const sentinel = {
        released: false,
        async release() {
          sentinel.released = true;
        },
      };
      held = sentinel;
      requests.push(sentinel);
      return sentinel;
    },
  };

  const doc = {
    get visibilityState() {
      return visibility;
    },
    addEventListener(_type: "visibilitychange", listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: "visibilitychange", listener: () => void) {
      listeners.delete(listener);
    },
  };

  return {
    api,
    doc,
    requests,
    isHeld: () => held?.released === false,
    isReleased: () => held?.released === true,
    listenerCount: () => listeners.size,
    setVisibility(next: DocumentVisibilityState) {
      visibility = next;
      if (next === "hidden" && held) held.released = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("holds the screen while active and lets go on stop", async () => {
  const s = scenario();
  const handle = holdScreenAwake(s.api, s.doc);
  await tick();

  expect(s.requests.length).toBe(1);
  expect(s.isHeld()).toBe(true);
  expect(s.listenerCount()).toBe(1);

  handle.stop();
  await tick();
  expect(s.isReleased()).toBe(true);
  expect(s.listenerCount()).toBe(0);
});

test("re-acquires when the student comes back to the tab", async () => {
  const s = scenario();
  const handle = holdScreenAwake(s.api, s.doc);
  await tick();
  expect(s.requests.length).toBe(1);

  // Hidden: the browser drops the lock. Nothing to request while hidden.
  s.setVisibility("hidden");
  await tick();
  expect(s.requests.length).toBe(1);

  // Shown again: the lock is gone, so it must be taken back.
  s.setVisibility("visible");
  await tick();
  expect(s.requests.length).toBe(2);
  expect(s.isHeld()).toBe(true);

  handle.stop();
});

test("a lock granted after stop() is handed straight back", async () => {
  // The route changed while the OS was still deciding: the lock arrives too
  // late to be useful, but it must not leak.
  const grant: {
    resolve?: (sentinel: {
      released: boolean;
      release(): Promise<void>;
    }) => void;
  } = {};
  const slow: ScreenWakeLockApi = {
    request() {
      return new Promise((resolve) => {
        grant.resolve = resolve;
      });
    },
  };
  const s = scenario();
  const handle = holdScreenAwake(slow, s.doc);
  await tick();
  handle.stop();
  let released = false;
  grant.resolve?.({
    released: false,
    async release() {
      released = true;
    },
  });
  await tick();
  expect(released).toBe(true);
});

test("a refused lock is a silent no-op, never a throw", async () => {
  const refusing: ScreenWakeLockApi = {
    request() {
      return Promise.reject(new Error("NotAllowedError"));
    },
  };
  const s = scenario();
  const handle = holdScreenAwake(refusing, s.doc);
  await tick();
  expect(s.isHeld()).toBe(false);
  handle.stop();
  await tick();
});
