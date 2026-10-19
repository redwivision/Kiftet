/**
 * How a recall set is spread across a chapter, so a question set is a sweep of
 * *every lesson* rather than eight questions that happen to cluster on the first
 * few ideas.
 *
 * Kiftet has no lesson table. What it has is the book's own numbering, carried
 * onto each concept at ingest (`mergeConcepts` keeps the label, so a concept can
 * read "2.3.1 The internal structure of a leaf"). That numbering is the closest
 * honest thing to a lesson: the first two segments ("2.3") name the section a
 * concept belongs to. This module groups the ordered concepts by that key, so
 * each surviving group is a lesson the set must touch at least once. A book whose
 * concepts carry no numbering at all is chunked into equal windows instead,
 * because even then "cover the whole chapter" must not silently become "cover the
 * first four ideas".
 *
 * Pure and dependency-light on purpose — no database, no provider — so the
 * spreading can be tested by itself.
 */

import {
  RECALL_MAX_QUESTIONS,
  RECALL_MIN_QUESTIONS,
  type RecallFormat,
  recallFormatPlan,
} from "./questions";
import type { SubjectFamily } from "./subject-strategy";

/** One lesson's worth of covering material: the concepts that fall under one
 *  section, plus the objectives assigned to it. */
export type RecallUnit = {
  /** Stable key — the section number ("2.3"), or a synthetic key when the book
   *  has no numbering. Used to check coverage and to merge units. */
  key: string;
  /** The book's own label for the unit ("2.3"), or "" when there was none. The
   *  UI turns this into "Section 2.3"; a bare number would read as a mystery. */
  label: string;
  concepts: string[];
  objectives: string[];
};

/** One question the plan expects: the lesson it belongs to, the concept to probe
 *  (so the writer names a real idea), and the format it must be answered in. The
 *  format is fixed here, not left to the writer, so the global mix holds however
 *  the work is split across providers. */
export type RecallSlot = {
  unit: RecallUnit;
  concept: string;
  format: RecallFormat;
};

/** The key a wholly unnumbered chapter's synthetic unit gets, and the fallback
 *  key for a concept that follows numbered ones without carrying its own. */
const UNGROUPED = "__ungrouped";

const NUMBERING = /^\s*(\d+(?:\.\d+)*)/;

/**
 * The section a concept belongs to: the first two segments of its leading
 * numbering ("2.3.1 …" → "2.3", "2.3 …" → "2.3", "2 …" → "2"). Null when the
 * label carries no number, which is the cue to fall back to windows.
 */
export function sectionKey(conceptText: string): string | null {
  const match = NUMBERING.exec(conceptText);
  if (!match?.[1]) return null;
  const segments = match[1].split(".").filter(Boolean);
  if (segments.length === 0) return null;
  return segments.slice(0, 2).join(".");
}

/** The number of concepts a synthetic window should hold when a book has no
 *  numbering: small enough to be a real "lesson", big enough not to make a
 *  question per sentence. */
const WINDOW_SIZE = 3;

/**
 * Group ordered concepts into coverage units and hand the chapter-level
 * objectives out to them.
 *
 * Numbered concepts lead, in the book's order, because that order is the
 * sequence the chapter teaches in. Objectives — which the book states once for
 * the whole chapter, not per section — are dealt round-robin across the units so
 * every unit's questions can hold the student to some of the author's contract
 * rather than none of it.
 */
export function buildCoverageUnits(
  concepts: readonly { conceptText: string }[],
  objectives: readonly string[],
): RecallUnit[] {
  const units = groupBySection(concepts);
  dealObjectives(units, objectives);
  return mergeDown(units);
}

