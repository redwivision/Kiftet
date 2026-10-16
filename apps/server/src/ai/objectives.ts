/**
 * Reading a chapter's own learning objectives out of its prose, without a model.
 *
 * A concept is what a chapter is *about*; an objective is what the book says
 * the student must be able to *do* with it. Many Ethiopian textbooks state
 * them outright, under a heading like "Objectives" or "Learning outcomes",
 * then a bulleted list of imperatives — "describe the internal structure of a
 * leaf", "explain the role of chlorophyll". When the book writes that list
 * itself, there is nothing to infer and no reason to spend a model call
 * reading it back.
 *
 * Kept apart from the route, like `concepts.ts`, so the reasoning is testable
 * without a database. Deliberately conservative: a wrong objective becomes a
 * wrong targeted question, which is worse than having no objective at all. If
 * the shape is not recognisable, this returns nothing and the caller decides
 * whether to ask the model.
 */

export type Objective = {
  objectiveText: string;
  /** Character offset of the objective line in the chapter's raw text, so it
   *  can be anchored back to the student's own book. */
  offset: number;
};

/** How many objectives a single chapter may carry. A section that keeps
 *  yielding "objectives" past this is almost certainly not a list. */
const MAX_OBJECTIVES = 15;

/** The heading that introduces an objectives list. Covers the phrasings the
 *  MoE textbooks use: a bare "Objectives", "Learning Outcomes", "Competencies",
 *  and the sentence form "After studying this chapter, you will be able to…". */
const HEADING =
  /(learning\s+objectives?|\bobjectives?\b|learning\s+outcomes?|competenc(?:y|ies)|after\s+(?:studying|completing|reading)\s+this\s+(?:chapter|unit|section)|by\s+the\s+end\s+of\s+this\s+(?:chapter|unit|section)|you\s+will\s+be\s+able\s+to)/i;

/** The leading word of an objective: the instruction verbs textbooks use to
 *  open a learning outcome. Lowercased for comparison. */
const OBJECTIVE_VERBS = new Set([
  "describe",
  "explain",
  "define",
  "identify",
  "state",
  "list",
  "discuss",
  "compare",
  "contrast",
  "distinguish",
  "calculate",
  "apply",
  "demonstrate",
  "outline",
  "summarise",
  "summarize",
  "recognise",
  "recognize",
  "understand",
  "analyse",
  "analyze",
  "evaluate",
  "interpret",
  "construct",
  "solve",
  "use",
  "name",
  "give",
  "show",
  "relate",
  "classify",
  "label",
  "draw",
  "examine",
  "investigate",
  "appreciate",
  "develop",
  "know",
  "mention",
  "write",
  "convert",
  "balance",
  "measure",
  "observe",
  "record",
  "illustrate",
]);

/** A bullet marker at the start of a line: "- ", "• ", "1. ", "a) ", etc. */
const BULLET = /^(?:[-–—•◦‣⁃·*]|\(?\d+[.)]|\(?[a-z][.)])\s+/i;

function stripBullet(line: string): string {
  return line.replace(BULLET, "").trim();
}

/**
 * One line that reads as a learning objective: either it was bulleted (inside
 * an objectives section, bullets are the objectives) or it opens with an
 * instruction verb. Body prose opens with "The", "A", "In", "When" — none of
 * which are in the verb set — so it is not mistaken for an outcome.
 */
function isObjectiveLike(rawLine: string, stripped: string): boolean {
  if (stripped.length < 4 || stripped.length > 320) return false;
  if (BULLET.test(rawLine)) return true;
  const first = stripped.split(/[\s,]+/)[0]?.toLowerCase() ?? "";
  return OBJECTIVE_VERBS.has(first.replace(/[^a-z]/g, ""));
}

/**
 * Pull the chapter's stated objectives out of its raw text.
 *
 * Scans only after the first objectives heading, takes the contiguous run of
 * objective-like lines that follows it, and stops at the first line that is
 * neither an objective nor blank. That run is the list; everything else in the
 * chapter is prose. Returns offsets into the original text (leading whitespace
 * of each line included in the trim delta) so an objective can be located in
 * the book exactly.
 */
export function fallbackObjectives(rawText: string): Objective[] {
  if (!rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  const headingAt = lines.findIndex((line) => HEADING.test(line));
  if (headingAt === -1) return [];

  const out: Objective[] = [];
  let offset = 0;
  // Walk to the heading so offsets stay true to the original text.
  for (let i = 0; i <= headingAt; i++) offset += (lines[i]?.length ?? 0) + 1;

  let started = false;
  for (let i = headingAt + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineStart = offset;
    offset += line.length + 1;

    const trimmed = line.trim();
    if (!trimmed) {
      // A blank line before the list is spacing; after it, it ends the list.
      if (started) break;
      continue;
    }

    const stripped = stripBullet(trimmed);
    if (isObjectiveLike(trimmed, stripped)) {
      started = true;
      // Anchor at the objective's own words, not the bullet in front of them,
      // so `rawText.slice(offset)` begins with `objectiveText`.
      const textAt = line.indexOf(stripped);
      const lead = textAt >= 0 ? textAt : line.length - line.trimStart().length;
      out.push({ objectiveText: stripped, offset: lineStart + lead });
      if (out.length >= MAX_OBJECTIVES) break;
    } else if (started) {
      // The contiguous run ended — the rest of the chapter is prose.
      break;
    }
    // Before the list starts, skip the heading's own filler line
    // ("After studying this chapter, you will be able to:").
  }

  return out;
}
