/**
 * The lifetime of a demo identity, kept separate from the janitor that uses it
 * so the boundary is testable without a database or a real clock.
 */

export const DEFAULT_DEMO_TTL_HOURS = 24;

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The instant a demo identity must have been created *before* to be collected.
 * A demo created at exactly the cutoff is kept — strictly older is deleted — so
 * a sweep at hour 24 and a demo created at hour 0 don't disagree about the
 * same instant.
 */
export function demoCutoff(now: Date, ttlHours: number): Date {
  return new Date(now.getTime() - ttlHours * MS_PER_HOUR);
}

/**
 * Coerce whatever the environment layer surfaced into a usable TTL.
 *
 * The env proxy returns a varlock-coerced number in one deployment and a raw
 * string in another (a platform-set variable), so both are accepted. Anything
 * unusable falls back to the default rather than being trusted: a NaN here
 * would make the cutoff "now" and collect every demo in one sweep, which is
 * the failure mode worth being explicit about.
 */
export function resolveDemoTtlHours(raw: unknown): number {
  const hours = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_DEMO_TTL_HOURS;
}