function groupBySection(
  concepts: readonly { conceptText: string }[],
): RecallUnit[] {
  const numbered = concepts.filter((c) => sectionKey(c.conceptText) !== null);
  // Every concept unnumbered: split into ordered windows instead of one unit, so
  // the set still spreads across the chapter's length.
  if (numbered.length === 0) {
    return windowUnits(concepts);
  }
  const byKey = new Map<string, RecallUnit>();
  const ordered: RecallUnit[] = [];
  for (const { conceptText } of concepts) {
    const key = sectionKey(conceptText) ?? UNGROUPED;
    let unit = byKey.get(key);
    if (!unit) {
      unit = {
        key,
        label: key === UNGROUPED ? "" : key,
        concepts: [],
        objectives: [],
      };
      byKey.set(key, unit);
      ordered.push(unit);
    }
    unit.concepts.push(conceptText);
  }
  return ordered;
}

function windowUnits(
  concepts: readonly { conceptText: string }[],
): RecallUnit[] {
  const units: RecallUnit[] = [];
  for (let i = 0; i < concepts.length; i += WINDOW_SIZE) {
    const slice = concepts.slice(i, i + WINDOW_SIZE);
    units.push({
      key: `w${units.length + 1}`,
      label: "",
      concepts: slice.map((c) => c.conceptText),
      objectives: [],
    });
  }
  return units;
}

function dealObjectives(
  units: RecallUnit[],
  objectives: readonly string[],
): void {
  if (units.length === 0) return;
  const numbered = new Map(units.map((u) => [u.key, u]));
  const loose: string[] = [];
  for (const objective of objectives) {
    const key = sectionKey(objective);
    const unit = key ? numbered.get(key) : undefined;
    if (unit) unit.objectives.push(objective);
    else loose.push(objective);
  }
  // Objectives with no section of their own ride round-robin, so no single unit
  // absorbs the whole chapter's contract.
  loose.forEach((objective, i) => {
    units[i % units.length]?.objectives.push(objective);
  });
}

/**
 * Fold adjacent units together until there are no more than `RECALL_MAX_QUESTIONS`
 * of them, so every surviving lesson can still be asked about at least once
 * without the set outgrowing its ceiling. The smallest adjacent pair merges each
 * time, which keeps the large sections intact and absorbs the fragments.
 */
function mergeDown(units: RecallUnit[]): RecallUnit[] {
  const out = [...units];
  while (out.length > RECALL_MAX_QUESTIONS) {
    let bestAt = 0;
    let bestSize = Number.POSITIVE_INFINITY;
    for (let i = 0; i < out.length - 1; i++) {
      const size =
        (out[i]?.concepts.length ?? 0) + (out[i + 1]?.concepts.length ?? 0);
      if (size < bestSize) {
        bestSize = size;
        bestAt = i;
      }
    }
    const left = out[bestAt];
    const right = out[bestAt + 1];
    if (!left || !right) break;
    out.splice(bestAt, 2, {
      key: left.key,
      label: left.label || right.label,
      concepts: [...left.concepts, ...right.concepts],
      objectives: [...left.objectives, ...right.objectives],
    });
  }
  return out;
}

/**
 * Narrow units to the sections a session is scoped to (phase 11, step 4).
 * An empty selection, or one whose keys no longer exist (a re-read chapter can
 * renumber), means the whole chapter — never an empty quiz.
 */
export function scopedUnits<T extends { key: string }>(
  units: readonly T[],
  scopeKeys: readonly string[] | null | undefined,
): T[] {
  if (!scopeKeys?.length) return [...units];
  const wanted = new Set(scopeKeys);
  const kept = units.filter((unit) => wanted.has(unit.key));
  return kept.length > 0 ? kept : [...units];
}

/** The concepts inside a set of scoped sections, in the chapter's order.
 *  Sections are kept whole, so a topic is never half-diagnosed. An empty or
 *  stale selection means the whole chapter (see `scopedUnits`). */
export function scopedConcepts<T extends { conceptText: string }>(
  concepts: readonly T[],
  scopeKeys: readonly string[] | null | undefined,
): T[] {
  if (!scopeKeys?.length) return [...concepts];
  const units = buildCoverageUnits(concepts, []);
  const inScope = new Set(
    scopedUnits(units, scopeKeys).flatMap((unit) => unit.concepts),
  );
  return concepts.filter((concept) => inScope.has(concept.conceptText));
}

