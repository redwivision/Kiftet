import { ApiError, api, apiUrl } from "@/lib/api";

const KEY = "kiftet-demo-user";
const SAMPLE_TEXTBOOK = "Biology — Cell Biology";
const SAMPLE_CHAPTER = "Cell Structure and Function";

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

// Whether this visitor should wear the demo chrome (banner, sample-answer
// on-ramp). A demo id alone is not enough: a signed-in student can still be
// carrying one — an OAuth redirect that never cleared it, or a sign-up that
// only clears it on a later screen. The session is the tie-breaker, so a
// signed-in student is never dressed as someone who "just came to look".
export function isDemoVisitor(
  session: unknown,
  demoUserId: string | null,
): boolean {
  return !session && Boolean(demoUserId);
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

async function createSampleSession(): Promise<string> {
  const chapters =
    await api<{ id: string; title: string; textbookTitle: string }[]>(
      "/chapters",
    );
  const sample = chapters.find(
    (chapter) =>
      chapter.title === SAMPLE_CHAPTER &&
      chapter.textbookTitle === SAMPLE_TEXTBOOK,
  );
  if (!sample) {
    throw new ApiError(
      404,
      "The prepared sample isn't available right now. Please try again.",
    );
  }

  const { sessionId } = await api<{ sessionId: string }>("/sessions/start", {
    method: "POST",
    body: JSON.stringify({ chapterId: sample.id, recallMode: "blurting" }),
  });
  return sessionId;
}

export async function startDemoStudy(): Promise<string> {
  await startDemo();
  try {
    return await createSampleSession();
  } catch (error) {
    if (!(error instanceof ApiError) || !error.demoExpired) throw error;
    clearDemoUser();
    await startDemo();
    return createSampleSession();
  }
}

/**
 * Throw away a demo room that no longer exists and mint a fresh one.
 *
 * A demo identity expires after a day (the server janitor collects it), but the
 * browser keeps the id in localStorage and `startDemo` would hand it straight
 * back — so a visitor whose room expired was stuck on 401 with no way out. The
 * "demo ended" prompt calls this: it clears the dead id first, so `startDemo`
 * mints a new room instead of returning the corpse.
 */
export async function restartDemo(): Promise<string> {
  clearDemoUser();
  return startDemo();
}
