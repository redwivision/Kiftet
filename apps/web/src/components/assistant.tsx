"use client";

import { VoxideClient } from "@voxide/react";

import { api } from "@/lib/api";
import { detectSessionEnd } from "@/lib/intent";
import { t as translate } from "@/lib/messages";
import {
  getVoiceLanguage,
  onVoiceLanguageChange,
  voiceLocale,
} from "@/lib/voice";

let activeSessionId: string | null = null;
let activeChapterId: string | null = null;

// Grounding for the voice agent: the current study context is re-read on every
// tool call and surfaced to the model, so it stops answering mid-recall with
// generic filler and keeps to the study loop (see docs/howItWorks/dataflow.md §5).
let studyContext: Record<string, unknown> | null = null;

// True while a recall/answer capture is in progress on screen. While it is,
// the on-screen capture owns end-of-speech detection ("that's all I remember")
// so those cues finalize the answer instead of being read as a whole-session
// goodbye. When false, a farewell ("bye", "I'm done studying") closes the
// session end-to-end.
let captureActive = false;

// Guards against two end cues (a spoken "bye" plus the model's own
// completeSession call, say) racing to close the same session twice.
let endingSession = false;

export function setSession(id: string) {
  activeSessionId = id;
}

export function setChapter(id: string) {
  activeChapterId = id;
}

export function setStudyContext(ctx: Record<string, unknown> | null) {
  studyContext = ctx;
}

export function setCaptureActive(active: boolean) {
  captureActive = active;
}

export function isCaptureActive(): boolean {
  return captureActive;
}

export function hasVoxideKey(): boolean {
  return (
    typeof import.meta !== "undefined" &&
    Boolean(import.meta.env.VITE_VOXIDE_KEY)
  );
}

// ── Client (lazy, browser-only) ─────────────────────────────────
let clientCache: VoxideClient | null = null;

// Instructions sent *to* the agent rather than shown to the student, so they
// live here instead of messages.ts. They follow the language pref because the
// agent reads them to decide how to speak: an English instruction in front of
// an Amharic passage is how you get an Amharic lesson read aloud in an English
// voice.
const READ_PROMPT = {
  en: (text: string) =>
    `Please read the short piece below to the student aloud with your natural voice, exactly as written, slowly and clearly, then stop without adding anything:\n\n${text}`,
  am: (text: string) =>
    `ከዚህ በታች ያለውን አጭሩ ክፍል በተፈጥሮዎን ድምጽ በደግሞ ለተማሪው በአፖድ አንብብ፤ በትክክል እንደተጻፈው፣ በዝግታ እና በግልጽ በመናገር፤ ከዚያ ግን ምንም ሳትጨምር ያቁም።\n\n${text}`,
};

const STOP_PROMPT = {
  en: "Stop reading right now and stay quiet.",
  am: "አሁን የሚቀርብህን ሁልጊ አቁምና ጸጥታ ቀምብ።",
};

// The agent's fallback is spoken aloud, so it is user-facing copy and goes
// through the same message table as the rest of the UI.
function applyFallback(client: VoxideClient): void {
  const lang = getVoiceLanguage();
  client.setFallback({
    message: translate(lang, "voice-agent-greeting"),
    suggestions: [
      translate(lang, "voice-agent-done"),
      translate(lang, "voice-agent-close"),
      translate(lang, "voice-agent-dashboard"),
    ],
  });
}

export function getVoxideClient(): VoxideClient | null {
  if (typeof window === "undefined") return null;
  if (clientCache) return clientCache;
  const key = (import.meta.env.VITE_VOXIDE_KEY as string) ?? "";
  if (!key.trim()) return null;
  // The language is set here and nowhere else, so without it the SDK falls back
  // to en-US for both recognition and speech — which is how an Amharic student
  // ended up with a fully Amharic screen and an English voice.
  clientCache = new VoxideClient({
    publicKey: key.trim(),
    language: voiceLocale(),
  });
  registerCapabilities(clientCache);
  clientCache.bindState(() => ({
    currentPage: typeof location !== "undefined" ? location.pathname : "/",
    activeSessionId,
    activeChapterId,
  }));
  clientCache.registerState({
    studyContext: () => studyContext ?? {},
  });
  applyFallback(clientCache);
  // The client is cached for the life of the page, so a student who switches to
  // አማርኛ mid-session would otherwise keep being heard in en-US until a reload.
  // No unsubscribe: the cache is never discarded.
  onVoiceLanguageChange(() => {
    clientCache?.setLanguage(voiceLocale());
    if (clientCache) applyFallback(clientCache);
  });
  // End the whole session when the student says goodbye — no tap needed.
  clientCache.on("message", (payload: unknown) => {
    void maybeAutoEndSession(payload);
  });
  // Fire-and-forget: the SDK gates voice operations behind isInitialized.
  clientCache.init().catch((err) => {
    console.error("[Voxide] init failed:", err);
  });
  return clientCache;
}

