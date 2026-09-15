import { GoogleGenAI } from "@google/genai";

import { env } from "../env.server";

const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export const DEFAULT_MODEL = "gemini-3.6-flash";

const PLACEHOLDER_KEY = "placeholder-gemini-api-key";

export type ConceptChecklistItem = {
  conceptText: string;
  isMisconception: boolean;
  weight: number;
  
};

export type GapAnalysis = {
  covered: string[];
  missing: string[];
  misconceptions: string[];
  score: number;
};

export type MicroLesson = {
  text: string;
};

export type RetestQuestion = {
  question: string;
};

export type AiService = {
  extractConcepts(rawText: string): Promise<ConceptChecklistItem[]>;
  gradeRecall(transcript: string, concepts: ConceptChecklistItem[]): Promise<GapAnalysis>;
  generateMicroLesson(gaps: GapAnalysis, concepts: ConceptChecklistItem[]): Promise<MicroLesson>;
  generateRetestQuestions(gaps: GapAnalysis, concepts: ConceptChecklistItem[]): Promise<RetestQuestion[]>;
};

// ────────────────────────────────────────────────────────────────
// Fallback chain (the design's seam rule: the product must always work,
// with or without a key). If Gemini is unavailable or fails, we degrade to
// deterministic heuristics so demos and CI never hard-fail.
// ────────────────────────────────────────────────────────────────

function isAiAvailable(): boolean {
  return env.GEMINI_API_KEY !== PLACEHOLDER_KEY && env.GEMINI_API_KEY.trim().length > 0;
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40);
}

function fallbackExtract(rawText: string): ConceptChecklistItem[] {
  return sentences(rawText).slice(0, 8).map((s) => ({
    conceptText: s,
    isMisconception: false,
    weight: 1,
  }));
}

function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !["this", "that", "with", "from", "they", "them", "have"].includes(w)),
  );
}

function fallbackGrade(transcript: string, concepts: ConceptChecklistItem[]): GapAnalysis {
  const covered: string[] = [];
  const misconceptions: string[] = [];
  const tokens = significantTokens(transcript);
  for (const concept of concepts) {
    const nameTokens = significantTokens(concept.conceptText);
    const hit = [...nameTokens].some((t) => tokens.has(t)) && nameTokens.size > 0;
    if (!hit) continue;
    if (concept.isMisconception) misconceptions.push(concept.conceptText);
    else covered.push(concept.conceptText);
  }
  const missing = concepts
    .filter((c) => !c.isMisconception && !covered.includes(c.conceptText))
    .map((c) => c.conceptText);
  const score = covered.length / Math.max(1, concepts.filter((c) => !c.isMisconception).length);
  return { covered, missing, misconceptions, score };
}

function fallbackLesson(gaps: GapAnalysis): string {
  const targets = [...gaps.missing, ...gaps.misconceptions].slice(0, 3);
  if (!targets.length) {
    return "You already covered every idea in this section. Give yourself a quick recap out loud, then move on.";
  }
  const body = targets.map((t) => `“${t}”`).join("; ");
  return `Let’s close your gaps. Today we focus on ${body}. Listen closely: ${targets[0]}, in plain words — it is simply this: keep the definition clear, use the example, and say it back out loud. Now explain it to me your way.`;
}

function fallbackQuestions(gaps: GapAnalysis): RetestQuestion[] {
  const targets = [...gaps.missing, ...gaps.misconceptions].slice(0, 3);
  return targets.map((t) => ({
    question: `Explain “${t}” in your own words, as if teaching a friend.`,
  }));
}

// ────────────────────────────────────────────────────────────────
// Gemini helpers
// ────────────────────────────────────────────────────────────────

function clampWeight(weight: unknown): number {
  const n = typeof weight === "number" ? weight : 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function clampScore(score: unknown): number {
  const n = typeof score === "number" ? score : 0;
  return Math.min(1, Math.max(0, n));
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function parseJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function askJson(systemPrompt: string, userInput: string): Promise<string> {
  const response = await genAI.models.generateContent({
    model: DEFAULT_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: `${systemPrompt}\n\n---\n${userInput}` },
        ],
      },
    ],
    config: { responseMimeType: "application/json", temperature: 0.4 },
  });
  return response.text ?? "";
}

function extractItems(raw: string): ConceptChecklistItem[] | null {
  const data = parseJson<{ items?: unknown[] }>(raw);
  if (!data || !Array.isArray(data.items)) return null;
  const items: ConceptChecklistItem[] = [];
  for (const item of data.items) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.conceptText !== "string" || !o.conceptText.trim()) continue;
    items.push({
      conceptText: o.conceptText.trim(),
      isMisconception: o.isMisconception === true,
      weight: clampWeight(o.weight),
    });
  }
  return items.length ? items.slice(0, 12) : null;
}

function parseGaps(raw: string, concepts: ConceptChecklistItem[]): GapAnalysis | null {
  const data = parseJson<Partial<GapAnalysis>>(raw);
  if (!data) return null;
  return sanitizeGaps(
    {
      covered: strings(data.covered),
      missing: strings(data.missing),
      misconceptions: strings(data.misconceptions),
      score: clampScore(data.score),
    },
    concepts,
  );
}

