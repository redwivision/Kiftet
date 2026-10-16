export type SubjectFamily =
  | "mathematics"
  | "physics"
  | "chemistry"
  | "biology"
  | "english_languages"
  | "history_social"
  | "geography"
  | "economics_business"
  | "cs_ict"
  | "general_science"
  | "other";

export type StudyPhase =
  | "recall"
  | "gaps"
  | "lesson"
  | "plan"
  | "retest"
  | "result";

export interface PhaseDirectives {
  system?: string[];
  user?: string[];
  hints?: string[];
}

function norm(s: string): string {
  return (s || "").trim().toLowerCase();
}

export function getFamily(subject: string): SubjectFamily {
  const s = norm(subject);
  if (
    /(computer science|informatics|programming|coding|software|data structures|algorithms)\b/.test(
      s,
    ) ||
    /\bict\b/.test(s)
  ) {
    return "cs_ict";
  }
  if (
    /(english|languages?|linguistics|grammar|literature|composition|reading|writing|vocab|amharic|afaan|oromo|tigrinya|somali|spanish|french|german|arabic|swahili|chinese|japanese|korean|portuguese|russian)/.test(
      s,
    )
  ) {
    return "english_languages";
  }
  if (
    /(history|social studies|civics|citizenship|ethical|ethics|politics|government|sociology|anthropology|philosophy|humanities)/.test(
      s,
    )
  ) {
    return "history_social";
  }
  if (
    /(geography|geology|map\b|climate|environment|ecology|earth science)/.test(
      s,
    )
  ) {
    return "geography";
  }
  if (
    /(economics|economy|business|commerce|finance|accounting|marketing|entrepreneur)/.test(
      s,
    )
  ) {
    return "economics_business";
  }
  if (
    /(math|mathematics|algebra|geometry|trigonometry|calculus|statistics|probability|arithmetic|precalculus|linear algebra|discrete|number theory)/.test(
      s,
    )
  ) {
    return "mathematics";
  }
  if (
    /(physics|mechanics|thermodynamics|electromagnetism|optics|waves|kinematics|dynamics|nuclear|quantum)/.test(
      s,
    )
  ) {
    return "physics";
  }
  if (
    /(chemistry|organic|inorganic|biochemistry|stoichiometry|chemical\b)/.test(
      s,
    )
  ) {
    return "chemistry";
  }
  if (
    /(biology|biological|zoology|botany|anatomy|physiology|microbiology|genetics|cell\b|evolution|taxonomy)/.test(
      s,
    )
  ) {
    return "biology";
  }
  if (
    /(general science|integrated science|science\b|stem|natural science)/.test(
      s,
    )
  ) {
    return "general_science";
  }
  return "other";
}

