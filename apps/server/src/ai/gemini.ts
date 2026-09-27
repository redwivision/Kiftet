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

/** The script/register generated student-facing text should be written in.
 *  Follows the app's language pref (bet 4 / phase 10, slice C). */
export type ContentLanguage = "en" | "am";

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
  targetConcept?: string;
};

export type AiService = {
  extractConcepts(rawText: string): Promise<ConceptChecklistItem[]>;
  gradeRecall(
    transcript: string,
    concepts: ConceptChecklistItem[],
  ): Promise<GapAnalysis>;
  generateMicroLesson(
    gaps: GapAnalysis,
    concepts: ConceptChecklistItem[],
    language?: ContentLanguage,
  ): Promise<MicroLesson>;
  generateRetestQuestions(
    gaps: GapAnalysis,
    concepts: ConceptChecklistItem[],
    recallText?: string,
    language?: ContentLanguage,
  ): Promise<RetestQuestion[]>;
};

// ────────────────────────────────────────────────────────────────
// Fallback chain (the design's seam rule: the product must always work,
// with or without a key). If Gemini is unavailable or fails, we degrade to
// deterministic heuristics so demos and CI never hard-fail.
// ────────────────────────────────────────────────────────────────

function isAiAvailable(): boolean {
  return (
    env.GEMINI_API_KEY !== PLACEHOLDER_KEY &&
    env.GEMINI_API_KEY.trim().length > 0
  );
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40);
}

