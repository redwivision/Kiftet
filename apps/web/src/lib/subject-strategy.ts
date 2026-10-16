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
  )
    return "cs_ict";
  if (
    /(english|languages?|linguistics|grammar|literature|composition|reading|writing|vocab|amharic|afaan|oromo|tigrinya|somali|spanish|french|german|arabic|swahili|chinese|japanese|korean|portuguese|russian)/.test(
      s,
    )
  )
    return "english_languages";
  if (
    /(history|social studies|civics|citizenship|ethical|ethics|politics|government|sociology|anthropology|philosophy|humanities)/.test(
      s,
    )
  )
    return "history_social";
  if (
    /(geography|geology|map\b|climate|environment|ecology|earth science)/.test(
      s,
    )
  )
    return "geography";
  if (
    /(economics|economy|business|commerce|finance|accounting|marketing|entrepreneur)/.test(
      s,
    )
  )
    return "economics_business";
  if (
    /(math|mathematics|algebra|geometry|trigonometry|calculus|statistics|probability|arithmetic|precalculus|linear algebra|discrete|number theory)/.test(
      s,
    )
  )
    return "mathematics";
  if (
    /(physics|mechanics|thermodynamics|electromagnetism|optics|waves|kinematics|dynamics|nuclear|quantum)/.test(
      s,
    )
  )
    return "physics";
  if (
    /(chemistry|organic|inorganic|biochemistry|stoichiometry|chemical\b)/.test(
      s,
    )
  )
    return "chemistry";
  if (
    /(biology|biological|zoology|botany|anatomy|physiology|microbiology|genetics|cell\b|evolution|taxonomy)/.test(
      s,
    )
  )
    return "biology";
  if (
    /(general science|integrated science|science\b|stem|natural science)/.test(
      s,
    )
  )
    return "general_science";
  return "other";
}

export function getRecallHint(subject: string): string | null {
  const f = getFamily(subject);
  if (f === "mathematics")
    return "Say the method/steps first — explain why each step makes sense.";
  if (f === "physics")
    return "Explain the phenomenon (why it happens), not just the formula.";
  if (f === "chemistry")
    return "Explain at the particle level — what changes and why.";
  if (f === "biology")
    return "Explain the process/system step by step — inputs, outputs, order.";
  if (f === "english_languages")
    return "Use the word/phrase in a sentence; explain meaning in context.";
  if (f === "history_social")
    return "Explain causes and effects, and the order of events.";
  if (f === "geography")
    return "Explain the pattern or landform, and why it occurs.";
  if (f === "economics_business")
    return "Explain the model and its assumptions.";
  if (f === "cs_ict")
    return "Explain the logic — trace behavior step by step, don't just name syntax.";
  return null;
}

export function getRetestHint(subject: string): string | null {
  const f = getFamily(subject);
  if (f === "mathematics")
    return "Solve a new problem and explain each step. Watch for traps in similar-looking questions.";
  if (f === "physics")
    return "Predict the outcome, compute with units, then explain your reasoning.";
  if (f === "chemistry")
    return "Balance or predict products, and explain the atom conservation.";
  if (f === "biology")
    return "Predict what happens if a component fails, and explain why.";
  if (f === "english_languages")
    return "Use the word in a new sentence; correct the wrong one with an explanation.";
  if (f === "history_social")
    return "Sequence events; explain cause-effect; compare perspectives.";
  if (f === "geography")
    return "Interpret the map/data; compare regions; explain the process.";
  if (f === "economics_business")
    return "Interpret the graph shift; apply the model to a new scenario; explain.";
  if (f === "cs_ict")
    return "Predict output with a trace; debug and explain the fix.";
  return null;
}
