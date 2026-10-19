/**
 * The exam-readiness verdict: one honest pass/fail across the whole chapter,
 * not just the questions the writer happened to ask.
 *
 * A chapter is divided into the book's own sections (`buildCoverageUnits`), and
 * every section carries weight by the number of ideas in it — including ideas
 * nobody ever answered. An unprobed idea scores zero rather than disappearing,
 * so a set that quietly skips half the chapter cannot report 100%. A section
 * with no judged idea at all is reported as unprobed, and the session cannot be
 * called a pass while one remains: the proof has a hole in it.
 *
 * Pure and dependency-light so the arithmetic is testable without a database or
 * a model.
 */

import type { RecallUnit } from "./recall-coverage";

/** A section's result, in the order the book teaches it. */
export type SectionVerdict = {
  /** Stable key: the book's section number ("2.3") or a synthetic one. */
  key: string;
  /** The book's own label, or "" when the chapter had no numbering. */
  label: string;
  /** How many ideas the section holds. */
  concepts: number;
  /** How many of those ideas were actually judged by an answer. */
  probedConcepts: number;
  /** Weighted 0–100, with unprobed ideas counting as zero. */
  score: number;
  /** False when no idea in the section was ever judged. */
  probed: boolean;
};

export type SessionVerdict = {
  passed: boolean;
  /** Weighted 0–100 across every section, unprobed ideas included. */
  overall: number;
  /** The score a pass requires. */
  threshold: number;
  sections: SectionVerdict[];
  /** Sections with no judged idea at all. A pass requires zero. */
  unprobedSections: number;
};

/** The exam-readiness bar. */
export const PASS_THRESHOLD = 70;

/**
 * Build the final mastery map from study evidence. Baseline answers measure
 * where the student started; only recall and post-test answers can establish
 * readiness, with later post-test evidence overriding earlier recall.
 */
export function masteryFromStudyAttempts(
  rows: readonly {
    stage: string;
    gapsIdentified: unknown;
  }[],
): Record<string, number> {
  const mastery: Record<string, number> = {};
  for (const row of rows) {
    if (row.stage !== "recall" && row.stage !== "retest") continue;
    const raw = row.gapsIdentified;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const map = (raw as Record<string, unknown>).mastery;
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    for (const [concept, value] of Object.entries(
      map as Record<string, unknown>,
    )) {
      const level = Math.round(Number(value));
      if (!Number.isFinite(level) || level < 0 || level > 3) continue;
      const name = concept.trim();
      if (name) mastery[name] = level;
    }
  }
  return mastery;
}

/** What a mastery level earns: mastered counts fully, partial counts half, a
 *  misconception (2) or an untouched idea (0) earns nothing. */
function earnedFraction(level: number | undefined): number {
  if (level === 3) return 1;
  if (level === 1) return 0.5;
  return 0;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Derive the verdict from the chapter's sections, the student's mastery map,
 * and the per-idea weights. `mastery` may use any case/whitespace around the
 * concept text; `weights` are keyed the same way (default 1).
 */
export function deriveSessionVerdict(
  units: readonly RecallUnit[],
  mastery: Readonly<Record<string, number>>,
  weights: Readonly<Record<string, number>> = {},
  threshold: number = PASS_THRESHOLD,
): SessionVerdict {
  const masteryByKey = new Map<string, number>();
  for (const [concept, level] of Object.entries(mastery)) {
    const n = Math.round(Number(level));
    if (!Number.isFinite(n) || n < 0 || n > 3) continue;
    masteryByKey.set(normalize(concept), n);
  }
  const weightByKey = new Map<string, number>();
  for (const [concept, weight] of Object.entries(weights)) {
    if (Number.isFinite(weight) && weight > 0) {
      weightByKey.set(normalize(concept), weight);
    }
  }

  let earnedTotal = 0;
  let weightTotal = 0;
  const sections = units.map((unit) => {
    let earned = 0;
    let total = 0;
    let probedConcepts = 0;
    for (const concept of unit.concepts) {
      const key = normalize(concept);
      const weight = weightByKey.get(key) ?? 1;
      total += weight;
      const level = masteryByKey.get(key);
      if (level === undefined) continue;
      probedConcepts += 1;
      earned += weight * earnedFraction(level);
    }
    earnedTotal += earned;
    weightTotal += total;
    return {
      key: unit.key,
      label: unit.label,
      concepts: unit.concepts.length,
      probedConcepts,
      score: total ? Math.round((earned / total) * 100) : 0,
      probed: probedConcepts > 0,
    };
  });

  const overall = weightTotal
    ? Math.round((earnedTotal / weightTotal) * 100)
    : 0;
  const unprobedSections = sections.filter((s) => !s.probed).length;
  return {
    passed:
      sections.length > 0 && unprobedSections === 0 && overall >= threshold,
    overall,
    threshold,
    sections,
    unprobedSections,
  };
}