function fallbackExtract(rawText: string): ConceptChecklistItem[] {
  return sentences(rawText)
    .slice(0, 8)
    .map((s) => ({
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
      .filter(
        (w) =>
          w.length > 3 &&
          !["this", "that", "with", "from", "they", "them", "have"].includes(w),
      ),
  );
}

// A concept counts as claimed only when the student actually addressed it —
// matching a single shared token ("current" for "current is used up in a
// resistor") would mark it covered far too cheaply. Require a majority of the
// concept's own tokens to appear.
function conceptLexicallyHit(
  nameTokens: Set<string>,
  tokens: Set<string>,
): boolean {
  if (!nameTokens.size) return false;
  const matched = [...nameTokens].filter((t) => tokens.has(t)).length;
  return matched >= Math.max(1, Math.ceil(nameTokens.size * 0.6));
}

// Score = fraction of non-misconception concepts covered, weighted by each
// concept's importance (weight 1-5). A weight-5 idea counts five times as
// much as a weight-1 aside, so the number reflects what the chapter actually
// requires, not just how many titles were touched.
function weightedCoverage(
  covered: string[],
  concepts: ConceptChecklistItem[],
): number {
  const real = concepts.filter((c) => !c.isMisconception);
  if (!real.length) return 1;
  const seen = new Set(covered.map((c) => c.trim().toLowerCase()));
  let coveredWeight = 0;
  let totalWeight = 0;
  for (const concept of real) {
    totalWeight += concept.weight;
    if (seen.has(concept.conceptText.trim().toLowerCase()))
      coveredWeight += concept.weight;
  }
  return totalWeight ? coveredWeight / totalWeight : 1;
}

function fallbackGrade(
  transcript: string,
  concepts: ConceptChecklistItem[],
): GapAnalysis {
  const covered: string[] = [];
  const misconceptions: string[] = [];
  const tokens = significantTokens(transcript);
  for (const concept of concepts) {
    const nameTokens = significantTokens(concept.conceptText);
    if (!conceptLexicallyHit(nameTokens, tokens)) continue;
    if (concept.isMisconception) misconceptions.push(concept.conceptText);
    else covered.push(concept.conceptText);
  }
  const missing = concepts
    .filter((c) => !c.isMisconception && !covered.includes(c.conceptText))
    .map((c) => c.conceptText);
  return {
    covered,
    missing,
    misconceptions,
    score: weightedCoverage(covered, concepts),
  };
}

function fallbackLesson(
  gaps: GapAnalysis,
  language: ContentLanguage = "en",
): string {
  const targets = [...gaps.missing, ...gaps.misconceptions].slice(0, 3);
  if (!targets.length) {
    return language === "am"
      ? "በዚህ ክፍል ውስጥ ያሉትን ሃሳቦች በሙሉ አስቀድመህ ሸፍነሃል። በድምፅ በፍጥነት ጠቅለል አድርገህ ንገር፣ ከዚያም ወደፊት ቀጥል።"
      : "You already covered every idea in this section. Give yourself a quick recap out loud, then move on.";
  }
  const body = targets.map((t) => `“${t}”`).join("; ");
  if (language === "am") {
    return `ክፍተቶችህን እንዘጋ። ዛሬ በእነዚህ ላይ እናተኩራለን፦ ${body}። በጥንቃቄ አዳምጥ፦ ${targets[0]} — በቀላል ቃላት እንዲህ ነው፦ ትርጉሙን በግልጽ ይዘህ፣ ምሳሌውን ተጠቀም፣ እና በድምፅ ይድገመው። አሁን በራስህ መንገድ ግለፅልኝ።`;
  }
  return `Let’s close your gaps. Today we focus on ${body}. Listen closely: ${targets[0]}, in plain words — it is simply this: keep the definition clear, use the example, and say it back out loud. Now explain it to me your way.`;
}

function fallbackQuestions(
  gaps: GapAnalysis,
  language: ContentLanguage = "en",
): RetestQuestion[] {
  const targets = [...gaps.missing, ...gaps.misconceptions].slice(0, 3);
  return targets.map((t) => ({
    question:
      language === "am"
        ? `“${t}”ን በራስህ ቃላት ግለጽ — ጓደኛ እያስተማርክ እንደሆነ።`
        : `Explain “${t}” in your own words, as if teaching a friend.`,
    targetConcept: t,
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
  return value.filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
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

// A stalled Gemini call must never hang a student session: after this the
// promise rejects, the per-method catch falls back, and the UI keeps moving.
const GEMINI_TIMEOUT_MS = 20_000;

// Retries share ONE wall-clock budget rather than getting a fresh full timeout
// each. Three 20s attempts would be 60s+ of hanging, which blows past the 30s
// client fetch timeout in `api.ts` and turns a transient blip into a hard error
// page. Each attempt gets whatever is left of the budget, so the retry path
// stays inside the client window (24s of calls + backoff vs 30s) with a little
// headroom. Raise GEMINI_TOTAL_BUDGET_MS only if that client timeout moves.
const GEMINI_TOTAL_BUDGET_MS = 24_000;
const GEMINI_MAX_ATTEMPTS = 3;

// Only transient conditions are retried. A 400 (malformed request) or 404 will
// fail identically every time, and retrying it just burns quota we have per
// project, not per user.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 500;

/** The Gemini SDK surfaces the HTTP status on `ApiError.status`; be defensive
 *  because a timeout rejection from `withTimeout` is a plain `Error`. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  return status !== undefined && RETRYABLE_STATUS.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Gemini request timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Why the product is currently degraded to deterministic fallbacks. A 429 is
// the failure to expect: the Gemini free tier is per *project* (~10 req/min,
// ~1-1.5k/day) and we are explicitly not paying until real users prove the
// case, so our own per-user allowance is deliberately set below it.
const aiTelemetry = {
  attempts: 0,
  retries: 0,
  rateLimited: 0,
  timeouts: 0,
  malformed: 0,
  failed: 0,
};

export function aiTelemetrySnapshot() {
  return { ...aiTelemetry };
}

async function askJson(
  systemPrompt: string,
  userInput: string,
): Promise<string> {
  const deadline = Date.now() + GEMINI_TOTAL_BUDGET_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    // Out of wall clock: a timeout, not a provider fault. Fall back rather
    // than starting an attempt that cannot finish inside the client window.
    if (remaining <= 0) {
      lastError = new Error("Gemini retry budget exhausted");
      break;
    }
    aiTelemetry.attempts += 1;
    try {
      const response = await withTimeout(
        genAI.models.generateContent({
          model: DEFAULT_MODEL,
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\n---\n${userInput}` }],
            },
          ],
          config: { responseMimeType: "application/json", temperature: 0.4 },
        }),
        Math.min(GEMINI_TIMEOUT_MS, remaining),
      );
      return response.text ?? "";
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === GEMINI_MAX_ATTEMPTS) break;
      // Jitter matters here: many students hit the same per-project ceiling at
      // the same moment, and fixed backoff would have them all retry in
      // lockstep and re-trip the 429 immediately.
      const delay =
        RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 250;
      aiTelemetry.retries += 1;
      await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    }
  }

  const status = statusOf(lastError);
  if (status === 429) aiTelemetry.rateLimited += 1;
  else if (
    lastError instanceof Error &&
    lastError.message.includes("timed out")
  )
    aiTelemetry.timeouts += 1;
  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini request failed");
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

function parseGaps(
  raw: string,
  concepts: ConceptChecklistItem[],
): GapAnalysis | null {
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
function sanitizeGaps(
  gaps: GapAnalysis,
  concepts: ConceptChecklistItem[],
): GapAnalysis {
  const match = (value: string) => {
    const lower = value.trim().toLowerCase();
    return (
      concepts.find((c) => c.conceptText.trim().toLowerCase() === lower)
        ?.conceptText ?? value.trim()
    );
  };
  const covered = [...new Set(gaps.covered.map(match))].filter(Boolean);
  const misconceptions = [...new Set(gaps.misconceptions.map(match))].filter(
    Boolean,
  );
  const missingSet = new Set(gaps.missing.map(match).filter(Boolean));
  for (const concept of concepts) {
    if (concept.isMisconception) continue;
    const name = concept.conceptText.trim();
    const isNamed = [...covered, ...misconceptions].some(
      (c) => c.trim().toLowerCase() === name.toLowerCase(),
    );
    if (!isNamed) missingSet.add(name);
  }
  // The system recomputes the score itself (weighted by concept importance)
  // so the number is deterministic and consistent across AI/fallback paths,
  // instead of trusting whatever the model happened to guess.
  const score = weightedCoverage(covered, concepts);
  return { covered, missing: [...missingSet], misconceptions, score };
}

function conceptsChecklist(concepts: ConceptChecklistItem[]): string {
  return concepts
    .map(
      (c) =>
        `- ${c.conceptText}${c.isMisconception ? " [MISCONCEPTION]" : ""} (weight ${c.weight})`,
    )
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

// Per-question verdict score: a misconception counts as handled when the student
// does NOT restate the wrong belief; a real concept counts when it shows up in
// the covered set. This gives a fraction 0-1 that maps to "right/still open"
// for the individual retest question.
export function focusScore(
  gaps: { covered: string[]; misconceptions: string[] },
  concepts: ConceptChecklistItem[],
): number {
  if (!concepts.length) return 1;
  const covered = new Set(gaps.covered.map((c) => c.trim().toLowerCase()));
  const restated = new Set(
    gaps.misconceptions.map((c) => c.trim().toLowerCase()),
  );
  let numerator = 0;
  let denominator = 0;
  for (const concept of concepts) {
    denominator += concept.weight;
    const name = concept.conceptText.trim().toLowerCase();
    if (concept.isMisconception) {
      // Correct when the student does NOT restate the wrong belief.
      if (!restated.has(name)) numerator += concept.weight;
    } else {
      if (covered.has(name)) numerator += concept.weight;
    }
  }
  return denominator ? numerator / denominator : 1;
}

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
  "Each question targets exactly ONE gap item: set targetConcept to the exact conceptText of that item " +
  "(bare conceptText, never the [MISCONCEPTION] marker), so the answer is graded only against that idea. " +
  "If the student's own recall is provided, mirror their wording — reuse the terms, framing, and examples they actually used " +
  "so each question reads as a direct follow-up to what they said, not a canned quiz. Never quote their recall back as a statement, " +
  "and never treat a wrong belief they stated as correct; only echo their phrasing. " +
  'Return STRICT JSON: {"questions":[{"question":"...","targetConcept":"<one exact gap conceptText>"}]}.';

// Bet 4 / phase 10, slice C: generated content follows the app's language
// pref. Concept names are DATA (they come from the chapter's own checklist,
// in whatever script that book was written) — the model must keep them
// verbatim and write everything else in the requested language.
const AMHARIC_OUTPUT =
  "\n\nOUTPUT LANGUAGE: Write all student-facing text in Amharic, using the Ge'ez (Ethiopic) script, e.g. ተናገር and ምዕራፍ. " +
  "Concept and idea names taken from the source material are DATA — keep them verbatim in their original script, quoted, and never translate them. " +
  "Write everything else (sentences, instructions, your prompts back to the student) in Amharic.";

function outputInstruction(language: ContentLanguage): string {
  return language === "am" ? AMHARIC_OUTPUT : "";
}

// The retest user prompt. When the student's own recall is available it is
// appended so the writer can mirror their wording. Exported so the
// recall-echo behaviour is directly testable without a live model.
export function retestUserPrompt(
  gaps: GapAnalysis,
  recallText?: string,
): string {
  const recall = recallText?.trim();
  const base = `GAP ANALYSIS:\n${gapsSummary(gaps)}`;
  return recall
    ? `${base}\n\nSTUDENT'S OWN RECALL (mirror their wording):\n${recall.slice(0, 8000)}`
    : base;
}

// Pull a question list out of the model reply, carrying each question's target
// concept when the model converged on one (it is validated against the stored
// checklist by the route, never trusted blindly).
function extractQuestions(raw: string): RetestQuestion[] | null {
  const data = parseJson<{ questions?: unknown[] }>(raw);
  if (!data || !Array.isArray(data.questions)) return null;
  const out: RetestQuestion[] = [];
  for (const q of data.questions) {
    if (typeof q !== "object" || q === null) continue;
    const record = q as Record<string, unknown>;
    const question = record.question;
    if (typeof question !== "string" || !question.trim()) continue;
    out.push({
      question: question.trim(),
      targetConcept:
        typeof record.targetConcept === "string" && record.targetConcept.trim()
          ? record.targetConcept.trim()
          : undefined,
    });
    if (out.length >= 3) break;
  }
  return out.length ? out : null;
}

/** The model answered, but the answer was unusable (not JSON, or JSON that
 *  failed validation). Distinct from a transport failure: this one is worth
 *  watching as a quality signal, not just an availability one. */
function malformed<T>(operation: string, fallback: () => T): T {
  aiTelemetry.malformed += 1;
  console.error(`[ai] ${operation} got an unusable response, using fallback`);
  return fallback();
}

/** Every degraded path funnels through here so a fallback is never silent.
 *  Previously each method did `catch { return fallback(); }` with no logging
 *  and no counter, which meant a student being served the deterministic
 *  fallback — and us paying for nothing — looked identical to success. */
function degraded<T>(operation: string, error: unknown, fallback: () => T): T {
  const status = statusOf(error);
  const reason =
    status === 429
      ? "rate_limited (429)"
      : status !== undefined
        ? `upstream_status_${status}`
        : "timeout_or_network";
  aiTelemetry.failed += 1;
  console.error(
    `[ai] ${operation} degraded to deterministic fallback: ${reason}`,
    error instanceof Error ? error.message : error,
  );
  return fallback();
}

export const ai: AiService = {
  async extractConcepts(rawText: string): Promise<ConceptChecklistItem[]> {
    const fallback = () => fallbackExtract(rawText);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        EXTRACT_SYSTEM,
        `CHAPTER TEXT:\n${rawText.slice(0, 24000)}`,
      );
      return extractItems(raw) ?? malformed("extractConcepts", fallback);
    } catch (error) {
      return degraded("extractConcepts", error, fallback);
    }
  },

  async gradeRecall(
    transcript: string,
    concepts: ConceptChecklistItem[],
  ): Promise<GapAnalysis> {
    const fallback = () => fallbackGrade(transcript, concepts);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        GRADE_SYSTEM,
        `CONCEPT CHECKLIST:\n${conceptsChecklist(concepts)}\n\nSTUDENT RECALL:\n${transcript}`,
      );
      return parseGaps(raw, concepts) ?? malformed("gradeRecall", fallback);
    } catch (error) {
      return degraded("gradeRecall", error, fallback);
    }
  },

  async generateMicroLesson(
    gaps: GapAnalysis,
    _concepts: ConceptChecklistItem[],
    language: ContentLanguage = "en",
  ): Promise<MicroLesson> {
    const fallback = () => ({ text: fallbackLesson(gaps, language) });
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        LESSON_SYSTEM + outputInstruction(language),
        `GAP ANALYSIS:\n${gapsSummary(gaps)}`,
      );
      const data = parseJson<Partial<MicroLesson>>(raw);
      if (data && typeof data.text === "string" && data.text.trim())
        return { text: data.text.trim() };
      return malformed("generateMicroLesson", fallback);
    } catch (error) {
      return degraded("generateMicroLesson", error, fallback);
    }
  },

  async generateRetestQuestions(
    gaps: GapAnalysis,
    _concepts: ConceptChecklistItem[],
    recallText?: string,
    language: ContentLanguage = "en",
  ): Promise<RetestQuestion[]> {
    const fallback = () => fallbackQuestions(gaps, language);
    if (!isAiAvailable()) return fallback();
    try {
      const raw = await askJson(
        RETEST_SYSTEM + outputInstruction(language),
        retestUserPrompt(gaps, recallText),
      );
      return (
        extractQuestions(raw) ?? malformed("generateRetestQuestions", fallback)
      );
    } catch (error) {
      return degraded("generateRetestQuestions", error, fallback);
    }
  },
};
