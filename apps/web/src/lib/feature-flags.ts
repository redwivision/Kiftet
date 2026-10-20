/**
 * Product flags that hide a shipped-but-unfinished surface without deleting it.
 *
 * A flag here means a real feature exists and works, but is not ready to be the
 * student's path yet. The point is to keep the route, the server endpoints and
 * the components intact — and the flag honest — rather than rip code out and
 * rewrite it later. Flip a flag back to `true` to re-open the surface.
 */

/**
 * The syllabus view (`/syllabus`, the dashboard's "Study by unit" button and
 * the `SYLLABUS_ROUTE_PREFIXES` entry). Off while the team's focus is the
 * uploaded textbook: its `syllabus_unit.periods` figures are not transcribed,
 * so it would show structure the student cannot yet act on, and it competes
 * for attention with the book they actually have.
 */
export const SYLLABUS_ENABLED = false;
