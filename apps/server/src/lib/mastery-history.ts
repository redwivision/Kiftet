import type { MasteryLevel } from "../ai/gemini";

/**
 * What the student knows now, per concept, and when we last looked.
 *
 * Mastery is not stored as a fact about a concept — it is stored as a record of
 * what was said in one attempt (`attempt.gapsIdentified`, a JSONB map). So the
 * student's current state has to be *reconstructed*: for every concept, the
 * most recent level anyone recorded, and the moment it was recorded.
 *
 * Two shapes of attempt meet here, and the difference matters:
 *
 * - A **recall** attempt grades the whole chapter, so its map is complete —
 *   every concept has an entry, most of them at level 0.
 * - A **retest** attempt grades only the concepts it probed, so its map is
 *   partial.
 *
 * So a concept's level is the most recent level recorded *for that concept*,
 * wherever it came from — not the most recent chapter map. Taking the latest
 * attempt wholesale would let a retest erase everything it did not ask
 * about.
 *
 * This module is pure: it takes the samples and returns the history. The
 * database read lives elsewhere, and the planner's policy lives in
 * `daily-plan.ts`.
 */

export type MasterySample = {
  chapterId: string;
  createdAt: Date;
  /** The attempt's mastery map, as stored. */
  mastery: Record<string, number> | null | undefined;
};

export type ConceptHistory = {
  chapterId: string;
  /** The concept as it was last written — the freshest name we have. */
  concept: string;
  level: MasteryLevel;
  lastCheckedAt: Date;
  /** How many times this concept has been graded. */
  checks: number;
};

const keyOf = (name: string) => name.trim().toLowerCase();

/**
 * Reconstruct the student's per-concept history from a set of attempts.
 *
 * The samples may arrive in any order; the result does not depend on it. A
 * later sample for a concept replaces the earlier one's level and date, and
 * the concept's display name follows the freshest reading.
 */
export function masteryHistory(
  samples: readonly MasterySample[],
): ConceptHistory[] {
  const ordered = [...samples].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const byConcept = new Map<string, ConceptHistory>();

  for (const sample of ordered) {
    const mastery = sample.mastery;
    if (!mastery || typeof mastery !== "object" || Array.isArray(mastery))
      continue;

    for (const [rawName, rawLevel] of Object.entries(mastery)) {
      const name = rawName.trim();
      if (!name) continue;

      // The same rules the grader uses: round to a whole level, and drop
      // anything outside 0–3 rather than guessing what it meant.
      const level = Math.round(Number(rawLevel));
      if (!Number.isFinite(level) || level < 0 || level > 3) continue;

      const key = `${sample.chapterId}\u0000${keyOf(name)}`;
      const existing = byConcept.get(key);
      if (existing) {
        existing.level = level as MasteryLevel;
        existing.lastCheckedAt = sample.createdAt;
        existing.checks += 1;
        existing.concept = name;
      } else {
        byConcept.set(key, {
          chapterId: sample.chapterId,
          concept: name,
          level: level as MasteryLevel,
          lastCheckedAt: sample.createdAt,
          checks: 1,
        });
      }
    }
  }

  return [...byConcept.values()];
}

/**
 * The chapter IDs a student has actually been graded in.
 *
 * A chapter they have opened but never answered in has no history, and
 * nothing in it is due for review — asking them to revisit a chapter they
 * never studied would be noise.
 */
export function studiedChapterIds(
  history: readonly ConceptHistory[],
): string[] {
  return [...new Set(history.map((entry) => entry.chapterId))];
}
