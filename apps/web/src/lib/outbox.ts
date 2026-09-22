// Bet 3 (STRATEGY.md): the submission outbox that survives a dead connection.
//
// When a graded submission can't reach the server (a network failure, not a
// server rejection), it is parked here in IndexedDB with its ORIGINAL
// attemptId. When the student is back online the items replay through the same
// endpoints, and the server's existing insertAttemptOnce idempotency (keyed on
// attemptId per session) guarantees a replay lands exactly once — retries
// never double-grade or double-count.
//
// Honesty by construction: nothing here stores or implies a score. Items are
// "saved, will be graded" until a successful flush removes them.

import { ApiError, api } from "@/lib/api";
import { allStore, dbAvailable, putStore, removeStore } from "@/lib/store";

export type OutboxKind = "recall" | "answer";

export type OutboxItem = {
	id: string;
	kind: OutboxKind;
	sessionId: string;
	/** The server-side idempotency key — reused verbatim on replay. */
	attemptId: string;
	/** Endpoint body minus attemptId; replay re-adds it. */
	payload: {
		transcriptText: string;
		questionIndex?: number;
	};
	createdAt: number;
};

export async function listOutbox(): Promise<OutboxItem[]> {
	if (!dbAvailable()) return [];
	const items = await allStore<OutboxItem>("outbox");
	return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function enqueueOutbox(item: OutboxItem): Promise<void> {
	if (!dbAvailable()) return;
	await putStore("outbox", item, item.id);
	notifyChange();
}

export async function removeOutbox(id: string): Promise<void> {
	if (!dbAvailable()) return;
	await removeStore("outbox", id);
	notifyChange();
}

// ── Reactive count (the offline banner subscribes so a flushed queue
//    disappears on its own) ─────────────────────────────────────

type Listener = (count: number) => void;

const listeners = new Set<Listener>();

function notifyChange(): void {
	// Fire-and-forget: a count badge is never worth blocking a submit on.
	void listOutbox().then((items) => {
		const count = items.length;
		for (const listener of listeners) listener(count);
	});
}

export function subscribeOutbox(listener: Listener): () => void {
	listeners.add(listener);
	void listOutbox().then((items) => listener(items.length));
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Replays every queued item through its endpoint, in order, reusing each
 * item's original attemptId. Returns how many items are still pending after
 * the pass. Stops early on the first network failure (we're probably still
 * offline); leaves items queued on rate-limit or auth failures so a later
 * pass can try again, and drops items the server says can never succeed
 * (session gone, invalid body) so the queue can't wedge forever.
 */
export async function flushOutbox(): Promise<number> {
	if (!dbAvailable()) return 0;
	const items = await listOutbox();
	for (const item of items) {
		try {
			const path =
				item.kind === "recall"
					? `/sessions/${item.sessionId}/recall`
					: `/sessions/${item.sessionId}/retest/answer`;
			await api(path, {
				method: "POST",
				body: JSON.stringify({ ...item.payload, attemptId: item.attemptId }),
			});
			await removeOutbox(item.id);
		} catch (error) {
			const status = error instanceof ApiError ? error.status : 0;
			if (status === 0) break; // still offline — keep everything
			if (status === 429 || status === 401 || status === 403) continue; // retry later
			await removeOutbox(item.id); // 400/404/410… it can never grade
		}
	}
	notifyChange();
	return (await listOutbox()).length;
}

/** Does any queued item belong to this session? */
export async function hasQueuedForSession(sessionId: string): Promise<boolean> {
	const items = await listOutbox();
	return items.some((i) => i.sessionId === sessionId);
}
