"use client";

import { VoxideClient } from "@voxide/react";

import { api } from "@/lib/api";
import { detectSessionEnd } from "@/lib/intent";

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

export function getVoxideClient(): VoxideClient | null {
	if (typeof window === "undefined") return null;
	if (clientCache) return clientCache;
	const key = (import.meta.env.VITE_VOXIDE_KEY as string) ?? "";
	if (!key.trim()) return null;
	clientCache = new VoxideClient({ publicKey: key.trim() });
	registerCapabilities(clientCache);
	clientCache.bindState(() => ({
		currentPage: typeof location !== "undefined" ? location.pathname : "/",
		activeSessionId,
		activeChapterId,
	}));
	clientCache.registerState({
		studyContext: () => studyContext ?? {},
	});
	clientCache.setFallback({
		message:
			"The study loop on screen — the recall, the diagnosis, the short version, the retest — is driven by the page, and I help by reading things back in a natural voice. Recite the chapter out loud or answer the question on screen, and when you're finished just tell me and I'll close the session.",
		suggestions: [
			"I'm done for now",
			"Close the session",
			"Take me back to the dashboard",
		],
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
		await client.sendText(
			`Please read the short piece below to the student aloud with your natural voice, exactly as written, slowly and clearly, then stop without adding anything:\n\n${text}`,
		);
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
		client.sendText("Stop reading right now and stay quiet.");
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
