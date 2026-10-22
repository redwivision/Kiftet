import { expect, test } from "bun:test";
import { api } from "./api";

test("only a 401 while a demo identity is attached marks the demo as expired", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  let demoUser: string | null = "demo-id";
  let response = new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => demoUser,
      },
    },
  });
  globalThis.fetch = new Proxy(previousFetch, {
    apply: () => Promise.resolve(response),
  });

  try {
    await expect(api("/chapters")).rejects.toMatchObject({
      status: 401,
      demoExpired: true,
    });

    demoUser = null;
    await expect(api("/chapters")).rejects.toMatchObject({
      status: 401,
      demoExpired: false,
    });

    demoUser = "demo-id";
    response = new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
    await expect(api("/chapters")).rejects.toMatchObject({
      status: 403,
      demoExpired: false,
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("AI quota errors expose their retry window to the study screen", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: () => null } },
  });
  globalThis.fetch = new Proxy(previousFetch, {
    apply: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code: "AI_QUOTA_EXCEEDED",
            error: "Quota reached",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "17",
            },
          },
        ),
      ),
  });

  try {
    await expect(api("/sessions/test/recall")).rejects.toMatchObject({
      status: 429,
      code: "AI_QUOTA_EXCEEDED",
      retryAfterSeconds: 17,
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
