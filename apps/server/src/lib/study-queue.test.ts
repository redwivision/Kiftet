import { describe, expect, test } from "bun:test";
import { nextQueueSlot, orderedQueueSlots } from "./study-queue";

const slot = (
  id: string,
  status: "pending" | "in_progress" | "completed",
  position: number | null,
) => ({ id, status, position });

describe("an ordered study queue", () => {
  test("orders by position, not by insertion or id", () => {
    const slots = [
      slot("c", "pending", 3),
      slot("a", "in_progress", 1),
      slot("b", "pending", 2),
    ];
    expect(orderedQueueSlots(slots).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  test("the next chapter is the earliest pending one", () => {
    const slots = [
      slot("a", "completed", 1),
      slot("b", "in_progress", 2),
      slot("c", "pending", 3),
      slot("d", "pending", 4),
    ];
    expect(nextQueueSlot(slots)?.id).toBe("c");
  });

  test("an open session is not the next chapter", () => {
    // The student is already in "a"; "next" must mean after it, or the
    // handoff button would send them back into the session they just finished.
    const slots = [slot("a", "in_progress", 1), slot("b", "pending", 2)];
    expect(nextQueueSlot(slots)?.id).toBe("b");
  });

  test("a finished queue has no next chapter", () => {
    expect(
      nextQueueSlot([slot("a", "completed", 1), slot("b", "completed", 2)]),
    ).toBeNull();
    expect(nextQueueSlot([])).toBeNull();
  });

  test("a gap from a dropped chapter does not shift the order", () => {
    // Chapter 2 was removed (positions 1 and 3 remain), so the next one is
    // still the earliest pending by position.
    const slots = [slot("a", "completed", 1), slot("c", "pending", 3)];
    expect(nextQueueSlot(slots)?.id).toBe("c");
  });

  test("rows without a position sort last", () => {
    const slots = [slot("loose", "pending", null), slot("a", "pending", 1)];
    expect(orderedQueueSlots(slots).map((s) => s.id)).toEqual(["a", "loose"]);
  });

  test("equal positions keep their incoming order", () => {
    const slots = [slot("first", "pending", 1), slot("second", "pending", 1)];
    expect(orderedQueueSlots(slots).map((s) => s.id)).toEqual([
      "first",
      "second",
    ]);
  });
});
