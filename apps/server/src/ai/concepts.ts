/**
 * Reconciling a chapter's own contents with what a model found in its prose.
 *
 * Kept apart from the route so it can be tested without a database, and because
 * the reasoning is the point: when the book states its own structure, that
 * structure wins, and the model is left to add to it rather than replace it.
 */

/**
 * The bare idea behind a line of text, for deciding whether two say the same
 * thing: lowercase, no numbering, no punctuation, no filler words.
 *
 * "2.3.1 The internal structure of a leaf" and "The internal structure of
 * leaves" are one topic written twice — once by a typesetter, once by a model —
 * and must not become two checklist items.
 */
function conceptKey(text: string): string {
  const filler = new Set([
    "a",
    "an",
    "and",
    "the",
    "of",
    "in",
    "is",
    "to",
    "for",
    "on",
    "with",
  ]);
  return text
    .toLowerCase()
    .replace(/^[\d.\s]+/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !filler.has(w))
    .sort()
    .join(" ");
}

/** How many levels of numbering a topic carries: "2.3.1" is three. */
function topicDepth(topic: string): number {
  const number = /^([\d.]+)/.exec(topic)?.[1] ?? "";
  return number.split(".").filter(Boolean).length;
}

export type Concept = {
  conceptText: string;
  isMisconception: boolean;
  weight: number;
};

/**
 * Fold the book's own contents into the concepts a model found.
 *
 * The topics lead, in the book's order, because that order is the sequence the
 * chapter teaches — the order a student has to learn in. Concepts the model
 * found and the contents did not mention follow, which is where misconceptions
 * and detail the contents summarised away survive.
 */
export function mergeConcepts(
  topics: string[] | undefined,
  extracted: Concept[],
): Concept[] {
  const out: Concept[] = [];
  const seen = new Set<string>();
  const push = (
    conceptText: string,
    isMisconception: boolean,
    weight: number,
  ) => {
    const key = conceptKey(conceptText);
    // Nothing left after cleaning means it was punctuation, not an idea.
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ conceptText, isMisconception, weight });
  };

  for (const topic of topics ?? []) {
    // Deeper in the numbering means more specific, so it carries less weight
    // than the section it hangs under. The label keeps its numbering, which is
    // what shows the student where in the chapter they are.
    const depth = topicDepth(topic);
    push(topic, false, depth >= 3 ? 2 : depth === 2 ? 4 : 1);
  }
  for (const c of extracted) push(c.conceptText, c.isMisconception, c.weight);
  return out;
}
