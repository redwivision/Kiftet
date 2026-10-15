import { expect, test } from "bun:test";
import { isDemoVisitor, restartDemo } from "./demo";

const session = { user: { id: "u1" } };

test("an anonymous stranger with a demo id is a demo visitor", () => {
  expect(isDemoVisitor(null, "demo-123")).toBe(true);
});

test("a signed-in student is never a demo visitor, even with a stale demo id", () => {
  expect(isDemoVisitor(session, "demo-123")).toBe(false);
});

test("no demo id and no session is not a demo visitor", () => {
  expect(isDemoVisitor(null, null)).toBe(false);
});

test("a signed-in student without a demo id is not a demo visitor", () => {
  expect(isDemoVisitor(session, null)).toBe(false);
});

test("restarting a demo clears the expired id before creating a fresh room", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  const values = new Map<string, string>([["kiftet-demo-user", "expired-id"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  globalThis.fetch = new Proxy(previousFetch, {
    apply: () => {
      expect(storage.getItem("kiftet-demo-user")).toBeNull();
      return Promise.resolve(
        new Response(JSON.stringify({ userId: "fresh-id" }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    },
  });

  try {
    await expect(restartDemo()).resolves.toBe("fresh-id");
    expect(storage.getItem("kiftet-demo-user")).toBe("fresh-id");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
