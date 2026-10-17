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
 * Reorder a recall set so its slow questions never bunch together. The model's
 * format mix is only as good as its last instruction-following, and the parser
 * can *downgrade* an unanswerable multiple choice into a spoken short answer —
 * so a set can quietly collapse into two or three "explain…" in a row. This puts
 * the closed questions back in front and spaces the short answers evenly among
 * them, never two in a row, while preserving the closed questions' relative
 * order (which `spreadByFocus` has already used to keep consecutive questions on
 * different ideas).
 *
 * If the model produced more short answers than there is room to space without
 * touching, we cannot invent options for them — so the surplus stays, trailing
 * the set, but the gentle closed questions still open every run.
 */
export function enforceRecallMix<T extends { format?: string }>(
  questions: readonly T[],
): T[] {
  const closed = questions.filter((q) => q.format !== "short_answer");
  const shorts = questions.filter((q) => q.format === "short_answer");
  if (shorts.length === 0) return [...questions];
  // Spread the shorts across (shorts + 1) gaps between closed questions.
  const per = Math.max(1, Math.floor(closed.length / (shorts.length + 1)));
  const out: T[] = [];
  let ci = 0;
  for (let s = 0; s < shorts.length; s++) {
    for (let k = 0; k < per && ci < closed.length; k++) {
      out.push(closed[ci++] as T);
    }
    out.push(shorts[s] as T);
  }
  while (ci < closed.length) out.push(closed[ci++] as T);
  return out;
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
 * The half of the standard both writers share: every question wears exactly one
 * of the five levels. The *difficulty* half deliberately differs, because recall
 * and retest are not the same test — see the two functions below.
 */
const LEVEL_DEFINITIONS =
  "Tag every question with exactly ONE cognitive level, and spread the set across all five so it measures more than memory: " +
  '"knowledge" (recall a fact, term, definition, or formula), ' +
  '"comprehension" (explain an idea in your own words), ' +
  '"application" (use the idea to work through a new case, problem, or example), ' +
  '"critical_thinking" (judge, predict, or reason about a scenario that needs the idea), ' +
  '"compare_contrast" (tell two related ideas apart, or weigh their similarities and differences). ';

/**
 * Recall's difficulty standard: gentle on purpose. A student scanning for what
 * they do and do not know should not have to fight an exam, so a clean factual
 * prompt — a term, a definition, a word that fills a blank — is not only allowed,
 * it is the backbone of the set. A little challenge (a "why", one new example) is
 * welcome; stress is not. Deliberately does NOT forbid a single-word answer,
 * because recall's fill-in-the-blank and multiple-choice formats answer in one.
 */
export function recallLevelDirective(): string {
  return (
    LEVEL_DEFINITIONS +
    "Recall is a low-pressure CHECK, not an exam: an easy, quick question is exactly what you want. " +
    "Make most questions knowledge-level — a term, a definition, or the word that fills a blank. Let at most a couple rise to comprehension or application (a single 'why', or one new example) so the set measures understanding as well as memory, without turning into a quiz the student dreads. " +
    "Do not write pure yes/no prompts. A question the student answers by picking an option or filling one blank is ideal."
  );
}

/**
 * Retest's difficulty standard: exam-hard. This is the pass that proves the
 * student is bulletproof, so vagueness and softness are the failures to avoid.
 */
export function retestLevelDirective(): string {
  return (
    LEVEL_DEFINITIONS +
    "Never write a question that can be answered yes/no or with a single memorised word, and never write an easy question."
  );
}

/**
 * Whether a retest set is too soft for the job it exists to do. A retest is the
 * exam-readiness proof, so a set that climbs fewer than three cognitive levels,
 * or never leaves the textbook for a novel scenario, is a quality signal worth
 * surfacing — logged, never silently passed. Pure and exported so the signal is
 * testable without a live model.
 */
export function retestIsSoft(
  questions: readonly { level?: CognitiveLevel; beyondText?: boolean }[],
): boolean {
  const levels = new Set(
    questions.map((q) => q.level).filter((l): l is CognitiveLevel => !!l),
  );
  const hasBeyond = questions.some((q) => q.beyondText === true);
  return questions.length > 0 && (levels.size < 3 || !hasBeyond);
}

/**
 * The levels a deterministic fallback question uses, cycled, so even the
 * no-model path produces a spread instead of three identical "explain it"
 * prompts. Recall stays gentle — mostly knowledge checks with the occasional
 * comprehension — while retest climbs the full ladder.
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
      : ["knowledge", "knowledge", "comprehension"];
  return Array.from(
    { length: count },
    (_, i) => order[i % order.length] ?? "comprehension",
  );
}
