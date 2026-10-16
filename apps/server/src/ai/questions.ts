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