// Keep AI output consistent with the stored concept list: fuzzy-match returned
// names back to the canonical conceptText so downstream lookups always agree.
function sanitizeGaps(gaps: GapAnalysis, concepts: ConceptChecklistItem[]): GapAnalysis {
  const match = (value: string) => {
    const lower = value.trim().toLowerCase();
    return concepts.find((c) => c.conceptText.trim().toLowerCase() === lower)?.conceptText ?? value.trim();
  };
  const covered = [...new Set(gaps.covered.map(match))].filter(Boolean);
  const misconceptions = [...new Set(gaps.misconceptions.map(match))].filter(Boolean);
  const missingSet = new Set(gaps.missing.map(match).filter(Boolean));
  for (const concept of concepts) {
    if (concept.isMisconception) continue;
    const name = concept.conceptText.trim();
    const isNamed = [...covered, ...misconceptions].some(
      (c) => c.trim().toLowerCase() === name.toLowerCase(),
    );
    if (!isNamed) missingSet.add(name);
  }
  const score = gaps.score > 0
    ? gaps.score
    : covered.length / Math.max(1, concepts.filter((c) => !c.isMisconception).length);
  return { covered, missing: [...missingSet], misconceptions, score };
}

function conceptsChecklist(concepts: ConceptChecklistItem[]): string {
  return concepts
    .map((c) => `- ${c.conceptText}${c.isMisconception ? " [MISCONCEPTION]" : ""} (weight ${c.weight})`)
    .join("\n");
}

function gapsSummary(gaps: GapAnalysis): string {
  return [
    `Covered: ${gaps.covered.length ? gaps.covered.join("; ") : "none"}`,
    `Missing: ${gaps.missing.length ? gaps.missing.join("; ") : "none"}`,
    `Misconceptions: ${gaps.misconceptions.length ? gaps.misconceptions.join("; ") : "none"}`,
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────
// The service
// ────────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM =
  "Extract the core concepts someone must understand to master this chapter. " +
  "Return STRICT JSON, no prose, in this exact shape: " +
  '{"items":[{"conceptText":"short self-contained phrase (5-15 words, as the student would say it)","weight":1-5,"isMisconception":false}]}. ' +
  "Include common student MISCONCEPTIONS as separate items (isMisconception true, phrased as the WRONG belief). " +
  "Return 5-10 items, only what is actually in the text.";

const GRADE_SYSTEM =
  "You judge how well a student's spoken recall covers the concept checklist. " +
  "Return STRICT JSON, no prose: " +
  '{"covered":["conceptText that the student correctly explained"],"missing":["checklist concepts not really addressed"],"misconceptions":["checklist items the student got WRONG or stated as a misconception"],"score":0.0-1.0}. ' +
  "Only reference concepts that exist in the checklist verbatim (bare conceptText, never the [MISCONCEPTION] marker). " +
  "score = fraction of non-misconception concepts covered. " +
  "A misconception item listed in 'covered' is an error — it goes to 'misconceptions' instead.";

const LESSON_SYSTEM =
  "Write a short PRONUNCIATION-FRIENDLY lesson that fixes exactly the gaps in the GapAnalysis. " +
  "This will be read aloud by a voice engine, so write crisp short sentences designed to be spoken and remembered, " +
  "no headers, no markdown, no bullet lists, 4-8 sentences total, one plain analogy, ends with a one-line recall prompt to the student. " +
  'Return STRICT JSON: {"text":"the lesson"}.';

const RETEST_SYSTEM =
  "Write 2-3 short spoken check questions that re-test exactly the missing/misconception items in the GapAnalysis. " +
  "Each question must ask the student to speak aloud an explanation, definition, or worked example — not pick an option. " +
  'Return STRICT JSON: {"questions":[{"question":"..."}]}.';

export const ai: AiService = {
  async extractConcepts(rawText: string): Promise<ConceptChecklistItem[]> {
    const fallback = () => fallbackExtract(rawText);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(EXTRACT_SYSTEM, `CHAPTER TEXT:\n${rawText.slice(0, 24000)}`);
      return extractItems(raw) ?? fallback();
    } catch {
      return fallback();
    }
  },

  async gradeRecall(transcript: string, concepts: ConceptChecklistItem[]): Promise<GapAnalysis> {
    const fallback = () => fallbackGrade(transcript, concepts);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        GRADE_SYSTEM,
        `CONCEPT CHECKLIST:\n${conceptsChecklist(concepts)}\n\nSTUDENT RECALL:\n${transcript}`,
      );
      return parseGaps(raw, concepts) ?? fallback();
    } catch {
      return fallback();
    }
  },

  async generateMicroLesson(
    gaps: GapAnalysis,
    _concepts: ConceptChecklistItem[],
  ): Promise<MicroLesson> {
    const fallback = () => ({ text: fallbackLesson(gaps) });
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(LESSON_SYSTEM, `GAP ANALYSIS:\n${gapsSummary(gaps)}`);
      const data = parseJson<Partial<MicroLesson>>(raw);
      if (data && typeof data.text === "string" && data.text.trim()) return { text: data.text.trim() };
      return fallback();
    } catch {
      return fallback();
    }
  },

  async generateRetestQuestions(
    gaps: GapAnalysis,
    _concepts: ConceptChecklistItem[],
  ): Promise<RetestQuestion[]> {
    const fallback = () => fallbackQuestions(gaps);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(RETEST_SYSTEM, `GAP ANALYSIS:\n${gapsSummary(gaps)}`);
      const data = parseJson<{ questions?: unknown[] }>(raw);
      if (!data || !Array.isArray(data.questions)) return fallback();
      const questions: RetestQuestion[] = [];
      for (const q of data.questions) {
        if (typeof q !== "object" || q === null) continue;
        const question = (q as Record<string, unknown>).question;
        if (typeof question === "string" && question.trim()) questions.push({ question: question.trim() });
      }
      return questions.length ? questions.slice(0, 3) : fallback();
    } catch {
      return fallback();
    }
  },
};