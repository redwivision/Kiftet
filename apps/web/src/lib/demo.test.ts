import { expect, test } from "bun:test";
import { isDemoVisitor, restartDemo, startDemoStudy } from "./demo";

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

test("the prepared demo starts a study session for its seeded chapter", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  const values = new Map<string, string>([["kiftet-demo-user", "demo-id"]]);
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
    apply: async (_target, _thisArg, args) => {
      const [input, init] = args;
      const path = String(input);
      expect(new Headers(init?.headers).get("X-Demo-User-Id")).toBe("demo-id");
      if (path.endsWith("/chapters")) {
        return new Response(
          JSON.stringify([
            {
              id: "sample-chapter",
              title: "Cell Structure and Function",
              textbookTitle: "Biology — Cell Biology",
            },
          ]),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      expect(path.endsWith("/sessions/start")).toBe(true);
      expect(JSON.parse(String(init?.body))).toEqual({
        chapterId: "sample-chapter",
        recallMode: "blurting",
      });
      return new Response(JSON.stringify({ sessionId: "sample-session" }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  try {
    await expect(startDemoStudy()).resolves.toBe("sample-session");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("the prepared demo replaces an expired room before starting the sample", async () => {
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
  let chapterReads = 0;
  globalThis.fetch = new Proxy(previousFetch, {
    apply: async (_target, _thisArg, args) => {
      const [input, init] = args;
      const path = String(input);
      if (path.endsWith("/demo/start")) {
        return new Response(JSON.stringify({ userId: "fresh-id" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      expect(new Headers(init?.headers).get("X-Demo-User-Id")).toBe(
        chapterReads === 0 ? "expired-id" : "fresh-id",
      );
      if (path.endsWith("/chapters")) {
        chapterReads += 1;
        if (chapterReads === 1) {
          return new Response(JSON.stringify({ error: "Expired." }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify([
            {
              id: "sample-chapter",
              title: "Cell Structure and Function",
              textbookTitle: "Biology — Cell Biology",
            },
          ]),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      expect(path.endsWith("/sessions/start")).toBe(true);
      return new Response(JSON.stringify({ sessionId: "fresh-session" }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  try {
    await expect(startDemoStudy()).resolves.toBe("fresh-session");
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
