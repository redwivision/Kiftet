import type { ConceptHistory } from "./mastery-history";

/**
 * The planner's rules, as pure functions.
 *
 * Everything the daily plan decides is decided here, deterministically, with
 * no model involved. A student can rely on the plan because its rules are
 * explicit and stable, not because a model happened to make the same choice.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long before a concept is worth checking again.
 *
 * A first cut, and honestly a small one: the ladder is explicit, short, and
 * tunable rather than a claim about how memory works. A real spaced-repetition
 * engine comes later and is built on this same history.
 *
 * Level 0 is **not** in the table, and that is a decision rather than an
 * omission. Level 0 means the student never addressed the concept — nothing
 * was learned, so nothing can be forgotten. Review is for things that were
 * learned and are going stale; a concept that was never covered is a gap, and
 * gaps belong to the book's own sequence, not to a review queue. Including it
 * would also be a trap: the concept would sit at the top of the queue forever,
 * because a review can never turn a level 0 into a level 3.
 */
export const REVIEW_INTERVAL_DAYS: Readonly<Record<number, number>> = {
  1: 1,
  2: 2,
  3: 7,
};

/**
 * The order the planner reaches for past material.
 *
 * This is the product's established triage — a wrong belief first, then a
 * shaky one, then something solid that has gone stale — so the plan and the
 * guide agree about what matters. A student told to revise an idea the plan
 * treats as urgent must not find the guide ranking it fourth.
 */
const REVIEW_TIER: Readonly<Record<number, number>> = { 2: 0, 1: 1, 3: 2 };

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export type ReviewPreference = "none" | "light" | "heavy";

/**
 * How many review items a day of this length can hold.
 *
 * Capacity, not appetite: a student who says "twenty minutes" gets fewer
 * review items than one who says "an hour", even if both said "heavy". The
 * day's length is the student's own number, so it wins.
 */
export function reviewCapacity(minutes: number): number {
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  return 3;
}

/**
 * How many review items the student's stated preference asks for.
 *
 * "None" means none — until there is an exam date. Forgetting something only
 * has a consequence when there is a deadline, and until then the student said
 * they did not want their past brought back, so we do not bring it back. The
 * moment they give us a date, review comes back at the light level: present
 * enough to be useful, and no more than they asked for.
 */
export function desiredReviewCount(
  preference: ReviewPreference,
  hasExamDate: boolean,
): number {
  if (preference === "none") return hasExamDate ? 1 : 0;
  if (preference === "light") return 1;
  return 3;
}

/**
 * The number of review items today's plan actually carries.
 *
 * The smaller of what the student asked for and what the day can hold — but
 * never zero when they asked for something, because silently dropping the
 * review they asked for is worse than a slightly full day.
 */
export function reviewCount(
  preference: ReviewPreference,
  hasExamDate: boolean,
  minutes: number,
): number {
  const desired = desiredReviewCount(preference, hasExamDate);
  if (desired <= 0) return 0;
  return Math.max(1, Math.min(desired, reviewCapacity(minutes)));
}

/**
 * Is this concept due for another look?
 *
 * Only a concept that was actually learned can be due. A level 0 never is.
 */
export function isReviewDue(
  level: number,
  lastCheckedAt: Date,
  now: Date,
): boolean {
  const days = REVIEW_INTERVAL_DAYS[level];
  if (days === undefined) return false;
  return now.getTime() - lastCheckedAt.getTime() >= days * DAY_MS;
}

/**
 * The concepts worth reviewing now, in the order to review them.
 *
 * Within a tier, the book being worked on comes first: a student in Biology
 * is better served by Biology's due concept than by one from a book they are
 * not touching today. After that, the one we have not looked at for longest
 * comes first — it has had the most time to go stale, and it is the one the
 * student is closest to forgetting.
 */
export function reviewCandidates(
  history: readonly ConceptHistory[],
  now: Date,
  preferredChapterIds?: ReadonlySet<string>,
): ConceptHistory[] {
  const preferred = preferredChapterIds ?? new Set<string>();
  return history
    .filter((entry) => isReviewDue(entry.level, entry.lastCheckedAt, now))
    .sort((a, b) => {
      const tier = (REVIEW_TIER[a.level] ?? 9) - (REVIEW_TIER[b.level] ?? 9);
      if (tier !== 0) return tier;
      const aPreferred = preferred.has(a.chapterId) ? 0 : 1;
      const bPreferred = preferred.has(b.chapterId) ? 0 : 1;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;
      const age = a.lastCheckedAt.getTime() - b.lastCheckedAt.getTime();
      if (age !== 0) return age;
      const chapter = compareText(a.chapterId, b.chapterId);
      return chapter || compareText(a.concept, b.concept);
    });
}

/** One line of the book's own contents. */
export type BookSection = {
  path: string;
  title: string;
};

export type LearnTarget = {
  /** The section to learn next, or null for the whole chapter. */
  path: string | null;
  title: string | null;
  /** How many sections are still ahead of the student in this chapter. */
  remaining: number;
};

/**
 * The next thing to learn in a chapter.
 *
 * The student's position is the book's own printed path ("3.2"), and the next
 * thing is the line after it in the book's own contents. The order is the
 * book's, not ours: until a trusted exam-period allocation exists, the book's
 * sequence is the proxy for what matters, and it is treated as one.
 *
 * A student who has not picked a section yet gets the whole chapter. A
 * student at the last section gets nothing left in this chapter — which is an
 * answer the plan states rather than a gap it hides.
 */
export function nextSection(
  sections: readonly BookSection[],
  currentPath: string | null,
): LearnTarget {
  if (!currentPath) {
    return { path: null, title: null, remaining: Math.max(sections.length, 1) };
  }

  const index = sections.findIndex(
    (section) => section.path.toLowerCase() === currentPath.toLowerCase(),
  );
  // A position the book does not have — a section renumbered between editions
  // — falls back to the whole chapter rather than pointing at nothing.
  if (index < 0) {
    return { path: null, title: null, remaining: Math.max(sections.length, 1) };
  }

  const next = sections[index + 1];
  if (!next) return { path: null, title: null, remaining: 0 };

  return {
    path: next.path,
    title: next.title,
    remaining: Math.max(0, sections.length - (index + 1)),
  };
}
