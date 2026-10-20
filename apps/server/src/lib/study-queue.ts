/**
 * The ordering rules for an ordered study queue (phase 11, step 4c).
 *
 * Kept as pure functions, separate from the route that reads them, because the
 * queue's whole behaviour is "which one is next" — and that question has more
 * edge cases than it looks: a position column can hold gaps (a dropped item),
 * duplicates (two chapters added twice), or a queue where the open session was
 * completed and several pending ones remain. Each of those decides what the
 * student sees next, and a route-level test would only ever exercise the happy
 * path a browser happens to take.
 */

export type QueueSlotStatus = "pending" | "in_progress" | "completed";

export type QueueSlot = {
  /** The study session's id. */
  id: string;
  status: QueueSlotStatus;
  /** Position within the queue; null when the row was never queued. */
  position: number | null;
};

/** Ascending position, with unpositioned rows last and ties kept stable. */
export function orderedQueueSlots<T extends QueueSlot>(
  slots: readonly T[],
): T[] {
  return [...slots].sort((a, b) => {
    const left = a.position ?? Number.MAX_SAFE_INTEGER;
    const right = b.position ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

/**
 * The chapter the student should move to next: the earliest-positioned session
 * still pending. Null when the queue is finished or has nothing left to open —
 * an `in_progress` session is *not* returned, because "next" means "after the
 * one that is open", and the open one is reached from the dashboard's resume
 * card instead.
 */
export function nextQueueSlot<T extends QueueSlot>(
  slots: readonly T[],
): T | null {
  return (
    orderedQueueSlots(slots).find((slot) => slot.status === "pending") ?? null
  );
}
