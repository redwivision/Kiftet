/**
 * A one-line summary of what a study session covers (phase 11, step 5).
 *
 * The scope picker lives on the recall screen and disappears once questions
 * exist, so a student who reloads into a narrowed session sees a score about
 * part of a chapter with no way to tell which part. This turns the stored
 * `scopeKeys` into the three things there are to say about it, and nothing
 * when there is nothing worth saying.
 */

/** The subset of a scope unit this needs — label and key, no concept list. */
export type ScopeUnitLabel = {
  key: string;
  /** The book's own label ("2.3"), or "" for an unnumbered book. */
  label: string;
};

export type ScopeStatus =
  | { kind: "whole" }
  | { kind: "one"; label: string }
  | { kind: "many"; n: number };

/**
 * Null when a chip would only repeat the header. A chapter with fewer than two
 * sections has no meaningful choice, so "Whole chapter" says nothing the title
 * does not; a chapter with real sections still gets the chip even when the
 * whole chapter is selected, because the student may have arrived through a
 * queue and forgotten what they planned.
 */
export function scopeSummary(
  units: readonly ScopeUnitLabel[] | null,
  keys: readonly string[] | null,
): ScopeStatus | null {
  if (!units || units.length < 2) return null;
  const selected = keys ?? [];
  if (selected.length === 0) return { kind: "whole" };
  if (selected.length === 1) {
    const key = selected[0];
    const index = units.findIndex((unit) => unit.key === key);
    // The stored key may name a section the chapter no longer has; count it
    // rather than label a section that isn't there.
    if (index === -1) return { kind: "many", n: selected.length };
    const unit = units[index];
    if (!unit) return { kind: "many", n: selected.length };
    return { kind: "one", label: unit.label || String(index + 1) };
  }
  return { kind: "many", n: selected.length };
}
