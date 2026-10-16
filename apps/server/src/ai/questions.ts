/**
 * The cognitive standard every question is held to — recall and retest alike.
 *
 * Five levels, borrowed from the way national exams are described: a question
 * may measure *knowledge* (a fact), *comprehension* (an explanation),
 * *application* (use it on a new case), *critical thinking* (judge or reason
 * about a scenario), or *compare and contrast* (tell two ideas apart). Held as
 * the single taxonomy for the whole product so a question is never judged by
 * two different rulers: the writer tags each one, the answer is graded against
 * the ideas it names, and the set is expected to spread across the levels.
 *
 * Kept apart from `gemini.ts`, like `subject-strategy.ts`, so the standard is
 * one readable thing rather than prompt prose scattered through the service.
 */

import type { SubjectFamily } from "./subject-strategy";

export type CognitiveLevel =
  | "knowledge"
  | "comprehension"
  | "application"
  | "critical_thinking"
  | "compare_contrast";

/** Every level, in the order a question set should climb them. */
export const COGNITIVE_LEVELS: readonly CognitiveLevel[] = [
  "knowledge",
  "comprehension",
  "application",
  "critical_thinking",
  "compare_contrast",
] as const;

/** The two question families, which serve deliberately different purposes:
 *  `recall` diagnoses gaps; `retest` proves exam-readiness. */
export type QuestionKind = "recall" | "retest";

/**
 * How a recall question is answered. Recall is kept *simple on purpose* — a
 * student scanning for what they do and don't know should not have to write an
 * essay per idea. Retest is the opposite: it stays free-form spoken explanation.
 */
export type RecallFormat = "multiple_choice" | "fill_blank" | "short_answer";

export const RECALL_FORMATS: readonly RecallFormat[] = [
  "multiple_choice",
  "fill_blank",
  "short_answer",
] as const;

export function isRecallFormat(value: unknown): value is RecallFormat {
  return (
    typeof value === "string" &&
    (RECALL_FORMATS as readonly string[]).includes(value)
  );
}

/** Questions per recall set — the batch the 5/2/1 mix is defined against. */
export const RECALL_SET_SIZE = 8;

/**
 * The shape of a recall set. Most questions are multiple choice (fast to
 * answer, easy to grade), a couple are fill-in-the-blank, and one is a spoken
 * short answer. Subjects where a single missing word is the natural probe —
 * maths, the sciences, CS/ICT — shift the balance so fill-in-the-blank can be
 * the largest share. Deterministic, so the writer's instruction, the parser's
 * validation, and the no-model fallback all agree on the same set.
 */
export function isBlankHeavy(family: SubjectFamily): boolean {
  return (
    family === "mathematics" ||
    family === "physics" ||
    family === "chemistry" ||
    family === "biology" ||
    family === "cs_ict"
  );
}

/** The canonical 8-question batch each family aims for: 5/2/1 by default, 3/4/1
 *  where a blank is the natural probe. */
export function recallShapeWeights(
  blankHeavy: boolean,
): Record<RecallFormat, number> {
  return blankHeavy
    ? { multiple_choice: 3, fill_blank: 4, short_answer: 1 }
    : { multiple_choice: 5, fill_blank: 2, short_answer: 1 };
}

export function recallFormatCounts(
  count: number,
  family: SubjectFamily = "other",
): Record<RecallFormat, number> {
  const total = Math.max(0, Math.floor(count));
  const weights = recallShapeWeights(isBlankHeavy(family));
  const sum = RECALL_FORMATS.reduce((acc, f) => acc + weights[f], 0);
  // Exact shares, floored, then the remainder handed to the largest fractions,
  // so the parts sum to exactly `count`.
  const exact = RECALL_FORMATS.map((format) => ({
    format,
    raw: sum > 0 ? (total * weights[format]) / sum : 0,
  }));
  const result: Record<RecallFormat, number> = {
    multiple_choice: 0,
    fill_blank: 0,
    short_answer: 0,
  };
  let remaining = total;
  for (const { format, raw } of exact) {
    result[format] = Math.floor(raw);
    remaining -= result[format];
  }
  const byFraction = [...exact].sort(
    (a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)),
  );
  for (let i = 0; remaining > 0 && byFraction.length > 0; i++, remaining--) {
    const next = byFraction[i % byFraction.length];
    if (next) result[next.format] += 1;
  }
  return result;
}

/**
 * A stable, human-sensible order for a recall set: multiple choice and
 * fill-in-the-blank alternate, with the short answer tucked into the middle so
 * the set never opens or closes on its slowest question.
 */
export function recallFormatPlan(
  count: number,
  family: SubjectFamily = "other",
): RecallFormat[] {
  const counts = recallFormatCounts(count, family);
  const alt: RecallFormat[] = [];
  for (
    let i = 0;
    i < Math.max(counts.multiple_choice, counts.fill_blank);
    i++
  ) {
    if (i < counts.multiple_choice) alt.push("multiple_choice");
    if (i < counts.fill_blank) alt.push("fill_blank");
  }
  const mid = Math.floor(alt.length / 2);
  for (let i = 0; i < counts.short_answer; i++) {
    alt.splice(mid + i, 0, "short_answer");
  }
  return alt;
}

/**
 * Whether a response to a *closed* recall question (multiple choice or
 * fill-in-the-blank) is correct. Both sides are compared case-, whitespace-,
 * and punctuation-insensitively, so "Osmosis." and " osmosis " agree. Open
 * questions are never judged here — they go to the model, as recall always has.
 */
export function judgeClosedAnswer(expected: string, response: string): boolean {
  const norm = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const e = norm(expected);
  const r = norm(response);
  return e.length > 0 && e === r;
}

export function isCognitiveLevel(value: unknown): value is CognitiveLevel {
  return (
    typeof value === "string" &&
    (COGNITIVE_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * The shared instruction that makes every question standard. Concatenated onto
 * both writers' system prompts, so neither can quietly drop the taxonomy.
 */
export const LEVEL_DIRECTIVE =
  "Tag every question with exactly ONE cognitive level, and spread the set across all five so it measures more than memory: " +
  '"knowledge" (recall a fact, term, definition, or formula), ' +
  '"comprehension" (explain an idea in your own words), ' +
  '"application" (use the idea to work through a new case, problem, or example), ' +
  '"critical_thinking" (judge, predict, or reason about a scenario that needs the idea), ' +
  '"compare_contrast" (tell two related ideas apart, or weigh their similarities and differences). ' +
  "Never write a question that can be answered yes/no or with a single memorised word, and never write an easy question.";

/**
 * The levels a deterministic fallback question uses, cycled, so even the
 * no-model path produces a spread instead of three identical "explain it"
 * prompts. Recall leans diagnostic (comprehension/application); retest climbs
 * the full ladder.
 */
export function fallbackLevels(
  kind: QuestionKind,
  count: number,
): CognitiveLevel[] {
  const order: CognitiveLevel[] =
    kind === "retest"
      ? [
          "knowledge",
          "comprehension",
          "application",
          "critical_thinking",
          "compare_contrast",
        ]
      : ["comprehension", "application", "compare_contrast"];
  return Array.from(
    { length: count },
    (_, i) => order[i % order.length] ?? "comprehension",
  );
}
