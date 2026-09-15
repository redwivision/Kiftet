"use client";

import { VoxideClient } from "@voxide/react";

import { api } from "@/lib/api";

let activeSessionId: string | null = null;
let activeChapterId: string | null = null;

export function setSession(id: string) {
  activeSessionId = id;
}

export function setChapter(id: string) {
  activeChapterId = id;
}

function commaList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasVoxideKey(): boolean {
  return typeof import.meta !== "undefined" && Boolean(import.meta.env.VITE_VOXIDE_KEY);
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
  // Fire-and-forget: the SDK gates voice operations behind isInitialized.
  clientCache.init().catch((err) => {
    console.error("[Voxide] init failed:", err);
  });
  return clientCache;
}

// ── Capabilities ───────────────────────────────────────────────

function registerCapabilities(ai: VoxideClient): void {
  ai.register({
    listChapters: {
      description: "List all available study chapters with titles, subjects, and IDs.",
      handler: async () => {
        const chapters = await api<
          { id: string; title: string; textbookTitle: string; subject: string }[]
        >("/chapters");
        return { chapters };
      },
    },

    startStudy: {
      description:
        "Start a new study session for a chapter. Pass the chapter ID from listChapters.",
      params: { chapterId: { type: "string", required: true } },
      handler: async ({ chapterId }) => {
        const { sessionId } = await api<{ sessionId: string }>("/sessions/start", {
          method: "POST",
          body: JSON.stringify({ chapterId }),
        });
        activeSessionId = sessionId;
        activeChapterId = chapterId;
        return { sessionId, status: "ok" };
      },
    },

    recall: {
      description:
        "Record the student's spoken explanation after they finish recalling a chapter. Posts the transcript and returns a gap analysis with score.",
      params: { transcriptText: { type: "string", required: true } },
      handler: async ({ transcriptText }) => {
        if (!activeSessionId) throw new Error("No active study session. Start one first.");
        const result = await api<{
          transcriptText: string;
          gaps: { covered: string[]; missing: string[]; misconceptions: string[]; score: number };
        }>(`/sessions/${activeSessionId}/recall`, {
          method: "POST",
          body: JSON.stringify({ transcriptText }),
        });
        return {
          score: result.gaps.score,
          covered: result.gaps.covered,
          missing: result.gaps.missing,
          misconceptions: result.gaps.misconceptions,
        };
      },
    },

    getMicrolesson: {
      description:
        "Generate a short spoken micro-lesson that fixes the student's specific knowledge gaps. Pass the list of missing concepts and misconceptions from the recall gap analysis.",
      params: {
        missing: { type: "string", required: true },
        misconceptions: { type: "string" },
      },
      handler: async ({ missing, misconceptions }) => {
        if (!activeSessionId) throw new Error("No active study session.");
        const { text } = await api<{ text: string }>(`/sessions/${activeSessionId}/microlesson`, {
          method: "POST",
          body: JSON.stringify({
            missing: commaList(missing),
            misconceptions: misconceptions ? commaList(misconceptions) : [],
          }),
        });
        return { lesson: text };
      },
    },

    startRetest: {
      description:
        "Generate retest questions targeting the student's knowledge gaps. Pass missing concepts and misconceptions from the recall gap analysis.",
      params: {
        missing: { type: "string", required: true },
        misconceptions: { type: "string" },
      },
      handler: async ({ missing, misconceptions }) => {
        if (!activeSessionId) throw new Error("No active study session.");
        const { questions } = await api<{ questions: { question: string }[] }>(
          `/sessions/${activeSessionId}/retest`,
          {
            method: "POST",
            body: JSON.stringify({
              missing: commaList(missing),
              misconceptions: misconceptions ? commaList(misconceptions) : [],
            }),
          },
        );
        return {
          questions: questions.map((q) => q.question),
          count: questions.length,
        };
      },
    },

    answerRetest: {
      description:
        "Record the student's spoken retest answer and grade it. Posts the transcript and returns the updated score and gap analysis.",
      params: {
        transcriptText: { type: "string", required: true },
        missing: { type: "string", required: true },
        misconceptions: { type: "string" },
      },
      handler: async ({ transcriptText, missing, misconceptions }) => {
        if (!activeSessionId) throw new Error("No active study session.");
        const result = await api<{
          score: number;
          gaps: { covered: string[]; missing: string[]; misconceptions: string[]; score: number };
        }>(`/sessions/${activeSessionId}/retest/answer`, {
          method: "POST",
          body: JSON.stringify({
            transcriptText,
            missing: commaList(missing),
            misconceptions: misconceptions ? commaList(misconceptions) : [],
          }),
        });
        return {
          score: result.score,
          covered: result.gaps.covered,
          missing: result.gaps.missing,
          misconceptions: result.gaps.misconceptions,
        };
      },
    },

    getSessionResult: {
      description:
        "Get the before/after score comparison and improvement delta for the current study session.",
      handler: async () => {
        if (!activeSessionId) throw new Error("No active study session.");
        const result = await api<{ before: number | null; after: number | null; delta: number | null }>(
          `/sessions/${activeSessionId}/result`,
        );
        return result;
      },
    },

    completeSession: {
      description:
        "Mark the current study session as complete. Call this when the student is done studying.",
      handler: async () => {
        if (!activeSessionId) throw new Error("No active study session.");
        await api(`/sessions/${activeSessionId}/complete`, { method: "POST" });
        const id = activeSessionId;
        activeSessionId = null;
        activeChapterId = null;
        return { status: "ok", sessionId: id };
      },
    },
  });
}