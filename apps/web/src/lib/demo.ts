import { apiUrl } from "@/lib/api";

const KEY = "kiftet-demo-user";

export function getDemoUser(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setDemoUser(userId: string): void {
  window.localStorage.setItem(KEY, userId);
}

export function clearDemoUser(): void {
  window.localStorage.removeItem(KEY);
}

export async function startDemo(): Promise<string> {
  // Already have a demo room in this browser — hand back the cached id instead
  // of fabricating another one.
  //
  // This is what makes the server-side per-IP limit safe to tighten. Previously
  // every click minted a fresh user, textbook, chapter and ten concept rows,
  // so a returning visitor cost as much as a first-time one, and the limit had
  // to stay loose enough for "the same person clicking five times" — which is
  // exactly the headroom a script needs. Returning visitors now cost nothing.
  const existing = getDemoUser();
  if (existing) return existing;

  const res = await fetch(apiUrl("/demo/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Couldn't start the demo.");
  }
  const { userId } = (await res.json()) as { userId: string };
  setDemoUser(userId);
  return userId;
}