/** Close a study session for real: mark it complete, forget the active
 *  session/chapter, hang up the voice, and send the student back to the
 *  dashboard. The hang-up and navigation are deferred `delayMs` so a close
 *  triggered by the agent's own completeSession tool can deliver its result
 *  back to the model first. */
async function endVoiceSession(delayMs = 0): Promise<string | null> {
  if (endingSession) return activeSessionId;
  endingSession = true;
  try {
    const id = activeSessionId;
    if (id) {
      await api(`/sessions/${id}/complete`, { method: "POST" });
    }
    activeSessionId = null;
    activeChapterId = null;
    studyContext = null;
    captureActive = false;
    window.setTimeout(() => {
      clientCache?.disconnect();
      if (typeof window !== "undefined") {
        window.location.assign("/dashboard");
      }
    }, delayMs);
    return id;
  } finally {
    endingSession = false;
  }
}

// Farewells ("bye", "I'm done studying", "close") end the session on their
// own. Guarded by captureActive so a mid-recall "I'm done" still finalizes the
// answer instead of wiping the session.
async function maybeAutoEndSession(payload: unknown): Promise<void> {
  if (captureActive) return;
  if (typeof payload !== "object" || payload === null) return;
  const msg = payload as { role?: string; text?: string; partial?: boolean };
  if (msg.role !== "user" || !msg.text || msg.partial) return;
  if (!activeSessionId) return;
  if (!detectSessionEnd(msg.text)) return;
  await endVoiceSession();
}

/** Read `text` aloud with the agent's natural voice. Returns false when the
 *  voice layer isn't available so the caller can fall back to browser TTS. */
export async function speakViaVoxide(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!hasVoxideKey()) return false;
  try {
    const client = getVoxideClient();
    if (!client) return false;
    if (!client.isInitialized) await client.init();
    if (!client.isInitialized) return false;
    await client.connect();
    const lang = getVoiceLanguage();
    await client.sendText(READ_PROMPT[lang](text));
    return true;
  } catch (err) {
    console.error("[Voxide] natural speech read-out failed:", err);
    return false;
  }
}

/** Cut off an agent read-back mid-speech. Sends a cooperative stop first,
 *  then hangs up the voice channel as a hard stop so no audio keeps playing
 *  behind the scene. A later speakViaVoxide reconnects on demand. */
export function stopVoiceNarration(): void {
  const client = clientCache;
  if (!client) return;
  try {
    client.sendText(STOP_PROMPT[getVoiceLanguage()]);
    client.disconnect();
  } catch {
    // Best-effort: narration has no API to ask the agent to halt.
  }
}

// ── Capabilities ───────────────────────────────────────────────

function registerCapabilities(ai: VoxideClient): void {
  // The study loop (recall → diagnose → lesson → retest → result) is owned
  // by the on-screen UI, which grades directly against the API. The agent
  // intentionally does NOT re-implement any of it — a second master of the
  // same endpoints would produce duplicate attempts and out-of-sync phases
  // (see docs/howItWorks/dataflow.md §5). The single capability the agent keeps is
  // closing the session, so a spoken "I'm done" ends the whole loop.
  ai.register({
    completeSession: {
      description:
        "Mark the current study session as complete. Call this when the student is done studying, says goodbye, or wants to close the session. It ends the voice and returns to the dashboard.",
      handler: async () => {
        if (!activeSessionId) throw new Error("No active study session.");
        const id = activeSessionId;
        // Fire-and-forget with a delay so this tool result is delivered
        // to the model before the client hangs up and navigates away.
        void endVoiceSession(150);
        return { status: "ok", sessionId: id };
      },
    },
  });
}