/** How many questions a chapter of `unitCount` lessons should ask: the floor,
 *  scaled up to one per lesson, and never past the ceiling. */
export function recallQuestionCount(unitCount: number): number {
  return Math.min(
    RECALL_MAX_QUESTIONS,
    Math.max(RECALL_MIN_QUESTIONS, unitCount),
  );
}

/**
 * Turn the units into the exact list of questions to write: a format (the
 * global mix, fixed server-side), a lesson, and a concept to probe. Every unit
 * is guaranteed at least one slot; the remaining slots go to the preferred
 * lessons first (the ones the student's blurting already flagged), then are
 * dealt round-robin so no lesson takes them all. The sequence round-robins the
 * units too, so the set walks the chapter instead of clustering.
 */
export function planRecallSlots(
  units: readonly RecallUnit[],
  count: number,
  family: SubjectFamily,
  preferredKeys: ReadonlySet<string> = new Set(),
): RecallSlot[] {
  if (units.length === 0) return [];
  const formats = recallFormatPlan(count, family);
  const ordered = [...units].sort((a, b) => {
    const pa = preferredKeys.has(a.key) ? 0 : 1;
    const pb = preferredKeys.has(b.key) ? 0 : 1;
    return pa - pb;
  });
  const counts = new Map(ordered.map((u) => [u.key, 1]));
  let extra = count - ordered.length;
  for (let i = 0; extra > 0; i++, extra--) {
    const unit = ordered[i % ordered.length];
    if (!unit) break;
    counts.set(unit.key, (counts.get(unit.key) ?? 1) + 1);
  }
  const remaining = new Map(counts);
  const sequence: RecallUnit[] = [];
  while (sequence.length < count) {
    let placed = false;
    for (const unit of ordered) {
      if ((remaining.get(unit.key) ?? 0) <= 0) continue;
      sequence.push(unit);
      remaining.set(unit.key, (remaining.get(unit.key) ?? 0) - 1);
      placed = true;
      if (sequence.length >= count) break;
    }
    if (!placed) break;
  }
  const usedConcepts = new Map<string, number>();
  return sequence.map((unit, i) => {
    const at = usedConcepts.get(unit.key) ?? 0;
    usedConcepts.set(unit.key, at + 1);
    const concept =
      unit.concepts.length > 0
        ? (unit.concepts[at % unit.concepts.length] as string)
        : (unit.objectives[at % Math.max(1, unit.objectives.length)] ?? "");
    return { unit, concept, format: formats[i] ?? "multiple_choice" };
  });
}

/** How many slots travel in one provider call. Small enough that each call is a
 *  short, focused prompt the model cannot skim, which is the point of splitting
 *  the work at all. */
export const RECALL_CHUNK_SIZE = 5;

export function chunkRecallSlots(
  slots: readonly RecallSlot[],
  size: number = RECALL_CHUNK_SIZE,
): RecallSlot[][] {
  const size_ = Math.max(1, size);
  const chunks: RecallSlot[][] = [];
  for (let i = 0; i < slots.length; i += size_) {
    chunks.push(slots.slice(i, i + size_));
  }
  return chunks;
}

/** concept (normalized) → the key of the unit it belongs to, so a written
 *  question can be traced back to the lesson it covers. */
export function unitByConcept(
  units: readonly RecallUnit[],
): Map<string, RecallUnit> {
  const index = new Map<string, RecallUnit>();
  for (const unit of units) {
    for (const concept of unit.concepts) index.set(normalize(concept), unit);
  }
  return index;
}

/** The unit a written question covers, matched on its target concept; null when
 *  the concept is not one we planned (the writer invented one, or it was
 *  reconciled to a gap name). */
export function unitForConcept(
  index: ReadonlyMap<string, RecallUnit>,
  conceptText: string | undefined,
): RecallUnit | null {
  if (!conceptText) return null;
  return index.get(normalize(conceptText)) ?? null;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