export function getPhaseDirectives(
  family: SubjectFamily,
  phase: StudyPhase,
): PhaseDirectives {
  const empty: PhaseDirectives = {};
  if (family === "mathematics") {
    if (phase === "recall")
      return {
        system: [
          "Focus on method/reasoning steps, not just final answer.",
          "Look for evidence of step-by-step explanation.",
          "Spot logical gaps in reasoning.",
        ],
        hints: [
          "Say the method/steps first.",
          "Explain why each step makes sense.",
        ],
      };
    if (phase === "plan" || phase === "lesson")
      return {
        system: [
          "Prefer worked examples with each step explicit.",
          "Emphasize do/undo (inverse ops).",
          "Increase difficulty gradually.",
          "Include 'spot the error' practice.",
        ],
        hints: ["Solve small example step-by-step."],
      };
    if (phase === "retest")
      return {
        system: [
          "New problem (not identical).",
          "Require explanation of each step.",
          "Credit reasoning and method.",
          "Include spot-the-error variant when apt.",
        ],
        hints: ["Solve new problem; explain each step."],
      };
    return empty;
  }
  if (family === "physics") {
    if (phase === "recall")
      return {
        system: [
          "Focus on physical reasoning (cause-effect).",
          "Note forces, energy, motion, units.",
          "Uncover misconceptions.",
        ],
        hints: ["Explain the phenomenon (why)."],
      };
    if (phase === "plan" || phase === "lesson")
      return {
        system: [
          "Connect to real life; conceptual diagrams.",
          "Emphasize units/vectors/assumptions.",
          "Derive reasoning before plugging numbers.",
        ],
        hints: ["Reason first, then numbers."],
      };
    if (phase === "retest")
      return {
        system: [
          "Predict outcomes if variables change.",
          "Compute with correct units.",
          "Test conceptual + computational.",
        ],
        hints: ["Predict outcome; compute with units; explain."],
      };
    return empty;
  }
  if (family === "chemistry") {
    if (phase === "recall")
      return {
        system: [
          "Focus on mechanism, electron transfer, bonding, driving forces.",
          "Note confusion about products/states/conservation.",
        ],
        hints: ["Explain at particle level."],
      };
    if (phase === "plan" || phase === "lesson")
      return {
        system: [
          "Particulate reasoning.",
          "Balancing = atom conservation, stepwise.",
          "Link to periodic trends when relevant.",
        ],
        hints: ["Balance atoms step-by-step."],
      };
    if (phase === "retest")
      return {
        system: [
          "Balance equation and explain atom conservation.",
          "Predict products with reasoning.",
          "Fix incorrect equation; identify mistake.",
        ],
        hints: ["Balance/predict products; explain."],
      };
    return empty;
  }
  if (family === "biology") {
    if (phase === "recall")
      return {
        system: [
          "Focus on processes/systems (inputs/outputs/sequence/interactions).",
          "Structure-function relationships.",
        ],
        hints: ["Explain process/system stepwise."],
      };
    if (phase === "plan" || phase === "lesson")
      return {
        system: [
          "Interconnections between systems.",
          "Compare/contrast.",
          "Cause-effect if component fails.",
        ],
        hints: ["Trace connections between parts."],
      };
    if (phase === "retest")
      return {
        system: [
          "Predict outcome if structure/organelle fails.",
          "Test sequence/order.",
          "Explain why, not just what.",
        ],
        hints: ["Predict outcome if component fails; explain."],
      };
    return empty;
  }
  if (family === "english_languages") {
    if (phase === "recall")
      return {
        system: [
          "Assess usage in context (meaning + appropriateness).",
          "Note grammar/clarity/collocation.",
          "Don't over-penalize pronunciation unless obscures meaning.",
        ],
        hints: ["Use word/phrase in a sentence.", "Summarize in context."],
      };
    if (phase === "plan" || phase === "lesson")
      return {
        system: [
          "Prioritize active production (speak/write).",
          "Corrective feedback with correct examples.",
          "Contrast correct vs common errors.",
        ],
        hints: ["Produce correct usage in context."],
      };
    if (phase === "retest")
      return {
        system: [
          "Require new sentence/context (not memorized).",
          "Correction task (fix incorrect).",
          "Test comprehension when appropriate.",
          "Meaningful context.",
        ],
        hints: ["Use in a new sentence.", "Fix/correct with explanation."],
      };
    return empty;
  }
  if (family === "history_social") {
    if (phase === "recall")
      return {
        system: [
          "Cause-effect, chronology, context, perspectives.",
          "Evidence/support, avoid overgeneralization.",
        ],
        hints: ["Explain causes/effects and sequence."],
      };
    if (phase === "plan" || phase === "lesson")
      return {
        system: [
          "Timeline + cause-effect maps.",
          "Compare perspectives; discuss bias.",
          "Short/long-term consequences.",
        ],
        hints: ["Map causes → effects."],
      };
    if (phase === "retest")
      return {
        system: [
          "Sequence with reasoning.",
          "Compare perspectives/accounts; identify bias.",
          "Multi-causal (internal/external).",
        ],
        hints: ["Sequence; cause-effect; compare perspectives."],
      };
    return empty;
  }
  if (family === "geography") {
    if (phase === "recall")
      return {
        system: [
          "Spatial patterns, processes, human-environment.",
          "Landform formation, climate drivers, distribution.",
        ],
        hints: ["Explain pattern/landform and why."],
      };
    if (phase === "plan" || phase === "lesson")
      return {
        system: [
          "Map reasoning + data interpretation.",
          "Physical processes.",
          "Regional comparisons.",
        ],
        hints: ["Interpret maps/data."],
      };
    if (phase === "retest")
      return {
        system: [
          "Interpret maps/data.",
          "Regional comparisons with reasoning.",
          "Process → landform/distribution.",
        ],
        hints: ["Interpret map/data; compare regions; explain."],
      };
    return empty;
  }
  if (family === "economics_business") {
    if (phase === "recall")
      return {
        system: [
          "Models (supply/demand, incentives, trade-offs, opportunity cost).",
          "Shifts vs movements.",
        ],
        hints: ["Explain model/assumptions."],
      };
    if (phase === "plan" || phase === "lesson")
      return {
        system: [
          "Real-world examples.",
          "Graph interpretation (shifts/movements/equilibrium).",
          "Interaction of S and D sets price.",
        ],
        hints: ["Trace S/D interaction."],
      };
    if (phase === "retest")
      return {
        system: [
          "Graph shifts with explanation.",
          "Apply model to new scenario.",
          "Distinguish movement vs shift.",
        ],
        hints: ["Graph shifts; apply to scenario; explain."],
      };
    return empty;
  }
  if (family === "cs_ict") {
    if (phase === "recall")
      return {
        system: [
          "Focus on logic/behavior, not syntax.",
          "Trace control flow (loops/conditionals).",
          "State/variables/edge cases.",
        ],
        hints: ["Explain logic; trace behavior stepwise."],
      };
    if (phase === "plan" || phase === "lesson")
      return {
        system: [
          "Stepwise tracing (mental execution).",
          "Small testable examples.",
          "Debug: find/explain/fix.",
          "Decomposition/algorithmic thinking.",
        ],
        hints: ["Trace line-by-line.", "Find/explain/fix bugs."],
      };
    if (phase === "retest")
      return {
        system: [
          "Predict output by tracing; show reasoning.",
          "Debug: locate/explain/fix.",
          "Write/modify small focused function.",
          "Consider edge cases.",
        ],
        hints: [
          "Predict output with trace.",
          "Debug/find-fix with explanation.",
        ],
      };
    return empty;
  }
  return empty;
}
